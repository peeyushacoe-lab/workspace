import type { TemplateDefinition, TemplateKey } from "./types";

export const defaultTemplates: Record<TemplateKey, TemplateDefinition> = {
  accepted: {
    id: "accepted",
    defaultKey: "accepted",
    label: "Accepted",
    description: "Warm confirmation for successful applicants.",
    subject: "Your CyberSage internship application",
    body: `Hi {{firstName}},

Congratulations. Your application has been accepted, and we are excited to move you into the next stage of the CyberSage internship workflow.

{{customMessage}}

Thank you for choosing to build with CyberSage.`,
  },
  rejected: {
    id: "rejected",
    defaultKey: "rejected",
    label: "Rejected",
    description: "Respectful closure for unsuccessful applicants.",
    subject: "CyberSage internship application update",
    body: `Hi {{firstName}},

Thank you for the time and effort you put into your CyberSage internship application. After careful review, we are unable to move your application forward at this time.

{{customMessage}}

We appreciate your interest and encourage you to apply again when future opportunities open.`,
  },
  interview: {
    id: "interview",
    defaultKey: "interview",
    label: "Interview Scheduled",
    description: "Interview date, preparation notes, and next steps.",
    subject: "Your CyberSage interview is scheduled",
    body: `Hi {{firstName}},

Congratulations on successfully passing the CyberSage Internship Examination.

We are pleased to invite you to the next stage of the selection process — the interview round.

Interview Time: 2:30 PM IST
Interview Date: {{interviewDate}}

{{customMessage}}

Please be prepared to discuss your background, technical interests, projects, and availability during the interview.

You will receive the interview meeting link prior to the interview.

We look forward to speaking with you and learning more about your skills and passion for cybersecurity.

Best regards,
CyberSage Recruitment Team`,
  },
  reminder: {
    id: "reminder",
    defaultKey: "reminder",
    label: "Reminder",
    description: "Short follow-up for applicants or clients.",
    subject: "Reminder from CyberSage",
    body: `Hi {{firstName}},

This is a quick reminder about your CyberSage application status: {{status}}.

{{customMessage}}

Please reply to the latest instructions from the team when you are ready.`,
  },
};

export const templates = defaultTemplates;

export function toPrismaTemplate(template: TemplateKey | undefined) {
  if (!template) return "CUSTOM" as const;
  return template.toUpperCase() as "ACCEPTED" | "REJECTED" | "INTERVIEW" | "REMINDER" | "CUSTOM";
}

