import { badRequest } from "./errors.js";

/**
 * Cursor keyset untuk feed: gabungan waktu aktivitas terakhir dan id event.
 * Dua kolom dipakai karena `last_activity_at` bisa sama untuk beberapa event
 * yang diperbarui pada detik yang sama.
 */
export type FeedCursor = { at: string; id: string };

export function encodeCursor(value: FeedCursor): string {
  return btoa(`${value.at}|${value.id}`);
}

export function decodeCursor(raw: string | undefined): FeedCursor | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = atob(raw);
  } catch {
    throw badRequest("invalid_cursor", "Cursor tidak valid");
  }

  const separator = decoded.lastIndexOf("|");
  if (separator <= 0) throw badRequest("invalid_cursor", "Cursor tidak valid");

  const at = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);

  if (Number.isNaN(Date.parse(at)) || id.length < 10) {
    throw badRequest("invalid_cursor", "Cursor tidak valid");
  }

  return { at, id };
}
