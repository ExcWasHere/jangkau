import { useState } from "react";
import { useNavigate } from "react-router";

import type { EventDetail } from "~/features/feed/api";
import { applyAsPic, withdrawPicApplication } from "~/features/distributor/api";
import { useMe } from "~/features/auth/use-me";
import { useT } from "~/i18n";
import { ApiError, apiFetch } from "~/shared/api/client";
import { useToast } from "~/shared/ui/toast";

/**
 * Kotak pengajuan penanggung jawab.
 *
 * Empat keadaan yang harus dibedakan, karena tindakan pengguna berbeda di
 * masing-masing: belum login, belum jadi penyalur, penyalur belum terverifikasi,
 * dan sudah terverifikasi. Semua pesan menyebut langkah berikutnya, bukan hanya
 * "tidak diizinkan".
 */
export function ApplyPanel({
  detail,
  token,
  onChanged,
}: {
  detail: EventDetail;
  token: string | null;
  onChanged: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();

  const [pitch, setPitch] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Status verifikasi diambil dari `useMe`, bukan dari `detail.viewer`:
  // detail dimuat lebih dulu di server tanpa token, jadi `viewer` di sana bisa
  // masih kosong saat panel pertama kali dirender. `useMe` selalu berasal dari
  // sesi yang sedang aktif.
  const { me, loading: meLoading } = useMe();
  const application = detail.myApplication;
  const distributor = me?.distributor ?? null;
  const verified = distributor?.verification_status === "verified";

  if (application?.status === "approved") {
    return (
      <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
        {t("eventApply.approved")}
      </p>
    );
  }

  if (application?.status === "applied") {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-warn">
        <p>{t("eventApply.pending")}</p>
        {token ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await withdrawPicApplication(token, detail.event.id);
                toast.push(t("eventApply.withdraw"), "success");
                onChanged();
              } catch (cause) {
                toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="mt-2 text-[12px] font-semibold underline"
          >
            {t("eventApply.withdraw")}
          </button>
        ) : null}
      </div>
    );
  }

  if (meLoading) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        {t("common.loadingSession")}
      </p>
    );
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
        <p className="text-muted">{t("eventApply.signIn")}</p>
        <button
          type="button"
          onClick={() => navigate("/masuk")}
          className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          {t("nav.signIn")}
        </button>
      </div>
    );
  }

  if (!distributor) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
        <p className="text-muted">{t("eventApply.needVerified")}</p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          {t("eventApply.becomeDistributor")}
        </button>
      </div>
    );
  }

  // Sudah mengajukan verifikasi tapi belum diputuskan: tindakan pengguna adalah
  // menunggu, bukan mengirim dokumen lagi. Dibedakan dari `unverified` supaya
  // tombolnya tidak menyesatkan.
  if (distributor.verification_status === "pending") {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-warn">
        <p>{t("dashboard.pendingNote")}</p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-2 text-[12px] font-semibold underline"
        >
          {t("dashboard.verificationTitle")}
        </button>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
        <p className="text-muted">{t("eventApply.needVerified")}</p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
        >
          {t("dashboard.verificationTitle")}
        </button>
      </div>
    );
  }

  if (application?.status === "rejected" || application?.status === "revoked") {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
        <p className="text-muted">{t("eventApply.rejected")}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          {t("eventApply.title")}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white"
      >
        {t("eventApply.title")}
      </button>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await applyAsPic(token, detail.event.id, pitch);
          toast.push(t("eventApply.sent"), "success");
          setOpen(false);
          setPitch("");
          onChanged();
        } catch (cause) {
          toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
    >
      <h3 className="text-[15px] font-semibold">{t("eventApply.title")}</h3>
      <p className="text-[12px] text-muted">{t("eventApply.intro")}</p>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("eventApply.pitch")}
        <textarea
          required
          minLength={50}
          maxLength={500}
          rows={4}
          value={pitch}
          onChange={(event) => setPitch(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
        <span className="text-[11px] font-normal text-muted">
          {pitch.length}/500 · {t("eventApply.pitchHint")}
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {t("eventApply.submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold"
        >
          {t("posko.cancel")}
        </button>
      </div>
    </form>
  );
}

/** Form posko untuk pelapor event atau penanggung jawab yang disetujui. */
export function PoskoEditor({
  eventId,
  canManage,
  token,
  onCreated,
}: {
  eventId: string;
  canManage: boolean;
  token: string | null;
  onCreated: () => void;
}) {
  const { t } = useT();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [headcount, setHeadcount] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [surveyed, setSurveyed] = useState(true);

  if (!canManage || !token) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold"
      >
        {t("posko.create")}
      </button>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15_000,
            });
          });

          await apiFetch(`/posko/events/${eventId}/posko`, {
            method: "POST",
            token,
            body: JSON.stringify({
              name,
              address: address || undefined,
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracyM: position.coords.accuracy,
              },
              headcount: Number(headcount) || 0,
              capacity: capacity ? Number(capacity) : undefined,
              surveyed,
              needs: [],
            }),
          });

          toast.push(t("posko.created"), "success");
          setOpen(false);
          setName("");
          setAddress("");
          onCreated();
        } catch (cause) {
          toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
    >
      <h3 className="text-[15px] font-semibold">{t("posko.create")}</h3>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("posko.name")}
        <input
          required
          minLength={3}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("posko.address")}
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("posko.headcount")}
          <input
            type="number"
            min={0}
            value={headcount}
            onChange={(event) => setHeadcount(event.target.value)}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("posko.capacity")}
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={surveyed}
          onChange={(event) => setSurveyed(event.target.checked)}
          className="mt-0.5"
        />
        {t("posko.surveyed")}
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {t("posko.submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold"
        >
          {t("posko.cancel")}
        </button>
      </div>
    </form>
  );
}
