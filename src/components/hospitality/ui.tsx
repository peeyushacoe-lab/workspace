"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { iconSize } from "@/components/icons";

/**
 * Small shared kit for the hospitality views — one page header, one modal, one
 * set of control styles — so every hotel screen reads as the same product.
 * All colour comes from Atrium tokens; inside the hotel shell the accent tokens
 * resolve to the hospitality teal automatically (.hosp-workspace).
 */

export const inputCls =
  "w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground " +
  "placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors";

export const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg " +
  "bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const outlineBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg border border-border " +
  "bg-surface text-foreground hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const ghostBtn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium rounded-md text-muted " +
  "hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50";

export const chipCls = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border whitespace-nowrap";

/** fetch → JSON, throwing the API's own error message on failure. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Tell the shell to re-pull its sidebar badges. */
export function notifyShell() {
  window.dispatchEvent(new Event("hospitality:refresh"));
}

/** Read a query flag once on mount (?add=1, ?status=…) without a Suspense boundary. */
export function readQuery(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function relTime(input: string | Date): string {
  const mins = Math.round((Date.now() - new Date(input).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function waitLabel(input: string | Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(input).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-GB")}`;
  }
}

export function formatQty(n: number) {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** A readable one-off password: no ambiguous characters. */
export function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => chars[v % chars.length]).join("");
}

export function HospPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-soft px-5 pb-5 pt-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground text-balance">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="px-5 py-6 lg:px-8">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-panel border border-border bg-surface shadow-pop sm:rounded-panel ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-start gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-subtle transition-colors hover:bg-hover hover:text-foreground">
            <X className={iconSize("md")} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && <p className="text-[11.5px] text-subtle">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft">
        <Icon className={`${iconSize("xl")} text-accent`} />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />
      ))}
    </div>
  );
}
