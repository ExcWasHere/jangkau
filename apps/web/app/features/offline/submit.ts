import { apiFetch } from "~/shared/api/client";

/** Hasil pengiriman satu unggahan, baik langsung maupun dari antrean. */
export type SubmitResult = {
  eventId: string;
  merged: boolean;
  needsReview: boolean;
};

export type SubmitInput = {
  clientUuid: string;
  body: string;
  placeLabel?: string;
  capturedAt: string;
  location: { lat: number; lng: number; accuracyM?: number };
  photos: Array<{ blob: Blob; mimeType: string; sizeBytes: number }>;
};

/**
 * Mengunggah foto satu per satu lewat presign, lalu mengirim unggahannya.
 *
 * Dipakai jalur langsung (halaman unggah) dan jalur antrean offline, supaya
 * keduanya berperilaku identik. Kalau foto sudah pernah terunggah pada
 * percobaan sebelumnya, R2 hanya menyimpan objek baru dengan key baru —
 * duplikat objek tidak berbahaya karena baris database tidak dibuat dua kali
 * (`clientUuid` unik).
 */
export async function submitPost(input: SubmitInput, token: string): Promise<SubmitResult> {
  const media: Array<{ key: string; mimeType: string; sizeBytes: number }> = [];

  for (const photo of input.photos) {
    const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
      method: "POST",
      token,
      body: JSON.stringify({
        kind: "post_photo",
        contentType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
      }),
    });

    const put = await fetch(presign.putUrl, {
      method: "PUT",
      headers: { "content-type": photo.mimeType },
      body: photo.blob,
    });

    if (!put.ok) throw new Error(`Gagal mengunggah foto (${put.status})`);

    media.push({ key: presign.key, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes });
  }

  return apiFetch<SubmitResult>("/posts", {
    method: "POST",
    token,
    body: JSON.stringify({
      clientUuid: input.clientUuid,
      body: input.body,
      placeLabel: input.placeLabel,
      capturedAt: input.capturedAt,
      location: input.location,
      media,
    }),
  });
}

/**
 * Membedakan kegagalan jaringan dari penolakan server.
 *
 * `fetch` melempar `TypeError` saat jaringan putus; API kita melempar
 * `ApiError` dengan status. Hanya kegagalan jaringan yang layak diantrekan —
 * menolak unggahan yang salah isi berulang kali tidak akan pernah berhasil.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}
