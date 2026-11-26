import { Link } from "react-router";

import { useAuthState } from "~/features/auth/session";
import { CountUp, Reveal } from "~/shared/ui/reveal";

const PILLARS = [
  {
    title: "Rincian, bukan ringkasan",
    body: "Rencana Anggaran Biaya dibuka per item sebelum donasi dimulai, bukan satu angka bulat di akhir.",
  },
  {
    title: "Dicek sebelum uang cair",
    body: "Lokasi laporan harus di dalam radius pos, dan setiap tahap pencairan menunggu bukti belanja.",
  },
  {
    title: "Warga punya jalur",
    body: "Laporan tersimpan di perangkat lebih dulu, lalu terkirim sendiri saat sinyal kembali.",
  },
];

const PROBLEMS = [
  {
    number: "01",
    title: "Bantuan menumpuk di satu pos, kosong di pos lain",
    body: "Donasi bergerak atas dasar cerita, bukan angka kebutuhan per pos. Tidak ada yang tahu pos mana kekurangan air dan pos mana kelebihan selimut.",
  },
  {
    number: "02",
    title: "Penggunaan dana baru terbaca setelah selesai",
    body: "Laporan pertanggungjawaban datang belakangan. Kalau ada yang tidak sesuai, uangnya sudah keluar.",
  },
  {
    number: "03",
    title: "Laporan lapangan tidak menempel ke mana pun",
    body: "Warga melapor lewat pesan singkat yang tersebar. Laporan itu tidak terhubung ke pos, ke anggaran, atau ke stok barang.",
  },
];

const CHANGES = [
  "Kebutuhan dilaporkan dari lokasi, tetap tersimpan walau sinyal hilang.",
  "RAB disusun organisasi terverifikasi, lalu dikonfirmasi pelapor sebelum donasi dibuka.",
  "Dana cair bertahap; tahap berikutnya menunggu bukti belanja dan konfirmasi barang diterima.",
  "Stok tiap pos terlihat publik dan ikut ter-update setiap ada barang masuk atau keluar.",
];

const FEATURES = [
  {
    title: "Lapor tanpa sinyal",
    body: "Laporan dan foto masuk antrean di perangkat, terkirim otomatis saat koneksi kembali. Retry tidak membuat duplikat.",
  },
  {
    title: "Validasi radius pos",
    body: "Titik lokasi perangkat diuji terhadap radius pos dengan PostGIS. Laporan di luar radius ditolak sebelum disimpan.",
  },
  {
    title: "Ambang dukungan",
    body: "Laporan baru layak diambil organisasi setelah mendapat dukungan minimum dari akun berbeda.",
  },
  {
    title: "RAB dan konfirmasi pelapor",
    body: "Rincian kebutuhan dan biaya per item, disetujui pelapor sebelum kampanye berstatus menerima donasi.",
  },
  {
    title: "Pencairan bertahap",
    body: "Aturan rilis dijaga di database: tanpa bukti belanja dan konfirmasi barang, tahap berikutnya tidak terbuka.",
  },
  {
    title: "Stok per pos",
    body: "Setiap pergerakan barang tercatat dengan alasan dan pelakunya. Saldo tidak bisa diubah tanpa jejak.",
  },
];

const ROLES = [
  {
    index: "01",
    name: "Pelapor",
    who: "Warga & koordinator pos",
    steps: [
      "Buat akun, pilih pos pengungsian.",
      "Tulis kebutuhan, ambil lokasi perangkat.",
      "Laporan masuk antrean perangkat lebih dulu.",
      "Pantau status: menunggu, tervalidasi, siap diambil.",
    ],
    access: "Akun pelapor",
  },
  {
    index: "02",
    name: "Organisasi",
    who: "Lembaga & relawan terverifikasi",
    steps: [
      "Daftarkan organisasi dan unggah dokumen legal.",
      "Tunggu verifikasi admin sebelum bisa bertindak.",
      "Ambil laporan yang sudah memenuhi ambang.",
      "Susun RAB, ajukan ke pelapor, kelola pencairan.",
    ],
    access: "Butuh verifikasi admin",
  },
  {
    index: "03",
    name: "Donor",
    who: "Publik & pendukung",
    steps: [
      "Buka kampanye per pos pengungsian.",
      "Periksa RAB dan status konfirmasi pelapor.",
      "Donasi ke permintaan tertentu (mode simulasi).",
      "Ikuti bukti belanja dan stok yang masuk.",
    ],
    access: "Tanpa akun untuk melihat",
  },
];

export function LandingPage() {
  const { session, ready } = useAuthState();
  const signedIn = ready && Boolean(session);

  return (
    <>
      {/* Satu lapisan motif untuk seluruh isi halaman, berhenti tepat di footer. */}
      <div className="page-pattern">
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
          <Reveal>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
              <span className="h-px w-6 bg-brand-line" aria-hidden />
              Case 2 — Stronger Communities and Everyday Services
            </p>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="mt-5 max-w-4xl text-[2.1rem] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-6xl">
              Bantuan berhenti menumpuk di satu pos.
              <span className="block text-brand">Mulai mengikuti kebutuhan nyata.</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-lg">
              Jangkau menghubungkan pelapor di lokasi, organisasi kemanusiaan terverifikasi, dan
              donor dalam satu alur yang bisa ditelusuri per pos pengungsian — dari laporan pertama
              sampai barang diterima.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={signedIn ? "/lapor" : "/daftar"}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
              >
                {signedIn ? "Buat laporan baru" : "Buat akun pelapor"}
              </Link>
              <a
                href="#cara-kerja"
                className="rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-line hover:text-brand"
              >
                Lihat alurnya
              </a>
            </div>
          </Reveal>

          <Reveal delay={280}>
            <dl className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              {[
                { value: 1800, suffix: "", label: "warga mengungsi akibat kebakaran di Bangka Selatan" },
                { value: 405, suffix: "", label: "pengungsi terkonsentrasi di satu pos saat erupsi Sinabung" },
                { value: 3, suffix: " lapis", label: "verifikasi: dokumen, radius lokasi, bukti belanja" },
              ].map((stat) => (
                <div key={stat.label} className="bg-canvas px-5 py-6">
                  <dt className="text-3xl font-extrabold tracking-tight text-brand">
                    <CountUp value={stat.value} suffix={stat.suffix} />
                  </dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section className="border-y border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
                Apa itu Jangkau
              </p>
              <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
                Satu lapisan keterbukaan di dalam alur bantuan.
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
                Laporan, anggaran, donasi, dan stok hidup dalam satu sistem. Yang biasanya jadi
                lampiran, di sini jadi data yang bisa diperiksa.
              </p>
            </Reveal>

            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {PILLARS.map((pillar, index) => (
                <Reveal as="li" key={pillar.title} delay={index * 80}>
                  <div className="h-full rounded-xl border border-line bg-white p-6 transition-colors hover:border-brand-line">
                    <h3 className="text-[15px] font-semibold">{pillar.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{pillar.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="cara-kerja" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
              Kenapa perlu
            </p>
            <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              Bantuan yang terkumpul belum tentu sampai ke pos yang tepat.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <ol className="flex flex-col divide-y divide-line border-t border-line">
              {PROBLEMS.map((problem, index) => (
                <Reveal as="li" key={problem.number} delay={index * 70}>
                  <div className="flex gap-5 py-6">
                    <span className="mt-0.5 text-xs font-bold tracking-widest text-brand">
                      {problem.number}
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold">{problem.title}</h3>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                        {problem.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={120}>
              <div className="rounded-xl border border-brand-line bg-brand-soft/40 p-6">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-strong uppercase">
                  Yang Jangkau ubah
                </p>
                <ul className="mt-4 flex flex-col gap-3">
                  {CHANGES.map((change) => (
                    <li key={change} className="flex gap-2.5 text-[13px] leading-relaxed">
                      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="fitur" className="border-y border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
                Fitur
              </p>
              <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
                Yang bisa diperiksa, bukan hanya diumumkan.
              </h2>
            </Reveal>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <Reveal as="li" key={feature.title} delay={(index % 3) * 70}>
                  <div className="h-full rounded-xl border border-line bg-white p-5 transition-colors hover:border-brand-line">
                    <h3 className="text-[14px] font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{feature.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="peran" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
              Tiga peran, satu alur
            </p>
            <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              Setiap pihak melihat bagian yang relevan.
            </h2>
          </Reveal>

          <ul className="mt-10 grid gap-4 lg:grid-cols-3">
            {ROLES.map((role, index) => (
              <Reveal as="li" key={role.name} delay={index * 80}>
                <div className="flex h-full flex-col rounded-xl border border-line bg-white p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[15px] font-semibold">{role.name}</h3>
                    <span className="text-xs font-bold tracking-widest text-brand">
                      {role.index}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{role.who}</p>

                  <ol className="mt-4 flex flex-1 flex-col gap-2.5">
                    {role.steps.map((step, stepIndex) => (
                      <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed">
                        <span className="mt-0.5 w-3 shrink-0 text-[11px] font-semibold text-muted tabular-nums">
                          {stepIndex + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>

                  <p className="mt-5 border-t border-line pt-3 text-[12px] font-medium text-brand-strong">
                    {role.access}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <Reveal>
            <div className="rounded-2xl border border-line bg-white p-8 sm:p-10">
              <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
                Lihat sendiri pos mana yang kebutuhannya belum terpenuhi.
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
                Peta dan stok pos terbuka untuk siapa saja. Untuk melapor, mengambil laporan, atau
                mengelola pencairan, masuk sesuai peran.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to={signedIn ? "/laporan" : "/masuk"}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
                >
                  {signedIn ? "Buka dasbor" : "Masuk"}
                </Link>
                <Link
                  to="/daftar"
                  className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-line hover:text-brand"
                >
                  Daftar sebagai pelapor
                </Link>
              </div>
              <p className="mt-6 text-[12px] leading-relaxed text-muted">
                Prototipe ini memakai data sintetis. Pembayaran dan pencairan dana berjalan dalam
                mode simulasi dan diberi label di antarmuka.
              </p>
            </div>
          </Reveal>
        </section>
      </div>
    </>
  );
}
