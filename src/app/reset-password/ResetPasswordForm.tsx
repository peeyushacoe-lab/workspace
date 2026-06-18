"use client";

import { useState } from "react";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";

export function ResetPasswordForm({ isForcedReset }: { isForcedReset: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isForcedReset && !currentPassword) {
      setError("Current password is required");
      return;
    }
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
      const body: Record<string, string> = { newPassword };
      if (!isForcedReset) body.currentPassword = currentPassword;
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          <div className="text-sm text-[#ea4335] bg-[#ea4335]/10 border border-[#ea4335]/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Current password — only shown for voluntary changes, not forced first-time resets */}
        {!isForcedReset && (
          <div>
            <label className="text-sm font-medium text-[#202124] mb-1.5 block">Current Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5f6368]/60" />
              <input
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter your current password"
                className="block w-full pl-9 pr-10 py-2.5 border border-[#e8eaed] rounded-md bg-[#f1f3f4] text-[#202124] focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]/60 transition-all text-sm outline-none"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#202124] transition-colors"
                onClick={() => setShowCurrentPw(s => !s)}
              >
                {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
              placeholder="Repeat your new password"
              className="block w-full pl-9 pr-4 py-2.5 border border-[#e8eaed] rounded-md bg-[#f1f3f4] text-[#202124] focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]/60 transition-all text-sm outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-[#1a56db] hover:bg-[#1648c7] focus:ring-2 focus:ring-[#1a56db]/20 transition-all disabled:opacity-50 items-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Saving…" : isForcedReset ? "Set Password & Continue" : "Update Password"}
        </button>

        {!isForcedReset && (
          <p className="text-center">
            <a href="/settings" className="text-sm text-[#1a56db] hover:text-[#1648c7] transition-colors">
              Back to Settings
            </a>
          </p>
        )}
      </form>
    </div>
  );
}
