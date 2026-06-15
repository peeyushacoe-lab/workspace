"use client";

import { useState, useEffect } from "react";
import { Key, Webhook, Plus, Trash2, Copy, Check, Eye, EyeOff, Loader2, Globe, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

type APIKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

type WebhookEndpoint = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  failCount: number;
  lastTriggeredAt: string | null;
};

const AVAILABLE_SCOPES = ["email:read", "email:send", "chat:read", "chat:write", "drive:read", "drive:write", "calendar:read", "calendar:write", "users:read"];
const WEBHOOK_EVENTS = ["email.received", "email.sent", "chat.message", "drive.upload", "calendar.event", "user.created", "meeting.started", "sentinel.alert"];

export default function DeveloperPage() {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"keys" | "webhooks">("keys");
  const [copied, setCopied] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["email:read"]);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(["email.received"]);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/developer/keys").then((r) => r.json()),
      fetch("/api/developer/webhooks").then((r) => r.json()),
    ]).then(([keys, hooks]: [APIKey[], WebhookEndpoint[]]) => {
      setApiKeys(keys ?? []);
      setWebhooks(hooks ?? []);
    }).catch(() => toast.error("Failed to load developer resources"))
      .finally(() => setLoading(false));
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = await res.json() as { key: APIKey & { rawKey: string } };
      setApiKeys((prev) => [data.key, ...prev]);
      setRevealedKey(data.key.rawKey);
      toast.success("API key created — copy it now, it won't be shown again");
      setShowNewKey(false);
      setNewKeyName("");
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      await fetch(`/api/developer/keys/${id}`, { method: "DELETE" });
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  const createWebhook = async () => {
    if (!newWebhookUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/developer/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newWebhookUrl.trim(), events: newWebhookEvents }),
      });
      if (!res.ok) throw new Error("Failed to create webhook");
      const webhook = await res.json() as WebhookEndpoint;
      setWebhooks((prev) => [webhook, ...prev]);
      toast.success("Webhook endpoint registered");
      setShowNewWebhook(false);
      setNewWebhookUrl("");
    } catch {
      toast.error("Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await fetch(`/api/developer/webhooks/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook deleted");
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Developer · Phase 26"
        title="Developer Portal"
        description="Manage API keys and webhook endpoints for third-party integrations."
      />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#e8eaed]">
          {(["keys", "webhooks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? "border-[#1a56db] text-[#1a56db]" : "border-transparent text-[#9aa0a6] hover:text-[#5f6368]"}`}
            >
              {t === "keys" ? <Key className="w-4 h-4" /> : <Webhook className="w-4 h-4" />}
              {t === "keys" ? "API Keys" : "Webhooks"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#5f6368]" /></div>
        ) : tab === "keys" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#9aa0a6]">Use API keys to authenticate requests to the CyberSage API.</p>
              <button onClick={() => setShowNewKey(true)} className="flex items-center gap-1.5 bg-[#1a56db]/15 hover:bg-[#1a56db]/25 border border-[#1a56db]/30 text-[#1a56db] text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> New key
              </button>
            </div>

            {revealedKey && (
              <div className="flex items-center gap-3 bg-[#f8fafd]/10 border border-[#06d6a0]/30 rounded-xl px-4 py-3">
                <Zap className="w-4 h-4 text-[#06d6a0] flex-shrink-0" />
                <code className="flex-1 text-xs font-mono text-[#06d6a0] break-all">{revealedKey}</code>
                <button onClick={() => copyToClipboard(revealedKey, "new")} className="flex-shrink-0">
                  {copied === "new" ? <Check className="w-4 h-4 text-[#06d6a0]" /> : <Copy className="w-4 h-4 text-[#9aa0a6] hover:text-[#5f6368]" />}
                </button>
                <button onClick={() => setRevealedKey(null)} className="text-[#9aa0a6] hover:text-[#ff4d6d] text-xs">Dismiss</button>
              </div>
            )}

            {showNewKey && (
              <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-4">
                <p className="text-sm font-semibold text-[#202124]">Create API Key</p>
                <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. My Integration)" className="w-full bg-[#f1f3f4] border border-[#e8eaed] rounded-lg px-3 py-2 text-sm text-[#202124] outline-none focus:border-[#1a56db]/40" />
                <div>
                  <p className="text-xs text-[#9aa0a6] mb-2">Scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_SCOPES.map((s) => (
                      <button key={s} onClick={() => setNewKeyScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${newKeyScopes.includes(s) ? "bg-[#1a56db]/15 text-[#1a56db] border-[#1a56db]/30" : "text-[#9aa0a6] border-[#e8eaed]"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createKey} disabled={creating || !newKeyName.trim()} className="flex items-center gap-1.5 bg-[#1a56db]/15 hover:bg-[#1a56db]/25 border border-[#1a56db]/30 text-[#1a56db] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
                  </button>
                  <button onClick={() => setShowNewKey(false)} className="text-sm text-[#9aa0a6] hover:text-[#5f6368] px-4 py-2">Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div key={key.id} className="bg-white border border-[#e8eaed] rounded-xl px-4 py-3 flex items-center gap-4">
                  <Key className="w-4 h-4 text-[#9aa0a6] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#202124]">{key.name}</span>
                      {!key.isActive && <span className="text-[10px] text-[#ff4d6d] bg-[#ff4d6d]/10 border border-[#ff4d6d]/20 px-1.5 py-0.5 rounded-full">Revoked</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <code className="text-xs text-[#9aa0a6] font-mono">{key.keyPrefix}••••••••</code>
                      <span className="text-[10px] text-[#9aa0a6]">{key.scopes.join(", ")}</span>
                    </div>
                  </div>
                  {key.lastUsedAt && <span className="text-[10px] text-[#9aa0a6] hidden sm:block">Used {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                  <button onClick={() => copyToClipboard(key.keyPrefix, key.id)} className="text-[#9aa0a6] hover:text-[#5f6368]">
                    {copied === key.id ? <Check className="w-4 h-4 text-[#06d6a0]" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button onClick={() => void revokeKey(key.id)} className="text-[#9aa0a6] hover:text-[#ff4d6d]"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {apiKeys.length === 0 && <p className="text-sm text-[#9aa0a6] text-center py-8">No API keys yet</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#9aa0a6]">Webhooks send real-time notifications to your endpoints when events occur.</p>
              <button onClick={() => setShowNewWebhook(true)} className="flex items-center gap-1.5 bg-[#1a56db]/15 hover:bg-[#1a56db]/25 border border-[#1a56db]/30 text-[#1a56db] text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> New webhook
              </button>
            </div>

            {showNewWebhook && (
              <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-4">
                <p className="text-sm font-semibold text-[#202124]">Register Webhook</p>
                <div className="flex items-center gap-2 bg-[#f1f3f4] border border-[#e8eaed] rounded-lg px-3 py-2">
                  <Globe className="w-4 h-4 text-[#9aa0a6]" />
                  <input value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhooks/cybersage" className="flex-1 bg-transparent text-sm text-[#202124] outline-none placeholder-[#5d6579]" />
                </div>
                <div>
                  <p className="text-xs text-[#9aa0a6] mb-2">Events to receive</p>
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENTS.map((e) => (
                      <button key={e} onClick={() => setNewWebhookEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${newWebhookEvents.includes(e) ? "bg-[#1a56db]/15 text-[#1a56db] border-[#1a56db]/30" : "text-[#9aa0a6] border-[#e8eaed]"}`}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createWebhook} disabled={creating || !newWebhookUrl.trim()} className="flex items-center gap-1.5 bg-[#1a56db]/15 hover:bg-[#1a56db]/25 border border-[#1a56db]/30 text-[#1a56db] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Register
                  </button>
                  <button onClick={() => setShowNewWebhook(false)} className="text-sm text-[#9aa0a6] hover:text-[#5f6368] px-4 py-2">Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {webhooks.map((wh) => (
                <div key={wh.id} className="bg-white border border-[#e8eaed] rounded-xl px-4 py-3 flex items-center gap-4">
                  <Webhook className="w-4 h-4 text-[#9aa0a6] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-[#202124] truncate">{wh.url}</p>
                    <p className="text-[10px] text-[#9aa0a6] mt-0.5">{wh.events.join(", ")}</p>
                  </div>
                  {wh.failCount > 0 && <span className="text-[10px] text-[#ff4d6d] bg-[#ff4d6d]/10 px-1.5 py-0.5 rounded-full">{wh.failCount} failures</span>}
                  <button onClick={() => void deleteWebhook(wh.id)} className="text-[#9aa0a6] hover:text-[#ff4d6d]"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {webhooks.length === 0 && <p className="text-sm text-[#9aa0a6] text-center py-8">No webhooks yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
