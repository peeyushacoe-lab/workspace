import { Send, type LucideIcon } from "lucide-react";
import { SidebarLayout } from "./SidebarLayout";
import { getPortalNavForRole, type SessionUser } from "@/lib/auth";
import { DesktopBridge } from "./DesktopBridge";

export function Shell({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser?: SessionUser | null;
}) {
  const nav = currentUser ? getPortalNavForRole(currentUser.role) : [];

  return (
    <SidebarLayout nav={nav} currentUser={currentUser}>
      <DesktopBridge />
      {children}
    </SidebarLayout>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: string;
  eyebrow: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#f0f0f0] bg-white">
      <div className="px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-[#80868b] uppercase tracking-wide mb-1">{eyebrow}</p>
            <h1 className="text-xl font-semibold text-[#202124] tracking-[-0.01em] leading-snug">{title}</h1>
            <p className="text-[13px] text-[#5f6368] mt-1">{description}</p>
          </div>
          {action && (
            <div className="flex-shrink-0">{action}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone: "teal" | "blue" | "amber" | "rose";
  hint?: string;
  icon?: LucideIcon;
}) {
  const dots = {
    teal:  "bg-teal-500",
    blue:  "bg-blue-500",
    amber: "bg-amber-500",
    rose:  "bg-rose-500",
  };

  const formatted = typeof value === "number" ? value.toLocaleString("en-US") : value;

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dots[tone]}`} />
            <p className="text-[13px] font-medium text-[#5f6368]">{label}</p>
          </div>
          <p className="text-2xl font-semibold text-[#202124] tabular-nums leading-none tracking-[-0.01em]">{formatted}</p>
          {hint && <p className="text-xs text-[#80868b] mt-2">{hint}</p>}
        </div>
        {Icon && <Icon className="h-4 w-4 text-[#9aa0a6] flex-shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

export function SendButton() {
  return (
    <button
      type="submit"
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1a56db] px-4 text-sm text-white font-medium hover:bg-[#1447c0] transition-colors disabled:opacity-50"
    >
      <Send className="h-3.5 w-3.5" />
      Send Campaign
    </button>
  );
}
