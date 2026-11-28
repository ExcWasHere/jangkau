import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Antrean unggahan offline.
 *
 * Warga di lokasi bencana sering kehilangan sinyal justru saat laporan paling
 * dibutuhkan. Unggahan disimpan di IndexedDB — termasuk foto — lalu dikirim
 * saat jaringan kembali. `clientUuid` dibuat sekali di perangkat dan dipakai
 * server sebagai kunci idempotensi, sehingga percobaan ulang tidak pernah
 * membuat unggahan ganda.
 */

const DB_NAME = "jangkau";
const DB_VERSION = 1;
const STORE = "pending-posts";

export type QueuedPhoto = {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
};

export type QueuedPost = {
  clientUuid: string;
  body: string;
  placeLabel?: string;
  capturedAt: string;
  location: { lat: number; lng: number; accuracyM?: number };
  photos: QueuedPhoto[];
  createdAt: string;
  /** Percobaan pengiriman; dipakai untuk menampilkan pesan setelah berulang kali gagal. */
  attempts: number;
  lastError?: string;
};

interface JangkauDB extends DBSchema {
  "pending-posts": {
    key: string;
    value: QueuedPost;
    indexes: { createdAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<JangkauDB>> | null = null;

function db(): Promise<IDBPDatabase<JangkauDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JangkauDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: "clientUuid" });
        store.createIndex("createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

/** IndexedDB tidak tersedia di SSR, mode privat, atau sebagian browser lama. */
export async function isQueueAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    await db();
    return true;
  } catch {
    return false;
  }
}

export async function enqueuePost(input: Omit<QueuedPost, "createdAt" | "attempts">): Promise<void> {
  const database = await db();
  await database.put(STORE, { ...input, createdAt: new Date().toISOString(), attempts: 0 });
}

export async function listQueuedPosts(): Promise<QueuedPost[]> {
  const database = await db();
  return database.getAllFromIndex(STORE, "createdAt");
}

export async function removeQueuedPost(clientUuid: string): Promise<void> {
  const database = await db();
  await database.delete(STORE, clientUuid);
}

export async function markAttempt(clientUuid: string, lastError?: string): Promise<void> {
  const database = await db();
  const existing = await database.get(STORE, clientUuid);
  if (!existing) return;

  await database.put(STORE, {
    ...existing,
    attempts: existing.attempts + 1,
    lastError,
  });
}

export async function countQueued(): Promise<number> {
  try {
    const database = await db();
    return await database.count(STORE);
  } catch {
    return 0;
  }
}
