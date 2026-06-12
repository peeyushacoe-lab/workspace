"use client";

import { useState } from "react";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";

export function ResetPasswordForm({ isForcedReset }: { isForcedReset: boolean }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.redirectTo ?? "/inbox";
      } else {
        setError(data.error ?? "Failed to reset password");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.4)] w-full max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="text-sm text-[#ff4d6d] bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-[#202124] mb-1.5 block">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5f6368]/60" />
            <input
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="block w-full pl-9 pr-10 py-2.5 border border-[#e8eaed] rounded-md bg-[#f1f3f4] text-[#202124] focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]/60 transition-all text-sm outline-none"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#202124] transition-colors"
              onClick={() => setShowPw(s => !s)}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-[#202124] mb-1.5 block">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5f6368]/60" />
            <input
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="Repeat your password"
              className="block w-full pl-9 pr-4 py-2.5 border border-[#e8eaed] rounded-md bg-[#f1f3f4] text-[#202124] focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]/60 transition-all text-sm outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-[#1a56db] hover:bg-[#f8fafd] focus:ring-2 focus:ring-[#1a56db]/20 transition-all disabled:opacity-50 items-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Saving…" : isForcedReset ? "Set Password & Continue" : "Update Password"}
        </button>

        {!isForcedReset && (
          <p className="text-center">
            <a href="/settings" className="text-sm text-[#1a56db] hover:text-[#7dd8f5] transition-colors">
              Back to Settings
            </a>
          </p>
        )}
      </form>
    </div>
  );
}
