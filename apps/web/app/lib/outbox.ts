import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { NeedCategory, SeverityLevel } from "@jangkau/shared";

/**
 * Antrean laporan offline. Satu-satunya sumber kebenaran untuk laporan yang
 * belum terkirim; `clientUuid` dipakai server sebagai kunci idempotensi
 * sehingga retry tidak pernah membuat duplikat.
 */

export type OutboxState = "queued" | "uploading" | "synced" | "failed";

export type OutboxItem = {
  clientUuid: string;
  postId: string;
  bodyText?: string;
  transcript?: string;
  category?: NeedCategory;
  severity: SeverityLevel;
  headcountDelta?: number;
  location: { lat: number; lng: number; accuracyM?: number };
  capturedAt: string;
  mediaKeys: string[];
  state: OutboxState;
  attempts: number;
  error?: string;
  serverId?: string;
  updatedAt: string;
};

type JangkauDB = DBSchema & {
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { "by-state": OutboxState; "by-updated": string };
  };
  cache: {
    key: string;
    value: { key: string; value: unknown; savedAt: string };
  };
};

let dbPromise: Promise<IDBPDatabase<JangkauDB>> | null = null;

function db(): Promise<IDBPDatabase<JangkauDB>> {
  dbPromise ??= openDB<JangkauDB>("jangkau", 1, {
    upgrade(database) {
      const outbox = database.createObjectStore("outbox", { keyPath: "clientUuid" });
      outbox.createIndex("by-state", "state");
      outbox.createIndex("by-updated", "updatedAt");
      database.createObjectStore("cache", { keyPath: "key" });
    },
  });
  return dbPromise;
}

export function newClientUuid(): string {
  return crypto.randomUUID();
}

export async function enqueue(
  item: Omit<OutboxItem, "state" | "attempts" | "updatedAt">,
): Promise<OutboxItem> {
  const record: OutboxItem = {
    ...item,
    state: "queued",
    attempts: 0,
    updatedAt: new Date().toISOString(),
  };
  await (await db()).put("outbox", record);
  return record;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await (await db()).getAllFromIndex("outbox", "by-updated");
  return items.reverse();
}

export async function updateOutbox(
  clientUuid: string,
  patch: Partial<OutboxItem>,
): Promise<void> {
  const database = await db();
  const existing = await database.get("outbox", clientUuid);
  if (!existing) return;
  await database.put("outbox", {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeOutbox(clientUuid: string): Promise<void> {
  await (await db()).delete("outbox", clientUuid);
}

/** Cache kecil untuk daftar pos agar form tetap terisi saat sinyal hilang. */
export async function cacheSet(key: string, value: unknown): Promise<void> {
  await (await db()).put("cache", { key, value, savedAt: new Date().toISOString() });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await (await db()).get("cache", key);
  return row ? (row.value as T) : null;
}

type SyncResult = {
  sent: number;
  duplicates: number;
  failed: number;
  remaining: number;
  lastError: string | null;
};

/**
 * Kirim semua item berstatus queued. Dipanggil saat online, saat aplikasi
 * dibuka, dan saat pengguna menekan "Kirim sekarang".
 *
 * Aturan status:
 *  201            → synced
 *  200 duplicate  → synced
 *  422            → failed (permanen; mis. lokasi di luar radius)
 *  401            → berhenti, sesi perlu diperbarui
 *  5xx / jaringan → tetap queued untuk dicoba lagi
 */
export async function syncOutbox(
  send: (item: OutboxItem) => Promise<{ id: string; duplicate: boolean }>,
  onProgress?: (item: OutboxItem) => void,
): Promise<SyncResult> {
  const items = (await listOutbox()).filter((item) => item.state === "queued");
  const result: SyncResult = {
    sent: 0,
    duplicates: 0,
    failed: 0,
    remaining: 0,
    lastError: null,
  };

  for (const item of items) {
    await updateOutbox(item.clientUuid, { state: "uploading", error: undefined });
    onProgress?.({ ...item, state: "uploading" });

    try {
      const response = await send(item);
      await updateOutbox(item.clientUuid, {
        state: "synced",
        serverId: response.id,
        attempts: item.attempts + 1,
      });
      if (response.duplicate) result.duplicates += 1;
      else result.sent += 1;
      onProgress?.({ ...item, state: "synced", serverId: response.id });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const status = (cause as { status?: number }).status ?? 0;
      const permanent = status >= 400 && status < 500 && status !== 401 && status !== 429;

      await updateOutbox(item.clientUuid, {
        state: permanent ? "failed" : "queued",
        attempts: item.attempts + 1,
        error: message,
      });
      onProgress?.({
        ...item,
        state: permanent ? "failed" : "queued",
        error: message,
      });

      if (permanent) result.failed += 1;
      result.lastError = message;
      if (status === 401) break;
    }
  }

  const all = await listOutbox();
  result.remaining = all.filter((item) => item.state === "queued" || item.state === "uploading").length;
  return result;
}
