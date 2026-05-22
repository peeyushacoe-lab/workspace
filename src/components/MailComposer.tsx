"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileUp,
  Loader2,
  ShieldCheck,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { mergeContacts, parseContactsText } from "@/lib/recipients";
import { analyzeMessage } from "@/lib/security";
import { defaultTemplates } from "@/lib/templates";
import type { ContactInput, TemplateDefinition } from "@/lib/types";
import { getAllowedSendersForRole, type EmailAddressConfig } from "@/lib/email-config";
import type { UserRole } from "@/generated/prisma/enums";

type Signature = {
  id: string;
  userId: string;
  fullName: string;
  title: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
  html: string;
  plainText?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UploadResponse = {
  contacts: ContactInput[];
  errors: string[];
};

type SendResponse = {
  success: number;
  failed: number;
  skipped: number;
  campaignId?: string;
  setupHints?: string[];
  errors: string[];
};

const STORAGE_KEY = "cybersage_mail_templates";

type MailComposerVariant = "default" | "stitch";

type MailComposerTheme = {
  inputClass: string;
  compactInputClass: string;
  textareaClass: string;
  labelTextClass: string;
  primaryButtonClass: string;
  secondaryButtonClass: string;
  mainSectionClass: string;
  innerPanelClass: string;
  uploadZoneClass: string;
  pasteButtonClass: string;
  previewTitleClass: string;
  previewDescriptionClass: string;
  recipientBadgeClass: string;
  previewCardClass: string;
  emptyPreviewClass: string;
  placeholderHintClass: string;
  iconAccentClass: string;
  resultNestedClass: string;
};

const defaultMailTheme: MailComposerTheme = {
  inputClass:
    "h-11 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[14px] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]",
  compactInputClass:
    "h-9 w-32 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]",
  textareaClass:
    "rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-[14px] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]",
  labelTextClass: "text-[13px] font-medium text-[var(--foreground)]",
  primaryButtonClass:
    "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60",
  secondaryButtonClass:
    "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-[14px] font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50",
  mainSectionClass:
    "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]",
  innerPanelClass: "rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-5",
  uploadZoneClass:
    "relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[14px] font-medium text-[var(--accent)] transition hover:bg-[#ecd5c8]",
  pasteButtonClass:
    "mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 text-[13px] font-semibold text-[var(--accent)] transition hover:bg-[#ecd5c8]",
  previewTitleClass: "font-serif text-[22px] leading-tight tracking-tight text-[var(--foreground)]",
  previewDescriptionClass: "mt-1 text-[14px] text-[var(--muted)]",
  recipientBadgeClass:
    "rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]",
  previewCardClass: "rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-4",
  emptyPreviewClass:
    "rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] p-8 text-center text-[14px] text-[var(--muted)]",
  placeholderHintClass: "text-[12px] text-[var(--subtle)]",
  iconAccentClass: "text-[var(--accent)]",
  resultNestedClass: "mt-4 rounded-md border border-[var(--border)] bg-white/60 p-3 text-[var(--foreground)]",
};

const stitchMailTheme: MailComposerTheme = {
  inputClass:
    "h-11 rounded-lg border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20",
  compactInputClass:
    "h-9 w-32 rounded-lg border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20",
  textareaClass:
    "rounded-lg border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-3 py-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20",
  labelTextClass: "text-sm font-medium text-[#bbc9cf]",
  primaryButtonClass:
    "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#00d2ff] px-5 text-sm font-semibold text-[#003543] transition hover:bg-[#47d6ff] disabled:cursor-not-allowed disabled:opacity-60",
  secondaryButtonClass:
    "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-4 text-sm font-medium text-[#bbc9cf] transition hover:bg-[#262939] disabled:cursor-not-allowed disabled:opacity-50",
  mainSectionClass:
    "rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#0f1321] p-6",
  innerPanelClass: "rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] p-5",
  uploadZoneClass:
    "relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] text-sm font-medium text-[#00d2ff] transition hover:border-[#00d2ff] hover:bg-[#00d2ff]/10",
  pasteButtonClass:
    "mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-4 text-sm font-semibold text-[#00d2ff] transition hover:bg-[#00d2ff]/10",
  previewTitleClass: "text-lg font-semibold tracking-tight text-[#dfe1f6]",
  previewDescriptionClass: "mt-1 text-sm text-[#bbc9cf]",
  recipientBadgeClass:
    "rounded-full bg-[#00d2ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#a5e7ff]",
  previewCardClass: "rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] p-4",
  emptyPreviewClass:
    "rounded-xl border-2 border-dashed border-[rgba(0,255,255,0.1)] bg-[#0f1321] p-8 text-center text-sm text-[#bbc9cf]",
  placeholderHintClass: "text-xs text-[#859399]",
  iconAccentClass: "text-[#00d2ff]",
  resultNestedClass: "mt-4 rounded-lg border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] p-3 text-sm text-[#dfe1f6]",
};

function splitName(name: string, email: string) {
  const parts = (name?.trim() ?? "").split(/\s+/).filter(Boolean);
  const first = parts[0] || email.split("@")[0] || "there";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
}

function interpolateTemplate(template: string, contact: ContactInput) {
  const { first, last } = splitName(contact.name, contact.email);
  const firstName = contact.firstName?.trim() || first;
  const lastName = contact.lastName?.trim() || last;
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || contact.name;

  return template
    .replace(/{{\s*firstName\s*}}/gi, firstName)
    .replace(/{{\s*lastName\s*}}/gi, lastName)
    .replace(/{{\s*fullName\s*}}/gi, fullName)
    .replace(/{{\s*name\s*}}/gi, fullName)
    .replace(/{{\s*email\s*}}/gi, contact.email)
    .replace(/{{\s*status\s*}}/gi, contact.status)
    .replace(/{{\s*interviewDate\s*}}/gi, contact.interviewDate ?? "")
    .replace(/{{\s*customMessage\s*}}/gi, contact.customMessage ?? "")
    .replace(/\r\n/g, "\n");
}

function loadStoredTemplates() {
  if (typeof window === "undefined") {
    return [] as TemplateDefinition[];
  }

  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    if (!item) return [];
    return JSON.parse(item) as TemplateDefinition[];
  } catch {
    return [];
  }
}

function saveStoredTemplates(templates: TemplateDefinition[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function MailComposer({
  userRole,
  variant = "default",
  defaultRecipient,
  defaultSubject,
  onSuccess,
}: {
  userRole?: UserRole;
  variant?: MailComposerVariant;
  defaultRecipient?: string;
  defaultSubject?: string;
  onSuccess?: () => void;
}) {
  const isStitch = variant === "stitch";
  const t = isStitch ? stitchMailTheme : defaultMailTheme;
  const [contacts, setContacts] = useState<ContactInput[]>([]);
  
  // Use defaultRecipient if provided
  useEffect(() => {
    if (defaultRecipient) {
      setContacts([{ 
        email: defaultRecipient, 
        name: defaultRecipient.split('@')[0], 
        status: "REPLY",
        interviewDate: "",
        customMessage: ""
      }]);
    }
  }, [defaultRecipient]);

  const [errors, setErrors] = useState<string[]>([]);
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("accepted");
  const [subject, setSubject] = useState(defaultSubject || defaultTemplates.accepted.subject);
  const [body, setBody] = useState(defaultTemplates.accepted.body);
  const [templateLabel, setTemplateLabel] = useState(defaultTemplates.accepted.label);
  const [templateDescription, setTemplateDescription] = useState(defaultTemplates.accepted.description);
  const [title, setTitle] = useState("CyberSage Internship Campaign");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState("Pending");
  const [result, setResult] = useState<SendResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string>("");
  const [selectedSenderEmail, setSelectedSenderEmail] = useState<string>("");
  const [allowedSenders, setAllowedSenders] = useState<EmailAddressConfig[]>([]);

  useEffect(() => {
    const stored = loadStoredTemplates();
    const defaultTemplateIds = new Set(Object.keys(defaultTemplates));
    const merged = Object.values(defaultTemplates).map((defaultTemplate) =>
      stored.find((storedTemplate) => storedTemplate.id === defaultTemplate.id) ?? defaultTemplate,
    );
    const customTemplates = stored.filter((storedTemplate) => !defaultTemplateIds.has(storedTemplate.id));
    setTemplates([...merged, ...customTemplates]);
  }, []);

  useEffect(() => {
    // Load signatures
    const loadSignatures = async () => {
      try {
        const response = await fetch("/api/signatures");
        if (response.ok) {
          const data = await response.json();
          setSignatures(data);
          // Select the first signature by default
          if (data.length > 0) {
            setSelectedSignatureId(data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load signatures:", error);
      }
    };
    loadSignatures();
  }, []);

  useEffect(() => {
    // Set allowed senders based on user role
    if (userRole) {
      const senders = getAllowedSendersForRole(userRole);
      setAllowedSenders(senders);
      if (senders.length > 0 && !selectedSenderEmail) {
        // Prefer personal email if available
        const personal = senders.find(s => s.type === "PERSONAL");
        setSelectedSenderEmail(personal ? personal.email : senders[0].email);
      }
    }
  }, [userRole, selectedSenderEmail]);

  useEffect(() => {
    const selected = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
    if (!selected) return;
    setTemplateLabel(selected.label);
    setTemplateDescription(selected.description);
    setSubject(selected.subject);
    setBody(selected.body);
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    saveStoredTemplates(templates);
  }, [templates]);

  const preview = useMemo(() => contacts.slice(0, 3), [contacts]);
  const messageRisks = useMemo(() => analyzeMessage(customMessage), [customMessage]);

  const currentTemplate = templates.find((template) => template.id === selectedTemplateId) ?? defaultTemplates.accepted;

  const previewContent = useMemo(() => {
    if (!preview.length) return "Upload a CSV or paste email addresses directly to preview recipients.";
    const sample: ContactInput = {
      ...preview[0],
      firstName: preview[0].firstName || firstName,
      lastName: preview[0].lastName || lastName,
      interviewDate: preview[0].interviewDate || interviewDate,
      customMessage: preview[0].customMessage || customMessage,
    };
    const interpolated = interpolateTemplate(body, sample);
    const signatureHtml = selectedSignatureId ? signatures.find(s => s.id === selectedSignatureId)?.html || "" : "";
    
    return (
      <div className="space-y-4">
        <div className="whitespace-pre-wrap">{interpolated}</div>
        {signatureHtml && (
          <div 
            className="mt-6 pt-4 border-t border-[rgba(0,255,255,0.08)]"
            dangerouslySetInnerHTML={{ __html: signatureHtml }} 
          />
        )}
      </div>
    );
  }, [body, preview, firstName, lastName, interviewDate, customMessage, selectedSignatureId, signatures]);

  async function uploadCsv(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as UploadResponse;

    if (!response.ok) {
      toast.error("CSV upload failed");
      setErrors(data.errors ?? ["Upload failed"]);
      return;
    }

    setContacts((current) => mergeContacts(current, data.contacts));
    setErrors(data.errors);
    toast.success(`Loaded ${data.contacts.length} contacts`);
  }

  function addPastedContacts() {
    const parsed = parseContactsText(pasteText, pasteStatus);

    if (!parsed.contacts.length) {
      setErrors(parsed.errors.length ? parsed.errors : ["Paste at least one valid email address."]);
      toast.error("No valid pasted emails");
      return;
    }

    setContacts((current) => mergeContacts(current, parsed.contacts));
    setErrors(parsed.errors);
    setPasteText("");
    toast.success(`Added ${parsed.contacts.length} pasted contacts`);
  }

  function saveTemplate() {
    setTemplates((current) => {
      const exists = current.some((template) => template.id === selectedTemplateId);
      const updated = current.map((template) =>
        template.id === selectedTemplateId
          ? { ...template, label: templateLabel, description: templateDescription, subject, body }
          : template,
      );

      if (!exists) {
        return [...updated, { id: selectedTemplateId, label: templateLabel, description: templateDescription, subject, body }];
      }

      return updated;
    });

    toast.success("Template saved");
  }

  function createNewTemplate() {
    const id = `custom-${Date.now()}`;
    const newTemplate: TemplateDefinition = {
      id,
      label: "New custom template",
      description: "Create a custom email template with placeholders like {{firstName}}, {{email}}, {{status}}, {{interviewDate}}.",
      subject: "Your CyberSage update",
      body: `Hi {{firstName}},\n\nWrite your message here and use placeholders such as {{name}}, {{email}}, {{status}}, {{interviewDate}}, and {{customMessage}}.`,
    };

    setTemplates((current) => [...current, newTemplate]);
    setSelectedTemplateId(id);
    toast.success("Custom template created");
  }

  function resetTemplate() {
    if (!currentTemplate.defaultKey) {
      toast.error("Reset is only available for built-in templates.");
      return;
    }

    const original = defaultTemplates[currentTemplate.defaultKey];
    setTemplateLabel(original.label);
    setTemplateDescription(original.description);
    setSubject(original.subject);
    setBody(original.body);
    toast.success("Template reset to default");
  }

  function sendCampaign() {
    startTransition(async () => {
      setResult(null);
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subject,
          body,
          template: currentTemplate.defaultKey,
          contacts,
          firstName,
          lastName,
          interviewDate,
          customMessage,
          signatureId: selectedSignatureId || undefined,
          senderEmail: selectedSenderEmail,
        }),
      });
      const data = (await response.json()) as SendResponse;
      setResult(data);

      if (response.ok && data.failed === 0) {
        toast.success(`Sent ${data.success} emails`);
        if (onSuccess) onSuccess();
      } else if (data.failed > 0) {
        toast.error(`${data.failed} emails failed. Check details in the result panel.`);
      } else {
        toast.error(data.errors?.[0] ?? "Send failed");
      }
    });
  }

  const recipientCountLabel = `${contacts.length} recipient${contacts.length === 1 ? "" : "s"} loaded`;

  if (variant === "stitch") {
    return (
      <div
        id="stitch-mail-composer"
        className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]"
      >
        <Toaster richColors theme="light" />

        <section className="space-y-6 rounded-xl bg-[#1b1f2e] p-6 border border-[rgba(0,255,255,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#bbc9cf]">Compose & send</p>
              <h1 className="mt-2 text-3xl font-bold text-[#dfe1f6]">New Security Campaign</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#bbc9cf]">
                Upload recipients, edit templates, and send — same flow as the Stitch composer screen.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 py-2 text-sm font-semibold text-[#bbc9cf]">
              Admin Access
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-[#dfe1f6]">Campaign Protection Active</p>
                  <p className="mt-1 text-sm text-[#bbc9cf]">
                    All outgoing links will be automatically wrapped with CyberSage secure tracking and encryption.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Campaign title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  >
                    {templates.map((templateOption) => (
                      <option key={templateOption.id} value={templateOption.id}>
                        {templateOption.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Signature</span>
                  <select
                    value={selectedSignatureId}
                    onChange={(event) => setSelectedSignatureId(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  >
                    <option value="">No signature</option>
                    {signatures.map((signature) => (
                      <option key={signature.id} value={signature.id}>
                        {signature.fullName} - {signature.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">From Address</span>
                  <select
                    value={selectedSenderEmail}
                    onChange={(event) => setSelectedSenderEmail(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                    required
                  >
                    {allowedSenders.map((sender) => (
                      <option key={sender.email} value={sender.email}>
                        {sender.displayName} ({sender.email})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Template name</span>
                  <input
                    value={templateLabel}
                    onChange={(event) => setTemplateLabel(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Template subject</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">CSV upload</span>
                  <span className="relative flex h-12 items-center justify-center gap-2 rounded-md border-2 border-dashed border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm font-semibold text-[#00d2ff] transition hover:border-[#00d2ff] hover:bg-[#00d2ff]/10">
                    <FileUp className="h-4 w-4" />
                    Upload contacts
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadCsv(file);
                      }}
                    />
                  </span>
                </label>
              </div>

              <label className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[#bbc9cf]">Template body</span>
                  <span className="text-xs text-[#94a3b8]">Fully editable — rewrite any line, keep or remove any placeholder.</span>
                </div>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={10}
                  className="min-h-[280px] rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 py-4 text-sm leading-6 text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  placeholder="Hi {{firstName}},\n\nCongratulations. Your application has been accepted, and we are excited to move you into the next stage of the CyberSage internship workflow.\n\n{{customMessage}}\n\nThank you for choosing to build with CyberSage."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={saveTemplate}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#00d2ff] px-5 text-sm font-semibold text-[#003543] transition hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)]"
                >
                  Save template
                </button>
                <button
                  type="button"
                  onClick={createNewTemplate}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-5 text-sm font-semibold text-[#bbc9cf] transition hover:bg-[#303444]"
                >
                  New custom template
                </button>
                <button
                  type="button"
                  onClick={resetTemplate}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-5 text-sm font-semibold text-[#bbc9cf] transition hover:bg-[#303444]"
                >
                  Reset built-in
                </button>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#bbc9cf]">Template description</span>
                <input
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                  className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                />
              </label>

              <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-5">
                <h2 className="text-sm font-semibold text-[#dfe1f6]">Personalize the recipient</h2>
                <p className="mt-2 text-sm leading-6 text-[#bbc9cf]">
                  Overrides apply when the contact row leaves the field blank. Single recipient? Just fill these — no CSV needed.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#bbc9cf]">First name</span>
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Peeyush"
                      className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#bbc9cf]">Last name</span>
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Kumar"
                      className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Interview date</span>
                  <input
                    value={interviewDate}
                    onChange={(event) => setInterviewDate(event.target.value)}
                    placeholder="12 May 2026, 10:00"
                    className="h-12 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#bbc9cf]">Custom message</span>
                  <textarea
                    value={customMessage}
                    onChange={(event) => setCustomMessage(event.target.value)}
                    rows={4}
                    className="min-h-[120px] rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#262939] px-4 py-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                    placeholder="Optional message added into every personalized email."
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={contacts.length === 0 || isPending}
                  onClick={sendCampaign}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#00d2ff] px-5 text-sm font-semibold text-[#003543] transition hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send campaign
                </button>
                <button
                  type="button"
                  disabled={contacts.length === 0}
                  onClick={() => {
                    setContacts([]);
                    setResult(null);
                    toast.info("Recipient list cleared");
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-6 text-sm font-semibold text-[#bbc9cf] transition hover:bg-[#303444] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
                <p className="text-sm text-[#bbc9cf]">{recipientCountLabel}</p>
              </div>

              <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#dfe1f6]">Direct email paste</h2>
                    <p className="mt-2 text-sm leading-6 text-[#bbc9cf]">
                      Supports bare emails, comma-separated rows, or Name &lt;email&gt; format.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#bbc9cf]">
                    Default status
                    <input
                      value={pasteStatus}
                      onChange={(event) => setPasteStatus(event.target.value)}
                      className="h-10 rounded-lg border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] px-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                    />
                  </label>
                </div>
                <textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  rows={6}
                  className="mt-4 w-full rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] px-4 py-3 text-sm text-[#dfe1f6] outline-none transition focus:border-[#00d2ff]/50 focus:ring-2 focus:ring-[#00d2ff]/20"
                  placeholder={`peeyush@example.com\nRahul, rahul@example.com, Accepted\nCyberSage Client <client@example.com>`}
                />
                <button
                  type="button"
                  onClick={addPastedContacts}
                  className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[rgba(0,255,255,0.08)] bg-[#262939] px-5 text-sm font-semibold text-[#00d2ff] transition hover:bg-[#00d2ff]/10"
                >
                  <ClipboardPaste className="h-4 w-4" />
                  Add pasted emails
                </button>
              </div>

              <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#dfe1f6]">
                  <ShieldCheck className="h-4 w-4 text-[#dfe1f6]" />
                  Phase 2 safety check
                </div>
                <div className="mt-3 grid gap-2">
                  {messageRisks.map((risk) => (
                    <div
                      key={risk.label}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        risk.level === "danger"
                          ? "border-[#e0b8ad] bg-[#f7e7e1] text-[#8a3d28]"
                          : risk.level === "warn"
                            ? "border-[#e6cc9a] bg-[#f7eed8] text-[#7a5a1f]"
                            : "border-[#bcd1c5] bg-[#e4ede7] text-[#2f5d49]"
                      }`}
                    >
                      {risk.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-5">
                <h2 className="text-sm font-semibold text-[#dfe1f6]">Select Template</h2>
                <div className="mt-4 space-y-3">
                  {templates.slice(0, 4).map((templateOption) => (
                    <button
                      key={templateOption.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(templateOption.id)}
                      className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                        selectedTemplateId === templateOption.id
                          ? "border-[#00d2ff] bg-[#00d2ff]/10 text-[#dfe1f6]"
                          : "border-[rgba(0,255,255,0.08)] bg-[#262939] text-[#bbc9cf] hover:border-[#00d2ff]/40 hover:bg-[#1b1f2e]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{templateOption.label}</span>
                        <span className="text-xs text-[#94a3b8]">{templateOption.defaultKey ? "Built-in" : "Custom"}</span>
                      </div>
                      <p className="mt-2 text-sm text-[#bbc9cf]">{templateOption.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-5">
                <h2 className="text-sm font-semibold text-[#dfe1f6]">Visual Preview</h2>
                <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e]">
                  <div className="h-40 bg-[#e2e8f0]" />
                  <div className="p-4">
                    <p className="text-base font-semibold text-[#dfe1f6]">{templateLabel}</p>
                    <p className="mt-2 text-sm text-[#bbc9cf]">{templateDescription}</p>
                    <div className="mt-4 h-2 rounded-full bg-[#e2e8f0]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={t.mainSectionClass}>
          <h2 className={t.previewTitleClass}>Preview</h2>
          <p className={t.previewDescriptionClass}>{templateDescription}</p>
          <div className="mt-5 space-y-3">
            {preview.length ? (
              preview.map((contact) => (
                <div key={contact.email} className={t.previewCardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-medium text-[#dfe1f6]">{contact.name || contact.email}</p>
                    <span className={t.recipientBadgeClass}>{contact.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#bbc9cf]">{contact.email}</p>
                  <p className="mt-3 text-sm leading-6 text-[#dfe1f6]">{previewContent}</p>
                </div>
              ))
            ) : (
              <div className={t.emptyPreviewClass}>
                Upload a CSV or paste email addresses directly to preview recipients.
              </div>
            )}
          </div>
          <div className={`mt-5 ${t.innerPanelClass} text-sm text-[#dfe1f6]`}>
            <p className="font-semibold">Placeholders available</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#bbc9cf]">
              <li>{"{{firstName}}"} — first name (override or derived from contact)</li>
              <li>{"{{lastName}}"} — last name (override or derived from contact)</li>
              <li>{"{{fullName}}"} — first + last combined</li>
              <li>{"{{name}}"} — alias for full name</li>
              <li>{"{{email}}"} — recipient email</li>
              <li>{"{{status}}"} — status value</li>
              <li>{"{{interviewDate}}"} — interview date</li>
              <li>{"{{customMessage}}"} — custom message</li>
            </ul>
          </div>
          {errors.length ? (
            <div className="mt-5 rounded-xl border border-[#e6cc9a] bg-[#f7eed8] p-4 text-sm text-[#7a5a1f]">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" />
                CSV warnings
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {errors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result ? (
            <div
              className={`mt-5 rounded-xl border p-4 text-sm ${
                result.failed > 0
                  ? "border-[#e0b8ad] bg-[#f7e7e1] text-[#8a3d28]"
                  : "border-[#bcd1c5] bg-[#e4ede7] text-[#2f5d49]"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.failed > 0 ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Campaign complete
              </div>
              <p className="mt-2">
                Success: {result.success} | Failed: {result.failed} | Dry run: {result.skipped}
              </p>
              {result.setupHints?.length ? (
                <div className={t.resultNestedClass}>
                  <p className="font-semibold">What to fix</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {result.setupHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.errors.length ? (
                <div className={t.resultNestedClass}>
                  <p className="font-semibold">Failed send details</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 break-words">
                    {result.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div
      id={isStitch ? "stitch-mail-composer" : undefined}
      className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"
    >
      <Toaster richColors theme="light" />
      <section className={t.mainSectionClass}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className={t.labelTextClass}>Campaign title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={t.inputClass}
            />
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>Template</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className={t.inputClass}
            >
              {templates.map((templateOption) => (
                <option key={templateOption.id} value={templateOption.id}>
                  {templateOption.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>Signature</span>
            <select
              value={selectedSignatureId}
              onChange={(event) => setSelectedSignatureId(event.target.value)}
              className={t.inputClass}
            >
              <option value="">No signature</option>
              {signatures.map((signature) => (
                <option key={signature.id} value={signature.id}>
                  {signature.fullName} - {signature.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>From Address</span>
            <select
              value={selectedSenderEmail}
              onChange={(event) => setSelectedSenderEmail(event.target.value)}
              className={t.inputClass}
              required
            >
              {allowedSenders.map((sender) => (
                <option key={sender.email} value={sender.email}>
                  {sender.displayName} ({sender.email})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>Template name</span>
            <input
              value={templateLabel}
              onChange={(event) => setTemplateLabel(event.target.value)}
              className={t.inputClass}
            />
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>Template subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className={t.inputClass}
            />
          </label>
          <label className="grid gap-2">
            <span className={t.labelTextClass}>CSV upload</span>
            <span className={t.uploadZoneClass}>
              <FileUp className="h-4 w-4" />
              Upload contacts
              <input
                type="file"
                accept=".csv,text/csv"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadCsv(file);
                }}
              />
            </span>
          </label>
        </div>

        <label className="mt-5 grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className={t.labelTextClass}>Template body</span>
            <span className={t.placeholderHintClass}>
              Fully editable — rewrite any line, keep or remove any placeholder.
            </span>
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            className={t.textareaClass}
            placeholder="Write your custom email body here. Use placeholders like {{firstName}}, {{lastName}}, and {{email}}."
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={saveTemplate}
            className={t.primaryButtonClass}
          >
            Save template
          </button>
          <button
            type="button"
            onClick={createNewTemplate}
            className={t.secondaryButtonClass}
          >
            New custom template
          </button>
          <button
            type="button"
            onClick={resetTemplate}
            className={t.secondaryButtonClass}
          >
            Reset built-in
          </button>
        </div>

        <label className="mt-5 grid gap-2">
          <span className={t.labelTextClass}>Template description</span>
          <input
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
            className={t.inputClass}
          />
        </label>

        <div className={`mt-5 ${t.innerPanelClass}`}>
          <p className={`text-sm font-semibold ${isStitch ? "text-[#dfe1f6]" : "text-[var(--foreground)]"}`}>
            Personalize the recipient
          </p>
          <p className={`mt-1 text-xs leading-5 ${isStitch ? "text-[#bbc9cf]" : "text-[var(--subtle)]"}`}>
            Overrides apply when the contact row leaves the field blank. Single recipient? Just fill these — no CSV needed.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={t.labelTextClass}>First name</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Peeyush"
                className={t.inputClass}
              />
            </label>
            <label className="grid gap-2">
              <span className={t.labelTextClass}>Last name</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Kumar"
                className={t.inputClass}
              />
            </label>
          </div>
        </div>

        <label className="mt-4 grid gap-2">
          <span className={t.labelTextClass}>Interview date</span>
          <input
            value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
            placeholder="12 May 2026, 10:00"
            className={t.inputClass}
          />
        </label>
        <label className="mt-4 grid gap-2">
          <span className={t.labelTextClass}>Custom message</span>
          <textarea
            value={customMessage}
            onChange={(event) => setCustomMessage(event.target.value)}
            rows={4}
            className={t.textareaClass}
            placeholder="Optional message added into every personalized email."
          />
        </label>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            disabled={contacts.length === 0 || isPending}
            onClick={sendCampaign}
            className={t.primaryButtonClass}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send campaign
          </button>
          <button
            type="button"
            disabled={contacts.length === 0}
            onClick={() => {
              setContacts([]);
              setResult(null);
              toast.info("Recipient list cleared");
            }}
            className={t.secondaryButtonClass}
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
          <p className={`flex items-center gap-2 text-sm ${isStitch ? "text-[#bbc9cf]" : "text-[var(--muted)]"}`}>
            <Users className="h-4 w-4" />
            {contacts.length} recipients loaded
          </p>
        </div>

        <div className={`mt-6 ${t.innerPanelClass}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className={`flex items-center gap-2 text-sm font-semibold ${isStitch ? "text-[#dfe1f6]" : "text-[var(--foreground)]"}`}>
                <ClipboardPaste className={`h-4 w-4 ${t.iconAccentClass}`} />
                Direct email paste
              </h2>
              <p className={`mt-1 text-xs leading-5 ${isStitch ? "text-[#bbc9cf]" : "text-[var(--subtle)]"}`}>
                Supports bare emails, comma-separated rows, or Name &lt;email&gt; format.
              </p>
            </div>
            <label className={`flex items-center gap-2 text-xs ${isStitch ? "text-[#bbc9cf]" : "text-[var(--muted)]"}`}>
              Default status
              <input
                value={pasteStatus}
                onChange={(event) => setPasteStatus(event.target.value)}
                className={t.compactInputClass}
              />
            </label>
          </div>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={6}
            className={"mt-4 w-full " + t.textareaClass}
            placeholder={`peeyush@example.com\nRahul, rahul@example.com, Accepted\nCyberSage Client <client@example.com>`}
          />
          <button
            type="button"
            onClick={addPastedContacts}
            className={t.pasteButtonClass}
          >
            <ClipboardPaste className="h-4 w-4" />
            Add pasted emails
          </button>
        </div>

        <div className={`mt-5 ${t.innerPanelClass}`}>
          <h2 className={`flex items-center gap-2 text-sm font-semibold ${isStitch ? "text-[#dfe1f6]" : "text-[var(--foreground)]"}`}>
            <ShieldCheck className={`h-4 w-4 ${t.iconAccentClass}`} />
            Phase 2 safety check
          </h2>
          <div className="mt-3 grid gap-2">
            {messageRisks.map((risk) => (
              <div
                key={risk.label}
                className={`rounded-md border px-3 py-2 text-[12px] ${
                  risk.level === "danger"
                    ? "border-[#e0b8ad] bg-[#f7e7e1] text-[#8a3d28]"
                    : risk.level === "warn"
                      ? "border-[#e6cc9a] bg-[#f7eed8] text-[#7a5a1f]"
                      : "border-[#bcd1c5] bg-[#e4ede7] text-[#2f5d49]"
                }`}
              >
                {risk.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={t.mainSectionClass}>
        <h2 className={t.previewTitleClass}>Preview</h2>
        <p className={t.previewDescriptionClass}>{templateDescription}</p>
        <div className="mt-5 space-y-3">
          {preview.length ? (
            preview.map((contact) => (
              <div key={contact.email} className={t.previewCardClass}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[15px] font-medium ${isStitch ? "text-[#dfe1f6]" : "text-[var(--foreground)]"}`}>{contact.name}</p>
                  <span className={t.recipientBadgeClass}>{contact.status}</span>
                </div>
                <p className={`mt-1 text-sm ${isStitch ? "text-[#bbc9cf]" : "text-[var(--muted)]"}`}>{contact.email}</p>
                <div className={`mt-3 text-sm leading-6 ${isStitch ? "text-[#dfe1f6]" : "text-[var(--foreground)]"}`}>{previewContent}</div>
              </div>
            ))
          ) : (
            <div className={t.emptyPreviewClass}>
              Upload a CSV or paste email addresses directly to preview recipients.
            </div>
          )}
        </div>
        <div className={`mt-5 ${t.innerPanelClass} ${isStitch ? "text-sm text-[#dfe1f6]" : "text-[14px] text-[var(--foreground)]"}`}>
          <p className="font-semibold">Placeholders available</p>
          <ul className={`mt-2 list-inside list-disc space-y-1 ${isStitch ? "text-[#bbc9cf]" : "text-[var(--muted)]"}`}>
            <li>{"{{firstName}}"} — first name (override or derived from contact)</li>
            <li>{"{{lastName}}"} — last name (override or derived from contact)</li>
            <li>{"{{fullName}}"} — first + last combined</li>
            <li>{"{{name}}"} — alias for full name</li>
            <li>{"{{email}}"} — recipient email</li>
            <li>{"{{status}}"} — status value</li>
            <li>{"{{interviewDate}}"} — interview date</li>
            <li>{"{{customMessage}}"} — custom message</li>
          </ul>
        </div>
        {errors.length ? (
          <div className="mt-5 rounded-lg border border-[#e6cc9a] bg-[#f7eed8] p-4 text-[13px] text-[#7a5a1f]">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" />
              CSV warnings
            </div>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {errors.slice(0, 5).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result ? (
          <div className={`mt-5 rounded-lg border p-4 text-[13px] ${result.failed > 0 ? "border-[#e0b8ad] bg-[#f7e7e1] text-[#8a3d28]" : "border-[#bcd1c5] bg-[#e4ede7] text-[#2f5d49]"}`}>
            <div className="flex items-center gap-2 font-semibold">
              {result.failed > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Campaign complete
            </div>
            <p className="mt-2">
              Success: {result.success} | Failed: {result.failed} | Dry run: {result.skipped}
            </p>
            {result.setupHints?.length ? (
              <div className={t.resultNestedClass}>
                <p className="font-semibold">What to fix</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {result.setupHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.errors.length ? (
              <div className={t.resultNestedClass}>
                <p className="font-semibold">Failed send details</p>
                <ul className="mt-2 list-inside list-disc space-y-1 break-words">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
