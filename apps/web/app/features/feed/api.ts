import type { DisasterType, FeedSection } from "@jangkau/shared";

import { publicEnv } from "~/shared/lib/env";

export type FeedItem = {
  id: string;
  title: string;
  disasterType: DisasterType;
  summary: string | null;
  status: string;
  section: FeedSection;
  location: { lat: number; lng: number };
  region: {
    village: string | null;
    district: string | null;
    regency: string | null;
    province: string | null;
  };
  radiusM: number;
  severity: number;
  likeCount: number;
  postCount: number;
  picCount: number;
  poskoCount: number;
  coverUrl: string | null;
  firstReportedAt: string;
  lastActivityAt: string;
  uploaders: Array<{ id: string; name: string; username: string | null; post_count: number }>;
  hasPersonInCharge: boolean;
  likedByMe: boolean;
};

export type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
};

export type PersonInCharge = {
  assignmentId: string;
  distributorId: string;
  label: "organization" | "volunteer" | "creator";
  displayName: string;
  bio: string | null;
  verified: boolean;
  socialUrl: string | null;
  followerCount: number | null;
  totalIn: number;
  totalOut: number;
  balance: number;
  donationCount: number;
  handledEventCount: number;
  poskoCount: number;
};

export type PoskoSummary = {
  id: string;
  name: string;
  address: string | null;
  headcount: number;
  capacity: number | null;
  status: string;
  surveyed_at: string | null;
};

export type EventDetail = {
  event: FeedItem;
  likedByMe: boolean;
  personInCharge: PersonInCharge[];
  posko: PoskoSummary[];
  myApplication: { id: string; status: string; pitch: string | null } | null;
  viewer: {
    profileId: string;
    accountType: string;
    isAdmin: boolean;
    distributor: { label: string; verificationStatus: string } | null;
  } | null;
};

/**
 * Fetch dari server maupun browser. SSR memakai URL Worker yang sama,
 * jadi tidak ada jalur data kedua yang perlu dirawat.
 */
async function get<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Response("Gagal memuat data dari API", { status: response.status });
  }

  return (await response.json()) as T;
}

export function fetchFeed(params: {
  section?: FeedSection | "all";
  limit?: number;
  cursor?: string;
}): Promise<FeedResponse> {
  const query = new URLSearchParams();
  if (params.section) query.set("section", params.section);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);

  return get<FeedResponse>(`/events?${query.toString()}`);
}

export function fetchEvent(id: string, token?: string | null): Promise<EventDetail> {
  return get<EventDetail>(`/events/${id}`, token);
}

/** Rupiah tanpa desimal, mengikuti locale aktif. */
export function formatRupiah(value: number, locale = "id-ID"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * "2 jam lalu" tanpa dependensi tambahan.
 *
 * `numeric: "auto"` menghasilkan "menit ini" untuk selisih di bawah satu menit,
 * yang terbaca janggal di kartu. Untuk rentang itu dipakai "baru saja".
 */
export function relativeTime(iso: string, locale = "id-ID"): string {
  const diffMs = Date.parse(iso) - Date.now();
  if (Math.abs(diffMs) < 60_000) return locale.startsWith("en") ? "just now" : "baru saja";

  const minutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];

  let value = minutes;
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) return formatter.format(value, unit);
    value = Math.round(value / step);
  }

  return formatter.format(value, "year");
}
