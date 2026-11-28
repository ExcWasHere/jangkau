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
  locationSource: "device" | "manual";
  photos: QueuedPhoto[];
  createdAt: string;
  /** Percobaan pengiriman; dipakai untuk menampilkan pesan setelah berulang kali gagal. */
  attempts: number;
  lastError?: string;
  /**
   * `pending` = menunggu jaringan, `failed` = ditolak server.
   *
   * Laporan yang ditolak **tidak dibuang**. Teks dan foto yang sudah ditulis
   * di tengah bencana terlalu berharga untuk dihapus karena satu kesalahan
   * validasi; pengguna bisa memperbaikinya lalu mengirim ulang.
   */
  status: "pending" | "failed";
};

interface JangkauDB extends DBSchema {
  "pending-posts": {
    key: string;
    value: QueuedPost;
    indexes: { createdAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<JangkauDB>> | null = null;

/**
 * Sinyal perubahan antrean.
 *
 * Hitungan di indikator hidup di layout, sementara perubahan terjadi di
 * halaman unggah. Tanpa sinyal, indikator menampilkan angka lama sampai
 * halaman dimuat ulang — pengguna melihat "perlu diperbaiki" padahal sudah
 * diperbaiki.
 */
const QUEUE_CHANGED_EVENT = "jangkau:queue-changed";

function announceQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export function onQueueChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(QUEUE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, listener);
}

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

export async function enqueuePost(
  input: Omit<QueuedPost, "createdAt" | "attempts" | "status">,
): Promise<void> {
  const database = await db();
  await database.put(STORE, {
    ...input,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  });
  announceQueueChanged();
}

export async function listQueuedPosts(): Promise<QueuedPost[]> {
  const database = await db();
  return database.getAllFromIndex(STORE, "createdAt");
}

export async function removeQueuedPost(clientUuid: string): Promise<void> {
  const database = await db();
  await database.delete(STORE, clientUuid);
  announceQueueChanged();
}

/**
 * Menandai satu percobaan gagal.
 *
 * `rejected` membedakan "server menolak" (perlu diperbaiki manusia) dari
 * "jaringan putus" (cukup tunggu). Hanya yang pertama mengubah status.
 */
export async function markAttempt(
  clientUuid: string,
  lastError?: string,
  rejected = false,
): Promise<void> {
  const database = await db();
  const existing = await database.get(STORE, clientUuid);
  if (!existing) return;

  await database.put(STORE, {
    ...existing,
    attempts: existing.attempts + 1,
    lastError,
    status: rejected ? "failed" : existing.status,
  });
}

/** Mengembalikan laporan gagal ke antrean setelah pengguna memperbaikinya. */
export async function retryQueuedPost(
  clientUuid: string,
  patch: { body?: string; placeLabel?: string },
): Promise<void> {
  const database = await db();
  const existing = await database.get(STORE, clientUuid);
  if (!existing) return;

  await database.put(STORE, {
    ...existing,
    body: patch.body ?? existing.body,
    placeLabel: patch.placeLabel ?? existing.placeLabel,
    status: "pending",
    lastError: undefined,
  });
  announceQueueChanged();
}

export async function countQueued(): Promise<number> {
  try {
    const database = await db();
    return await database.count(STORE);
  } catch {
    return 0;
  }
}

/** Jumlah per status, dipakai indikator dan halaman unggah. */
export async function countByStatus(): Promise<{ pending: number; failed: number }> {
  try {
    const items = await listQueuedPosts();
    return {
      pending: items.filter((item) => item.status !== "failed").length,
      failed: items.filter((item) => item.status === "failed").length,
    };
  } catch {
    return { pending: 0, failed: 0 };
  }
}
