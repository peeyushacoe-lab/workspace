"use client";

import { useMemo } from "react";
import { Accessibility, AlertTriangle, AlertCircle, Info, CheckCircle2, X } from "lucide-react";
import { checkAccessibility, summarise, type A11yIssue } from "@/lib/a11y-check";

/**
 * Accessibility checker panel — the equivalent of Word's Accessibility Checker.
 *
 * Exists because UK public-sector procurement (PSBAR 2018) and the EU
 * Accessibility Act both require WCAG 2.1 AA, and "we have no way to check"
 * is a hard blocker in those tenders regardless of how good the editor is.
 */

const SEVERITY_META = {
  error:   { icon: AlertCircle,   text: "text-crit", bg: "bg-crit-soft", label: "Error" },
  warning: { icon: AlertTriangle, text: "text-warn", bg: "bg-warn-soft", label: "Warning" },
  info:    { icon: Info,          text: "text-accent", bg: "bg-accent-soft", label: "Tip" },
} as const;

function IssueRow({ issue }: { issue: A11yIssue }) {
  const meta = SEVERITY_META[issue.severity];
  const Icon = meta.icon;
  return (
    <li className="px-3 py-2.5 hover:bg-hover transition-colors">
      <div className="flex items-start gap-2">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${meta.text}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{issue.title}</p>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">{issue.detail}</p>
          <p className="text-[11px] text-foreground mt-1.5 leading-relaxed">
            <span className="font-medium">Fix:</span> {issue.fix}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${meta.bg} ${meta.text}`}>
              {meta.label}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-sunken text-subtle">
              WCAG {issue.wcag}
            </span>
            {issue.context && (
              <span className="text-[10px] text-subtle truncate max-w-[140px]" title={issue.context}>
                {issue.context}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function AccessibilityPanel({
  html,
  onClose,
}: {
  /** Current document body as HTML. */
  html: string;
  onClose: () => void;
}) {
  const report = useMemo(() => {
    if (typeof window === "undefined") return null;
    return checkAccessibility(html, document);
  }, [html]);

  if (!report) return null;

  // Errors first, then warnings, then tips — the order you'd fix them in.
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...report.issues].sort((a, b) => order[a.severity] - order[b.severity]);

  const scoreTone =
    report.errors > 0 ? "text-crit" : report.warnings > 0 ? "text-warn" : "text-ok";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-soft flex-shrink-0">
        <Accessibility className="w-4 h-4 text-muted" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Accessibility</p>
          <p className="text-[10px] text-subtle">{summarise(report)}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors"
          aria-label="Close accessibility panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Score */}
      <div className="px-3 py-3 border-b border-border-soft flex items-center gap-3 flex-shrink-0">
        <div className={`text-2xl font-semibold tracking-tight ${scoreTone}`}>{report.score}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground">
            {report.score === 100 ? "No issues found" : "Accessibility score"}
          </p>
          <p className="text-[10px] text-subtle">
            {report.checked} element{report.checked === 1 ? "" : "s"} checked against WCAG 2.1 AA
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto text-ok mb-2" />
            <p className="text-xs text-muted">No accessibility issues detected</p>
            <p className="text-[10px] text-subtle mt-1">
              Automated checks catch common problems, not everything — test with a
              screen reader before publishing externally.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border-soft">
              {sorted.map(issue => <IssueRow key={issue.id} issue={issue} />)}
            </ul>
            <p className="px-3 py-3 text-[10px] text-subtle border-t border-border-soft leading-relaxed">
              These are automated checks. Passing them does not by itself certify
              WCAG 2.1 AA conformance — contrast, reading order and screen-reader
              behaviour still need manual review.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
