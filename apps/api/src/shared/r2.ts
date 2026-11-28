import { AwsClient } from "aws4fetch";

import type { Bindings } from "../env.js";

const PUT_TTL_SECONDS = 300;
const GET_TTL_SECONDS = 300;

function client(env: Bindings) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(env: Bindings, bucket: string, key: string, ttl: number): URL {
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(ttl));
  return url;
}

/**
 * URL PUT berumur pendek; browser mengunggah langsung ke R2 sehingga Worker
 * tidak pernah memegang isi berkas.
 *
 * `aws.signQuery` wajib: tanpa itu aws4fetch menandatangani lewat header dan
 * URL yang dikembalikan tidak berisi `X-Amz-Signature`, sehingga R2 menolaknya
 * dengan `InvalidArgument: Authorization`.
 */
export async function presignPut(
  env: Bindings,
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const signed = await client(env).sign(objectUrl(env, bucket, key, PUT_TTL_SECONDS), {
    method: "PUT",
    headers: { "content-type": contentType },
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * URL GET berumur pendek untuk bucket privat (dokumen verifikasi).
 * Jangan dipakai untuk media publik — pakai `publicUrl` supaya bisa di-cache CDN.
 */
export async function presignGet(env: Bindings, key: string): Promise<string> {
  const signed = await client(env).sign(objectUrl(env, env.R2_BUCKET, key, GET_TTL_SECONDS), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** URL permanen untuk objek di bucket publik. */
export function publicUrl(env: Bindings, key: string | null | undefined): string | null {
  if (!key) return null;
  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/${key}`;
}
