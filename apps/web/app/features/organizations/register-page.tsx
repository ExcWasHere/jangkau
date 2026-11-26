import { useState } from "react";
import { useNavigate } from "react-router";

import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { Field, buttonPrimary, inputClass } from "~/shared/ui/primitives";
import { useMe } from "~/features/auth/use-me";

const MAX_DOC_BYTES = 10 * 1024 * 1024;

/**
 * Pendaftaran organisasi. Dokumen legal diunggah ke R2 lewat presign, lalu
 * hanya key-nya yang disimpan di database. Status awal selalu `pending`:
 * akun belum mendapat kewenangan apa pun sampai admin memverifikasi.
 */
export function OrganizationRegisterPage() {
  const navigate = useNavigate();
  const { token, me } = useMe();

  const [name, setName] = useState("");
  const [legalType, setLegalType] = useState("yayasan");
  const [picName, setPicName] = useState(me?.fullName ?? "");
  const [picPhone, setPicPhone] = useState("");
  const [picEmail, setPicEmail] = useState(me?.email ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Dokumen legal wajib diunggah (PDF atau gambar).");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setError("Ukuran dokumen melebihi 10 MB.");
      return;
    }
    if (!token) return;

    setBusy(true);
    try {
      const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
        method: "POST",
        token,
        body: JSON.stringify({
          kind: "org_document",
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });

      const put = await fetch(presign.putUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Unggah dokumen gagal (${put.status})`);

      await apiFetch("/organizations", {
        method: "POST",
        token,
        body: JSON.stringify({
          name,
          legalType,
          legalDocKey: presign.key,
          picName,
          picPhone,
          picEmail: picEmail || undefined,
        }),
      });

      navigate("/organisasi", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Daftarkan organisasi</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Hanya organisasi terverifikasi yang boleh mengambil laporan dan membuka donasi. Dokumen
          diperiksa admin, dan hanya terlihat oleh admin serta pihak terkait.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Nama organisasi">
            <input
              required
              minLength={3}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              placeholder="Yayasan Peduli Malang"
            />
          </Field>

          <Field label="Bentuk badan">
            <select
              value={legalType}
              onChange={(event) => setLegalType(event.target.value)}
              className={inputClass}
            >
              <option value="yayasan">Yayasan</option>
              <option value="komunitas">Komunitas</option>
              <option value="koperasi">Koperasi</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama penanggung jawab">
              <input
                required
                minLength={3}
                value={picName}
                onChange={(event) => setPicName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Nomor HP penanggung jawab">
              <input
                required
                inputMode="tel"
                value={picPhone}
                onChange={(event) => setPicPhone(event.target.value)}
                className={inputClass}
                placeholder="08xx"
              />
            </Field>
          </div>

          <Field label="Email organisasi" hint="Opsional, untuk korespondensi verifikasi.">
            <input
              type="email"
              value={picEmail}
              onChange={(event) => setPicEmail(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field
            label="Dokumen legal"
            hint="Akta pendirian atau SK. PDF/JPG/PNG, maksimal 10 MB. Tidak dipublikasikan."
          >
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-normal"
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={buttonPrimary}>
              {busy ? "Mengirim…" : "Kirim pendaftaran"}
            </button>
            <p className="text-[12px] text-muted">Status awal: menunggu verifikasi admin.</p>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
