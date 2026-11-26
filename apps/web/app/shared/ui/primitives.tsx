import type { ReactNode } from "react";

/**
 * Primitif UI kecil yang dipakai lintas fitur. Tidak ada state di sini —
 * hanya kelas Tailwind yang sudah memakai token dari `app.css`.
 */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-white ${className}`}>{children}</div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      {eyebrow && (
        <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">{eyebrow}</p>
      )}
      <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {description && (
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface text-muted",
  brand: "bg-brand-soft text-brand-strong",
  ok: "bg-green-50 text-ok",
  warn: "bg-amber-50 text-warn",
  danger: "bg-red-50 text-danger",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/60 px-5 py-8 text-center">
      <p className="text-[13px] font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium">
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-normal outline-none transition-colors focus:border-brand";

export const buttonPrimary =
  "rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-brand-line hover:text-brand disabled:cursor-not-allowed disabled:opacity-50";
