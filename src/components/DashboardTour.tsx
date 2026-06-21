"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, Mail, MessageSquare, HardDrive, Calendar, Sparkles, CheckCircle } from "lucide-react";

const TOUR_STEPS = [
  {
    icon: CheckCircle,
    title: "Welcome to Nexus",
    body: "Your all-in-one enterprise platform. Let's take a quick tour of the key features.",
  },
  {
    icon: Mail,
    title: "Inbox",
    body: "Your unified inbox handles all inbound email. Read, reply, and track every message in one place.",
  },
  {
    icon: MessageSquare,
    title: "Chat",
    body: "Real-time team messaging with channels and direct messages. Stay connected with your team.",
  },
  {
    icon: HardDrive,
    title: "Drive",
    body: "Securely store, share, and collaborate on files across your entire organisation.",
  },
  {
    icon: Calendar,
    title: "Calendar",
    body: "Schedule events, set reminders, and coordinate meetings with your team.",
  },
  {
    icon: Sparkles,
    title: "AI Assistant",
    body: "Use AI to draft emails, summarise threads, and get smart suggestions. Your personal productivity boost.",
  },
];

const TOUR_KEY = "cybersage-tour-v1";

export function DashboardTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(TOUR_KEY)) {
      // Small delay so the page renders first
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "done");
    setVisible(false);
    fetch("/api/auth/complete-tour", { method: "POST" }).catch(() => {});
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step]!;
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 "
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <div className="bg-[#12151D] border border-[#262A35] rounded-xl shadow-2xl p-5 max-w-md w-full mx-4">
        {/* Progress dots */}
        <div className="flex items-center justify-between mb-7">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-[#00C2FF]" : i < step ? "w-1.5 bg-[#00C2FF]/40" : "w-1.5 bg-[#1B1F2A]"
                }`}
              />
            ))}
          </div>
          <button
            onClick={dismiss}
            className="text-[#8A92A6] hover:text-[#E6E9F0] transition-colors p-1 -mr-1 rounded-lg hover:bg-[#1B1F2A]"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-start gap-4 mb-8">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#0E2532] flex items-center justify-center">
            <Icon className="h-6 w-6 text-[#00C2FF]" />
          </div>
          <div>
            <h2 className="font-semibold text-[#E6E9F0] text-lg leading-snug mb-2">{current.title}</h2>
            <p className="text-sm text-[#8A92A6] leading-relaxed">{current.body}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 py-2.5 text-sm text-[#8A92A6] hover:text-[#E6E9F0] border border-[#262A35] rounded-lg transition-colors hover:bg-[#1B1F2A]"
          >
            Skip
          </button>
          <button
            onClick={() => (isLast ? dismiss() : setStep(s => s + 1))}
            className="flex-1 py-2.5 text-sm bg-[#00C2FF] text-[#06121A] hover:bg-[#12151D] font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {isLast ? "Get started" : "Next"}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
