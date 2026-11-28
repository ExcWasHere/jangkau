import { apiFetch } from "~/shared/api/client";

export type NotificationKind =
  | "verification_approved"
  | "verification_document_rejected"
  | "pic_approved"
  | "pic_rejected"
  | "pic_revoked"
  | "donation_paid"
  | "disbursement_approved"
  | "disbursement_transferred"
  | "disbursement_rejected"
  | "content_report_actioned"
  | "content_report_dismissed";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function fetchNotifications(token: string, limit = 30) {
  return apiFetch<{ items: Notification[]; unreadCount: number }>(
    `/notifications?limit=${limit}`,
    { token },
  );
}

export function fetchUnreadCount(token: string) {
  return apiFetch<{ unreadCount: number }>("/notifications/unread-count", { token });
}

export function markRead(id: string, token: string) {
  return apiFetch<{ notification: { id: string; read_at: string } }>(
    `/notifications/${id}/read`,
    { method: "PATCH", token },
  );
}

export function markAllRead(token: string) {
  return apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST", token });
}

/** Kelompok notifikasi berdasarkan awalan `kind`, untuk label di UI. */
export function notificationGroup(kind: string): "verification" | "pic" | "donation" | "disbursement" | "moderation" | "other" {
  if (kind.startsWith("verification")) return "verification";
  if (kind.startsWith("pic")) return "pic";
  if (kind.startsWith("donation")) return "donation";
  if (kind.startsWith("disbursement")) return "disbursement";
  if (kind.startsWith("content_report")) return "moderation";
  return "other";
}

/**
 * Penanda perubahan notifikasi.
 *
 * Lencana di header menyegarkan diri tiap 60 detik, tapi setelah pengguna
 * menandai notifikasi dibaca di halaman notifikasi, menunggu satu menit
 * terasa seperti tombolnya tidak bekerja. Halaman mengirim sinyal, lencana
 * mendengarkan.
 */
const REFRESH_EVENT = "jangkau:notifications-changed";

export function announceNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function onNotificationsChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(REFRESH_EVENT, listener);
  return () => window.removeEventListener(REFRESH_EVENT, listener);
}
