import type { Route } from "./+types/home";
import { Link } from "react-router";

import { useAuthState } from "~/features/auth/session";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Jangkau — bantuan tepat sasaran untuk pos pengungsian" },
    {
      name: "description",
      content:
        "Warga melaporkan kebutuhan pos pengungsian, organisasi terverifikasi menyusun RAB, donor melihat ke mana bantuan pergi.",
    },
  ];
}

const FLOW = [
  {
    step: "01",
    title: "Lapor dari lokasi",
    body: "Warga dan koordinator pos mencatat kebutuhan, kekurangan stok, dan jumlah pengungsi. Tetap tersimpan saat sinyal hilang.",
  },
  {
    step: "02",
    title: "Divalidasi bersama",
    body: "Lokasi dicek terhadap radius pos, warga lain memberi dukungan, dan laporan serupa digabung agar tidak dihitung berkali-kali.",
  },
  {
    step: "03",
    title: "RAB dikonfirmasi pelapor",
    body: "Organisasi terverifikasi menyusun rincian kebutuhan dan biaya. Pelapor menyetujui sebelum donasi dibuka.",
  },
  {
    step: "04",
    title: "Dana cair bertahap",
    body: "Setiap tahap butuh bukti belanja dan konfirmasi barang diterima, lalu stok pos ikut diperbarui.",
  },
];

const NUMBERS = [
  { value: "1.800", label: "warga mengungsi akibat kebakaran di Bangka Selatan" },
  { value: "405", label: "pengungsi terkonsentrasi di satu pos saat erupsi Sinabung" },
  {
    value: "3 lapis",
    label: "verifikasi: dokumen organisasi, radius lokasi laporan, dan bukti belanja per tahap",
  },
];

export default function Home() {
  const { session, ready } = useAuthState();
  const signedIn = ready && Boolean(session);

  return (
    <main>
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-extrabold tracking-tight">
            Jangkau<span className="text-brand">.</span>
          </span>
          <div className="flex items-center gap-2 text-sm">
            <Link
              to={signedIn ? "/laporan" : "/masuk"}
              className="rounded-lg px-3 py-2 font-medium text-muted hover:text-ink"
            >
              {signedIn ? "Laporan saya" : "Masuk"}
            </Link>
            <Link
              to={signedIn ? "/lapor" : "/daftar"}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-strong"
            >
              {signedIn ? "Buat laporan" : "Mulai lapor"}
            </Link>
          </div>
        </nav>
      </header>

      <section className="pattern-layer pattern-layer-fade">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
          <p className="text-sm font-semibold tracking-widest text-brand uppercase">
            Case 2 — Stronger Communities and Everyday Services
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-extrabold sm:text-5xl">
            Bantuan berhenti menumpuk di satu pos,{" "}
            <span className="text-brand">mulai mengikuti kebutuhan nyata.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            Jangkau menghubungkan pelapor di lokasi, organisasi kemanusiaan terverifikasi, dan
            donor dalam satu alur yang bisa ditelusuri per pos pengungsian — dari laporan pertama
            sampai barang diterima.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={signedIn ? "/lapor" : "/daftar"}
              className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              {signedIn ? "Buat laporan baru" : "Buat akun pelapor"}
            </Link>
            <a
              href="#alur"
              className="rounded-lg border border-brand-line bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              Lihat alurnya
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <dl className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
          {NUMBERS.map((item) => (
            <div key={item.label}>
              <dt className="text-3xl font-extrabold text-brand">{item.value}</dt>
              <dd className="mt-1 text-sm text-muted">{item.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="alur" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-bold sm:text-3xl">Empat langkah yang bisa diaudit</h2>
        <p className="mt-3 max-w-2xl text-muted">
          Setiap perpindahan status tercatat: siapa yang memverifikasi, berapa yang terkumpul,
          dan bukti apa yang menyertai pencairan.
        </p>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2">
          {FLOW.map((item) => (
            <li
              key={item.step}
              className="rounded-xl border border-line bg-white p-6 shadow-sm"
            >
              <span className="text-xs font-bold tracking-widest text-brand">{item.step}</span>
              <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-line">
        <div className="pattern-layer pattern-layer-edge">
          <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted">
            <p className="font-semibold text-ink">Jangkau — Tim Isin Aq Yank</p>
            <p className="mt-1">
              Politeknik Negeri Malang · STACK 2026, GDGoC ITB · Prototipe dengan data sintetis dan
              Midtrans sandbox.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
