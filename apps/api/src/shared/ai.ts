import { z } from "zod";

import { DISASTER_TYPES, NEED_CATEGORIES } from "@jangkau/shared";

import type { Bindings } from "../env.js";

/**
 * Klien AI. Endpoint kompatibel OpenAI chat-completions (inferhub), jadi tidak
 * perlu SDK tambahan dan bisa diganti provider lain cukup dengan mengubah
 * AI_BASE_URL.
 *
 * Prinsip dari PRD §7: AI hanya mengusulkan. Setiap fungsi di sini
 * mengembalikan `null` saat provider gagal atau keluarannya tidak valid, dan
 * pemanggil wajib punya jalur lanjut tanpa AI (post tetap terbit dengan
 * `needs_review = true`).
 */

const REQUEST_TIMEOUT_MS = 12_000;

export const postClassificationSchema = z.object({
  category: z.enum(NEED_CATEGORIES),
  confidence: z.number().min(0).max(1),
  /** Judul event yang layak tampil di kartu feed, maksimal 80 karakter. */
  suggestedTitle: z.string().min(4).max(80),
  disasterType: z.enum(DISASTER_TYPES),
  /** 1 = ringan, 5 = kritis. Dipakai untuk memilih hero beranda. */
  severity: z.number().int().min(1).max(5),
});

export type PostClassification = z.infer<typeof postClassificationSchema>;

export const mergeVerdictSchema = z.object({
  sameEvent: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300),
});

export type MergeVerdict = z.infer<typeof mergeVerdictSchema>;

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

async function chat(
  env: Bindings,
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) return null;

  try {
    const response = await fetch(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.AI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        temperature: 0,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as ChatResponse;
    const content = payload.choices?.[0]?.message?.content;
    return content?.trim() || null;
  } catch {
    return null;
  }
}

/** Model kadang membungkus JSON dengan ```json; ambil objek pertama. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const CLASSIFY_PROMPT = `Kamu mengklasifikasi unggahan warga tentang bencana di Indonesia.
Balas HANYA satu objek JSON, tanpa penjelasan, tanpa blok kode.

Bentuk wajib:
{"category":"<kategori>","confidence":<0..1>,"suggestedTitle":"<judul 4-80 karakter>","disasterType":"<jenis>","severity":<1..5>}

Nilai category yang diizinkan: ${NEED_CATEGORIES.join(", ")}.
Nilai disasterType yang diizinkan: ${DISASTER_TYPES.join(", ")}.
Aturan:
- category = kebutuhan paling mendesak yang disebut, bukan jenis bencana.
- suggestedTitle = nama bencana + lokasi bila disebut, mis. "Banjir Bandang Arjuna".
  Tanpa tanda kutip, tanpa emoji, tanpa titik di akhir.
- severity: 1 ringan, 3 sedang, 5 kritis. Pakai 3 bila tidak ada petunjuk.
- confidence mencerminkan keyakinanmu, bukan panjang teks.
- Jangan mengarang nama tempat yang tidak disebut.`;

/**
 * Klasifikasi satu unggahan. `null` berarti AI tidak bisa dipakai — pemanggil
 * tetap menerbitkan post dengan kategori `other`.
 */
export async function classifyPost(
  env: Bindings,
  input: { body: string; placeLabel?: string | null; disasterTypeHint?: string | null },
): Promise<PostClassification | null> {
  const context = [
    input.placeLabel ? `Lokasi disebut pengguna: ${input.placeLabel}` : null,
    input.disasterTypeHint ? `Petunjuk jenis bencana dari pengguna: ${input.disasterTypeHint}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(env, [
    { role: "system", content: CLASSIFY_PROMPT },
    { role: "user", content: context ? `${context}\n\nIsi unggahan:\n${input.body}` : input.body },
  ]);

  if (!raw) return null;

  const parsed = postClassificationSchema.safeParse(extractJson(raw));
  return parsed.success ? parsed.data : null;
}

const MERGE_PROMPT = `Kamu menilai apakah dua unggahan bencana di Indonesia membicarakan
KEJADIAN YANG SAMA (satu bencana, satu lokasi, satu rentang waktu), bukan sekadar
jenis bencana yang sama.
Balas HANYA satu objek JSON: {"sameEvent":true|false,"confidence":<0..1>,"reason":"<1 kalimat>"}

Aturan:
- Bencana berbeda di kota berbeda = false, walaupun jenisnya sama.
- Banjir di kecamatan yang sama pada hari yang sama = true.
- Bila ragu, jawab false. Kesalahan menggabung lebih merugikan daripada tidak menggabung.`;

/**
 * Verdict untuk satu pasangan kandidat. Hanya dipanggil pada kandidat yang
 * sudah lolos penyaring jarak + kemiripan teks, jadi biayanya kecil.
 */
export async function judgeMergeCandidate(
  env: Bindings,
  a: { title: string; body: string; place: string | null },
  b: { title: string; body: string; place: string | null },
): Promise<MergeVerdict | null> {
  const raw = await chat(env, [
    { role: "system", content: MERGE_PROMPT },
    {
      role: "user",
      content:
        `Kejadian A — judul: ${a.title}; lokasi: ${a.place ?? "tidak disebut"}\n` +
        `Isi A: ${a.body}\n\n` +
        `Kejadian B — judul: ${b.title}; lokasi: ${b.place ?? "tidak disebut"}\n` +
        `Isi B: ${b.body}`,
    },
  ]);

  if (!raw) return null;

  const parsed = mergeVerdictSchema.safeParse(extractJson(raw));
  return parsed.success ? parsed.data : null;
}
