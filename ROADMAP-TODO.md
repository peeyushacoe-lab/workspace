# Nexus / Cybersage — Execution To-Do

> Written 2026-07-08. Updated 2026-07-14 — status reflects what's actually been built and verified (eslint/tsc clean) vs. what still needs a human to run locally. Ordered by priority — work top to bottom.

---

## Phase 0 — Housekeeping (do first, ~30 min)

> Manual/local steps only — can't be run from the sandbox this work was built in.

- [ ] **Local install + build**: `npm install`, `npx prisma generate && npx prisma migrate dev` (several new models this session — `EmailTemplate`, `VacationResponder`, `VacationAutoReplyLog`, `ComplianceControl`, `SystemStatusPing`, `BackupVerification`, `MailImportJob`, etc.), then `npm run build` — confirm exit 0, push, verify Vercel deploy.
- [ ] **Smoke-test HR lifecycle end-to-end**: onboard someone → letter email arrives with PDF → sign & return on /hr (confidentiality checkbox) → mark received → offboard (resign + terminate paths) → issue NOC. Check stamp + signatory render on real data.
- [ ] **Upload real signatures** in HR console → People → Letter signatories (Khurram CEO / Peeyush CISO are pre-seeded).
- [ ] **Verify chat fixes in prod**: unread badges correct on load, DM header shows the *other* person's name.

## P0 — Trust (nobody switches without these)

- [x] **1. Migration wizard** — Gmail/IMAP connect, folder mapping, background BullMQ import job + progress UI, contacts + calendar (Google Takeout). `/settings/import`.
- [x] **2. Inbound spam/phishing layer** — SPF/DKIM/DMARC handling, link analysis + rewriting, attachment verdicts, sender reputation, spam folder + train/report, all scored in the webhook path.
- [x] **3. Deliverability self-serve** — per-domain DKIM/SPF/DMARC wizard with live DNS checks, bounce & suppression dashboard in `/admin/deliverability`.
- [x] **4. Export / takeout** — full account export (mail, drive, docs, contacts).
- [x] **5. Status page + restore drill** — public status page + backup verification flow (`/admin/backups`).

## P1 — Retention (why people stay)

- [x] **6. Search everywhere** — Meilisearch-backed omnibox search across mail/chat/drive/docs/notes/meetings/people with Gmail-style filter tokens (`from:`, `in:`, `has:attachment`, dates); graceful Prisma-only fallback when Meilisearch isn't configured.
- [x] **7. Gmail-parity inbox features audit** — snooze (real un-snooze job), undo send (30s), send later, templates/canned responses, keyboard shortcuts (j/k/e/r), vacation responder all built and wired.
- [x] **8. Mobile parity** — reliable Expo push (ticket parsing, stale-token pruning), badge counts, app-store build config.
- [x] **9. Notification preferences UI** — per-channel/per-type controls.

## P2 — Business & moat

- [ ] **10. Multi-tenant self-serve** — *intentionally skipped this pass, not started.* Signup → create org → verify domain (DNS TXT) → invite team → billing (Stripe). Organization/OrganizationInvite models already exist; wire the flow.
- [x] **11. Sentinel Brain** — AI threat correlation across mail/chat/drive/DLP events, auto-assembled `SecurityIncident` timelines in `/soc` (15-min recurring job).
- [x] **12. Compliance track** — SOC 2 readiness checklist, GDPR DPA template, data-residency tab, pen-test tracking in `/compliance`.
- [x] **13. Office suite depth** — Sheets formula engine (incl. fill-series + reference-shifting copy/cut/paste), Docs/Sheets/Slides sharing with real access-controlled permissions.
- [ ] **14. Jitsi self-host** — *intentionally skipped this pass, not started.* Docker deploy, embed in Nexus iframe.
- [ ] **15. Staff attendance** — *intentionally skipped this pass, not started.* Attendance is intern-only today.

## Post-roadmap fixes (2026-07-14 bug-check pass)

Found and fixed while reviewing the P1/P2 work above — not on the original list, worth a mention since they were real bugs, not style nits:

- Sentinel Brain was creating a duplicate `SecurityIncident` every 15-minute correlation run instead of updating the existing one (bad dedup key). Fixed.
- Meilisearch search paths for mail/chat were missing the `isTrashed`/`deletedAt` filters that the Prisma-fallback paths had, so trashed/deleted items could leak into search results when Meilisearch was active. Fixed.
- Sheets cut-then-paste was shifting formula references the same way copy-then-paste does; real spreadsheet convention keeps a moved formula's text unchanged. Fixed.
- Docs sharing was effectively unreachable: `/api/docs` never surfaced documents shared with you (unlike `/api/sheets` and `/api/slides`, which already did), so granting someone editor/viewer access left them with no way to ever find the doc. Fixed, plus surfaced save failures (403s) in the UI instead of failing silently.
- Inbox required a manual refresh (or up to an 8s poll) to see new mail — no real-time signal existed at all while the app was open. Added an SSE stream (`/api/inbox/stream`) fed by a Redis publish from the inbound webhook, so new mail now appears instantly; the poll remains only as a fallback if Redis/SSE is unavailable.

## Positioning reminder (for marketing/landing copy)

Target = teams paying for Google Workspace + Slack + Zoom + HR tool, not free-Gmail individuals.
Pitch = **"Your inbox is a SOC"** — visible security (badges, DLP, Sentinel) + everything in one pane + one lower bill + AI that acts (triage, drafts, meeting intelligence) + no ads/no scanning + full export freedom.

---

*Suggested chat-sized chunks: #1 alone, #2 alone, #3+#4 together, #5 quick, #6 alone, #7 in two sittings, #10 alone.*
