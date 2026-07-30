import { Send, type LucideIcon } from "lucide-react";
import { SidebarLayout } from "./SidebarLayout";
import { getPortalNavForRole, type SessionUser } from "@/lib/auth";
import { getNavGroups } from "@/lib/nav-groups";
import { DesktopBridge } from "./DesktopBridge";
import { CallProvider } from "./call/CallProvider";
import { PushNotificationSetup } from "./PushNotificationSetup";

export function Shell({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser?: SessionUser | null;
}) {
  const nav = currentUser ? getPortalNavForRole(currentUser.role) : [];
  // Spine + rail model. Derived from `nav`, so access control is unchanged.
  const groups = currentUser ? getNavGroups(currentUser.role) : [];

  return (
    <SidebarLayout nav={nav} groups={groups} currentUser={currentUser}>
      <DesktopBridge />
      <PushNotificationSetup />
      <CallProvider currentUserName={currentUser?.fullName ?? "Me"}>
        {children}
      </CallProvider>
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
    <div className="border-b border-border-soft bg-surface">
      <div className="px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-subtle tracking-wide mb-1">{eyebrow}</p>
            <h1 className="text-xl font-semibold text-foreground tracking-[-0.01em] leading-snug">{title}</h1>
            <p className="text-[13px] text-muted mt-1">{description}</p>
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
    teal:  "bg-ok",
    blue:  "bg-accent",
    amber: "bg-warn",
    rose:  "bg-crit",
  };

  const formatted = typeof value === "number" ? value.toLocaleString("en-US") : value;

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dots[tone]}`} />
            <p className="text-[13px] font-medium text-muted">{label}</p>
          </div>
          <p className="text-2xl font-semibold text-foreground tabular-nums leading-none tracking-[-0.01em]">{formatted}</p>
          {hint && <p className="text-xs text-subtle mt-2">{hint}</p>}
        </div>
        {Icon && <Icon className="h-4 w-4 text-subtle flex-shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

export function SendButton() {
  return (
    <button
      type="submit"
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm text-accent-foreground font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
    >
      <Send className="h-3.5 w-3.5" />
      Send Campaign
    </button>
  );
}
