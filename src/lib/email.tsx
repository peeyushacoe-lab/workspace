import { Resend } from "resend";
import type { ContactInput } from "./types";
import type { SignatureTemplate } from "./signatures";
import type { UserRole } from "@/generated/prisma/enums";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Single source of truth for the app URL used in all outbound emails.
// NEXT_PUBLIC_APP_URL is the only env var — never APP_URL (which may be stale).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexus.cybersage.uk";

function splitName(name: string, email: string) {
  const parts = (name?.trim() ?? "").split(/\s+/).filter(Boolean);
  const first = parts[0] || email.split("@")[0] || "there";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
}

function getSignatureHtml(signature: SignatureTemplate): string {
  // When the user has an avatar, always render via the full template so the
  // photo appears in email clients. Only use saved HTML for text-only signatures.
  if (signature.html && !signature.avatarUrl) return signature.html;

  const company = signature.companyName ?? "CyberSage Workspace";

  // Use <img> for profile pic, or a table-based centered initial (flexbox doesn't work in email clients)
  const initial = signature.fullName.charAt(0).toUpperCase();
  const avatarBlock = signature.avatarUrl
    ? `<img src="${signature.avatarUrl}" alt="${signature.fullName}" width="52" height="52"
         style="width:52px;height:52px;border-radius:50%;object-fit:cover;display:block;border:2px solid #e2e8f0;" />`
    : `<table cellpadding="0" cellspacing="0" border="0" width="52" height="52"
         style="width:52px;height:52px;border-radius:50%;background:#0f766e;border-collapse:collapse;">
        <tr>
          <td align="center" valign="middle"
              style="width:52px;height:52px;border-radius:50%;color:#ffffff;font-size:20px;font-weight:700;
                     font-family:system-ui,-apple-system,sans-serif;text-align:center;line-height:52px;">
            ${initial}
          </td>
        </tr>
       </table>`;

  // Only show subtitle line if there's something to show
  const titlePart = signature.title?.trim() ?? "";
  const subtitleLine = titlePart
    ? `<div style="color:#64748b;font-size:13px;margin-bottom:6px;">${titlePart} &middot; ${company}</div>`
    : `<div style="color:#64748b;font-size:13px;margin-bottom:6px;">${company}</div>`;

  // Contact details — only show if at least one exists
  const contactParts: string[] = [];
  if (signature.phone) {
    contactParts.push(`<a href="tel:${signature.phone.replace(/\s+/g, "")}" style="color:#0f766e;text-decoration:none;">${signature.phone}</a>`);
  }
  if (signature.linkedinUrl) {
    contactParts.push(`<a href="${signature.linkedinUrl}" style="color:#0f766e;text-decoration:none;">LinkedIn</a>`);
  }
  if (signature.website) {
    contactParts.push(`<a href="${signature.website}" style="color:#0f766e;text-decoration:none;">Website</a>`);
  }
  const contactLine = contactParts.length > 0
    ? `<div style="font-size:13px;color:#64748b;line-height:1.6;">${contactParts.join(" &middot; ")}</div>`
    : "";

  return `
<div style="margin-top:32px;padding-top:20px;border-top:2px solid #e2e8f0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-family:system-ui,-apple-system,sans-serif;">
    <tr>
      <td style="vertical-align:middle;padding-right:14px;">${avatarBlock}</td>
      <td style="vertical-align:middle;">
        <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:3px;">${signature.fullName}</div>
        ${subtitleLine}
        ${contactLine}
      </td>
    </tr>
  </table>
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

// Plain compose/reply email — no branded card, no background colour, no marketing layout.
// Gmail classifies branded HTML cards as Promotions/spam even from real addresses.
export function renderComposeHtml(body: string, contact: ContactInput, signature?: SignatureTemplate) {
  const htmlBody = interpolateTemplate(body, contact);
  const signatureHtml = signature ? getSignatureHtml(signature) : '';
  return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.7;">
    <div style="max-width:640px;padding:24px 24px 8px;">
      <div>${htmlBody}</div>
      ${signatureHtml}
    </div>
  </body>
</html>`;
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

  const appUrl = APP_URL;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <div style="background:#111113;padding:24px 32px;">
        <div style="color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">Nexus</div>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 12px;">You've been invited</h1>
        <p style="color:#52525b;line-height:1.7;margin:0 0 24px;">
          Hi <strong>${fullName}</strong>, <strong>${invitedByName}</strong> has invited you to join Nexus.
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
        <a href="${appUrl}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:16px;">Sign in to Nexus →</a>
        <p style="color:#3f3f46;font-size:13px;margin:0 0 16px;">Or copy this link into your browser:</p>
        <p style="font-family:monospace;font-size:13px;color:#2563eb;word-break:break-all;margin:0 0 20px;">${appUrl}/login</p>
        <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0;">
          You will be asked to set a new password on first sign-in. Do not share your temporary password.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "CyberSage <noreply@cybersage.uk>",
    to: toPersonalEmail,
    subject: "You've been invited to Nexus",
    html,
  });

  if (result.error) throw new Error(result.error.message);
  return { id: result.data?.id ?? "unknown", skipped: false };
}

export async function sendInternWelcomeEmail({
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

  const appUrl = APP_URL;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:system-ui,sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a56db 0%,#1648c7 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,.15);border-radius:12px;padding:10px 20px;margin-bottom:16px;">
        <span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:.1em;">NEXUS INTERNSHIP PROGRAM</span>
      </div>
      <h1 style="color:#fff;font-size:28px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">Welcome aboard, ${fullName}!</h1>
      <p style="color:rgba(255,255,255,.8);font-size:15px;margin:0;">You&apos;ve been accepted into the CyberSage internship program.</p>
    </div>
    <!-- Body -->
    <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(26,86,219,.12);">
      <p style="color:#3c4257;line-height:1.7;margin:0 0 20px;font-size:15px;">
        Hi <strong>${fullName}</strong>, <strong>${invitedByName}</strong> has set up your intern account on Nexus &mdash; the CyberSage team workspace.
        You now have access to the <strong>Internship Hub</strong> where you&apos;ll receive tasks, submit your work, and collaborate with mentors.
      </p>
      <!-- Credentials card -->
      <div style="background:#f0f4ff;border:1.5px solid #c7d7f8;border-radius:12px;padding:24px;margin-bottom:28px;">
        <div style="font-size:12px;font-weight:700;color:#1a56db;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px;">Your Login Credentials</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280;width:44%;">Work Email</td>
            <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">${workEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280;">Temp Password</td>
            <td style="padding:8px 0;font-family:monospace;font-weight:700;color:#1a56db;font-size:18px;letter-spacing:.04em;">${tempPassword}</td>
          </tr>
        </table>
      </div>
      <!-- CTA -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${appUrl}/login" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
          Sign in to Nexus &rarr;
        </a>
        <p style="color:#9ca3af;font-size:12px;margin:12px 0 0;">You will be prompted to set a new password on first sign-in.</p>
      </div>
      <!-- What you can do -->
      <div style="border-top:1px solid #e5e7eb;padding-top:24px;">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:14px;">Inside the Internship Hub you can:</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;font-size:13px;color:#4b5563;vertical-align:top;width:28px;">📢</td><td style="padding:6px 0;font-size:13px;color:#4b5563;">Read announcements &amp; team updates</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#4b5563;vertical-align:top;">🧩</td><td style="padding:6px 0;font-size:13px;color:#4b5563;">View and work on assigned tasks</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#4b5563;vertical-align:top;">📤</td><td style="padding:6px 0;font-size:13px;color:#4b5563;">Submit your work &amp; track revisions</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#4b5563;vertical-align:top;">💬</td><td style="padding:6px 0;font-size:13px;color:#4b5563;">Discuss tasks with your mentor</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#4b5563;vertical-align:top;">🐞</td><td style="padding:6px 0;font-size:13px;color:#4b5563;">Report bugs &amp; security findings</td></tr>
        </table>
      </div>
      <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:20px 0 0;">
        Do not share your temporary password. If you have questions, reply to this email or message your mentor on Nexus.
      </p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0;">CyberSage &mdash; Nexus Workspace &bull; <a href="${appUrl}" style="color:#1a56db;text-decoration:none;">${appUrl}</a></p>
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "CyberSage <noreply@cybersage.uk>",
    to: toPersonalEmail,
    subject: `Welcome to the CyberSage Internship Program, ${fullName}!`,
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
  options?: { isBulk?: boolean },
  attachments?: Array<{ filename: string; content: Buffer }>,
) {
  if (!resend) {
    return {
      id: "dry-run",
      skipped: true,
    };
  }

  const html = options?.isBulk
    ? renderEmailHtml(subject, body, contact, signature)
    : renderComposeHtml(body, contact, signature);
  const from = fromEmail || process.env.RESEND_FROM_EMAIL || "CyberSage <noreply@cybersage.uk>";
  const appUrl = APP_URL;

  // Idempotency key: same subject + recipient + minute = same key within a 60s window,
  // preventing duplicate sends from double-clicks or retries.
  const idempotencyKey = Buffer.from(`${subject}|${contact.email}|${Math.floor(Date.now() / 60000)}`).toString("base64url");
  const headers: Record<string, string> = {
    "X-Entity-Ref-ID": idempotencyKey,
    "Idempotency-Key": idempotencyKey,
  };
  if (options?.isBulk) {
    headers["List-Unsubscribe"] = `<${appUrl}/unsubscribe?email=${encodeURIComponent(contact.email)}>, <mailto:unsubscribe@cybersage.uk?subject=unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const result = await resend.emails.send({
    from,
    to: contact.email,
    replyTo: from,
    subject,
    html,
    headers,
    ...(cc?.length ? { cc } : {}),
    ...(bcc?.length ? { bcc } : {}),
    ...(attachments?.length ? { attachments } : {}),
  });

  if (result.error) {
    throw new Error(`${result.error.message} From: ${from}`);
  }

  return {
    id: result.data?.id ?? "unknown",
    skipped: false,
  };
}

export async function sendRoleGrantEmail({
  toEmail,
  fullName,
  accessRole,
  grantedByName,
}: {
  toEmail: string;
  fullName: string;
  accessRole: string;
  grantedByName: string;
}): Promise<void> {
  if (!resend) return;
  const firstName = fullName.split(" ")[0] || fullName;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1321;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1b1f2e;border-radius:16px;overflow:hidden;border:1px solid rgba(0,210,255,0.12);">
      <div style="background:linear-gradient(135deg,#0f1321,#1b1f2e);padding:24px 32px;border-bottom:1px solid rgba(0,210,255,0.1);">
        <div style="color:#00d2ff;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">CyberSage Workspace</div>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:22px;font-weight:700;color:#dfe1f6;margin:0 0 8px;">${accessRole} Access Granted</h1>
        <p style="color:#9aa3b8;line-height:1.7;margin:0 0 24px;">
          Hi <strong style="color:#dfe1f6;">${firstName}</strong>,
        </p>
        <p style="color:#9aa3b8;line-height:1.7;margin:0 0 24px;">
          You have been granted <strong style="color:#7dd8f5;">${accessRole}</strong> access in CyberSage Workspace.
          Welcome to the <strong style="color:#7dd8f5;">${accessRole} team</strong>!
        </p>
        <div style="background:rgba(0,210,255,0.06);border:1px solid rgba(0,210,255,0.15);border-radius:12px;padding:20px;margin:0 0 24px;">
          <div style="font-size:12px;color:#5d6579;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;">Access Level</div>
          <div style="color:#00d2ff;font-weight:700;font-size:18px;">${accessRole}</div>
          <div style="font-size:12px;color:#9aa3b8;margin-top:4px;">Granted by ${grantedByName} · CISO</div>
        </div>
        <p style="color:#5d6579;font-size:13px;line-height:1.6;margin:0;">
          You now have access to ${accessRole}-related features and resources in the workspace.
          If you have any questions about your new access, reach out to the CISO.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "CyberSage <noreply@cybersage.uk>",
    to: toEmail,
    subject: `${accessRole} Access Granted — Welcome to the ${accessRole} Team`,
    html,
  });
}

const EXEC_ROLES = new Set<UserRole>(["CEO", "CISO", "COO", "R_AND_D", "OPS_MANAGER"]);

const TEAM_NAMES: Partial<Record<UserRole, string>> = {
  DEVELOPER:      "Engineering",
  CYBER_SECURITY: "Cyber Security",
  QA:             "Quality Assurance",
  MARKETING:      "Marketing",
  RESEARCH:       "Research",
  FINANCE:        "Finance",
  OPERATIONS:     "Operations",
  SUPPORT:        "Support",
  ADMIN:          "Administration",
};

function buildWelcomeHtml(opts: {
  fullName: string;
  workEmail: string;
  role: UserRole;
  invitedByName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { fullName, workEmail, role, invitedByName, appUrl } = opts;
  const firstName = fullName.split(" ")[0];
  const isExec = EXEC_ROLES.has(role) || role === "CEO";
  const teamName = TEAM_NAMES[role] ?? role;

  if (isExec) {
    const subject = `Welcome to Nexus, ${firstName}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#111827;border-radius:20px;overflow:hidden;border:1px solid rgba(0,210,255,0.15);">
      <div style="background:linear-gradient(135deg,#0f1a2e,#0c2340);padding:40px 40px 32px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#00d2ff;margin-bottom:20px;">Nexus by CyberSage</div>
        <h1 style="font-size:30px;font-weight:800;color:#ffffff;margin:0 0 12px;line-height:1.2;">Welcome, ${firstName}.</h1>
        <p style="color:#94a3b8;font-size:16px;margin:0;line-height:1.6;">Your unified workspace is ready.</p>
      </div>
      <div style="padding:36px 40px;">
        <p style="color:#cbd5e1;font-size:15px;line-height:1.8;margin:0 0 24px;">
          You've been added to <strong style="color:#f1f5f9;">Nexus</strong> by ${invitedByName}.
          As <strong style="color:#00d2ff;">${role.replace(/_/g, " ")}</strong>, this is your personal and professional workspace —
          your organisation's email, chat, drive, calendar, and AI assistant, all in one place.
        </p>

        <div style="background:#0f172a;border-radius:14px;padding:22px 24px;margin:0 0 28px;border:1px solid rgba(0,210,255,0.1);">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">Your work email</div>
          <div style="font-size:18px;font-weight:700;color:#00d2ff;">${workEmail}</div>
        </div>

        <div style="margin:0 0 28px;">
          <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;">What's included</div>
          ${[
            ["✉️", "Unified Inbox", "All your team email with AI summaries and smart replies"],
            ["💬", "Team Chat", "Real-time channels for every project and team"],
            ["📁", "Drive", "Shared files and documents with role-based access"],
            ["📅", "Calendar", "Meeting scheduling and event management"],
            ["🤖", "AI Assistant", "Summarise threads, draft replies, and automate workflows"],
          ].map(([icon, name, desc]) => `
            <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
              <span style="font-size:20px;flex-shrink:0;">${icon}</span>
              <div>
                <div style="font-weight:600;color:#f1f5f9;font-size:14px;">${name}</div>
                <div style="color:#64748b;font-size:13px;margin-top:2px;">${desc}</div>
              </div>
            </div>`).join("")}
        </div>

        <a href="${appUrl}/login" style="display:inline-block;background:#00d2ff;color:#003543;font-weight:800;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;margin-bottom:28px;">Open Nexus →</a>

        <p style="color:#475569;font-size:13px;line-height:1.7;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
          This email was automatically sent to your Nexus inbox. For any questions, contact your workspace administrator or reply to this message.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
    return { subject, html };
  }

  // Team member email
  const subject = `Congratulations on joining the CyberSage ${teamName} team, ${firstName}! 🎉`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#111827;border-radius:20px;overflow:hidden;border:1px solid rgba(0,210,255,0.15);">
      <div style="background:linear-gradient(135deg,#0a2218,#0c2a1a);padding:40px 40px 32px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#00d2ff;margin-bottom:20px;">Nexus by CyberSage</div>
        <div style="font-size:40px;margin-bottom:14px;">🎉</div>
        <h1 style="font-size:28px;font-weight:800;color:#ffffff;margin:0 0 10px;line-height:1.2;">Congratulations, ${firstName}!</h1>
        <p style="color:#94a3b8;font-size:16px;margin:0;line-height:1.6;">You've made it to the CyberSage <strong style="color:#4ade80;">${teamName}</strong> team.</p>
      </div>
      <div style="padding:36px 40px;">
        <p style="color:#cbd5e1;font-size:15px;line-height:1.8;margin:0 0 24px;">
          Hi <strong style="color:#f1f5f9;">${firstName}</strong> — welcome aboard!
          ${invitedByName} has set up your Nexus workspace. This is your home for email,
          team chat, shared files, calendar, and AI-powered tools.
        </p>

        <div style="background:#0f172a;border-radius:14px;padding:22px 24px;margin:0 0 28px;border:1px solid rgba(0,210,255,0.1);">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">Your work email</div>
          <div style="font-size:18px;font-weight:700;color:#00d2ff;">${workEmail}</div>
        </div>

        <div style="margin:0 0 28px;">
          <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;">Getting started</div>
          ${[
            ["1", "Sign in to Nexus", `Go to ${appUrl}/login and use your work email + the temporary password from your invite email`],
            ["2", "Set your password", "You'll be prompted to create a new secure password on first login"],
            ["3", "Complete your profile", "Add your photo, bio, and status so your teammates can find you easily"],
            ["4", "Check your inbox", "Say hello in your team's chat channel and explore the tools"],
          ].map(([num, title, desc]) => `
            <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;">
              <div style="width:26px;height:26px;border-radius:50%;background:rgba(0,210,255,0.15);border:1px solid rgba(0,210,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:#00d2ff;text-align:center;line-height:26px;">${num}</div>
              <div>
                <div style="font-weight:600;color:#f1f5f9;font-size:14px;">${title}</div>
                <div style="color:#64748b;font-size:13px;margin-top:3px;">${desc}</div>
              </div>
            </div>`).join("")}
        </div>

        <a href="${appUrl}/login" style="display:inline-block;background:#4ade80;color:#052e16;font-weight:800;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;margin-bottom:28px;">Get started →</a>

        <p style="color:#475569;font-size:13px;line-height:1.7;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
          Need help? Reach out to ${invitedByName} or your team admin directly in Nexus Chat.
          We're excited to have you on the team! 🚀
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  return { subject, html };
}

/**
 * Delivers a welcome/onboarding email directly into the new user's Nexus inbox.
 * This appears as their very first message when they log in.
 */
export async function sendWelcomeInboxMessage(opts: {
  userId: string;
  workEmail: string;
  fullName: string;
  role: UserRole;
  invitedByName: string;
}) {
  // Dynamic import to avoid circular deps with prisma at module level
  const { prisma } = await import("@/lib/prisma");
  const { workEmail, fullName, role, invitedByName, userId } = opts;
  const appUrl = APP_URL;

  const { subject, html } = buildWelcomeHtml({ fullName, workEmail, role, invitedByName, appUrl });
  const fromAddr = "noreply@cybersage.uk";

  const mailbox = await prisma.mailbox.findUnique({ where: { email: workEmail } });
  if (!mailbox) return;

  const thread = await prisma.inboxThread.create({
    data: { subject, mailboxId: mailbox.id },
    select: { id: true },
  });

  await prisma.inboxMessage.create({
    data: {
      threadId: thread.id,
      from: fromAddr,
      to: workEmail,
      subject,
      textBody: `Welcome to Nexus, ${fullName.split(" ")[0]}! Your work email is ${workEmail}.`,
      htmlBody: html,
      isRead: false,
    },
  });

  void userId; // referenced for future notification triggers
}
