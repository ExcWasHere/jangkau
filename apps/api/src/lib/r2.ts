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

function objectUrl(env: Bindings, key: string, ttl: number): URL {
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(ttl));
  return url;
}

/**
 * URL PUT berumur pendek; browser mengunggah langsung ke R2.
 *
 * `aws.signQuery` wajib: tanpa itu aws4fetch menandatangani lewat header
 * dan URL yang dikembalikan tidak berisi `X-Amz-Signature`, sehingga R2
 * menolaknya dengan `InvalidArgument: Authorization`.
 */
export async function presignPut(
  env: Bindings,
  key: string,
  contentType: string,
): Promise<string> {
  const signed = await client(env).sign(objectUrl(env, key, PUT_TTL_SECONDS), {
    method: "PUT",
    headers: { "content-type": contentType },
    aws: { signQuery: true },
  });
  return signed.url;
}

/** URL GET berumur pendek untuk bucket privat. */
export async function presignGet(env: Bindings, key: string): Promise<string> {
  const signed = await client(env).sign(objectUrl(env, key, GET_TTL_SECONDS), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}
