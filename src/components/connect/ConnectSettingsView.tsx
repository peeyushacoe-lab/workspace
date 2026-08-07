"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Palette, MessageSquare, Video, Lock, Keyboard, Accessibility, Monitor,
  Sun, Moon, LaptopMinimal, Loader2, LogOut, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/connect/ui";
import { useConnectSettings } from "@/components/connect/ConnectSettingsEffects";
import type { ConnectSettings, ThemePreference, DensityPreference } from "@/lib/connect-settings";

/**
 * Connect settings.
 *
 * Every control here changes real behaviour — nothing is stored-and-ignored.
 * That's the constraint the section list was built around, not the other way
 * round: a settings page with switches that do nothing teaches people the
 * controls are decorative, and then the ones that *do* work get ignored too.
 *
 * Notifications are deliberately absent and link to Nexus instead. Connect and
 * Nexus are one identity sharing one notification matrix; a second page
 * writing the same preferences would let the two disagree, and someone who
 * muted chat mentions would have to wonder which page won.
 */

type Device = {
  id: string;
  label: string;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
};

type SectionKey = "appearance" | "messaging" | "calls" | "privacy" | "shortcuts" | "accessibility" | "devices";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Palette }[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "messaging", label: "Messaging", icon: MessageSquare },
  { key: "calls", label: "Calls & meetings", icon: Video },
  { key: "privacy", label: "Privacy", icon: Lock },
  { key: "accessibility", label: "Accessibility", icon: Accessibility },
  { key: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard },
  { key: "devices", label: "Connected devices", icon: Monitor },
];

export function ConnectSettingsView() {
  const { settings, update, loaded } = useConnectSettings();
  const [section, setSection] = useState<SectionKey>("appearance");

  const set = useCallback(
    async (patch: Parameters<typeof update>[0]) => {
      try {
        await update(patch);
      } catch {
        toast.error("Couldn't save that — it's been put back");
      }
    },
    [update],
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted">Sage Connect</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">
          Changes save as you make them and apply everywhere you&apos;re signed in.
        </p>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Section rail. Horizontal scroller on narrow screens rather than a
            select — the list is short enough to stay scannable. */}
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex flex-shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                section === s.key
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-hover hover:text-foreground"
              }`}
            >
              <s.icon className="h-4 w-4 flex-shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {!loaded ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-6 text-[13px] text-muted shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your settings…
            </div>
          ) : section === "appearance" ? (
            <AppearanceSection settings={settings} onChange={set} />
          ) : section === "messaging" ? (
            <MessagingSection settings={settings} onChange={set} />
          ) : section === "calls" ? (
            <CallsSection settings={settings} onChange={set} />
          ) : section === "privacy" ? (
            <PrivacySection settings={settings} onChange={set} />
          ) : section === "accessibility" ? (
            <AccessibilitySection settings={settings} onChange={set} />
          ) : section === "shortcuts" ? (
            <ShortcutsSection />
          ) : (
            <DevicesSection />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

type SetFn = (patch: Parameters<ReturnType<typeof useConnectSettings>["update"]>[0]) => Promise<void>;

function AppearanceSection({ settings, onChange }: { settings: ConnectSettings; onChange: SetFn }) {
  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "System", icon: LaptopMinimal },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];
  const densities: { value: DensityPreference; label: string; hint: string }[] = [
    { value: "comfortable", label: "Comfortable", hint: "Roomier rows, easier to scan" },
    { value: "compact", label: "Compact", hint: "More conversations on screen at once" },
  ];

  return (
    <Panel title="Appearance" description="How Connect looks on this account, on every device.">
      <Field label="Theme">
        <div className="flex gap-2">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => void onChange({ appearance: { theme: t.value } })}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-[12px] font-medium transition-colors ${
                settings.appearance.theme === t.value
                  ? "border-accent/40 bg-accent-soft text-accent-strong"
                  : "border-border text-muted hover:bg-hover hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Density">
        <div className="space-y-2">
          {densities.map((d) => (
            <Radio
              key={d.value}
              checked={settings.appearance.density === d.value}
              label={d.label}
              hint={d.hint}
              onSelect={() => void onChange({ appearance: { density: d.value } })}
            />
          ))}
        </div>
      </Field>
    </Panel>
  );
}

function MessagingSection({ settings, onChange }: { settings: ConnectSettings; onChange: SetFn }) {
  return (
    <Panel title="Messaging" description="How the composer and conversations behave.">
      <Toggle
        label="Enter sends the message"
        hint="Off swaps them: Enter starts a new line and ⌘/Ctrl+Enter sends."
        checked={settings.messaging.enterToSend}
        onChange={(v) => void onChange({ messaging: { enterToSend: v } })}
      />
      <Toggle
        label="Show image and GIF previews"
        hint="Off shows attachments as file cards instead of rendering them inline."
        checked={settings.messaging.mediaPreviews}
        onChange={(v) => void onChange({ messaging: { mediaPreviews: v } })}
      />
      <Toggle
        label="Show when others are typing"
        hint="Whether you see the typing indicator. Separate from whether you send yours — that's under Privacy."
        checked={settings.messaging.showTypingIndicators}
        onChange={(v) => void onChange({ messaging: { showTypingIndicators: v } })}
      />
    </Panel>
  );
}

function CallsSection({ settings, onChange }: { settings: ConnectSettings; onChange: SetFn }) {
  return (
    <Panel title="Calls & meetings" description="How you arrive when you join.">
      <Toggle
        label="Join with microphone muted"
        hint="Applies to meetings and to calls you answer."
        checked={settings.calls.joinMuted}
        onChange={(v) => void onChange({ calls: { joinMuted: v } })}
      />
      <Toggle
        label="Join with camera off"
        checked={settings.calls.joinCameraOff}
        onChange={(v) => void onChange({ calls: { joinCameraOff: v } })}
      />
    </Panel>
  );
}

function PrivacySection({ settings, onChange }: { settings: ConnectSettings; onChange: SetFn }) {
  return (
    <Panel
      title="Privacy"
      description="What Connect tells other people about you. Both of these are enforced on the server, not just hidden in your view."
    >
      <Toggle
        label="Send read receipts"
        hint="Off means opening a conversation no longer marks their messages as seen. You'll still see receipts others send you."
        checked={settings.privacy.shareReadReceipts}
        onChange={(v) => void onChange({ privacy: { shareReadReceipts: v } })}
      />
      <Toggle
        label="Show others when you're typing"
        checked={settings.privacy.shareTyping}
        onChange={(v) => void onChange({ privacy: { shareTyping: v } })}
      />
    </Panel>
  );
}

function AccessibilitySection({ settings, onChange }: { settings: ConnectSettings; onChange: SetFn }) {
  return (
    <Panel title="Accessibility" description="Connect also follows your operating system's settings where it can.">
      <Toggle
        label="Reduce motion"
        hint="Removes transitions and animations. Already on automatically if your system asks for reduced motion."
        checked={settings.appearance.reduceMotion}
        onChange={(v) => void onChange({ appearance: { reduceMotion: v } })}
      />
      <Toggle
        label="Larger text"
        hint="Scales everything together — spacing included — rather than only growing the type."
        checked={settings.appearance.largerText}
        onChange={(v) => void onChange({ appearance: { largerText: v } })}
      />
    </Panel>
  );
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "⌘K", action: "Open the command palette" },
  { keys: "Enter", action: "Send the message" },
  { keys: "Shift + Enter", action: "New line" },
  { keys: "@", action: "Mention someone" },
  { keys: "Esc", action: "Close a panel, menu or picker" },
];

function ShortcutsSection() {
  return (
    <Panel title="Keyboard shortcuts" description="Reference only — these aren't remappable yet.">
      <dl className="space-y-0">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 border-b border-border-soft py-2.5 last:border-0">
            <dt className="text-[13px] text-muted">{s.action}</dt>
            <dd>
              <kbd className="rounded-md border border-border bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-foreground">
                {s.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function DevicesSection() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connect/settings/devices", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDevices((await res.json()) as Device[]);
    } catch {
      toast.error("Couldn't load your devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (id?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/connect/settings/devices?${id ? `id=${id}` : "all=1"}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(id ? "Signed that device out" : "Signed out everywhere");
      void load();
    } catch {
      toast.error("Couldn't sign that out");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Connected devices"
      description="Everywhere you're currently signed in. Sign out anything you don't recognise."
    >
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : devices.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-3 py-3 text-[13px] text-muted">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-ok" />
          No other active sessions recorded.
        </div>
      ) : (
        <>
          <ul className="space-y-0">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b border-border-soft py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">{d.label}</p>
                  <p className="truncate text-[11px] text-subtle">
                    {d.ipAddress ?? "Unknown IP"} · last used {relative(d.lastSeenAt)}
                  </p>
                </div>
                <button
                  onClick={() => void revoke(d.id)}
                  disabled={busy}
                  className="flex-shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-crit-soft hover:text-crit disabled:opacity-40"
                >
                  Sign out
                </button>
              </li>
            ))}
          </ul>
          <div className="pt-3">
            <Button variant="destructive" size="sm" loading={busy} onClick={() => void revoke()}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out of every device
            </Button>
            <p className="mt-1.5 text-[11px] text-subtle">
              Includes this one — you&apos;ll need to sign in again.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

function Toggle({
  label, hint, checked, onChange,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function Radio({
  checked, label, hint, onSelect,
}: {
  checked: boolean; label: string; hint?: string; onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        checked ? "border-accent/40 bg-accent-soft" : "border-border hover:bg-hover"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-accent" : "border-border-strong"
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] font-medium ${checked ? "text-accent-strong" : "text-foreground"}`}>
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>}
      </span>
    </button>
  );
}

function relative(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
