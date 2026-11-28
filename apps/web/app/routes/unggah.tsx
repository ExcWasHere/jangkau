import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/unggah";

import { createPostSchema } from "@jangkau/shared";

import { useSession } from "~/features/auth/session";
import {
  ACCURACY_REJECT_M,
  ACCURACY_WARN_M,
  FAILURE_KEY,
  currentLocation,
  geolocationPermission,
  watchForBetterFix,
  type LocationFailure,
  type LocationFix,
} from "~/features/offline/geolocation";
import { LocationPicker } from "~/features/offline/location-picker";
import {
  enqueuePost,
  isQueueAvailable,
  listQueuedPosts,
  removeQueuedPost,
  retryQueuedPost,
  type QueuedPhoto,
  type QueuedPost,
} from "~/features/offline/queue";
import { isDuplicateRejection, isNetworkFailure, submitPost } from "~/features/offline/submit";
import { translatorFromMatches, useT, type DictKey } from "~/i18n";
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

type ChosenLocation = { lat: number; lng: number; accuracyM?: number; source: "device" | "manual" };

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

  const [location, setLocation] = useState<ChosenLocation | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");

  const [queued, setQueued] = useState<QueuedPost[]>([]);
  const [queuedPanel, setQueuedPanel] = useState(false);

  const refreshQueue = useCallback(async () => {
    setQueued(await listQueuedPosts());
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  /**
   * Mengambil lokasi perangkat, lalu memperbaiki akurasi bila masih kasar.
   *
   * Dipanggil otomatis saat halaman dibuka: pengguna tahu lebih awal apakah
   * GPS-nya bisa dipakai, bukan baru tahu setelah menulis panjang lalu ditolak.
   */
  const locate = useCallback(async () => {
    setLocating(true);
    setLocationNote(null);

    const first = await currentLocation();

    if (!first.ok) {
      setLocating(false);
      setPermission(await geolocationPermission());
      setLocationNote(t(FAILURE_KEY[first.failure.reason] as DictKey));
      return;
    }

    let fix: LocationFix = first.fix;

    if (fix.accuracyM > ACCURACY_WARN_M) {
      const better = await watchForBetterFix({ targetAccuracyM: ACCURACY_WARN_M });
      if (better.ok && better.fix.accuracyM < fix.accuracyM) fix = better.fix;
    }

    setLocating(false);
    setPermission("granted");

    if (fix.accuracyM > ACCURACY_REJECT_M) {
      setLocation(null);
      setLocationNote(t("gps.tooCoarse", { accuracy: fix.accuracyM }));
      return;
    }

    setLocation({
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      source: "device",
    });
    setLocationNote(
      fix.accuracyM > ACCURACY_WARN_M
        ? t("gps.poorAccuracy", { accuracy: fix.accuracyM })
        : null,
    );
  }, [t]);

  // Minta izin saat halaman dibuka. Kalau sudah pernah diblokir, browser tidak
  // menampilkan dialog lagi — `geolocationPermission()` membedakannya dan UI
  // langsung menawarkan jalur manual.
  useEffect(() => {
    if (!ready || !token) return;

    void (async () => {
      const state = await geolocationPermission();
      setPermission(state);

      if (state === "denied") {
        setLocationNote(t("gps.denied"));
        return;
      }

      await locate();
    })();
  }, [ready, token, locate, t]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(t("upload.signInRequired"));
      return;
    }

    if (!location) {
      setError(t("gps.required"));
      return;
    }

    setBusy(true);
    try {
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
        locationSource: location.source,
        location: {
          lat: location.lat,
          lng: location.lng,
          accuracyM: location.source === "device" ? location.accuracyM : undefined,
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
        // Unggahan ini sudah masuk (mis. tombol tertekan dua kali). Bukan
        // alasan menyimpan salinan kedua di antrean.
        if (isDuplicateRejection(cause)) {
          toast.push(t("upload.successNew"), "success");
          navigate("/");
          return;
        }

        if (!isNetworkFailure(cause)) throw cause;

        const available = await isQueueAvailable();
        if (!available) {
          setError(t("offline.notSaved"));
          return;
        }

        await enqueuePost({ ...payload, photos });
        toast.push(t("offline.queued"), "info");
        // Sengaja tidak navigasi: halaman tujuan dirender server, dan saat
        // offline permintaan itu gagal sehingga pengguna mendarat di halaman
        // galat browser setelah laporannya berhasil disimpan.
        setQueuedPanel(true);
        setBody("");
        setPlaceLabel("");
        setFiles([]);
        await refreshQueue();
        return;
      }
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.message);
      else setError(cause instanceof Error ? cause.message : t("upload.incomplete"));
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

  if (queuedPanel) {
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
              onClick={() => setQueuedPanel(false)}
              className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white"
            >
              {t("upload.submit")}
            </button>
            <Link to="/" className="rounded-lg border border-line px-4 py-2 text-[14px] font-semibold">
              {t("common.backToHome")}
            </Link>
          </div>

          <QueueList items={queued} onChange={() => void refreshQueue()} />
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

        <LocationPanel
          location={location}
          locating={locating}
          note={locationNote}
          permission={permission}
          onRetry={() => void locate()}
          onManual={() => setPickerOpen(true)}
        />

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
          disabled={busy || !location}
          className="rounded-lg bg-brand px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? (status ?? t("upload.submitting")) : t("upload.submit")}
        </button>

        {queued.length > 0 ? (
          <QueueList items={queued} onChange={() => void refreshQueue()} />
        ) : null}
      </form>

      {pickerOpen ? (
        <LocationPicker
          initial={location ? { lat: location.lat, lng: location.lng } : null}
          onConfirm={(point) => {
            setLocation({ ...point, source: "manual" });
            setLocationNote(t("gps.manualBadge"));
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}

function LocationPanel({
  location,
  locating,
  note,
  permission,
  onRetry,
  onManual,
}: {
  location: ChosenLocation | null;
  locating: boolean;
  note: string | null;
  permission: "granted" | "denied" | "prompt" | "unknown";
  onRetry: () => void;
  onManual: () => void;
}) {
  const { t } = useT();

  return (
    <section
      aria-labelledby="lokasi"
      className={`rounded-xl border p-4 ${
        location ? "border-ok/40 bg-ok/5" : "border-warn/40 bg-warn/10"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="lokasi" className="text-[13px] font-semibold">
          {t("upload.locationTitle")}
        </h2>
        {location ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              location.source === "manual" ? "bg-warn/20 text-warn" : "bg-ok/20 text-ok"
            }`}
          >
            {location.source === "manual" ? t("gps.manualBadge") : t("gps.deviceBadge")}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-[13px]">
        {locating
          ? t("gps.locating")
          : location
            ? location.source === "device" && location.accuracyM !== undefined
              ? t("gps.located", { accuracy: location.accuracyM })
              : `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : t("gps.required")}
      </p>

      {note ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{note}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {permission !== "denied" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={locating}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {t("gps.retry")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onManual}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
        >
          {t("gps.useManual")}
        </button>
      </div>
    </section>
  );
}

/**
 * Laporan yang tertahan di perangkat.
 *
 * Yang ditolak server ditampilkan terpisah dan bisa diperbaiki: teks dan foto
 * yang sudah ditulis di tengah bencana tidak boleh hilang karena satu kesalahan
 * validasi.
 */
function QueueList({ items, onChange }: { items: QueuedPost[]; onChange: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="antrean" className="rounded-xl border border-line bg-surface p-4">
      <h2 id="antrean" className="text-[15px] font-semibold">
        {t("queue.title")}
      </h2>
      <p className="mt-1 text-[12px] text-muted">{t("queue.intro")}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.clientUuid} className="rounded-lg border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  item.status === "failed" ? "bg-danger/15 text-danger" : "bg-warn/15 text-warn"
                }`}
              >
                {item.status === "failed" ? t("queue.failedBadge") : t("queue.pendingBadge")}
              </span>
              <span className="text-[12px] text-muted">
                {item.photos.length} foto · {item.locationSource === "manual"
                  ? t("gps.manualBadge")
                  : t("gps.deviceBadge")}
              </span>
            </div>

            {editing === item.clientUuid ? (
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-[12px] font-semibold">
                  {t("queue.bodyLabel")}
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-normal"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await retryQueuedPost(item.clientUuid, { body: draft });
                      toast.push(t("queue.retried"), "success");
                      setEditing(null);
                      onChange();
                    }}
                    className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    {t("queue.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
                  >
                    {t("gps.manualCancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 text-[13px]">{item.body}</p>
                {item.lastError ? (
                  <p className="mt-1 text-[12px] text-danger">
                    {t("queue.reason")}: {item.lastError}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(item.clientUuid);
                      setDraft(item.body);
                    }}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
                  >
                    {t("queue.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(t("queue.discardConfirm"))) return;
                      await removeQueuedPost(item.clientUuid);
                      toast.push(t("queue.discarded"), "info");
                      onChange();
                    }}
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger"
                  >
                    {t("queue.discard")}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
