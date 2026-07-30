"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight, Loader2, Mail, Users, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Step = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  { id: "profile",    title: "Set up your profile",  description: "Add your job title and a profile photo so teammates recognise you.", icon: Users },
  { id: "signature",  title: "Create your signature", description: "Add a professional email signature with your name, title, and contact details.", icon: Mail },
  { id: "security",   title: "Enable 2-factor auth",  description: "Protect your account with an authenticator app or SMS code.", icon: Shield },
  { id: "explore",    title: "Explore CyberSage",     description: "Take a quick tour of your inbox, chat, and AI assistant.", icon: Sparkles },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const step = STEPS[current];
  const isLast = current === STEPS.length - 1;
  const progress = Math.round(((current) / STEPS.length) * 100);

  const markComplete = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setCompleted((prev) => new Set([...prev, step.id]));
    setLoading(false);

    if (isLast) {
      toast.success("Setup complete — welcome to CyberSage!");
      router.push("/inbox");
    } else {
      setCurrent((c) => c + 1);
    }
  };

  const skip = () => {
    if (isLast) { router.push("/inbox"); return; }
    setCurrent((c) => c + 1);
  };

  return (
    <div className="min-h-full bg-surface text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Welcome to CyberSage</h1>
          <p className="text-muted">Let&apos;s get you set up in just a few steps.</p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-subtle mb-1.5">
            <span>Step {current + 1} of {STEPS.length}</span>
            <span>{progress}% complete</span>
          </div>
          <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-3 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = completed.has(s.id);
            const active = i === current;
            const future = i > current;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${
                  active
                    ? "bg-surface border-accent/30 shadow-lg shadow-accent/5"
                    : done
                    ? "bg-surface border-ok/20"
                    : "bg-surface border-border opacity-50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  done ? "bg-ok/20" : active ? "bg-accent/15" : "bg-surface-sunken"
                }`}>
                  {done ? (
                    <CheckCircle className="w-5 h-5 text-ok" />
                  ) : (
                    <Icon className={`w-5 h-5 ${active ? "text-accent" : "text-subtle"}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${done ? "text-ok" : active ? "text-white" : "text-subtle"}`}>
                    {s.title}
                  </p>
                  {active && <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.description}</p>}
                </div>
                {!future && !done && !active && (
                  <ChevronRight className="w-4 h-4 text-subtle flex-shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={markComplete}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-accent-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLast ? (
              "Finish setup"
            ) : (
              <>Complete step <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
          <button
            onClick={skip}
            className="px-5 py-3 text-sm text-subtle hover:text-muted transition-colors rounded-xl border border-border hover:bg-hover"
          >
            {isLast ? "Go to inbox" : "Skip"}
          </button>
        </div>

        <p className="text-center text-xs text-subtle mt-6">
          You can always update these later in{" "}
          <a href="/settings" className="text-accent hover:underline">Settings</a>.
        </p>
      </div>
    </div>
  );
}
