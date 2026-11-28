import { apiFetch } from "~/shared/api/client";

export type DonationStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export type Donation = {
  id: string;
  eventId: string;
  picAssignmentId: string;
  poskoId: string | null;
  orderId: string;
  amount: number;
  currency: string;
  status: DonationStatus;
  paymentType: string | null;
  qrString: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  donorName: string | null;
  isAnonymous: boolean;
  isGuest: boolean;
  claimed: boolean;
  claimToken: string;
  createdAt: string;
};

export type CreateDonationResponse = {
  donation: Donation;
  provider: "mock" | "midtrans";
  qrUrl: string;
};

export type DonationStatusResponse = {
  donation: Donation;
  provider: "mock" | "midtrans";
};

export function createDonation(input: {
  picAssignmentId: string;
  poskoId?: string;
  amount: number;
  donorName?: string;
  anonymous: boolean;
  guestEmail?: string;
  token?: string | null;
}): Promise<CreateDonationResponse> {
  const { token, ...body } = input;
  return apiFetch<CreateDonationResponse>("/donations", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function fetchDonation(
  id: string,
  opts: { token?: string | null; claimToken?: string | null } = {},
): Promise<DonationStatusResponse> {
  const query = opts.claimToken ? `?token=${encodeURIComponent(opts.claimToken)}` : "";
  return apiFetch<DonationStatusResponse>(`/donations/${id}${query}`, { token: opts.token });
}

export function simulatePaid(id: string, claimToken?: string | null) {
  return apiFetch<{ donation: Donation; alreadyPaid: boolean }>(
    `/donations/${id}/simulate-paid`,
    { method: "POST", body: JSON.stringify({ token: claimToken ?? undefined }) },
  );
}

export function claimDonation(id: string, claimToken: string, token: string) {
  return apiFetch<{ donation: Donation; alreadyClaimed: boolean; claimedByMe: boolean }>(
    `/donations/${id}/claim`,
    { method: "POST", token, body: JSON.stringify({ claimToken }) },
  );
}

export type RecentDonation = {
  id: string;
  amount: number;
  donorName: string | null;
  paidAt: string | null;
  poskoId: string | null;
};

export function fetchRecentDonations(eventId: string): Promise<{ items: RecentDonation[] }> {
  return apiFetch<{ items: RecentDonation[] }>(`/events/${eventId}/donations`);
}

/** Hitung mundur `mm:ss` sampai kedaluwarsa; `null` bila sudah lewat. */
export function remainingTime(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
