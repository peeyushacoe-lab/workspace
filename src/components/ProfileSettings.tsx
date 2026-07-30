"use client";

import { useEffect, useState, useTransition } from "react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Save, Plus, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Signature = {
  id: string;
  fullName: string;
  title: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
  html?: string | null;
};

type SignatureFormData = {
  fullName: string;
  title: string;
  phone: string;
  linkedinUrl: string;
  website: string;
  html: string;
};

const inputClass =
  "block w-full py-2.5 border border-border rounded-md bg-surface text-foreground placeholder-muted focus:ring-2 focus:ring-accent focus:border-accent text-sm px-3 outline-none transition";

const textareaClass =
  "block w-full py-2.5 border border-border rounded-md bg-surface text-foreground placeholder-muted focus:ring-2 focus:ring-accent focus:border-accent text-sm px-3 outline-none transition min-h-[120px]";

const labelTextClass = "text-sm font-medium text-foreground mb-1.5 block";

const primaryButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-muted transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50";

export function ProfileSettings({
  userName,
}: {
  userEmail: string;
  userName: string;
}) {
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAccountPending, startAccountTransition] = useTransition();
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [formData, setFormData] = useState<SignatureFormData>({
    fullName: userName,
    title: "",
    phone: "",
    linkedinUrl: "",
    website: "",
    html: "",
  });

  const [displayName, setDisplayName] = useState(userName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    loadSignature();
  }, []);

  const loadSignature = async () => {
    try {
      const response = await fetch("/api/signatures");
      if (response.ok) {
        const data = await response.json();
        setSignature(Array.isArray(data) ? (data[0] ?? null) : null);
      }
    } catch (error) {
      console.error("Failed to load signature:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const url = signature ? `/api/signatures/${signature.id}` : "/api/signatures";
        const method = signature ? "PUT" : "POST";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (response.ok) {
          toast.success(signature ? "Signature updated!" : "Signature created!");
          await loadSignature();
          setIsEditing(false);
        } else {
          const error = await response.json();
          toast.error(error.message || "Failed to save signature");
        }
      } catch {
        toast.error("Failed to save signature");
      }
    });
  };

  const handleEdit = () => {
    if (signature) {
      setFormData({
        fullName: signature.fullName,
        title: signature.title,
        phone: signature.phone || "",
        linkedinUrl: signature.linkedinUrl || "",
        website: signature.website || "",
        html: signature.html || "",
      });
    } else {
      setFormData({ fullName: userName, title: "", phone: "", linkedinUrl: "", website: "", html: "" });
    }
    setIsEditing(true);
  };

  const handleDelete = async () => {
    if (!signature || !confirm("Are you sure you want to delete your signature?")) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/signatures/${signature.id}`, { method: "DELETE" });
        if (response.ok) {
          toast.success("Signature deleted!");
          setSignature(null);
        } else {
          toast.error("Failed to delete signature");
        }
      } catch {
        toast.error("Failed to delete signature");
      }
    });
  };

  const handleAccountSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setAccountError("New password and confirmation must match.");
      return;
    }

    startAccountTransition(async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: displayName, currentPassword, newPassword, confirmPassword }),
        });

        const data = await response.json();
        if (!response.ok) {
          setAccountError(data.error || "Unable to update profile.");
          return;
        }

        setAccountMessage("Profile updated successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch {
        setAccountError("Unable to update profile.");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-surface rounded-xl border border-border">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-surface p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Profile settings</h1>
            <p className="mt-2 text-sm text-muted">
              Update your display name, reset your password, and manage your sender signature.
            </p>
          </div>
          {!isEditing && (
            <button onClick={handleEdit} className={secondaryButtonClass}>
              <Plus className="h-4 w-4" />
              {signature ? "Edit Signature" : "Add Signature"}
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {/* Account security */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-medium text-muted">Account security</h2>
            <p className="mt-2 text-sm text-muted">Change your display name or password for your CyberSage account.</p>

            <form onSubmit={handleAccountSave} className="mt-6 space-y-4">
              <div>
                <label className={labelTextClass}>Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelTextClass}>Current password</label>
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type="password"
                  className={inputClass}
                  placeholder="Enter current password"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelTextClass}>New password</label>
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type="password"
                    className={inputClass}
                    placeholder="New password"
                  />
                </div>
                <div>
                  <label className={labelTextClass}>Confirm password</label>
                  <input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type="password"
                    className={inputClass}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              {accountError && (
                <div className="rounded-md border border-crit/30 bg-crit/10 p-4 text-sm text-crit">
                  {accountError}
                </div>
              )}
              {accountMessage && (
                <div className="rounded-md border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
                  {accountMessage}
                </div>
              )}

              <button type="submit" disabled={isAccountPending} className={primaryButtonClass}>
                <Save className="h-4 w-4" />
                Save account changes
              </button>
            </form>
          </div>

          {/* Sender identity */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-medium text-muted">Sender identity</h2>
            <p className="mt-2 text-sm text-muted">Manage your signature template and email identity.</p>

            {isEditing ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {signature ? "Edit signature" : "Create signature"}
                    </h3>
                    <p className="text-sm text-muted">Customize the outgoing sender identity.</p>
                  </div>
                  <button type="button" onClick={() => setIsEditing(false)} className={secondaryButtonClass}>
                    Cancel
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelTextClass}>Full Name</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelTextClass}>Job Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelTextClass}>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelTextClass}>LinkedIn URL</label>
                    <input
                      type="url"
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                      className={inputClass}
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelTextClass}>Website URL</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className={inputClass}
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label className={labelTextClass}>Custom HTML (optional)</label>
                  <textarea
                    value={formData.html}
                    onChange={(e) => setFormData({ ...formData, html: e.target.value })}
                    className={textareaClass}
                    placeholder="Custom HTML for your signature..."
                  />
                </div>

                <button type="submit" disabled={isPending} className={primaryButtonClass}>
                  <Save className="h-4 w-4" />
                  {signature ? "Update signature" : "Save signature"}
                </button>
              </form>
            ) : signature ? (
              <div className="mt-6 bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{signature.fullName}</h3>
                    <p className="text-sm text-muted">{signature.title}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleEdit} className="p-2 text-muted hover:text-accent transition" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={handleDelete} className="text-crit hover:text-crit hover:bg-crit/10 text-xs px-2 py-1 rounded-md transition-colors" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="text-sm text-muted space-y-2">
                  {signature.phone && <p><strong>Phone:</strong> {signature.phone}</p>}
                  {signature.linkedinUrl && <p><strong>LinkedIn:</strong> {signature.linkedinUrl}</p>}
                  {signature.website && <p><strong>Website:</strong> {signature.website}</p>}
                </div>
                {signature.html && (
                  <div className="mt-4 border border-border rounded-xl p-4 inline-block bg-surface text-sm w-full">
                    <p className="text-sm text-muted mb-2">Custom HTML preview</p>
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(signature.html) }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 text-sm text-muted">
                Click &quot;Add Signature&quot; to create your sender identity for emails.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
