import type { UserRole } from "@/generated/prisma/enums";

export interface EmailAddressConfig {
  email: string;
  displayName: string;
  type: "BULK" | "PERSONAL" | "DEPARTMENTAL" | "SHARED";
  department?: string;
  allowedRoles: UserRole[];
  description: string;
}

export const EMAIL_ADDRESSES: EmailAddressConfig[] = [
  {
    email: "noreply@cybersage.uk",
    displayName: "CyberSage Automation",
    type: "BULK",
    department: "System",
    allowedRoles: ["ADMIN", "CEO", "CISO", "MARKETING", "INTERNSHIP", "R_AND_D"],
    description: "Bulk emails, automation, and transactional messages"
  },
  {
    email: "ceo@cybersage.uk",
    displayName: "CEO - CyberSage",
    type: "PERSONAL",
    department: "Executive",
    allowedRoles: ["ADMIN", "CEO"],
    description: "CEO communications and executive outreach"
  },
  {
    email: "peeyush@cybersage.uk",
    displayName: "Peeyush - CISO",
    type: "PERSONAL",
    department: "Security",
    allowedRoles: ["ADMIN", "CISO"],
    description: "Chief Information Security Officer communications"
  },
  {
    email: "marketing@cybersage.uk",
    displayName: "Marketing Team",
    type: "DEPARTMENTAL",
    department: "Marketing",
    allowedRoles: ["ADMIN", "CEO", "MARKETING"],
    description: "Marketing campaigns and promotional content"
  },
  {
    email: "internships@cybersage.uk",
    displayName: "Internship Program",
    type: "DEPARTMENTAL",
    department: "HR",
    allowedRoles: ["ADMIN", "CEO", "INTERNSHIP"],
    description: "Internship communications and candidate outreach"
  },
  {
    email: "rnd@cybersage.uk",
    displayName: "R&D Department",
    type: "DEPARTMENTAL",
    department: "Research",
    allowedRoles: ["ADMIN", "CEO", "R_AND_D"],
    description: "Research and development communications"
  },
  {
    email: "support@cybersage.uk",
    displayName: "Support Team",
    type: "SHARED",
    department: "Support",
    allowedRoles: ["ADMIN", "CEO", "CISO", "MARKETING", "INTERNSHIP", "R_AND_D"],
    description: "Shared support inbox for customer inquiries"
  }
];

export function getAllowedSendersForRole(userRole: UserRole): EmailAddressConfig[] {
  return EMAIL_ADDRESSES.filter(config =>
    config.allowedRoles.includes(userRole)
  );
}

export function canUserSendFrom(userRole: UserRole, emailAddress: string): boolean {
  const config = EMAIL_ADDRESSES.find(addr => addr.email === emailAddress);
  return config ? config.allowedRoles.includes(userRole) : false;
}

export function getEmailConfig(email: string): EmailAddressConfig | undefined {
  return EMAIL_ADDRESSES.find(addr => addr.email === email);
}