"use client";

import { useState } from "react";
import { Shield, ShieldCheck, ShieldOff, Download, Copy, RefreshCw, X } from "lucide-react";

type SetupData = {
  secret: string;
  qrCode: string;
  otpauthUrl: string;
};

type State =
  | { kind: "disabled" }
  | { kind: "setting-up"; data: SetupData }
  | { kind: "backup-codes"; codes: string[] }
  | { kind: "enabled" };

type ModalAction = "disable" | "regenerate";

export function MFASetup({
  mfaEnabled,
  onStatusChange,
}: {
  mfaEnabled: boolean;
  onStatusChange: () => void;
}) {
  const [state, setState] = useState<State>(
    mfaEnabled ? { kind: "enabled" } : { kind: "disabled" }
  );
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ action: ModalAction; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function clearError() {
    setError("");
  }

  async function startSetup() {
    setLoading(true);
    clearError();
    try {
      const res = await fetch("/api/auth/mfa/setup");
      if (!res.ok) throw new Error("Failed to load setup");
      const data = (await res.json()) as SetupData;
      setState({ kind: "setting-up", data });
      setTokenInput("");
    } catch {
      setError("Could not start MFA setup. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndEnable() {
    if (state.kind !== "setting-up") return;
    if (!tokenInput.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: state.data.secret, token: tokenInput.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Verification failed");
      }
      const { backupCodes } = (await res.json()) as { backupCodes: string[] };
      setState({ kind: "backup-codes", codes: backupCodes });
      setTokenInput("");
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleModalSubmit() {
    if (!modal) return;
    if (!modal.token.trim()) {
      setError("Enter your current TOTP code.");
      return;
    }
    setLoading(true);
    clearError();
    try {
      if (modal.action === "disable") {
        const res = await fetch("/api/auth/mfa/disable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: modal.token.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Failed to disable MFA");
        }
        setState({ kind: "disabled" });
        setModal(null);
        onStatusChange();
      } else {
        const res = await fetch("/api/auth/mfa/backup-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: modal.token.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Failed to regenerate codes");
        }
        const { backupCodes } = (await res.json()) as { backupCodes: string[] };
        setModal(null);
        setState({ kind: "backup-codes", codes: backupCodes });
        onStatusChange();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadCodes(codes: string[]) {
    const text = [
      "CyberSage Workspace — MFA Backup Codes",
      "Keep these codes safe. Each code can only be used once.",
      "",
      ...codes,
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cybersage-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySecret(secret: string) {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-[#ff4d6d] bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg p-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="ml-2 text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {state.kind === "disabled" && (
        <div className="p-6 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-xl bg-[#262939]">
              <Shield className="h-6 w-6 text-[#bbc9cf]" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-[#dfe1f6]">Two-Factor Authentication</h3>
              <p className="text-sm text-[#bbc9cf] mt-1">
                Add an extra layer of security by requiring a code from your authenticator app at login.
              </p>
              <button
                onClick={startSetup}
                disabled={loading}
                className="mt-4 bg-[#00d2ff] text-[#003543] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Loading..." : "Enable Two-Factor Authentication"}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.kind === "setting-up" && (
        <div className="p-6 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl space-y-6">
          <div>
            <h3 className="text-xl font-bold text-[#dfe1f6]">Scan QR Code</h3>
            <p className="text-sm text-[#bbc9cf] mt-1">
              Open your authenticator app (Google Authenticator, Authy, etc.) and scan the QR code below.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="p-3 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)] shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.data.qrCode}
                alt="TOTP QR Code"
                className="h-48 w-48"
              />
            </div>

            <div className="w-full">
              <p className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-2">
                Or enter manually
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#262939] border border-[rgba(0,255,255,0.08)] font-mono text-sm text-[#dfe1f6] break-all">
                <span className="flex-1">{state.data.secret}</span>
                <button
                  onClick={() => copySecret(state.data.secret)}
                  className="flex-shrink-0 text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors"
                  title="Copy secret"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 mt-1">Copied to clipboard</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#dfe1f6] mb-2">
              Enter 6-digit verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-lg border border-[rgba(0,255,255,0.08)] text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-transparent bg-[#262939] text-[#dfe1f6]"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setState({ kind: "disabled" }); clearError(); }}
              className="bg-[#262939] text-[#bbc9cf] hover:bg-[#303444] border border-[rgba(0,255,255,0.08)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={verifyAndEnable}
              disabled={loading || tokenInput.length !== 6}
              className="flex-1 bg-[#00d2ff] text-[#003543] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? "Verifying..." : "Verify & Enable"}
            </button>
          </div>
        </div>
      )}

      {state.kind === "backup-codes" && (
        <div className="p-6 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
              <h3 className="text-xl font-bold text-[#dfe1f6]">MFA Enabled Successfully</h3>
            </div>
            <p className="text-sm text-[#bbc9cf]">
              Save these backup codes somewhere safe. Each code can only be used once to sign in if you lose access to your authenticator app.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-4 rounded-xl bg-[#262939] border border-[rgba(0,255,255,0.08)]">
            {state.codes.map((code, i) => (
              <div
                key={i}
                className="font-mono text-sm text-[#dfe1f6] px-3 py-2 rounded-lg bg-[#262939] border border-[rgba(0,255,255,0.08)] text-center tracking-widest"
              >
                {code}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => downloadCodes(state.codes)}
              className="bg-[#262939] text-[#bbc9cf] hover:bg-[#303444] border border-[rgba(0,255,255,0.08)] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={() => setState({ kind: "enabled" })}
              className="flex-1 bg-[#00d2ff] text-[#003543] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              I&apos;ve saved these codes
            </button>
          </div>
        </div>
      )}

      {state.kind === "enabled" && (
        <div className="p-6 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-100">
                <ShieldCheck className="h-6 w-6 text-emerald-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-[#dfe1f6]">Two-Factor Authentication</h3>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">
                    Enabled
                  </span>
                </div>
                <p className="text-sm text-[#bbc9cf] mt-0.5">Your account is protected with TOTP authentication.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setModal({ action: "regenerate", token: "" }); clearError(); }}
              className="bg-[#262939] text-[#bbc9cf] hover:bg-[#303444] border border-[rgba(0,255,255,0.08)] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate Backup Codes
            </button>
            <button
              onClick={() => { setModal({ action: "disable", token: "" }); clearError(); }}
              className="bg-[#ff4d6d]/10 text-[#ff4d6d] hover:bg-[#ff4d6d]/20 hover:shadow-[0_0_16px_rgba(255,77,109,0.35)] border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <ShieldOff className="h-4 w-4" />
              Disable MFA
            </button>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-[#1b1f2e] rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4 border border-[rgba(0,255,255,0.08)]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#dfe1f6]">
                {modal.action === "disable" ? "Disable MFA" : "Regenerate Backup Codes"}
              </h3>
              <button
                onClick={() => { setModal(null); clearError(); }}
                className="text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modal.action === "disable" && (
              <p className="text-sm text-[#ff4d6d] bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg p-3">
                This will remove MFA protection from your account. You will need your authenticator app code to confirm.
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-[#dfe1f6] mb-2">
                Enter current authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={modal.token}
                onChange={(e) =>
                  setModal({ ...modal, token: e.target.value.replace(/\D/g, "") })
                }
                placeholder="000000"
                className="w-full px-4 py-3 rounded-lg border border-[rgba(0,255,255,0.08)] text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-transparent bg-[#262939] text-[#dfe1f6]"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); clearError(); }}
                className="flex-1 bg-[#262939] text-[#bbc9cf] hover:bg-[#303444] border border-[rgba(0,255,255,0.08)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleModalSubmit}
                disabled={loading || modal.token.length !== 6}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 transition-colors ${
                  modal.action === "disable"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#2563eb] hover:bg-[#1d4ed8]"
                }`}
              >
                {loading
                  ? "Please wait..."
                  : modal.action === "disable"
                  ? "Disable MFA"
                  : "Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
