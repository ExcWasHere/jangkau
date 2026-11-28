import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/unggah";

import { createPostSchema } from "@jangkau/shared";

import { useSession } from "~/features/auth/session";
import { apiFetch, ApiError } from "~/shared/api/client";
import { publicEnv } from "~/shared/lib/env";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Unggah laporan bencana — Jangkau" }];
}

type PreparedMedia = { key: string; mimeType: string; sizeBytes: number };

/** Kompres di perangkat sebelum unggah: sisi terpanjang 1600 px, WebP. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", 0.72);
  });
}

export default function UploadPage() {
  const { token, ready } = useSession();
  const navigate = useNavigate();

  const [body, setBody] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadMedia(selected: File[]): Promise<PreparedMedia[]> {
    if (!token) return [];
    const prepared: PreparedMedia[] = [];

    for (const file of selected) {
      const blob = await compress(file);
      const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
        method: "POST",
        token,
        body: JSON.stringify({
          kind: "post_photo",
          contentType: blob.type || "image/webp",
          sizeBytes: blob.size,
        }),
      });

      const put = await fetch(presign.putUrl, {
        method: "PUT",
        headers: { "content-type": blob.type || "image/webp" },
        body: blob,
      });

      if (!put.ok) throw new Error(`Gagal mengunggah ${file.name}`);

      prepared.push({
        key: presign.key,
        mimeType: blob.type || "image/webp",
        sizeBytes: blob.size,
      });
    }

    return prepared;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Masuk dulu untuk mengunggah laporan.");
      return;
    }

    setBusy(true);
    try {
      setStatus("Mengambil lokasi…");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
        });
      });

      setStatus(`Mengunggah ${files.length} foto…`);
      const media = await uploadMedia(files);

      setStatus("Mengirim laporan…");
      const payload = {
        clientUuid: crypto.randomUUID(),
        body,
        placeLabel: placeLabel.trim() || undefined,
        capturedAt: new Date().toISOString(),
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        },
        media,
      };

      const parsed = createPostSchema.safeParse(payload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Laporan belum lengkap");
        return;
      }

      const result = await apiFetch<{ eventId: string; merged: boolean; needsReview: boolean }>(
        "/posts",
        { method: "POST", token, body: JSON.stringify(payload) },
      );

      navigate(`/bencana/${result.eventId}`);
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.message);
      else if (cause instanceof GeolocationPositionError) {
        setError("Lokasi tidak bisa diambil. Izinkan akses lokasi lalu coba lagi.");
      } else setError(cause instanceof Error ? cause.message : "Gagal mengirim laporan");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  if (ready && !token) {
    return (
      <AppShell>
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">
          Masuk dulu untuk mengunggah laporan bencana.{" "}
          <a href="/masuk" className="font-semibold text-brand underline">
            Masuk
          </a>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold">Unggah laporan bencana</h1>
          <p className="text-[13px] text-muted">
            Lokasi diambil dari perangkat dan wajib. Laporan yang membicarakan bencana yang sama akan
            digabung jadi satu berita.
          </p>
        </header>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Apa yang terjadi?
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Contoh: Air bah masuk jam 2 pagi, tiga dusun terendam, warga mengungsi ke balai desa. Butuh air bersih dan selimut."
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal"
          />
          <span className="text-[12px] font-normal text-muted">{body.length}/2000</span>
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Nama lokasi (opsional)
          <input
            type="text"
            maxLength={120}
            value={placeLabel}
            onChange={(event) => setPlaceLabel(event.target.value)}
            placeholder="Dusun Krajan, Kromengan"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Foto (maksimal 4)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))}
            className="text-[13px] font-normal"
          />
          <span className="text-[12px] font-normal text-muted">
            Foto dikompres di perangkat sebelum diunggah. Jangan memotret wajah orang yang bisa
            dikenali.
          </span>
        </label>

        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? (status ?? "Mengirim…") : "Kirim laporan"}
        </button>
      </form>
    </AppShell>
  );
}
