"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ── FormField wrapper ──────────────────────────────────────────────────────────

interface FormFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-xs font-medium text-[#bbc9cf]">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-[11px] text-[#bbc9cf]/60">{hint}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

// ── TextInput ─────────────────────────────────────────────────────────────────

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, icon, className, ...props }, ref) => (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbc9cf]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border bg-[#262939] px-3 py-2 text-sm text-[#dfe1f6]",
          "placeholder:text-[#bbc9cf]/60",
          "focus:outline-none focus:ring-1 transition-colors",
          error
            ? "border-red-500/50 focus:ring-red-500/50"
            : "border-white/[0.07] focus:border-[#00d2ff]/50 focus:ring-[#00d2ff]/30",
          icon && "pl-9",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
TextInput.displayName = "TextInput";

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border bg-[#262939] px-3 py-2 text-sm text-[#dfe1f6]",
        "placeholder:text-[#bbc9cf]/60 resize-y min-h-[80px]",
        "focus:outline-none focus:ring-1 transition-colors",
        error
          ? "border-red-500/50 focus:ring-red-500/50"
          : "border-white/[0.07] focus:border-[#00d2ff]/50 focus:ring-[#00d2ff]/30",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

// ── SelectInput ───────────────────────────────────────────────────────────────

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ error, options, placeholder, className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-lg border bg-[#262939] px-3 py-2 text-sm text-[#dfe1f6]",
        "focus:outline-none focus:ring-1 transition-colors",
        error
          ? "border-red-500/50 focus:ring-red-500/50"
          : "border-white/[0.07] focus:border-[#00d2ff]/50 focus:ring-[#00d2ff]/30",
        className,
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#1b1f2e]">
          {o.label}
        </option>
      ))}
    </select>
  ),
);
SelectInput.displayName = "SelectInput";

// ── Checkbox ──────────────────────────────────────────────────────────────────

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, ...props }, ref) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border border-white/[0.2] bg-[#262939]",
          "checked:bg-[#00d2ff] checked:border-[#00d2ff]",
          "focus:outline-none focus:ring-2 focus:ring-[#00d2ff]/30 transition-colors",
          className,
        )}
        {...props}
      />
      {label && <span className="text-sm text-[#bbc9cf]">{label}</span>}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";

// ── FormRow — side-by-side fields ─────────────────────────────────────────────

export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4", className)}>{children}</div>;
}

// ── FormSection — labelled group ──────────────────────────────────────────────

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {(title || description) && (
        <div className="border-b border-white/[0.07] pb-3">
          {title && <p className="text-sm font-semibold text-[#dfe1f6]">{title}</p>}
          {description && <p className="text-xs text-[#bbc9cf] mt-0.5">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
