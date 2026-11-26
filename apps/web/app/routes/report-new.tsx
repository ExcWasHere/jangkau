import { useCallback, useEffect, useState } from "react";

import { NEED_CATEGORIES, NEED_CATEGORY_LABELS, SEVERITY_LEVELS } from "@jangkau/shared";

import { RequireRole } from "~/features/auth/guards";
import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import {
  cacheGet,
  cacheSet,
  enqueue,
  listOutbox,
  newClientUuid,
  syncOutbox,
  updateOutbox,
  type OutboxItem,
  type OutboxMedia,
} from "~/features/reports/outbox";
import { useSession } from "~/features/auth/session";

type Post = { id: string; name: string; regency: string | null; headcount: number };

const POSTS_CACHE_KEY = "posts";
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const STATE_LABELS: Record<OutboxItem["state"], string> = {
  queued: "Menunggu dikirim",
  uploading: "Mengirim…",
  synced: "Terkirim",
  failed: "Gagal permanen",
};

function stateClass(state: OutboxItem["state"]): string {
  if (state === "synced") return "bg-green-50 text-ok";
  if (state === "failed") return "bg-red-50 text-danger";
  return "bg-brand-soft text-brand-strong";
}

export default function ReportNew() {
  const { token, ready } = useSession();

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsNotice, setPostsNotice] = useState<string | null>(null);
  const [postId, setPostId] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [headcount, setHeadcount] = useState("");

  const [location, setLocation] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<OutboxMedia[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshOutbox = useCallback(async () => {
    setOutbox(await listOutbox());
  }, []);

  /** Satu-satunya jalur kirim; dipakai submit dan tombol "Kirim sekarang". */
  /**
   * Unggah foto yang belum punya `key`: minta URL PUT ke API, kirim blob
   * langsung ke R2, lalu simpan key-nya di antrean agar retry tidak
   * mengunggah ulang.
   */
  const uploadPending = useCallback(
    async (item: OutboxItem) => {
      if (!token) throw new Error("Sesi belum siap");
      const media: Array<{ key: string; mimeType: string; sizeBytes: number }> = [];

      for (const [index, file] of item.media.entries()) {
        let key = file.key;

        if (!key) {
          const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
            method: "POST",
            token,
            body: JSON.stringify({
              kind: "report_photo",
              contentType: file.mimeType,
              sizeBytes: file.sizeBytes,
              scopeId: item.postId,
            }),
          });

          const put = await fetch(presign.putUrl, {
            method: "PUT",
            headers: { "content-type": file.mimeType },
            body: file.blob,
          });
          if (!put.ok) {
            throw new Error(`Unggah foto ${index + 1} gagal (${put.status})`);
          }

          key = presign.key;
          const nextMedia = item.media.map((entry, position) =>
            position === index ? { ...entry, key } : entry,
          );
          await updateOutbox(item.clientUuid, { media: nextMedia });
        }

        media.push({ key, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
      }

      return media;
    },
    [token],
  );

  const sendItem = useCallback(
    async (item: OutboxItem) => {
      if (!token) throw new Error("Sesi belum siap");
      const media = await uploadPending(item);

      const response = await apiFetch<{ id: string; duplicate: boolean }>("/reports", {
        method: "POST",
        token,
        body: JSON.stringify({
          clientUuid: item.clientUuid,
          postId: item.postId,
          bodyText: item.bodyText,
          transcript: item.transcript,
          category: item.category,
          severity: item.severity,
          headcountDelta: item.headcountDelta,
          location: item.location,
          capturedAt: item.capturedAt,
          media,
        }),
      });
      return { id: response.id, duplicate: response.duplicate };
    },
    [token, uploadPending],
  );

  const runSync = useCallback(async () => {
    if (!token) return null;
    setBusy(true);
    try {
      const result = await syncOutbox(sendItem);
      await refreshOutbox();
      return result;
    } finally {
      setBusy(false);
    }
  }, [refreshOutbox, sendItem, token]);

  // Daftar pos diambil sekali lalu di-cache: form harus tetap terisi
  // walau sinyal hilang saat warga mau melapor.
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await apiFetch<{ items: Post[] }>("/posts");
        if (!active) return;
        setPosts(data.items);
        setPostsNotice(null);
        await cacheSet(POSTS_CACHE_KEY, data.items);
        if (data.items[0]) setPostId((current) => current || data.items[0]!.id);
      } catch (cause) {
        if (!active) return;
        const cached = await cacheGet<Post[]>(POSTS_CACHE_KEY);
        if (cached?.length) {
          setPosts(cached);
          setPostId((current) => current || cached[0]!.id);
          setPostsNotice("Daftar pos dari cache perangkat. Sinkronisasi tertunda.");
        } else {
          setPostsNotice(
            cause instanceof ApiError ? cause.message : "Daftar pos belum bisa dimuat.",
          );
        }
      }
    }

    void load();
    void refreshOutbox();
    return () => {
      active = false;
    };
  }, [refreshOutbox]);

  function captureLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Perangkat ini tidak menyediakan lokasi.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }),
      (error) => setLocationError(error.message),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!location) {
      setLocationError("Ambil lokasi perangkat dulu — laporan tanpa lokasi tidak bisa divalidasi.");
      return;
    }

    await enqueue({
      clientUuid: newClientUuid(),
      postId,
      bodyText: bodyText.trim(),
      category: category ? (category as (typeof NEED_CATEGORIES)[number]) : undefined,
      severity: severity as (typeof SEVERITY_LEVELS)[number],
      headcountDelta: headcount ? Number(headcount) : undefined,
      location,
      capturedAt: new Date().toISOString(),
      media: photos,
    });

    setBodyText("");
    setHeadcount("");
    setPhotos([]);
    await refreshOutbox();
    setMessage("Laporan tersimpan di perangkat. Mencoba mengirim…");

    const result = await runSync();
    if (!result) return;

    setMessage(
      result.lastError
        ? `Tersimpan lokal, belum terkirim: ${result.lastError}`
        : `Terkirim ${result.sent + result.duplicates} laporan.`,
    );
  }

  async function retrySync() {
    const result = await runSync();
    if (!result) return;
    setMessage(
      result.lastError
        ? `Masih tertunda: ${result.lastError}`
        : `Selesai. Sisa di antrean: ${result.remaining}.`,
    );
  }

  if (!ready) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Memuat sesi…</p>
      </AppShell>
    );
  }

  const pending = outbox.filter((item) => item.state === "queued" || item.state === "uploading");

  return (
    <AppShell>
      <RequireRole allow={["resident", "organization", "admin"]}>
      <h1 className="text-2xl font-bold">Lapor kebutuhan pos</h1>
      <p className="mt-1 text-sm text-muted">
        Laporan disimpan di perangkat lebih dulu, jadi tetap aman saat sinyal hilang.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Pos pengungsian
          <select
            required
            value={postId}
            onChange={(event) => setPostId(event.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-brand"
          >
            <option value="" disabled>
              Pilih pos
            </option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.name}
                {post.regency ? ` — ${post.regency}` : ""}
              </option>
            ))}
          </select>
          {postsNotice && <span className="text-xs font-normal text-warn">{postsNotice}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Apa yang dibutuhkan?
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            placeholder="Contoh: Pos ini kekurangan air bersih untuk 120 pengungsi, selimut 30 lembar."
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
          <span className="text-xs font-normal text-muted">
            {bodyText.length}/2000 · kategori diisi AI bila kamu biarkan kosong
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Kategori (opsional)
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-brand"
            >
              <option value="">Biarkan AI menentukan</option>
              {NEED_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {NEED_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tingkat keparahan
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-brand"
            >
              <option value="low">Rendah</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
              <option value="critical">Kritis</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Perubahan jumlah pengungsi (opsional)
          <input
            type="number"
            inputMode="numeric"
            placeholder="mis. 40"
            value={headcount}
            onChange={(event) => setHeadcount(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Foto kondisi (opsional)</p>
              <p className="text-xs text-muted">
                Maksimal {MAX_PHOTOS} foto, 10 MB per file. Disimpan di perangkat sampai
                berhasil diunggah.
              </p>
            </div>
            <label className="cursor-pointer rounded-lg border border-brand-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft">
              Pilih foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  setPhotoError(null);

                  const oversized = files.find((file) => file.size > MAX_PHOTO_BYTES);
                  if (oversized) {
                    setPhotoError(`${oversized.name} melebihi 10 MB.`);
                    return;
                  }

                  setPhotos((current) => {
                    const room = MAX_PHOTOS - current.length;
                    if (files.length > room) {
                      setPhotoError(`Hanya ${room} foto lagi yang bisa ditambahkan.`);
                    }
                    return [
                      ...current,
                      ...files.slice(0, Math.max(0, room)).map((file) => ({
                        mimeType: file.type,
                        sizeBytes: file.size,
                        blob: file,
                      })),
                    ];
                  });
                }}
              />
            </label>
          </div>

          {photos.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {photos.map((photo, index) => (
                <li
                  key={`${index}-${photo.sizeBytes}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1 text-xs"
                >
                  <span className="text-muted">
                    {photo.mimeType.replace("image/", "").toUpperCase()} ·{" "}
                    {Math.round(photo.sizeBytes / 1024)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    className="font-semibold text-danger hover:underline"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}

          {photoError && <p className="mt-2 text-xs text-danger">{photoError}</p>}
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Lokasi perangkat</p>
              <p className="text-xs text-muted">
                {location
                  ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}${
                      location.accuracyM ? ` · ±${Math.round(location.accuracyM)} m` : ""
                    }`
                  : "Belum diambil. Dipakai untuk memastikan laporan berasal dari radius pos."}
              </p>
            </div>
            <button
              type="button"
              onClick={captureLocation}
              className="rounded-lg border border-brand-line bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              {location ? "Ambil ulang" : "Ambil lokasi"}
            </button>
          </div>
          {locationError && <p className="mt-2 text-xs text-danger">{locationError}</p>}
        </div>

        {message && (
          <p className="rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-strong">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !postId || bodyText.trim().length < 10}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Kirim laporan"}
        </button>
      </form>

      {outbox.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Antrean di perangkat</h2>
            {pending.length > 0 && (
              <button
                type="button"
                onClick={retrySync}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
              >
                Kirim sekarang
              </button>
            )}
          </div>

          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {outbox.map((item) => (
              <li key={item.clientUuid} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.bodyText ?? item.transcript}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(item.capturedAt).toLocaleString("id-ID")}
                    {item.error ? ` · ${item.error}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${stateClass(item.state)}`}
                >
                  {STATE_LABELS[item.state]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </RequireRole>
    </AppShell>
  );
}
