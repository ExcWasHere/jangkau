import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/unggah";

import { createPostSchema } from "@jangkau/shared";

import { useSession } from "~/features/auth/session";
import { isQueueAvailable, enqueuePost, type QueuedPhoto } from "~/features/offline/queue";
import { isNetworkFailure, submitPost } from "~/features/offline/submit";
import { translatorFromMatches, useT } from "~/i18n";
import { ApiError } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";
import { useToast } from "~/shared/ui/toast";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: t("meta.uploadTitle") }];
}

/** Kompres di perangkat sebelum unggah: sisi terpanjang 1600 px, WebP. */
async function compress(file: File): Promise<QueuedPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((result) => resolve(result ?? file), "image/webp", 0.72);
  });

  return { blob, mimeType: blob.type || "image/webp", sizeBytes: blob.size };
}

export default function UploadPage() {
  const { t } = useT();
  const { token, ready } = useSession();
  const navigate = useNavigate();
  const toast = useToast();

  const [body, setBody] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(t("upload.signInRequired"));
      return;
    }

    setBusy(true);
    try {
      setStatus(t("upload.statusLocating"));
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
        });
      });

      setStatus(t("upload.statusCompressing"));
      const photos: QueuedPhoto[] = [];
      for (const file of files) {
        photos.push(await compress(file));
      }

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
      };

      const parsed = createPostSchema.safeParse({ ...payload, media: [] });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? t("upload.incomplete"));
        return;
      }

      try {
        setStatus(t("upload.statusSending"));
        const result = await submitPost({ ...payload, photos }, token);
        toast.push(result.merged ? t("upload.successMerged") : t("upload.successNew"), "success");
        navigate(`/bencana/${result.eventId}`);
        return;
      } catch (cause) {
        // Jaringan putus di tengah jalan: simpan ke perangkat, jangan buang
        // laporan yang sudah ditulis.
        if (!isNetworkFailure(cause)) throw cause;

        const queued = await isQueueAvailable();
        if (!queued) {
          setError(t("offline.notSaved"));
          return;
        }

        await enqueuePost({ ...payload, photos });
        toast.push(t("offline.queued"), "info");
        // Sengaja TIDAK navigasi: halaman tujuan dirender server, dan saat
        // offline permintaan itu gagal sehingga pengguna mendarat di halaman
        // galat browser setelah laporannya berhasil disimpan.
        setQueued(true);
        setBody("");
        setPlaceLabel("");
        setFiles([]);
        return;
      }
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.message);
      else if (cause instanceof GeolocationPositionError) {
        setError(t("upload.geolocationFailed"));
      } else setError(cause instanceof Error ? cause.message : t("upload.incomplete"));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  if (ready && !token) {
    return (
      <AppShell>
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">
          {t("upload.signInRequired")}{" "}
          <a href="/masuk" className="font-semibold text-brand-text underline">
            {t("nav.signIn")}
          </a>
        </p>
      </AppShell>
    );
  }

  if (queued) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
          <div className="rounded-xl border border-ok/40 bg-ok/10 p-5">
            <p className="text-[15px] font-semibold text-ok">{t("offline.queuedTitle")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("offline.queued")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQueued(false)}
              className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white"
            >
              {t("upload.submit")}
            </button>
            <Link
              to="/"
              className="rounded-lg border border-line px-4 py-2 text-[14px] font-semibold"
            >
              {t("common.backToHome")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold">{t("upload.title")}</h1>
          <p className="text-[13px] text-muted">{t("upload.intro")}</p>
        </header>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {t("upload.bodyLabel")}
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("upload.bodyPlaceholder")}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal"
          />
          <span className="text-[12px] font-normal text-muted">{body.length}/2000</span>
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {t("upload.placeLabel")}
          <input
            type="text"
            maxLength={120}
            value={placeLabel}
            onChange={(event) => setPlaceLabel(event.target.value)}
            placeholder={t("upload.placePlaceholder")}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {t("upload.photosLabel")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))}
            className="text-[13px] font-normal"
          />
          <span className="text-[12px] font-normal text-muted">{t("upload.photosHint")}</span>
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
          {busy ? (status ?? t("upload.submitting")) : t("upload.submit")}
        </button>
      </form>
    </AppShell>
  );
}
