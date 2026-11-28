/**
 * Mengunduh foto bencana Indonesia dari Wikimedia Commons, mengompresnya ke WebP
 * 1600 px, lalu mengunggahnya ke R2.
 *
 *   bun run scripts/fetch-photos.ts
 *
 * Hanya perlu dijalankan sekali (atau saat ingin menyegarkan aset demo).
 * Butuh: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 *
 * Semua berkas berlisensi bebas; atribusi wajib dicantumkan di README
 * (lihat bagian "Kredit foto demo"). Hasil kredit ditulis ke photo-credits.json
 * di direktori kerja supaya tabel README bisa diperbarui tanpa menebak.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SOURCES: [slug: string, commonsTitle: string][] = [
  ["jakarta-flood-2020", "Floods in Raya Bintara Rd. (1 January 2020).jpg"],
  ["semarang-flood", "Abandoned guardhouse in flooded parking lot, Tanjung Mas Harbour, Semarang.jpg"],
  ["jakarta-flood-tanjung-duren", "Banjir Jakarta Perumahan di Tanjung Duren 1 Januari 2020.jpg"],
  ["sumatra-aid-logistics", "Aid sent for disaster management in West Sumatra.jpg"],
  ["tangerang-prison-fire", "Kebakaran di Lapas Tangerang, VOA Indonesia.jpg"],
  ["bukittinggi-market-fire", "Kebakaran di Pasar Atas Bukittinggi.jpg"],
  ["lombok-earthquake-damage", "Joko Widodo Lombok Earthquake damage.jpg"],
  ["cianjur-landslide", "Cianjur earthquake landslide.jpg"],
  ["merapi-eruption", "2010 Eruption at Mount Merapi, Indonesia.jpg"],
];

const USER_AGENT = "JangkauHackathon/1.0 (demo seed; team Isin Aq Yank)";

const r2 = new Bun.S3Client({
  accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
  secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  bucket: requireEnv("R2_BUCKET"),
  endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  region: "auto",
});

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`${key} belum diset.`);
    process.exit(1);
  }
  return value;
}

/** Commons membatasi laju permintaan; ulangi dengan jeda bertahap. */
async function fetchWithRetry(url: string, attempts = 5): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) return null;
    await Bun.sleep(4000 * (i + 1));
  }
  return null;
}

type Credit = {
  slug: string;
  key: string;
  bytes: number;
  width: number | undefined;
  height: number | undefined;
  license: string;
  artist: string;
  page: string;
};

const credits: Credit[] = [];

for (const [slug, title] of SOURCES) {
  const metaUrl =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
    `&titles=${encodeURIComponent(`File:${title}`)}` +
    "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600";

  const metaResponse = await fetchWithRetry(metaUrl);
  if (!metaResponse) {
    console.warn(`lewat ${slug}: metadata tidak tersedia`);
    continue;
  }

  const meta = (await metaResponse.json()) as {
    query: { pages: Record<string, { imageinfo?: { url: string; thumburl?: string; extmetadata?: Record<string, { value: string }> }[] }> };
  };
  const info = Object.values(meta.query.pages)[0]?.imageinfo?.[0];
  if (!info) {
    console.warn(`lewat ${slug}: imageinfo kosong`);
    continue;
  }

  const imageResponse = await fetchWithRetry(info.thumburl ?? info.url);
  if (!imageResponse) {
    console.warn(`lewat ${slug}: gambar tidak bisa diunduh`);
    continue;
  }

  const webp = await sharp(Buffer.from(await imageResponse.arrayBuffer()))
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const key = `posts/2026/11/${slug}.webp`;
  await r2.write(key, webp, { type: "image/webp" });

  const dimensions = await sharp(webp).metadata();
  credits.push({
    slug,
    key,
    bytes: webp.length,
    width: dimensions.width,
    height: dimensions.height,
    license: info.extmetadata?.LicenseShortName?.value ?? "?",
    artist: (info.extmetadata?.Artist?.value ?? "?").replace(/<[^>]+>/g, "").trim(),
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
  });

  console.log(`OK ${slug}.webp ${Math.round(webp.length / 1024)} KB`);
  await Bun.sleep(1500);
}

await writeFile("photo-credits.json", JSON.stringify(credits, null, 2), "utf8");
console.log(`selesai: ${credits.length} foto, kredit di photo-credits.json`);
