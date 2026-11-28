import { Hono } from "hono";

import { createPostSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { classifyPost, judgeMergeCandidate } from "../../shared/ai.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, notFound } from "../../shared/errors.js";
import { distanceMeters } from "../../shared/geo.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient, toPoint } from "../../shared/supabase.js";

export const postRoutes = new Hono<AppEnv>();

/**
 * Batas atas pencarian kandidat. Batas efektif per event tetap
 * `radius_m + post_max_distance_m`, sama dengan yang ditegakkan trigger
 * `fn_guard_post_location`. Kalau pencarian memakai angka lebih besar dari
 * itu, hasil merge akan ditolak trigger saat insert post.
 */
const MERGE_SEARCH_RADIUS_M = 10_000;
const MERGE_WINDOW_DAYS = 7;
/** Skor di atas ini digabung otomatis. */
const MERGE_AUTO_CONFIDENCE = 0.86;
/** Skor di antara ambang tinjauan dan otomatis: digabung, tapi ditandai untuk admin. */
const MERGE_REVIEW_CONFIDENCE = 0.72;
/**
 * Saat AI tidak bisa dipakai, event terdekat dalam jarak ini tetap dipakai
 * sebagai tujuan penggabungan. Tanpa jalur ini, gangguan provider AI membuat
 * satu bencana pecah menjadi banyak berita — persis yang ingin dicegah.
 * Post hasil jalur ini selalu ditandai `needs_review` untuk admin.
 */
const MERGE_FALLBACK_DISTANCE_M = 1500;
/**
 * Di atas ambang tinjauan (0,72) tapi di bawah ambang otomatis (0,86):
 * penggabungan tetap terjadi, dan `needs_review` menandainya untuk admin.
 * Nilai 0,5 akan gagal melewati ambang dan membuat fallback tidak berefek.
 */
const MERGE_FALLBACK_CONFIDENCE = 0.75;
/**
 * Jumlah kandidat yang dinilai AI, bukan hanya yang terdekat.
 *
 * Dua bencana bisa berjarak hampir sama dari satu titik. Kalau hanya kandidat
 * terdekat yang dinilai dan ternyata bukan kejadian yang sama, merge terlewat
 * padahal kandidat kedua cocok — dan berita yang seharusnya satu menjadi dua.
 */
const MERGE_CANDIDATES_EVALUATED = 3;
const DEFAULT_EVENT_RADIUS_M = 1500;
const POST_MAX_DISTANCE_FALLBACK_M = 5000;

type CandidateEvent = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  summary: string | null;
  regency: string | null;
  province: string | null;
  radiusM: number;
  distanceM: number;
};

/**
 * Unggah post bencana.
 *
 * Server yang menentukan event tujuan: cari event terdekat dalam radius dan
 * jendela waktu, minta AI menilai apakah kejadiannya sama, lalu gabung atau
 * buka event baru. Idempoten lewat `client_uuid`, jadi retry dari antrean
 * offline tidak pernah membuat post ganda.
 */
postRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = createPostSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Unggahan tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const existing = await admin
    .from("posts")
    .select("id, event_id, status, created_at")
    .eq("client_uuid", input.clientUuid)
    .maybeSingle();

  if (existing.error) raiseDbError(existing.error);
  if (existing.data) {
    return c.json(
      { post: existing.data, eventId: existing.data.event_id, deduplicated: true },
      200,
    );
  }

  // Klasifikasi dan pencarian kandidat tidak saling bergantung, jadi dijalankan
  // paralel. Berurutan, dua panggilan AI ini memakan ~30 detik; paralel
  // memotongnya menjadi satu kali waktu tunggu — penting untuk antrean offline
  // yang mengirim beberapa unggahan sekaligus.
  const [classification, candidate] = await Promise.all([
    classifyPost(c.env, {
      body: input.body,
      placeLabel: input.placeLabel ?? null,
      disasterTypeHint: input.disasterTypeHint ?? null,
    }),
    findCandidateEvent(c.env, input.location, input.body, input.placeLabel),
  ]);
  const shouldAttach = candidate !== null && candidate.confidence >= MERGE_REVIEW_CONFIDENCE;

  const eventId = shouldAttach
    ? candidate.eventId
    : await createEvent(c.env, {
        title: classification?.suggestedTitle ?? fallbackTitle(input.body, input.placeLabel),
        disasterType: classification?.disasterType ?? input.disasterTypeHint ?? "other",
        severity: classification?.severity ?? 3,
        location: input.location,
        placeLabel: input.placeLabel ?? null,
        createdBy: user.id,
      });

  const needsReview = !classification || (shouldAttach && candidate.confidence < MERGE_AUTO_CONFIDENCE);

  const { data: post, error: postError } = await admin
    .from("posts")
    .insert({
      client_uuid: input.clientUuid,
      event_id: eventId,
      author_id: user.id,
      body: input.body,
      location: toPoint(input.location.lat, input.location.lng),
      accuracy_m: input.location.accuracyM ?? null,
      place_label: input.placeLabel ?? null,
      captured_at: input.capturedAt,
      is_primary: !shouldAttach,
      ai_category: classification?.category ?? null,
      ai_confidence: classification?.confidence ?? null,
      ai_similarity: candidate?.confidence ?? null,
      ai_model: classification ? c.env.AI_MODEL : null,
      needs_review: needsReview,
    })
    .select("id, event_id, status, created_at")
    .single();

  if (postError) raiseDbError(postError);

  if (input.media.length > 0) {
    const { error: mediaError } = await admin.from("post_media").insert(
      input.media.map((item, index) => ({
        post_id: post.id,
        r2_key: item.key,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        width: item.width ?? null,
        height: item.height ?? null,
        sort_order: index,
      })),
    );
    if (mediaError) raiseDbError(mediaError);
  }

  const coverMedia = input.media[0];
  if (!shouldAttach && coverMedia) {
    const { error: coverError } = await admin
      .from("disaster_events")
      .update({ cover_media_key: coverMedia.key })
      .eq("id", eventId)
      .is("cover_media_key", null);
    if (coverError) raiseDbError(coverError);
  }

  return c.json(
    {
      post,
      eventId,
      merged: shouldAttach,
      similarity: candidate?.confidence ?? null,
      needsReview,
      classification,
    },
    201,
  );
});

/** Unggahan milik pemanggil, terbaru dulu. */
postRoutes.get("/mine", requireAuth, async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("posts")
    .select("id, event_id, body, status, captured_at, created_at, ai_category, needs_review")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});

/** Penulis boleh menarik unggahannya; data tetap ada untuk audit. */
postRoutes.delete("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: post, error: postError } = await admin
    .from("posts")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (postError) raiseDbError(postError);
  if (!post) throw notFound("Unggahan tidak ditemukan");
  if (post.author_id !== user.id && !user.isAdmin) {
    throw badRequest("not_owner", "Hanya penulis unggahan yang boleh menghapusnya");
  }

  const { error } = await admin.from("posts").update({ status: "removed" }).eq("id", id);
  if (error) raiseDbError(error);

  return c.json({ ok: true });
});

/**
 * Event terdekat dalam radius dan jendela waktu, dinilai AI.
 *
 * Penyaring jarak dilakukan lebih dulu supaya AI hanya dipanggil untuk satu
 * kandidat terdekat. Ini menjaga biaya dan latensi tetap rendah, dan
 * menghindari menggabungkan dua bencana yang kebetulan sejenis di kota berbeda.
 */
async function findCandidateEvent(
  env: AppEnv["Bindings"],
  location: { lat: number; lng: number },
  body: string,
  placeLabel: string | undefined,
): Promise<{ eventId: string; confidence: number } | null> {
  const admin = adminClient(env);
  const since = new Date(Date.now() - MERGE_WINDOW_DAYS * 86_400_000).toISOString();

  const deltaLat = MERGE_SEARCH_RADIUS_M / 111_320;
  const deltaLng =
    MERGE_SEARCH_RADIUS_M / (111_320 * Math.max(0.1, Math.cos((location.lat * Math.PI) / 180)));

  const [{ data, error }, { data: settings }] = await Promise.all([
    admin
      .from("v_event_feed")
      .select("id, title, lat, lng, summary, regency, province, radius_m")
      .gte("last_activity_at", since)
      .gte("lat", location.lat - deltaLat)
      .lte("lat", location.lat + deltaLat)
      .gte("lng", location.lng - deltaLng)
      .lte("lng", location.lng + deltaLng)
      .limit(10),
    admin
      .from("app_settings")
      .select("key, value")
      .eq("key", "post_max_distance_m")
      .maybeSingle(),
  ]);

  if (error) raiseDbError(error);

  const tolerance = Number(settings?.value ?? POST_MAX_DISTANCE_FALLBACK_M);

  const candidates: CandidateEvent[] = (data ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      lat: row.lat,
      lng: row.lng,
      summary: row.summary,
      regency: row.regency,
      province: row.province,
      radiusM: row.radius_m,
      distanceM: distanceMeters(location, { lat: row.lat, lng: row.lng }),
    }))
    // Sama persis dengan batas trigger: radius event + toleransi jarak.
    .filter((row) => row.distanceM <= row.radiusM + tolerance)
    .sort((a, b) => a.distanceM - b.distanceM);

  const nearest = candidates[0];
  if (!nearest) return null;

  const incoming = { title: fallbackTitle(body, placeLabel), body, place: placeLabel ?? null };
  let aiAvailable = false;

  for (const candidate of candidates.slice(0, MERGE_CANDIDATES_EVALUATED)) {
    const verdict = await judgeMergeCandidate(
      env,
      { title: candidate.title, body: candidate.summary ?? candidate.title, place: candidate.regency },
      incoming,
    );

    if (!verdict) continue;
    aiAvailable = true;

    if (verdict.sameEvent) {
      return { eventId: candidate.id, confidence: verdict.confidence };
    }
  }

  // AI menjawab untuk semua kandidat dan tidak ada yang cocok: buat berita baru.
  if (aiAvailable) return null;

  // AI tidak tersedia sama sekali: pakai jarak sebagai satu-satunya sinyal.
  return nearest.distanceM <= MERGE_FALLBACK_DISTANCE_M
    ? { eventId: nearest.id, confidence: MERGE_FALLBACK_CONFIDENCE }
    : null;
}

/** Judul sementara saat AI tidak tersedia: potongan teks + lokasi. */
function fallbackTitle(body: string, placeLabel: string | undefined): string {
  const firstSentence = body.split(/[.!?\n]/)[0]?.trim() ?? body;
  const trimmed =
    firstSentence.length > 70 ? `${firstSentence.slice(0, 67).trimEnd()}…` : firstSentence;
  return placeLabel ? `${trimmed} (${placeLabel})`.slice(0, 160) : trimmed.slice(0, 160);
}

async function createEvent(
  env: AppEnv["Bindings"],
  input: {
    title: string;
    disasterType: string;
    severity: number;
    location: { lat: number; lng: number };
    placeLabel: string | null;
    createdBy: string;
  },
): Promise<string> {
  const admin = adminClient(env);

  const { data: settings } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["event_default_radius_m"]);

  const radiusRow = settings?.find((row) => row.key === "event_default_radius_m");
  const radius = Number(radiusRow?.value ?? DEFAULT_EVENT_RADIUS_M);

  const { data, error } = await admin
    .from("disaster_events")
    .insert({
      title: input.title,
      disaster_type: input.disasterType,
      severity: input.severity,
      location: toPoint(input.location.lat, input.location.lng),
      radius_m: Number.isFinite(radius) ? radius : DEFAULT_EVENT_RADIUS_M,
      village: input.placeLabel,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) raiseDbError(error);
  return data.id;
}
