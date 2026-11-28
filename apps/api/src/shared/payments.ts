import QRCode from "qrcode";

import type { Bindings } from "../env.js";

/**
 * Lapisan pembayaran.
 *
 * Prototipe ini memakai **mock** karena Midtrans belum dikonfigurasi. Mock
 * bukan tiruan diam-diam: setiap respons membawa `provider: "mock"` dan UI
 * menampilkan label "Simulasi", sesuai aturan kompetisi bahwa fitur simulasi
 * harus ditandai jelas.
 *
 * Ketika `MIDTRANS_SERVER_KEY` diisi, provider berganti otomatis ke Midtrans
 * Core API (`payment_type: "qris"`) tanpa perubahan di modul donasi: kontrak
 * `PaymentProvider` yang sama.
 */

export type ChargeInput = {
  orderId: string;
  amount: number;
  expiresMinutes: number;
  itemName: string;
  customerName?: string;
  customerEmail?: string;
};

export type ChargeResult = {
  provider: "mock" | "midtrans";
  /** Payload yang di-encode menjadi QR. */
  qrString: string;
  /** URL transaksi (Midtrans) atau halaman simulasi (mock). */
  qrUrl: string;
  transactionId: string | null;
  expiresAt: string;
};

export type WebhookResult = {
  orderId: string;
  status: "paid" | "expired" | "failed" | "pending";
  transactionId: string | null;
  paymentType: string | null;
  raw: unknown;
};

export type PaymentProvider = {
  readonly kind: "mock" | "midtrans";
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** `null` bila notifikasi tidak bisa dipercaya (tanda tangan salah). */
  parseWebhook(payload: unknown, signature: string | null): Promise<WebhookResult | null>;
};

// ---------------------------------------------------------------- mock

/**
 * Mock membuat payload QR yang bisa dipindai menjadi URL simulasi. Isinya bukan
 * QRIS sungguhan — tidak ada uang yang berpindah, dan UI menandainya jelas.
 */
function createMockProvider(env: Bindings): PaymentProvider {
  return {
    kind: "mock",
    async createCharge(input) {
      const expiresAt = new Date(Date.now() + input.expiresMinutes * 60_000).toISOString();
      const payUrl = `${env.APP_BASE_URL.replace(/\/$/, "")}/donasi/${input.orderId}`;

      return {
        provider: "mock",
        // Format menyerupai QRIS agar jalur render sama; tetap bukan QRIS valid.
        qrString: `JANGKAU-MOCK|${input.orderId}|${input.amount}|${expiresAt}|${payUrl}`,
        qrUrl: payUrl,
        transactionId: `mock-${input.orderId}`,
        expiresAt,
      };
    },
    async parseWebhook(payload) {
      const body = payload as { order_id?: string; transaction_status?: string };
      if (!body?.order_id) return null;

      return {
        orderId: body.order_id,
        status: mapTransactionStatus(body.transaction_status),
        transactionId: null,
        paymentType: "qris",
        raw: payload,
      };
    },
  };
}

function mapTransactionStatus(status: string | undefined): WebhookResult["status"] {
  if (status === "settlement" || status === "capture") return "paid";
  if (status === "expire") return "expired";
  if (status === "deny" || status === "cancel") return "failed";
  return "pending";
}

// ---------------------------------------------------------------- midtrans

/**
 * Midtrans Core API. Dipakai hanya bila server key tersedia.
 *
 * `qr_string` dari Midtrans adalah payload QRIS yang bisa dipindai aplikasi
 * pembayaran apa pun. Notifikasi diverifikasi dengan SHA-512 dari
 * `order_id + status_code + gross_amount + server_key`.
 */
function createMidtransProvider(env: Bindings): PaymentProvider {
  const base =
    env.MIDTRANS_IS_PRODUCTION === "true"
      ? "https://api.midtrans.com/v2"
      : "https://api.sandbox.midtrans.com/v2";
  const auth = btoa(`${env.MIDTRANS_SERVER_KEY}:`);

  return {
    kind: "midtrans",
    async createCharge(input) {
      const response = await fetch(`${base}/charge`, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          payment_type: "qris",
          transaction_details: { order_id: input.orderId, gross_amount: input.amount },
          qris: { acquirer: "gopay" },
          item_details: [
            { id: "donation", price: input.amount, quantity: 1, name: input.itemName.slice(0, 50) },
          ],
          customer_details: {
            first_name: input.customerName?.slice(0, 50) ?? "Donatur",
            email: input.customerEmail,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const body = (await response.json()) as {
        status_code?: string;
        status_message?: string;
        transaction_id?: string;
        qr_string?: string;
        expiry_time?: string;
        actions?: Array<{ name: string; url: string }>;
      };

      if (!response.ok || !body.qr_string) {
        throw new Error(
          `Midtrans menolak charge: ${body.status_code ?? response.status} ${body.status_message ?? ""}`.trim(),
        );
      }

      return {
        provider: "midtrans",
        qrString: body.qr_string,
        qrUrl: body.actions?.find((action) => action.name === "qr-code")?.url ?? "",
        transactionId: body.transaction_id ?? null,
        expiresAt: body.expiry_time
          ? new Date(`${body.expiry_time.replace(" ", "T")}+07:00`).toISOString()
          : new Date(Date.now() + input.expiresMinutes * 60_000).toISOString(),
      };
    },
    async parseWebhook(payload, signature) {
      const body = payload as {
        order_id?: string;
        status_code?: string;
        gross_amount?: string;
        transaction_status?: string;
        transaction_id?: string;
        payment_type?: string;
        signature_key?: string;
      };

      if (!body?.order_id || !body.status_code || !body.gross_amount) return null;

      const valid = await verifyMidtransSignature(env, {
        orderId: body.order_id,
        statusCode: body.status_code,
        grossAmount: body.gross_amount,
        signature: signature ?? body.signature_key ?? "",
      });

      if (!valid) return null;

      return {
        orderId: body.order_id,
        status: mapTransactionStatus(body.transaction_status),
        transactionId: body.transaction_id ?? null,
        paymentType: body.payment_type ?? null,
        raw: payload,
      };
    },
  };
}

/** Verifikasi tanda tangan webhook Midtrans memakai Web Crypto. */
export async function verifyMidtransSignature(
  env: Bindings,
  input: { orderId: string; statusCode: string; grossAmount: string; signature: string },
): Promise<boolean> {
  if (!env.MIDTRANS_SERVER_KEY || !input.signature) return false;

  const data = new TextEncoder().encode(
    `${input.orderId}${input.statusCode}${input.grossAmount}${env.MIDTRANS_SERVER_KEY}`,
  );
  const digest = await crypto.subtle.digest("SHA-512", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return hex === input.signature;
}

export function paymentProvider(env: Bindings): PaymentProvider {
  return env.MIDTRANS_SERVER_KEY?.trim() ? createMidtransProvider(env) : createMockProvider(env);
}

/** QR sebagai SVG inline, supaya UI tidak perlu pustaka QR tambahan. */
export function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
}
