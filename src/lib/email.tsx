import { Resend } from "resend";
import type { ContactInput } from "./types";
import type { SignatureTemplate } from "./signatures";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function splitName(name: string, email: string) {
  const parts = (name?.trim() ?? "").split(/\s+/).filter(Boolean);
  const first = parts[0] || email.split("@")[0] || "there";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
}

function getSignatureHtml(signature: SignatureTemplate): string {
  if (signature.html) {
    return signature.html;
  }

  return `
<div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
  <div style="font-weight: 600; color: #0f172a; margin-bottom: 8px;">${signature.fullName}</div>
  <div style="color: #64748b; font-size: 14px; line-height: 1.5;">
    ${signature.title}<br>
    CyberSage Workspace Mail<br>
    ${signature.phone ? `<a href="tel:${signature.phone.replace(/\s+/g, '')}" style="color: #0f766e;">${signature.phone}</a><br>` : ''}
    ${signature.linkedinUrl ? `<a href="${signature.linkedinUrl}" style="color: #0f766e;">LinkedIn</a>` : ''}
    ${signature.website && signature.linkedinUrl ? ' | ' : ''}
    ${signature.website ? `<a href="${signature.website}" style="color: #0f766e;">Website</a>` : ''}
  </div>
</div>`;
}

function interpolateTemplate(template: string, contact: ContactInput) {
  const { first, last } = splitName(contact.name, contact.email);
  const firstName = contact.firstName?.trim() || first;
  const lastName = contact.lastName?.trim() || last;
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || contact.name;

  const replaced = template
    .replace(/{{\s*firstName\s*}}/gi, firstName)
    .replace(/{{\s*lastName\s*}}/gi, lastName)
    .replace(/{{\s*fullName\s*}}/gi, fullName)
    .replace(/{{\s*name\s*}}/gi, fullName)
    .replace(/{{\s*email\s*}}/gi, contact.email)
    .replace(/{{\s*status\s*}}/gi, contact.status)
    .replace(/{{\s*interviewDate\s*}}/gi, contact.interviewDate ?? "")
    .replace(/{{\s*customMessage\s*}}/gi, contact.customMessage ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "<br/>\n");

  return replaced;
}

export function renderEmailHtml(subject: string, body: string, contact: ContactInput, signature?: SignatureTemplate) {
  const htmlBody = interpolateTemplate(body, contact);
  const signatureHtml = signature ? getSignatureHtml(signature) : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
    <style>
      body { margin:0; padding:0; background:#f8fafc; color:#0f172a; font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .container { max-width:680px; margin:0 auto; padding:32px; }
      .card { background:#ffffff; border-radius:24px; box-shadow:0 24px 80px rgba(15,23,42,.08); padding:32px; }
      .brand { color:#0f766e; font-size:.75rem; letter-spacing:.2em; text-transform:uppercase; font-weight:700; margin-bottom:16px; }
      .title { font-size:1.75rem; margin:0 0 24px; }
      .content { color:#334155; font-size:1rem; line-height:1.8; }
      .footer { color:#64748b; font-size:.9rem; margin-top:32px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="brand">CyberSage</div>
        <h1 class="title">${subject}</h1>
        <div class="content">
          ${htmlBody}
          ${signatureHtml}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendInviteEmail({
  toPersonalEmail,
  fullName,
  workEmail,
  tempPassword,
  invitedByName,
}: {
  toPersonalEmail: string;
  fullName: string;
  workEmail: string;
  tempPassword: string;
  invitedByName: string;
}) {
  if (!resend) return { id: "dry-run", skipped: true };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cybersage.uk";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <div style="background:#111113;padding:24px 32px;">
        <div style="color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">CyberSage Workspace</div>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 12px;">You've been invited</h1>
        <p style="color:#52525b;line-height:1.7;margin:0 0 24px;">
          Hi <strong>${fullName}</strong>, <strong>${invitedByName}</strong> has invited you to join CyberSage Workspace.
        </p>
        <div style="background:#f4f4f5;border-radius:10px;padding:20px;margin:0 0 24px;">
          <div style="margin-bottom:16px;">
            <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Work Email (login)</div>
            <div style="font-weight:600;color:#18181b;font-size:15px;">${workEmail}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Temporary Password</div>
            <div style="font-family:monospace;font-weight:700;color:#2563eb;font-size:20px;letter-spacing:.05em;">${tempPassword}</div>
          </div>
        </div>
        <a href="${appUrl}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px;">Sign in to CyberSage</a>
        <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0;">
          You&apos;ll be asked to set a new password when you first sign in. Keep this email safe and do not share your temporary password.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "CyberSage <noreply@cybersage.uk>",
    to: toPersonalEmail,
    subject: "You've been invited to CyberSage Workspace",
    html,
  });

  if (result.error) throw new Error(result.error.message);
  return { id: result.data?.id ?? "unknown", skipped: false };
}

export async function sendEmail(
  subject: string,
  body: string,
  contact: ContactInput,
  signature?: SignatureTemplate,
  fromEmail?: string,
  cc?: string[],
  bcc?: string[],
) {
  if (!resend) {
    return {
      id: "dry-run",
      skipped: true,
    };
  }

  const html = renderEmailHtml(subject, body, contact, signature);
  const from = fromEmail || process.env.RESEND_FROM_EMAIL || "CyberSage <noreply@cybersage.uk>";
  const result = await resend.emails.send({
    from,
    to: contact.email,
    subject,
    html,
    ...(cc?.length ? { cc } : {}),
    ...(bcc?.length ? { bcc } : {}),
  });

  if (result.error) {
    throw new Error(`${result.error.message} From: ${from}`);
  }

  return {
    id: result.data?.id ?? "unknown",
    skipped: false,
  };
}
