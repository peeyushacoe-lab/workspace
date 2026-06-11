"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Suspense } from "react";

const PLANS = [
  { id: "free",       label: "Free",       price: "£0/mo",   features: "5 users · 5 GB" },
  { id: "starter",    label: "Starter",    price: "£29/mo",  features: "25 users · 50 GB" },
  { id: "pro",        label: "Pro",        price: "£79/mo",  features: "Unlimited users · 500 GB · AI" },
  { id: "enterprise", label: "Enterprise", price: "Custom",  features: "Dedicated instance · SLA" },
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPlan = searchParams.get("plan") ?? "free";

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    company: "",
    password: "",
    plan: defaultPlan,
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      toast.success("Account created — signing you in…");
      router.push("/onboarding");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0d1a] text-[#dfe1f6] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-semibold text-[#00d2ff]">CyberSage</Link>
          <h1 className="text-2xl font-semibold text-white mt-4 mb-1">Create your workspace</h1>
          <p className="text-[#8899a6] text-sm">Free forever · No card required</p>
        </div>

        <form onSubmit={submit} className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-2xl p-8 space-y-4">
          {/* Full name */}
          <div>
            <label className="block text-xs font-medium text-[#8899a6] mb-1.5">Full name</label>
            <input
              required
              value={form.fullName}
              onChange={set("fullName")}
              placeholder="Alex Johnson"
              className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2.5 text-sm text-[#dfe1f6] placeholder-[#3d4f59] outline-none focus:border-[#00d2ff]/40 transition-colors"
            />
          </div>

          {/* Work email */}
          <div>
            <label className="block text-xs font-medium text-[#8899a6] mb-1.5">Work email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="alex@company.com"
              className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2.5 text-sm text-[#dfe1f6] placeholder-[#3d4f59] outline-none focus:border-[#00d2ff]/40 transition-colors"
            />
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-medium text-[#8899a6] mb-1.5">Company name</label>
            <input
              required
              value={form.company}
              onChange={set("company")}
              placeholder="Acme Corp"
              className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2.5 text-sm text-[#dfe1f6] placeholder-[#3d4f59] outline-none focus:border-[#00d2ff]/40 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-[#8899a6] mb-1.5">Password</label>
            <div className="relative">
              <input
                required
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                placeholder="Min. 8 characters"
                className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2.5 pr-10 text-sm text-[#dfe1f6] placeholder-[#3d4f59] outline-none focus:border-[#00d2ff]/40 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5d6579] hover:text-[#9aa3b8]"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-medium text-[#8899a6] mb-1.5">Plan</label>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((p) => (
                <label
                  key={p.id}
                  className={`flex flex-col cursor-pointer rounded-lg border p-3 transition-colors ${
                    form.plan === p.id
                      ? "border-[#00d2ff]/50 bg-[#00d2ff]/8"
                      : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.11)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={form.plan === p.id}
                    onChange={set("plan")}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-semibold ${form.plan === p.id ? "text-[#00d2ff]" : "text-[#dfe1f6]"}`}>{p.label}</span>
                    {form.plan === p.id && <CheckCircle className="w-3 h-3 text-[#00d2ff]" />}
                  </div>
                  <span className="text-xs font-semibold text-white">{p.price}</span>
                  <span className="text-[10px] text-[#5d6579] mt-0.5">{p.features}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#00d2ff] text-[#003543] font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Creating workspace…" : "Create workspace"}
          </button>

          <p className="text-center text-xs text-[#5d6579]">
            By signing up you agree to our{" "}
            <a href="/terms" className="text-[#00d2ff] hover:underline">Terms</a>{" "}
            and{" "}
            <a href="/privacy" className="text-[#00d2ff] hover:underline">Privacy Policy</a>.
          </p>
        </form>

        <p className="text-center text-sm text-[#5d6579] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#00d2ff] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
