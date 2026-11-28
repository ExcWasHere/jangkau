/**
 * Pengambilan lokasi perangkat.
 *
 * Browser tidak bisa menyalakan GPS; yang bisa dilakukan hanya memicu dialog
 * izin, dan dialog itu muncul sekali. Setelah pengguna menekan **Blokir**,
 * panggilan berikutnya gagal tanpa dialog sama sekali — jadi jalur manual
 * bukan kemewahan, melainkan satu-satunya jalan keluar.
 *
 * Semua kegagalan dipetakan ke `reason` yang bisa ditindaklanjuti, bukan pesan
 * mentah `GeolocationPositionError`.
 */

export type LocationFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  source: "device";
};

export type LocationFailure = {
  reason: "unsupported" | "denied" | "timeout" | "unavailable" | "insecure";
};

export type LocationResult = { ok: true; fix: LocationFix } | { ok: false; failure: LocationFailure };

/** Akurasi di atas ini tidak membuktikan pelapor berada di radius event. */
export const ACCURACY_WARN_M = 500;
/** Akurasi di atas ini ditolak: titiknya hanya menebak. */
export const ACCURACY_REJECT_M = 1000;

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Status izin tanpa memicu dialog.
 *
 * `Permissions.query` tidak didukung Safari lama, jadi hasilnya `unknown` di
 * sana dan UI harus tetap menyediakan jalur manual.
 */
export async function geolocationPermission(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unknown";
  if (!navigator.permissions?.query) return "unknown";

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
}

function classifyError(error: GeolocationPositionError): LocationFailure {
  // Kode numerik dipakai langsung: konstanta pada objek error tidak selalu ada
  // di semua browser.
  if (error.code === 1) return { reason: "denied" };
  if (error.code === 3) return { reason: "timeout" };
  return { reason: "unavailable" };
}

/**
 * Satu percobaan cepat memakai fix terakhir yang masih valid.
 *
 * `maximumAge` 60 detik menghindari menunggu satelit lagi ketika perangkat
 * baru saja memberi titik — penting di halaman unggah yang dibuka berulang.
 */
export async function currentLocation(options: {
  timeoutMs?: number;
  maximumAgeMs?: number;
} = {}): Promise<LocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, failure: { reason: "unsupported" } };
  }

  // Geolocation hanya tersedia di konteks aman (HTTPS atau localhost).
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { ok: false, failure: { reason: "insecure" } };
  }

  const position = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (result) => resolve(result),
      (error) => resolve(error),
      {
        enableHighAccuracy: true,
        timeout: options.timeoutMs ?? 12_000,
        maximumAge: options.maximumAgeMs ?? 60_000,
      },
    );
  });

  if ("coords" in position) {
    return {
      ok: true,
      fix: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: Math.round(position.coords.accuracy),
        source: "device",
      },
    };
  }

  return { ok: false, failure: classifyError(position) };
}

/**
 * Mengamati posisi sampai akurasi membaik atau batas waktu habis.
 *
 * Dipakai setelah fix pertama terlalu kasar: satu pembacaan sering memakai
 * menara seluler, sementara `watchPosition` menerima perbaikan satelit
 * beberapa detik kemudian.
 */
export async function watchForBetterFix(input: {
  maxWaitMs?: number;
  targetAccuracyM?: number;
}): Promise<LocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, failure: { reason: "unsupported" } };
  }

  const target = input.targetAccuracyM ?? ACCURACY_WARN_M;
  const deadline = Date.now() + (input.maxWaitMs ?? 8_000);

  const { promise, resolve } = Promise.withResolvers<LocationResult>();
  let best: LocationFix | null = null;

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const fix: LocationFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: Math.round(position.coords.accuracy),
        source: "device",
      };

      if (!best || fix.accuracyM < best.accuracyM) best = fix;

      if (fix.accuracyM <= target || Date.now() > deadline) {
        navigator.geolocation.clearWatch(watchId);
        resolve({ ok: true, fix });
      }
    },
    (error) => {
      navigator.geolocation.clearWatch(watchId);
      resolve(best ? { ok: true, fix: best } : { ok: false, failure: classifyError(error) });
    },
    { enableHighAccuracy: true, timeout: deadline - Date.now(), maximumAge: 0 },
  );

  // Jaring pengaman: `watchPosition` bisa diam tanpa callback sama sekali di
  // perangkat yang tidak punya penerima GPS.
  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    resolve(best ? { ok: true, fix: best } : { ok: false, failure: { reason: "timeout" } });
  }, Math.max(0, deadline - Date.now()) + 500);

  return promise;
}

/** Pesan kunci kamus untuk setiap kegagalan, supaya UI tidak menebak. */
export const FAILURE_KEY = {
  unsupported: "gps.unsupported",
  denied: "gps.denied",
  timeout: "gps.timeout",
  unavailable: "gps.unavailable",
  insecure: "gps.insecure",
} as const;
