import { apiFetch } from "~/shared/api/client";

export type DisbursementStatus = "locked" | "requested" | "approved" | "transferred" | "rejected";

export type Disbursement = {
  id: string;
  picAssignmentId: string;
  seq: number;
  amount: number;
  status: DisbursementStatus;
  purpose: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  transferredAt: string | null;
  isSimulated: boolean;
  createdAt: string;
  receiptCount: number;
  confirmedCount: number;
  spent?: number;
};

export type ExpenseConfirmation = {
  profileId: string;
  decision: "received" | "partial" | "not_received";
  note: string | null;
  createdAt: string;
  displayName: string | null;
};

export type Expense = {
  id: string;
  disbursementId: string;
  poskoId: string | null;
  itemName: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  amount: number;
  merchant: string | null;
  purchasedAt: string | null;
  receiptUrl: string | null;
  note: string | null;
  status: "submitted" | "confirmed" | "disputed";
  createdAt: string;
  confirmations: ExpenseConfirmation[];
};

export type AssignmentSummary = {
  balance: { totalIn: number; totalOut: number; balance: number; donationCount: number };
  disbursements: Disbursement[];
  ledger: Array<{ kind: string; amount: number; createdAt: string; note: string | null }>;
};

export function fetchAssignmentSummary(assignmentId: string, token: string) {
  return apiFetch<AssignmentSummary>(`/disbursements/assignments/${assignmentId}/summary`, { token });
}

export function requestDisbursement(
  assignmentId: string,
  input: { amount: number; purpose: string },
  token: string,
) {
  return apiFetch<{ disbursement: Disbursement }>(
    `/disbursements/assignments/${assignmentId}/request`,
    { method: "POST", token, body: JSON.stringify(input) },
  );
}

export function fetchDisbursement(id: string, token: string) {
  return apiFetch<{ disbursement: Disbursement; expenses: Expense[] }>(`/disbursements/${id}`, {
    token,
  });
}

/**
 * Unggah bukti belanja: presign → PUT ke bucket publik → daftarkan di API.
 * Struk masuk bucket publik karena donatur perlu melihatnya untuk menilai
 * kewajaran belanja; isinya bukan data pribadi.
 */
export async function uploadExpense(
  token: string,
  disbursementId: string,
  input: {
    file: File;
    itemName: string;
    amount: number;
    category?: string;
    quantity?: number;
    unit?: string;
    merchant?: string;
    note?: string;
    poskoId?: string;
  },
) {
  const contentType = input.file.type || "image/webp";

  const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
    method: "POST",
    token,
    body: JSON.stringify({
      kind: "receipt",
      contentType,
      sizeBytes: input.file.size,
      scopeId: disbursementId,
    }),
  });

  const put = await fetch(presign.putUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: input.file,
  });

  if (!put.ok) throw new Error("Gagal mengunggah struk");

  return apiFetch<{ expense: Expense }>(`/disbursements/${disbursementId}/expenses`, {
    method: "POST",
    token,
    body: JSON.stringify({
      itemName: input.itemName,
      amount: input.amount,
      category: input.category ?? "other",
      quantity: input.quantity,
      unit: input.unit,
      merchant: input.merchant,
      note: input.note,
      poskoId: input.poskoId,
      receiptKey: presign.key,
    }),
  });
}

export type PendingConfirmation = {
  id: string;
  itemName: string;
  amount: number;
  receiptUrl: string | null;
  createdAt: string;
  disbursementId: string;
  disbursementSeq: number | null;
  picName: string | null;
};

export function fetchPendingConfirmations(token: string) {
  return apiFetch<{ items: PendingConfirmation[] }>("/disbursements/pending-confirmations/mine", {
    token,
  });
}

export function confirmExpense(
  expenseId: string,
  input: { decision: "received" | "partial" | "not_received"; note?: string },
  token: string,
) {
  return apiFetch<{ confirmation: unknown; expenseStatus: string }>(
    `/disbursements/expenses/${expenseId}/confirmations`,
    { method: "POST", token, body: JSON.stringify(input) },
  );
}

export const DISBURSEMENT_STATUS_KEY = {
  locked: "funds.statusLocked",
  requested: "funds.statusRequested",
  approved: "funds.statusApproved",
  transferred: "funds.statusTransferred",
  rejected: "funds.statusRejected",
} as const;

export const DECISION_KEY = {
  received: "funds.confirmed",
  partial: "funds.partial",
  not_received: "funds.notReceived",
} as const;
