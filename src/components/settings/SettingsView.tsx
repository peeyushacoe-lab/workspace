"use client";

import { useEffect, useState } from "react";
import {
  User, Shield, Bell, Mail, FileSignature, Palette,
  Globe, Clock, KeyRound, Monitor, Sun, Moon,
  Smartphone, ToggleLeft, Volume2, MailCheck, CalendarDays,
  HardDrive, MessageSquare, Lock, AlertTriangle, Download,
  ChevronRight, Check, Filter, Plus, Trash2, ToggleRight, Loader2, X,
} from "lucide-react";
import { ProfileSettings } from "@/components/ProfileSettings";
import { MFASetup } from "@/components/MFASetup";
import { SessionManager } from "@/components/SessionManager";
import { toast } from "sonner";

type Tab =
  | "profile"
  | "appearance"
  | "signature"
  | "notifications"
  | "security"
  | "mailboxes"
  | "language"
  | "privacy"
  | "mail-rules";

type SettingsUser = {
  id: string;
  email: string;
  fullName: string;
};

type RecentLogin = {
  id: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date | string;
};

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: "profile",      label: "Profile",       icon: User,          description: "Personal info and avatar" },
  { id: "appearance",   label: "Appearance",    icon: Palette,       description: "Theme, density, and fonts" },
  { id: "notifications",label: "Notifications", icon: Bell,          description: "Alerts and email digests" },
  { id: "signature",    label: "Signature",     icon: FileSignature, description: "Email signature editor" },
  { id: "mail-rules",   label: "Mail Rules",    icon: Filter,        description: "Auto-sort and label emails" },
  { id: "mailboxes",    label: "Mailboxes",     icon: Mail,          description: "Managed inbox access" },
  { id: "security",     label: "Security",      icon: Shield,        description: "MFA, sessions, and logins" },
  { id: "language",     label: "Language & Region", icon: Globe,     description: "Locale, timezone, and formats" },
  { id: "privacy",      label: "Privacy & Data", icon: Lock,         description: "Export and account controls" },
];

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-[rgba(0,255,255,0.08)]">
        <h3 className="text-sm font-semibold text-[#dfe1f6]">{title}</h3>
        {description && <p className="text-xs text-[#bbc9cf] mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[rgba(0,255,255,0.08)] last:border-0">
      <div className="flex-1 mr-6">
        <p className="text-sm font-medium text-[#dfe1f6]">{label}</p>
        {description && <p className="text-xs text-[#bbc9cf] mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        value ? "bg-[#00d2ff]" : "bg-[#3c494e]"
      }`}
      role="switch"
      aria-checked={value}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function AppearanceTab() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [fontSize, setFontSize] = useState<"normal" | "large">("normal");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
      if (saved) setTheme(saved);
      else setTheme("system");
    } catch {}
    try {
      const d = localStorage.getItem("ui_density") as "comfortable" | "compact" | null;
      if (d) setDensity(d);
    } catch {}
    try {
      const f = localStorage.getItem("font_size") as "normal" | "large" | null;
      if (f) setFontSize(f);
    } catch {}
  }, []);

  const applyTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    try {
      localStorage.setItem("theme", t);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = t === "dark" || (t === "system" && prefersDark);
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } catch {}
    toast.success(`Theme set to ${t}`);
  };

  const THEME_OPTIONS = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark",  label: "Dark",  icon: Moon },
    { value: "system",label: "System", icon: Monitor },
  ] as const;

  return (
    <>
      <SectionCard title="Theme" description="Choose how CyberSage looks on your device">
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => applyTheme(opt.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  active
                    ? "border-[#00d2ff] bg-[#00d2ff]/10"
                    : "border-[rgba(0,255,255,0.08)] hover:border-[#bbc9cf]"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-[#00d2ff]" : "text-[#bbc9cf]"}`} />
                <span className={`text-sm font-medium ${active ? "text-[#a5e7ff]" : "text-[#bbc9cf]"}`}>
                  {opt.label}
                </span>
                {active && <Check className="h-4 w-4 text-[#00d2ff]" />}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Layout Density" description="Control spacing and information density">
        <SettingRow label="Comfortable" description="More whitespace, easier to scan">
          <input
            type="radio"
            name="density"
            checked={density === "comfortable"}
            onChange={() => { setDensity("comfortable"); localStorage.setItem("ui_density", "comfortable"); }}
            className="accent-[#00d2ff]"
          />
        </SettingRow>
        <SettingRow label="Compact" description="Tighter spacing, more content visible">
          <input
            type="radio"
            name="density"
            checked={density === "compact"}
            onChange={() => { setDensity("compact"); localStorage.setItem("ui_density", "compact"); }}
            className="accent-[#00d2ff]"
          />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Text Size">
        <SettingRow label="Normal (14px)" description="Default reading size">
          <input
            type="radio"
            name="fontSize"
            checked={fontSize === "normal"}
            onChange={() => { setFontSize("normal"); localStorage.setItem("font_size", "normal"); }}
            className="accent-[#00d2ff]"
          />
        </SettingRow>
        <SettingRow label="Large (16px)" description="Easier on the eyes">
          <input
            type="radio"
            name="fontSize"
            checked={fontSize === "large"}
            onChange={() => {
              setFontSize("large");
              localStorage.setItem("font_size", "large");
              document.documentElement.style.fontSize = "16px";
            }}
            className="accent-[#00d2ff]"
          />
        </SettingRow>
      </SectionCard>
    </>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    newMail: true,
    calendarReminders: true,
    socAlerts: true,
    dlpAlerts: true,
    chatMentions: true,
    fileShared: true,
    emailDigest: false,
    pushEnabled: false,
    soundEnabled: false,
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "08:00",
  });

  const update = (key: keyof typeof prefs, val: boolean | string) => {
    setPrefs((p) => ({ ...p, [key]: val }));
  };

  return (
    <>
      <SectionCard title="Email Alerts" description="Get notified via in-app notifications">
        <SettingRow label="New mail received" description="Alert when email arrives in your inbox">
          <Toggle value={prefs.newMail} onChange={(v) => update("newMail", v)} />
        </SettingRow>
        <SettingRow label="Calendar reminders" description="Event start notifications">
          <Toggle value={prefs.calendarReminders} onChange={(v) => update("calendarReminders", v)} />
        </SettingRow>
        <SettingRow label="Chat mentions" description="When someone @mentions you">
          <Toggle value={prefs.chatMentions} onChange={(v) => update("chatMentions", v)} />
        </SettingRow>
        <SettingRow label="File shared with me" description="When a Drive file is shared">
          <Toggle value={prefs.fileShared} onChange={(v) => update("fileShared", v)} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Security Alerts" description="Critical security notifications — always recommended">
        <SettingRow label="SOC incidents" description="Open or escalated security incidents">
          <Toggle value={prefs.socAlerts} onChange={(v) => update("socAlerts", v)} />
        </SettingRow>
        <SettingRow label="DLP violations" description="Data loss prevention policy triggers">
          <Toggle value={prefs.dlpAlerts} onChange={(v) => update("dlpAlerts", v)} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Delivery Preferences">
        <SettingRow label="Daily email digest" description="Summary of activity emailed each morning">
          <Toggle value={prefs.emailDigest} onChange={(v) => update("emailDigest", v)} />
        </SettingRow>
        <SettingRow label="Push notifications" description="Browser push when tab is not focused">
          <Toggle value={prefs.pushEnabled} onChange={(v) => update("pushEnabled", v)} />
        </SettingRow>
        <SettingRow label="Sound alerts" description="Play sound on new notification">
          <Toggle value={prefs.soundEnabled} onChange={(v) => update("soundEnabled", v)} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Quiet Hours" description="Suppress notifications during these hours">
        <SettingRow label="Enable quiet hours">
          <Toggle value={prefs.quietHoursEnabled} onChange={(v) => update("quietHoursEnabled", v)} />
        </SettingRow>
        {prefs.quietHoursEnabled && (
          <div className="flex items-center gap-4 mt-4">
            <div>
              <label className="text-xs text-[#bbc9cf]">From</label>
              <input
                type="time"
                value={prefs.quietStart}
                onChange={(e) => update("quietStart", e.target.value)}
                className="block mt-1 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-3 py-1.5 text-sm text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/50 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#bbc9cf]">To</label>
              <input
                type="time"
                value={prefs.quietEnd}
                onChange={(e) => update("quietEnd", e.target.value)}
                className="block mt-1 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-3 py-1.5 text-sm text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/50 outline-none"
              />
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function LanguageTab() {
  const TIMEZONES = [
    "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris",
    "America/New_York", "America/Chicago", "America/Los_Angeles",
    "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore",
    "Asia/Tokyo", "Australia/Sydney",
  ];
  const DATE_FORMATS = [
    { label: "DD/MM/YYYY (31/12/2026)", value: "dd/MM/yyyy" },
    { label: "MM/DD/YYYY (12/31/2026)", value: "MM/dd/yyyy" },
    { label: "YYYY-MM-DD (2026-12-31)", value: "yyyy-MM-dd" },
  ];

  const [lang, setLang] = useState("en");
  const [tz, setTz] = useState("UTC");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");

  return (
    <>
      <SectionCard title="Language">
        <SettingRow label="Interface language">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-3 py-1.5 text-sm text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/50 outline-none"
          >
            <option value="en">English</option>
            <option value="ar">Arabic (العربية)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
            <option value="es">Spanish (Español)</option>
            <option value="ur">Urdu (اردو)</option>
            <option value="zh">Chinese (中文)</option>
            <option value="ja">Japanese (日本語)</option>
          </select>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Time & Date">
        <SettingRow label="Timezone">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-3 py-1.5 text-sm text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/50 outline-none"
          >
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Date format">
          <select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            className="rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-3 py-1.5 text-sm text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/50 outline-none"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Time format">
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm text-[#bbc9cf]">
              <input type="radio" name="timeFormat" value="12h" checked={timeFormat === "12h"} onChange={() => setTimeFormat("12h")} className="accent-[#00d2ff]" />
              12h
            </label>
            <label className="flex items-center gap-1.5 text-sm text-[#bbc9cf]">
              <input type="radio" name="timeFormat" value="24h" checked={timeFormat === "24h"} onChange={() => setTimeFormat("24h")} className="accent-[#00d2ff]" />
              24h
            </label>
          </div>
        </SettingRow>
      </SectionCard>
    </>
  );
}

function PrivacyTab({ userId }: { userId: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export/${userId}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cybersage-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data has been exported");
    } catch {
      toast.error("Export failed — you may not have permission");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <SectionCard title="Your Data" description="Control how your personal data is stored and used">
        <SettingRow label="Export all data" description="Download a copy of all your mail, chats, calendar events, and files">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-[#262939] text-[#bbc9cf] hover:bg-[#303444] border border-[rgba(0,255,255,0.08)] rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Account" description="Permanent account actions">
        <div className="border border-red-200 rounded-xl p-5 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Deactivate account</p>
              <p className="text-xs text-red-600 mt-0.5">
                Account deactivation is handled by your workspace administrator. Contact your admin or submit a request via the Help desk.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Privacy Controls">
        <SettingRow label="Analytics & usage data" description="Help improve CyberSage by sending anonymous usage statistics">
          <Toggle value={true} onChange={() => {}} />
        </SettingRow>
        <SettingRow label="Read receipts" description="Let others know when you've read their emails">
          <Toggle value={true} onChange={() => {}} />
        </SettingRow>
        <SettingRow label="Online presence" description="Show your active status to teammates">
          <Toggle value={true} onChange={() => {}} />
        </SettingRow>
      </SectionCard>
    </>
  );
}

// ── Mail Rules Tab ────────────────────────────────────────────────────────────
type MailRule = {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  conditions: { field: string; op: string; value: string }[];
  action: string;
  actionData: Record<string, string> | null;
};

const CONDITION_FIELDS = ["from","to","subject","body"] as const;
const CONDITION_OPS    = ["contains","equals","startsWith","endsWith","notContains"] as const;
const RULE_ACTIONS     = [
  { value: "LABEL",       label: "Add label" },
  { value: "MOVE_FOLDER", label: "Move to folder" },
  { value: "MARK_READ",   label: "Mark as read" },
  { value: "STAR",        label: "Star thread" },
  { value: "ARCHIVE",     label: "Archive" },
  { value: "TRASH",       label: "Move to trash" },
  { value: "PRIORITY",    label: "Set priority" },
  { value: "FORWARD",     label: "Forward to…" },
];

function MailRulesTab() {
  const [rules, setRules]       = useState<MailRule[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name,      setName]      = useState("");
  const [action,    setAction]    = useState("LABEL");
  const [actionVal, setActionVal] = useState("");
  const [conditions, setConditions] = useState([
    { field: "from", op: "contains", value: "" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/inbox/rules")
      .then(r => r.json())
      .then((data: MailRule[]) => setRules(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addCondition = () =>
    setConditions(prev => [...prev, { field: "from", op: "contains", value: "" }]);

  const removeCondition = (i: number) =>
    setConditions(prev => prev.filter((_, idx) => idx !== i));

  const updateCondition = (i: number, key: string, val: string) =>
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c));

  const handleCreate = async () => {
    if (!name.trim() || conditions.some(c => !c.value.trim())) {
      toast.error("Fill in all condition values and a rule name");
      return;
    }
    setSaving(true);
    try {
      const actionData: Record<string, string> = {};
      if (action === "LABEL")    actionData.label    = actionVal;
      if (action === "MOVE_FOLDER") actionData.folderId = actionVal;
      if (action === "PRIORITY") actionData.priority = actionVal;
      if (action === "FORWARD")  actionData.to       = actionVal;

      const res = await fetch("/api/inbox/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, conditions, action, actionData }),
      });
      const data = await res.json() as MailRule & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule");
      setRules(prev => [...prev, data]);
      setShowForm(false);
      setName(""); setActionVal(""); setConditions([{ field: "from", op: "contains", value: "" }]);
      toast.success("Rule created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: MailRule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
    await fetch(`/api/inbox/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    }).catch(() => {});
  };

  const deleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    await fetch(`/api/inbox/rules/${id}`, { method: "DELETE" }).catch(() => {});
    toast.success("Rule deleted");
  };

  const needsValue = ["LABEL","MOVE_FOLDER","PRIORITY","FORWARD"].includes(action);
  const actionPlaceholder =
    action === "LABEL"       ? "Label name" :
    action === "MOVE_FOLDER" ? "Folder ID" :
    action === "PRIORITY"    ? "LOW / NORMAL / HIGH / URGENT" :
    action === "FORWARD"     ? "email@example.com" : "";

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#bbc9cf]">{rules.length} rule{rules.length !== 1 ? "s" : ""} configured</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-[#00d2ff] text-[#003543] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#00b8d9] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Rule
        </button>
      </div>

      {/* Create rule form */}
      {showForm && (
        <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.12)] rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#dfe1f6]">New Rule</h4>
            <button onClick={() => setShowForm(false)} className="p-1 text-[#bbc9cf] hover:text-[#dfe1f6] rounded"><X className="w-4 h-4" /></button>
          </div>

          {/* Rule name */}
          <div>
            <label className="block text-xs text-[#bbc9cf] mb-1">Rule name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Move newsletters"
              className="w-full bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#bbc9cf]">When…</label>
              <button onClick={addCondition} className="text-xs text-[#00d2ff] hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add condition
              </button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={cond.field}
                    onChange={e => updateCondition(i, "field", e.target.value)}
                    className="bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-2 py-1.5 text-xs text-[#dfe1f6] focus:outline-none"
                  >
                    {CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select
                    value={cond.op}
                    onChange={e => updateCondition(i, "op", e.target.value)}
                    className="bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-2 py-1.5 text-xs text-[#dfe1f6] focus:outline-none"
                  >
                    {CONDITION_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input
                    type="text"
                    value={cond.value}
                    onChange={e => updateCondition(i, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-2 py-1.5 text-xs text-[#dfe1f6] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                  />
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(i)} className="p-1 text-[#bbc9cf] hover:text-[#ff4d6d] rounded">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-xs text-[#bbc9cf] mb-1">Then…</label>
            <div className="flex gap-2">
              <select
                value={action}
                onChange={e => { setAction(e.target.value); setActionVal(""); }}
                className="bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-2 py-2 text-sm text-[#dfe1f6] focus:outline-none"
              >
                {RULE_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              {needsValue && (
                <input
                  type="text"
                  value={actionVal}
                  onChange={e => setActionVal(e.target.value)}
                  placeholder={actionPlaceholder}
                  className="flex-1 bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                />
              )}
            </div>
          </div>

          <button
            onClick={() => void handleCreate()}
            disabled={saving}
            className="w-full bg-[#00d2ff] text-[#003543] py-2 rounded-lg text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Rule
          </button>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="text-center py-8 text-[#bbc9cf] text-sm">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12">
          <Filter className="w-10 h-10 text-[#3c494e] mx-auto mb-3" />
          <p className="text-sm text-[#bbc9cf]">No rules yet. Create one to auto-sort your inbox.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-[#1b1f2e] border rounded-xl p-4 transition-opacity ${rule.isActive ? "border-[rgba(0,255,255,0.12)]" : "border-[rgba(0,255,255,0.04)] opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#dfe1f6] truncate">{rule.name}</p>
                  <p className="text-xs text-[#bbc9cf] mt-0.5">
                    {rule.conditions.map(c => `${c.field} ${c.op} "${c.value}"`).join(" AND ")}
                  </p>
                  <p className="text-xs text-[#00d2ff] mt-0.5">
                    → {RULE_ACTIONS.find(a => a.value === rule.action)?.label ?? rule.action}
                    {rule.actionData && Object.values(rule.actionData).length > 0 && `: ${Object.values(rule.actionData)[0]}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void toggleActive(rule)}
                    className={`p-1.5 rounded-lg transition-colors ${rule.isActive ? "text-[#00d2ff] hover:bg-[#00d2ff]/10" : "text-[#3c494e] hover:bg-[#262939]"}`}
                    title={rule.isActive ? "Disable rule" : "Enable rule"}
                  >
                    <ToggleRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void deleteRule(rule.id)}
                    className="p-1.5 rounded-lg text-[#bbc9cf] hover:bg-[#ff4d6d]/10 hover:text-[#ff4d6d] transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function SettingsView({
  user,
  recentLogins,
  mfaEnabled,
}: {
  user: SettingsUser;
  recentLogins: RecentLogin[];
  mfaEnabled: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [currentMfaEnabled, setCurrentMfaEnabled] = useState(mfaEnabled);

  return (
    <div className="bg-[#0f1321] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Settings sidebar nav */}
          <aside className="bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.08)] w-52 flex-shrink-0 rounded-xl self-start">
            <nav className="space-y-0.5 p-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 text-left transition-all ${
                      isActive
                        ? "bg-[#00d2ff]/15 text-[#00d2ff] font-semibold rounded-lg px-3 py-2 text-sm"
                        : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-lg px-3 py-2 text-sm transition-colors"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tab.label}</p>
                    </div>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "profile" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Profile</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Manage your name, email, and personal information.</p>
                <ProfileSettings userEmail={user.email} userName={user.fullName} />
              </div>
            )}

            {activeTab === "appearance" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Appearance</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Customize how CyberSage looks and feels.</p>
                <AppearanceTab />
              </div>
            )}

            {activeTab === "notifications" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Notifications</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Control how and when CyberSage alerts you.</p>
                <NotificationsTab />
              </div>
            )}

            {activeTab === "signature" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Email Signature</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Appended to every outgoing email automatically.</p>
                <SectionCard title="Signature Editor">
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileSignature className="h-10 w-10 text-[#bbc9cf] mb-3" />
                    <p className="text-sm font-medium text-[#bbc9cf]">Rich HTML Signature Builder</p>
                    <p className="text-xs text-[#bbc9cf] mt-1">
                      Full signature editor with logo upload, social links, and HTML preview — coming in the next release.
                    </p>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === "mailboxes" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Mailboxes</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Shared and personal mailboxes you can access.</p>
                <SectionCard title="Your Mailboxes">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-md bg-[#dbeafe] border border-[#dbeafe]">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-[#00d2ff]" />
                        <div>
                          <p className="text-sm font-medium text-[#dfe1f6]">{user.email}</p>
                          <p className="text-xs text-[#a5e7ff] uppercase tracking-wider font-medium">Primary · Owner</p>
                        </div>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-xs text-center text-[#bbc9cf] mt-4">
                      Additional shared mailboxes are assigned by your administrator.
                    </p>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === "security" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Security</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Protect your account with two-factor authentication and monitor active sessions.</p>

                <SectionCard title="Two-Factor Authentication" description="Add an extra layer of security to your account">
                  <MFASetup
                    mfaEnabled={currentMfaEnabled}
                    onStatusChange={() => setCurrentMfaEnabled((prev) => !prev)}
                  />
                </SectionCard>

                <SectionCard title="Active Sessions" description="Devices currently logged into your account">
                  <SessionManager />
                </SectionCard>

                <SectionCard title="Recent Login Activity" description="Last 10 sign-in attempts to your account">
                  <div className="space-y-2">
                    {recentLogins.length === 0 ? (
                      <p className="text-sm text-[#bbc9cf] text-center py-4">No login history available.</p>
                    ) : (
                      recentLogins.map((login) => (
                        <div
                          key={login.id}
                          className="bg-[#262939] border border-[rgba(0,255,255,0.08)] rounded-xl px-4 py-3 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${login.success ? "bg-emerald-500" : "bg-red-500"}`} />
                            <div>
                              <p className={`text-xs font-semibold ${login.success ? "text-emerald-700" : "text-red-500"}`}>
                                {login.success ? "Successful login" : "Failed attempt"}
                              </p>
                              <p className="text-xs text-[#bbc9cf]">
                                {login.ip ?? "Unknown IP"} · {login.userAgent?.split(" ")[0] ?? "Unknown browser"}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-[#bbc9cf] flex-shrink-0">
                            {new Date(login.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Password" description="Change your account password">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#dfe1f6]">••••••••••••</p>
                      <p className="text-xs text-[#bbc9cf]">Last changed: unknown</p>
                    </div>
                    <a
                      href="/reset-password"
                      className="text-sm font-medium text-[#00d2ff] hover:text-[#00b8d9] transition-colors"
                    >
                      Change password →
                    </a>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === "mail-rules" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Mail Rules</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Automatically sort, label, and manage incoming emails.</p>
                <MailRulesTab />
              </div>
            )}

            {activeTab === "language" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Language & Region</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Set your language, timezone, and date preferences.</p>
                <LanguageTab />
              </div>
            )}

            {activeTab === "privacy" && (
              <div>
                <h2 className="text-xl font-bold text-[#dfe1f6] mb-1">Privacy & Data</h2>
                <p className="text-sm text-[#bbc9cf] mb-6">Manage your data and account privacy preferences.</p>
                <PrivacyTab userId={user.id} />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
