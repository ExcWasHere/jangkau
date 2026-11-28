import { Link } from "react-router";
import type { Route } from "./+types/saya";

import { RequireAuth } from "~/features/auth/guards";
import { useMe } from "~/features/auth/use-me";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Akun saya — Jangkau" }];
}

const BADGE_TEXT: Record<string, string> = {
  reporter: "Pelapor",
  funder: "Donatur",
};

const LABEL_TEXT: Record<string, string> = {
  organization: "Organisasi tanggap bencana",
  volunteer: "Relawan",
  creator: "Kreator",
};

const VERIFICATION_TEXT: Record<string, string> = {
  unverified: "Belum diverifikasi",
  pending: "Menunggu tinjauan admin",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  suspended: "Ditangguhkan",
};

function AccountBody() {
  const { me, isVerifiedDistributor } = useMe();
  if (!me) return null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{me.displayName}</h1>
        <p className="text-[13px] text-muted">
          {me.accountType === "distributor" ? "Penyalur bantuan" : "Warga"}
          {me.isAdmin ? " · Admin" : ""}
          {me.email ? ` · ${me.email}` : ""}
        </p>
      </header>

      <section aria-labelledby="lencana">
        <h2 id="lencana" className="text-[16px] font-semibold">
          Lencana
        </h2>
        {me.badges.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">
            Belum ada lencana. Unggah laporan bencana untuk mendapat lencana Pelapor, atau berdonasi
            untuk lencana Donatur.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {me.badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-semibold"
              >
                {BADGE_TEXT[badge] ?? badge}
              </li>
            ))}
          </ul>
        )}
      </section>

      {me.distributor ? (
        <section aria-labelledby="penyalur" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="penyalur" className="text-[16px] font-semibold">
            Profil penyalur
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {LABEL_TEXT[me.distributor.label] ?? me.distributor.label} ·{" "}
            {VERIFICATION_TEXT[me.distributor.verification_status] ?? me.distributor.verification_status}
          </p>

          {me.distributor.bio ? (
            <p className="mt-2 text-[14px] leading-relaxed">{me.distributor.bio}</p>
          ) : null}

          {isVerifiedDistributor ? (
            <p className="mt-3 text-[13px] text-ok">
              Kamu bisa mengajukan diri sebagai penanggung jawab penyaluran.
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-muted">
              Pengajuan penanggung jawab terbuka setelah verifikasi disetujui admin.
              {me.distributor.rejection_reason ? ` Catatan admin: ${me.distributor.rejection_reason}` : ""}
            </p>
          )}
        </section>
      ) : null}

      <p className="text-[13px] text-muted">
        <Link to="/" className="underline hover:text-ink">
          Kembali ke beranda
        </Link>
      </p>
    </div>
  );
}

export default function SayaPage() {
  return (
    <AppShell>
      <RequireAuth>
        <AccountBody />
      </RequireAuth>
    </AppShell>
  );
}
