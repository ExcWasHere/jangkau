/**
 * Kamus bahasa Indonesia — sumber kebenaran istilah.
 *
 * `en.ts` wajib `satisfies Dict`, jadi kunci yang hilang langsung gagal
 * typecheck. Tambah kunci di sini lebih dulu, lalu terjemahkan.
 *
 * Nada penulisan (design.md §8.3): kalimat aktif, angka konkret, tidak
 * menyalahkan pengguna, tidak menjanjikan.
 */
export const id = {
  meta: {
    homeTitle: "Jangkau — berita bencana yang bisa langsung dibantu",
    homeDescription:
      "Warga melaporkan bencana di lokasinya, komunitas mendukung, penyalur terverifikasi menangani, dan setiap rupiah bisa dilacak.",
    eventTitleSuffix: "Jangkau",
    accountTitle: "Akun saya — Jangkau",
    uploadTitle: "Unggah laporan bencana — Jangkau",
    signInTitle: "Masuk — Jangkau",
    signUpTitle: "Daftar — Jangkau",
  },

  nav: {
    home: "Beranda",
    leaderboard: "Leaderboard",
    pantau: "Pantau",
    upload: "Unggah",
    account: "Akun",
    signIn: "Masuk",
    signUp: "Daftar",
    signOut: "Keluar",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
  },

  common: {
    loading: "Memuat…",
    loadingSession: "Memuat sesi…",
    retry: "Coba lagi",
    close: "Tutup",
    backToHome: "Kembali ke beranda",
    locationUnknown: "Lokasi tidak disebut",
    noPhoto: "Belum ada foto",
    justNow: "baru saja",
    errorTitle: "Terjadi kesalahan",
    errorDetail: "Halaman ini gagal dimuat.",
    notFoundTitle: "Halaman tidak ditemukan",
    notFoundDetail: "Alamat yang kamu buka tidak ada.",
    loadFailed: "Gagal memuat data",
  },

  footer: {
    tagline: "Jangkau — bantuan tepat sasaran untuk lokasi bencana.",
    demoNote: "Data demo. Pencairan dana disimulasikan.",
  },

  preferences: {
    language: "Bahasa",
    theme: "Tema",
    themeDark: "Gelap",
    themeLight: "Terang",
    themeSystem: "Ikuti perangkat",
    saved: "Preferensi disimpan",
    saveFailed: "Preferensi gagal disimpan di akun, tapi tetap berlaku di perangkat ini",
  },

  feed: {
    leaderboardTitle: "Leaderboard",
    pantauTitle: "Pantau",
    terbaruTitle: "Terbaru",
    leaderboardHint: "Berita yang sudah menembus ambang dukungan dan siap diambil penyalur.",
    pantauHint:
      "Sudah ada penanggung jawab. Kebutuhan posko dan bukti belanja terbuka untuk publik.",
    terbaruHint: "Laporan terbaru dari warga di lokasi.",
    leaderboardEmpty: "Belum ada berita yang menembus ambang dukungan.",
    pantauEmpty: "Belum ada berita yang punya penanggung jawab.",
    terbaruEmpty: "Belum ada laporan. Jadilah yang pertama melapor.",
    seeAll: "Lihat semua",
    supportLabel: "dukungan",
    reporterLabel: "pelapor",
    poskoLabel: "posko",
    hasPic: "Sudah ada penanggung jawab · {count}",
    noPic: "Belum ada penanggung jawab",
    photoAlt: "Foto lokasi {title}",
    sectionLeaderboard: "LEADERBOARD",
    sectionPantau: "PANTAU",
    sectionTerbaru: "TERBARU",
    homeTitle: "Bantuan yang sampai ke lokasi yang tepat.",
    homeIntro:
      "Warga melaporkan bencana di sekitarnya. Laporan yang sama digabung menjadi satu berita, lalu didukung bersama. Begitu ada penanggung jawab terverifikasi, kebutuhan posko dan penggunaan dana terbuka untuk publik.",
    loadMore: "Muat lebih banyak",
  },

  event: {
    reportedAt: "dilaporkan {time}",
    support: "Dukung",
    supported: "Didukung",
    reportersAndPosko: "{reporters} pelapor · {posko} posko",
    reportersTitle: "Yang melaporkan",
    uploaderLine: "{name} · {count} unggahan",
    picTitle: "Penanggung jawab penyaluran",
    picEmpty: "Belum ada penanggung jawab. Berita ini masih mengumpulkan dukungan.",
    labelOrganization: "Organisasi tanggap bencana",
    labelVolunteer: "Relawan",
    labelCreator: "Kreator",
    verified: "Terverifikasi",
    raised: "Terkumpul",
    disbursed: "Disalurkan",
    donorCount: "Donatur",
    poskoCount: "Posko",
    poskoTitle: "Posko",
    poskoEmpty: "Kebutuhan posko terbuka setelah penanggung jawab menyelesaikan survei.",
    headcount: "{count} pengungsi",
    capacity: "kapasitas {count}",
    addressEmpty: "Alamat belum diisi",
    signInToSupport: "Masuk dulu untuk mendukung berita ini.",
    kindPantau: "PANTAU",
  },

  upload: {
    title: "Unggah laporan bencana",
    intro:
      "Lokasi diambil dari perangkat dan wajib. Laporan yang membicarakan bencana yang sama akan digabung jadi satu berita.",
    bodyLabel: "Apa yang terjadi?",
    bodyPlaceholder:
      "Contoh: Air bah masuk jam 2 pagi, tiga dusun terendam, warga mengungsi ke balai desa. Butuh air bersih dan selimut.",
    placeLabel: "Nama lokasi (opsional)",
    placePlaceholder: "Dusun Krajan, Kromengan",
    photosLabel: "Foto (maksimal 4)",
    photosHint:
      "Foto dikompres di perangkat sebelum diunggah. Jangan memotret wajah orang yang bisa dikenali.",
    submit: "Kirim laporan",
    submitting: "Mengirim…",
    statusLocating: "Mengambil lokasi…",
    statusUploading: "Mengunggah {count} foto…",
    statusSending: "Mengirim laporan…",
    signInRequired: "Masuk dulu untuk mengunggah laporan bencana.",
    geolocationFailed: "Lokasi tidak bisa diambil. Izinkan akses lokasi lalu coba lagi.",
    incomplete: "Laporan belum lengkap",
    successMerged: "Laporan digabung ke berita yang sudah ada.",
    successNew: "Laporan terbit sebagai berita baru.",
  },

  account: {
    title: "Akun saya",
    roleResident: "Warga",
    roleDistributor: "Penyalur bantuan",
    roleAdmin: "Admin",
    badgesTitle: "Lencana",
    badgesEmpty:
      "Belum ada lencana. Unggah laporan bencana untuk mendapat lencana Pelapor, atau berdonasi untuk lencana Donatur.",
    badgeReporter: "Pelapor",
    badgeFunder: "Donatur",
    distributorTitle: "Profil penyalur",
    distributorVerified: "Kamu bisa mengajukan diri sebagai penanggung jawab penyaluran.",
    distributorPending:
      "Pengajuan penanggung jawab terbuka setelah verifikasi disetujui admin.",
    distributorRejection: "Catatan admin: {reason}",
    verificationUnverified: "Belum diverifikasi",
    verificationPending: "Menunggu tinjauan admin",
    verificationVerified: "Terverifikasi",
    verificationRejected: "Ditolak",
    verificationSuspended: "Ditangguhkan",
  },

  auth: {
    signInTitle: "Masuk",
    signInIntro: "Warga dan penyalur bantuan memakai pintu yang sama.",
    signUpTitle: "Daftar akun",
    signUpIntro: "Pilih peran utamamu. Keduanya bisa melaporkan bencana dan berdonasi.",
    email: "Email",
    password: "Kata sandi",
    fullName: "Nama lengkap",
    phone: "Nomor HP",
    phonePlaceholder: "08xx",
    signIn: "Masuk",
    signUp: "Daftar",
    withGoogle: "Masuk dengan Google",
    or: "atau",
    noAccount: "Belum punya akun?",
    hasAccount: "Sudah punya akun?",
    processing: "Memproses…",
    checkEmailTitle: "Cek email kamu",
    checkEmailBody: "Tautan konfirmasi dikirim ke {email}. Setelah dikonfirmasi, kamu bisa masuk dan mulai melapor.",
    goToSignIn: "Ke halaman masuk",
    supabaseMissing:
      "Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di apps/web/.env.",
    accountTypeLegend: "Aku mendaftar sebagai",
    accountTypeResident: "Warga",
    accountTypeResidentHint: "Laporkan kondisi bencana di sekitarmu dan bantu lewat donasi.",
    accountTypeDistributor: "Penyalur Bantuan",
    accountTypeDistributorHint: "Kelola posko dan salurkan bantuan ke lokasi bencana.",
    accountTypeNote:
      "Keduanya bisa melaporkan bencana dan berdonasi. Penyalur bantuan bisa mengajukan diri sebagai penanggung jawab setelah terverifikasi.",
    labelLegend: "Jenis penyalur",
    labelOrganization: "Organisasi Tanggap Bencana",
    labelOrganizationHint: "Siapkan akta, SK, dan KTP penanggung jawab",
    labelVolunteer: "Relawan",
    labelVolunteerHint: "Siapkan KTP dan bukti kegiatan",
    labelCreator: "Kreator",
    labelCreatorHint: "Siapkan tautan sosial dan statistik pengikut",
    signInFailed: "Gagal masuk",
    signUpFailed: "Gagal mendaftar",
    googleFailed: "Gagal masuk dengan Google",
  },

  guards: {
    unverifiedTitle: "Verifikasi penyalur belum disetujui",
    unverifiedBody:
      "Lengkapi dokumen di dasbor penyalur dan tunggu persetujuan admin. Setelah mendapat centang terverifikasi, kamu bisa mengajukan diri sebagai penanggung jawab penyaluran.",
  },
};

/**
 * Tipe kamus. Nilai sengaja dilebarkan menjadi `string` (bukan literal) supaya
 * kamus lain bisa memakai teks berbeda; yang dijaga ketat adalah kuncinya.
 */
export type Dict = typeof id;
