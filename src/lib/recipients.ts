import { z } from "zod";
import type { ContactInput } from "./types";

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const contactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.string().trim().min(1).optional().default("Pending"),
  interviewDate: z.string().trim().optional(),
  customMessage: z.string().trim().optional(),
});

export function mergeContacts(existing: ContactInput[], incoming: ContactInput[]) {
  const byEmail = new Map<string, ContactInput>();

  [...existing, ...incoming].forEach((contact) => {
    byEmail.set(contact.email.toLowerCase(), {
      ...byEmail.get(contact.email.toLowerCase()),
      ...contact,
      email: contact.email.toLowerCase(),
    });
  });

  return Array.from(byEmail.values());
}

export function parseContactsText(
  text: string,
  fallbackStatus = "Pending",
): { contacts: ContactInput[]; errors: string[] } {
  const contacts: ContactInput[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const columns = splitRecipientLine(line);
    const emailMatch = line.match(emailRegex);
    const columnEmail = columns.find((column) => emailRegex.test(column))?.match(emailRegex)?.[0];
    const email = emailMatch?.[0] ?? columnEmail ?? "";
    const nameFromAngle = line.match(/^(.+?)\s*<[^>]+>/)?.[1]?.trim();
    const firstNonEmail = columns.find((column) => !emailRegex.test(column));
    const name = cleanName(nameFromAngle || firstNonEmail || email.split("@")[0] || "");
    const status = cleanName(columns.find((column) => column !== email && column !== firstNonEmail) || fallbackStatus);

    const parsed = contactSchema.safeParse({
      name,
      email: email.toLowerCase(),
      status,
    });

    if (parsed.success) {
      contacts.push(parsed.data);
    } else {
      errors.push(`Line ${index + 1}: add a valid email address.`);
    }
  });

  return {
    contacts: mergeContacts([], contacts),
    errors,
  };
}

function splitRecipientLine(line: string) {
  return line
    .split(/[,;\t]/)
    .map((column) => column.trim())
    .filter(Boolean);
}

function cleanName(value: string) {
  return value.replace(/^["']|["']$/g, "").trim();
}
