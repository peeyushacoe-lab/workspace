import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

const DPA_TEMPLATE = `DATA PROCESSING AGREEMENT (TEMPLATE)

This Data Processing Agreement ("DPA") forms part of the agreement between
Cybersage ("Processor") and the customer entering into Cybersage's Terms of
Service ("Controller"), and applies where Processor processes Personal Data
on behalf of Controller in connection with the Nexus workspace platform.

1. SUBJECT MATTER AND DURATION
   Processor provides email, chat, drive, calendar, meetings, and related
   workspace services. This DPA remains in effect for as long as Processor
   processes Personal Data on Controller's behalf.

2. NATURE AND PURPOSE OF PROCESSING
   Processing consists of storing, transmitting, and displaying Personal
   Data submitted by Controller's authorized users through the Service
   (e.g. email content, contact details, calendar data, file attachments)
   for the purpose of providing the Service.

3. CATEGORIES OF DATA SUBJECTS
   Employees, contractors, and other individuals whose Personal Data is
   submitted to the Service by Controller's authorized users.

4. CATEGORIES OF PERSONAL DATA
   Names, email addresses, message content, file contents and metadata,
   calendar and meeting details, and technical data (IP address, device
   information) necessary to operate the Service securely.

5. PROCESSOR OBLIGATIONS
   Processor shall:
   (a) process Personal Data only on documented instructions from Controller;
   (b) ensure persons authorized to process Personal Data are bound by
       confidentiality obligations;
   (c) implement appropriate technical and organizational measures,
       including encryption in transit and at rest, access controls, MFA
       for privileged roles, and audit logging;
   (d) assist Controller in responding to data subject requests;
   (e) notify Controller without undue delay after becoming aware of a
       Personal Data breach;
   (f) delete or return Personal Data at the end of the provision of
       services, subject to legal retention requirements;
   (g) make available information necessary to demonstrate compliance and
       allow for audits.

6. SUB-PROCESSORS
   Controller authorizes Processor to engage the following sub-processors
   in connection with the Service: hosting and compute (Vercel), database
   (Neon/PostgreSQL), object storage (Cloudflare R2), email delivery
   (Resend), cache/queue (Upstash Redis), search (Meilisearch), and AI
   processing (Anthropic). Processor will provide reasonable advance
   notice of any change to this sub-processor list.

7. INTERNATIONAL TRANSFERS
   Where Personal Data is transferred outside the data subject's
   jurisdiction, Processor relies on appropriate safeguards (such as
   Standard Contractual Clauses) as required by applicable law.

8. DATA SUBJECT RIGHTS
   Processor shall provide reasonable assistance to Controller to enable
   Controller to respond to requests from data subjects exercising their
   rights under applicable data protection law.

9. AUDIT RIGHTS
   Processor shall make available to Controller information reasonably
   necessary to demonstrate compliance with this DPA, and shall allow for
   and contribute to audits, including inspections, conducted by
   Controller or an auditor mandated by Controller, subject to reasonable
   notice and confidentiality.

10. LIABILITY
    Liability under this DPA is subject to the limitations of liability
    set out in the underlying Terms of Service between the parties.

---
This is a starting template only. Have qualified legal counsel review and
tailor it (governing law, SCC module selection, liability caps, and
sub-processor list accuracy) before executing with customers.
`;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return new NextResponse(DPA_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"cybersage-dpa-template.txt\"",
    },
  });
}
