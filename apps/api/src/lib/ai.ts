import { z } from "zod";

import { NEED_CATEGORIES, SEVERITY_LEVELS } from "@jangkau/shared";

import type { Bindings } from "../env.js";

/**
 * Klien AI. Endpoint kompatibel OpenAI chat-completions (inferhub),
 * jadi tidak perlu SDK tambahan dan bisa diganti provider lain cukup
 * dengan mengubah AI_BASE_URL.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export const classificationSchema = z.object({
  category: z.enum(NEED_CATEGORIES),
  severity: z.enum(SEVERITY_LEVELS),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(300),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        quantity: z.number().nonnegative(),
        unit: z.string().min(1).max(20),
      }),
    )
    .max(20)
    .default([]),
});

export type Classification = z.infer<typeof classificationSchema>;

const SYSTEM_PROMPT = `Kamu mengklasifikasi laporan kebutuhan pos pengungsian bencana di Indonesia.
Balas HANYA dengan satu objek JSON, tanpa penjelasan, tanpa blok kode.

Bentuk wajib:
{"category":"<kategori>","severity":"<tingkat>","confidence":<0..1>,"summary":"<1 kalimat bahasa Indonesia>","items":[{"name":"<barang>","quantity":<angka>,"unit":"<satuan>"}]}

Nilai category yang diizinkan: ${NEED_CATEGORIES.join(", ")}.
Nilai severity yang diizinkan: ${SEVERITY_LEVELS.join(", ")}.
Aturan: gunakan "other" bila kebutuhan tidak jelas. Jangan mengarang jumlah yang tidak disebut;
bila jumlah tidak disebut, pakai 0. confidence mencerminkan keyakinanmu, bukan panjang teks.`;

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

async function chat(env: Bindings, messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    throw new Error("AI belum dikonfigurasi");
  }

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
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`AI HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = (await response.json()) as ChatResponse;
  if (body.error) throw new Error(`AI error: ${body.error.message ?? "unknown"}`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI tidak mengembalikan isi");
  return content;
}

/** Model kadang membungkus JSON dengan ```json; ambil objek pertama. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI tidak mengembalikan objek JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Klasifikasi laporan. Mengembalikan `null` bila AI tidak tersedia atau
 * keluarannya tidak valid — alur laporan tetap jalan dengan kategori "other".
 */
export async function classifyReport(
  env: Bindings,
  text: string,
): Promise<Classification | null> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text.slice(0, 2000) },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await chat(env, messages);
      const parsed = classificationSchema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;

      messages.push({ role: "assistant", content: raw.slice(0, 500) });
      messages.push({
        role: "user",
        content: `JSON itu tidak sesuai skema: ${parsed.error.issues
          .map((issue) => issue.path.join(".") + " " + issue.message)
          .join("; ")}. Ulangi dengan bentuk yang diminta.`,
      });
    } catch (cause) {
      console.error("classify_failed", cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }

  return null;
}

/**
 * Verdict duplikat untuk satu pasangan laporan. Dipakai hanya pada
 * kandidat yang lolos penyaring trigram, jadi biayanya kecil.
 */
export async function judgeDuplicate(
  env: Bindings,
  a: string,
  b: string,
): Promise<{ duplicate: boolean; confidence: number; reason: string } | null> {
  const messages = [
    {
      role: "system",
      content: `Bandingkan dua laporan kebutuhan pos pengungsian. Balas HANYA JSON:
{"duplicate":<true|false>,"confidence":<0..1>,"reason":"<1 kalimat>"}
duplicate=true hanya bila keduanya melaporkan kebutuhan yang sama di pos yang sama, bukan sekadar kategori sama.`,
    },
    { role: "user", content: `Laporan A:\n${a.slice(0, 1200)}\n\nLaporan B:\n${b.slice(0, 1200)}` },
  ];

  try {
    const raw = await chat(env, messages);
    const parsed = z
      .object({
        duplicate: z.boolean(),
        confidence: z.number().min(0).max(1),
        reason: z.string().max(300),
      })
      .safeParse(extractJson(raw));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    console.error("judge_failed", cause instanceof Error ? cause.message : String(cause));
    return null;
  }
}
