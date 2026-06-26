"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, ShieldCheck, ShieldOff, Fingerprint,
  Smartphone, Trash2, Plus, Loader2, RefreshCw,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type Passkey = {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export function MFASetup({
  mfaEnabled,
  onStatusChange,
}: {
  mfaEnabled: boolean;
  onStatusChange: () => void;
}) {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchPasskeys = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/auth/passkey/list");
      const data = await res.json() as { passkeys: Passkey[] };
      setPasskeys(data.passkeys ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void fetchPasskeys(); }, [fetchPasskeys]);

  async function register() {
    setRegistering(true);
    setError("");
    setSuccess("");
    try {
      const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      if (!optRes.ok) throw new Error("Failed to start registration");
      const options = await optRes.json() as PublicKeyCredentialCreationOptionsJSON;

      const credential = await startRegistration({ optionsJSON: options });

      const verRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, name: newName.trim() || "My passkey" }),
      });
      const verData = await verRes.json() as { verified?: boolean; error?: string };
      if (!verRes.ok || !verData.verified) throw new Error(verData.error ?? "Verification failed");

      setSuccess("Passkey registered successfully.");
      setShowNameInput(false);
      setNewName("");
      await fetchPasskeys();
      onStatusChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("abort") && !msg.includes("NotAllowedError")) {
        setError(msg);
      }
    } finally {
      setRegistering(false);
    }
  }

  async function removePasskey(id: string) {
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`/api/auth/passkey/list?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove passkey");
      await fetchPasskeys();
      onStatusChange();
    } catch {
      setError("Could not remove passkey. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mfaEnabled ? "bg-[#e6f4ea]" : "bg-[#f1f3f4]"}`}>
          {mfaEnabled
            ? <ShieldCheck className="h-5 w-5 text-[#0f9d58]" />
            : <Shield className="h-5 w-5 text-[#5f6368]" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#202124]">Passkey (biometric) authentication</p>
          <p className="text-xs text-[#5f6368] mt-0.5">
            {mfaEnabled
              ? `${passkeys.length} passkey${passkeys.length !== 1 ? "s" : ""} registered — sign-in requires biometric approval`
              : "Use Face ID, fingerprint, or your device PIN to verify sign-ins. No codes needed."}
          </p>
        </div>
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${mfaEnabled ? "bg-[#e6f4ea] text-[#0f9d58]" : "bg-[#f1f3f4] text-[#5f6368]"}`}>
          {mfaEnabled ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Passkey list */}
      {loadingList ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[#5f6368]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : passkeys.length > 0 ? (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center gap-3 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e8f0fe]">
                {pk.deviceType === "multiDevice"
                  ? <Smartphone className="h-4 w-4 text-[#1a56db]" />
                  : <Fingerprint className="h-4 w-4 text-[#1a56db]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#202124] truncate">{pk.name}</p>
                <p className="text-[11px] text-[#80868b]">
                  Added {formatDate(pk.createdAt)}
                  {pk.lastUsedAt && ` · Last used ${formatDate(pk.lastUsedAt)}`}
                  {pk.backedUp && " · Synced to cloud"}
                </p>
              </div>
              <button
                onClick={() => void removePasskey(pk.id)}
                disabled={deletingId === pk.id}
                className="shrink-0 p-1.5 rounded-md text-[#80868b] hover:text-[#ea4335] hover:bg-[#fce8e6] transition-colors disabled:opacity-40"
                title="Remove passkey"
              >
                {deletingId === pk.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      ) : mfaEnabled ? (
        <p className="text-xs text-[#80868b]">No passkeys found — add one below.</p>
      ) : null}

      {/* Feedback */}
      {error && <p className="text-xs text-[#ea4335]">{error}</p>}
      {success && <p className="text-xs text-[#0f9d58]">{success}</p>}

      {/* Add passkey */}
      {showNameInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Work MacBook, iPhone 15"
            className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void register();
              if (e.key === "Escape") setShowNameInput(false);
            }}
          />
          <button
            onClick={() => void register()}
            disabled={registering}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
          >
            {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
            {registering ? "Waiting for biometric…" : "Register"}
          </button>
          <button
            onClick={() => setShowNameInput(false)}
            className="px-3 py-2 text-xs font-medium rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowNameInput(true); setError(""); setSuccess(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add passkey
          </button>
          {passkeys.length > 0 && (
            <button
              onClick={() => void fetchPasskeys()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          )}
          {mfaEnabled && passkeys.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm("Remove all passkeys and disable MFA?")) return;
                for (const pk of passkeys) await removePasskey(pk.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[#ea4335] hover:bg-[#fce8e6] transition-colors"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Disable MFA
            </button>
          )}
        </div>
      )}

      {/* Explainer for new users */}
      {!mfaEnabled && (
        <p className="text-[11px] text-[#80868b] leading-relaxed">
          Passkeys use your device&apos;s built-in biometrics (Face ID, Touch ID, Windows Hello) or PIN —
          nothing is shared with Nexus. Verification happens entirely on your device.
          Phishing-proof and more secure than any code or push notification.
        </p>
      )}
    </div>
  );
}
