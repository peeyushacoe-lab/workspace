import Papa from "papaparse";
import { z } from "zod";
import { mergeContacts } from "./recipients";
import type { ContactInput } from "./types";

const contactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.string().trim().min(1).optional().default("Pending"),
  interviewDate: z.string().trim().optional(),
  customMessage: z.string().trim().optional(),
});

export function parseContactsCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const contacts: ContactInput[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, index) => {
    const result = contactSchema.safeParse(row);

    if (result.success) {
      contacts.push(result.data);
    } else {
      errors.push(`Row ${index + 2}: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
    }
  });

  return {
    contacts: mergeContacts([], contacts),
    errors: [...errors, ...parsed.errors.map((error) => error.message)],
  };
}
