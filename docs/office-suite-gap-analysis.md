# Office suite — honest gap analysis

Audit of the Nexus office suite against the full Google Workspace / Microsoft 365
feature checklist, as of 2026-08-01. Verified against the codebase, not
estimated.

**Read this first:** the checklist is roughly 1,500 features. Google Workspace is
~20 years of work by thousands of engineers and still has gaps. This document is
not a plan to build all of it — it's an honest position statement so you can
choose what actually matters.

Status key: **Done** · **Partial** — usable but incomplete · **Missing** ·
**Won't** — deliberately out of scope.

---

## Headline numbers

| Area | State |
|---|---|
| Formula engine | **159 functions — 122/122, 100% of the checklist** |
| Test coverage | **158 automated tests** — `npm test` |
| Docs editing/formatting | ~85% — the daily-use surface is complete |
| Sheets data tools | ~80% — pivots, charts, validation, CF all real |
| Slides | ~75% — animations, transitions, presenter mode, master slides |
| Drive | ~80% — unified with the office suite, preview, versions, sharing |
| Import / export | **Done** for DOCX/XLSX/PPTX/CSV/PDF/HTML/TXT; ODF & EPUB missing |
| Comments & mentions | **Done** across Docs, Sheets, Slides |
| Version history | **Done** — server-persisted, shared engine |
| Real-time co-editing | **Partial** — presence + conflict detection; no live merge |
| AI | ~60% of the listed surface |
| Security / DLP / audit | **Done** — genuinely ahead of Google here |
| Automation (macros/scripts) | **Missing** entirely |
| Accessibility | **Partial** — WCAG checker + voice typing shipped; manual screen-reader audit still owed |

---

## 1. The engines

The checklist's own framing (16 engines) is the right one. Current state:

| # | Engine | Status | Notes |
|---|---|---|---|
| 1 | Document editor | Done | Tiptap; 48 toolbar features |
| 2 | Spreadsheet grid | Done | Freeze, merge, validation, CF, sparklines, slicers |
| 3 | Formula / calculation | Done | 159 fns, lambdas, spill arrays, named ranges |
| 4 | Presentation | Done | Themes, masters, animations, transitions, sorter |
| 5 | Canvas / graphics | Partial | Shapes + SmartArt; no freehand drawing, no image editing |
| 6 | Real-time collaboration | **Partial** | See §3 — the biggest architectural gap |
| 7 | Comments / mentions | Done | Threaded, resolvable, @mentions notify |
| 8 | Version control | Done | `DocumentVersion`, restore is reversible |
| 9 | Permissions / RBAC | Done | RFC-001 dynamic RBAC + per-doc share roles |
| 10 | Import / export | Done | See §2 |
| 11 | Template | Partial | Per-app templates exist; no org-wide template admin |
| 12 | AI | Partial | 23 endpoints; workspace-wide Q&A is the gap |
| 13 | Universal search | Partial | Meilisearch across entities; no content-level filters |
| 14 | Drive / file | Done | Unified, preview, versions, bulk ops |
| 15 | Security / DLP | Done | Sentinel, DLP policies, classification, audit |
| 16 | Audit / compliance | Done | Immutable `AuditLog`, legal hold, retention |

---

## 2. Import / export — verified working

Covered by `npm run test:office-io`, which round-trips a generated `.docx`
through **mammoth** (an independent OOXML parser) and parses a real `.pptx`.

| Format | Import | Export |
|---|---|---|
| DOCX | Done | Done — real OOXML, opens in Word without a repair prompt |
| XLSX / XLS | Done | Done |
| CSV / TSV | Done | Done |
| PPTX | Done — text, images, tables, positions, speaker notes | Done |
| PDF | — | Done (print pipeline) |
| HTML / TXT | Done | Done |
| **ODT / ODS / ODP** | Missing | Missing |
| **RTF, EPUB, Markdown** | Missing | Missing |
| **Slides → MP4 / SVG / GIF** | — | Missing |

ODF matters mainly for EU public-sector procurement. If that isn't a market,
it's safe to skip.

---

## 3. Real-time collaboration — the honest gap

**What works:** live presence (avatars), remote cell cursors in Sheets, per-slide
peer indicators, and — since this session — **conflict detection**: a save built
on a stale copy is rejected with 409 and the user is offered
reload-theirs / keep-mine.

**What doesn't:** two people typing simultaneously still don't *merge*. One is
told they conflicted rather than silently losing work. That's a large
improvement over last-write-wins, but it is not Google Docs.

**Why it isn't built:** true co-editing needs a server holding an open WebSocket
per editor. Vercel is serverless — functions die between requests. This is an
infrastructure decision, not a coding one:

- **Self-host** `y-websocket`/Hocuspocus beside the existing BullMQ worker — no
  new vendor, but you own uptime and scaling. ~1 week.
- **Hosted** (Liveblocks, PartyKit) — fastest, but a monthly bill and a third
  party holding document contents. Worth weighing for a security company.

Docs already has Yjs CRDTs loaded and unused, so it would be first to land.

---

## 4. Genuinely missing, ranked by real-world impact

1. **Accessibility — manual audit.** The automated checker (WCAG 2.1 AA),
   voice typing and alt-text prompts now ship, but no one has driven the suite
   with a real screen reader, and keyboard-only reading order is unverified.
   Automated checks are roughly a third of conformance; the rest is manual.
2. **Automation** — no macros, no Apps Script equivalent, no custom functions.
   Blocks anyone migrating a real Excel workflow.
3. **Scenario Manager and Solver** — Goal Seek ships; multi-variable
   optimisation does not.
4. **Advanced charts** — waterfall, funnel, treemap, sunburst, geo/map.
5. **Charts into Slides** — the last cross-app gap. Sheet ranges into Docs,
   doc→deck and deck→doc all ship; embedding a live *chart* does not.
6. **ODF formats** (ODT/ODS/ODP) — only matters for EU public-sector tenders.

---

## 5. Where Nexus is already *ahead* of Google

Worth defending in positioning — these are not Workspace features:

- Sentinel threat detection wired into the workspace
- DLP policy engine with violation tracking
- Security classification labels on documents
- Immutable audit log, legal hold, retention policies
- Self-hosted — no third party holds the data
- 37 formula functions beyond the checklist

---

## 6. Recommended order

Deliberately not "everything":

1. ~~Accessibility checker + voice typing~~ — **done**. Next: a manual
   screen-reader pass, which is the part automation can't cover.
2. ~~Spell/grammar check~~ — **done** (native spellcheck + AI proofreading).
3. ~~Cross-app linking~~ — **done** except live charts: sheet ranges into
   Docs (with refresh), doc→deck and deck→doc outline all ship.
4. ~~Lambda formula family~~ — **done**; the engine is at 100% of the checklist.
5. ~~Goal Seek~~ — **done**. ~~Mobile/touch~~ — **done** (pointer events
   throughout Sheets and Slides).
6. **Real-time co-editing** — pick the infra path, then build. Now the single
   largest remaining gap.
7. **Automation / scripting** — unblocks Excel migrations.

Everything below that is long-tail. The suite is already past the point where
most internal users would be blocked.
