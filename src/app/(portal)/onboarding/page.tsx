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
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-white mb-2">Welcome to CyberSage</h1>
          <p className="text-[#8899a6]">Let&apos;s get you set up in just a few steps.</p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-[#5A6275] mb-1.5">
            <span>Step {current + 1} of {STEPS.length}</span>
            <span>{progress}% complete</span>
          </div>
          <div className="h-1.5 bg-[#1B1F2A] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00C2FF] rounded-full transition-all duration-500"
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
                    ? "bg-[#12151D] border-[#00C2FF]/30 shadow-lg shadow-[#00d2ff]/5"
                    : done
                    ? "bg-[#12151D] border-emerald-500/20"
                    : "bg-[#12151D] border-[#262A35] opacity-50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  done ? "bg-emerald-500/20" : active ? "bg-[#00C2FF]/15" : "bg-[#1B1F2A]"
                }`}>
                  {done ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Icon className={`w-5 h-5 ${active ? "text-[#00C2FF]" : "text-[#5A6275]"}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${done ? "text-emerald-400" : active ? "text-white" : "text-[#5A6275]"}`}>
                    {s.title}
                  </p>
                  {active && <p className="text-xs text-[#8899a6] mt-0.5 leading-relaxed">{s.description}</p>}
                </div>
                {!future && !done && !active && (
                  <ChevronRight className="w-4 h-4 text-[#5A6275] flex-shrink-0 mt-1" />
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#00C2FF] text-[#06121A] font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
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
            className="px-5 py-3 text-sm text-[#5A6275] hover:text-[#8A92A6] transition-colors rounded-xl border border-[#262A35] hover:bg-[#ffffff05]"
          >
            {isLast ? "Go to inbox" : "Skip"}
          </button>
        </div>

        <p className="text-center text-xs text-[#5A6275] mt-6">
          You can always update these later in{" "}
          <a href="/settings" className="text-[#00C2FF] hover:underline">Settings</a>.
        </p>
      </div>
    </div>
  );
}
