# Verification walkthrough

Everything built in the 2026-08-01 session is covered by automated tests for its
*logic*, but none of it has been clicked by a human. This is the shortest path
to finding out whether it actually works — roughly 30 minutes.

Ordered by **blast radius**, not by feature. If a step fails, the note under it
tells you what else that failure invalidates so you can skip ahead.

Mark results in `Nexus_QA_Checklist.xlsx`.

---

## Tier 0 — if these fail, nothing else matters

### 1. The app boots
Open `nexus.cybersage.uk`, sign in.

- **Pass:** inbox loads.
- **Fail:** stop. Check the Vercel deploy log. Everything below is moot.

### 2. Long pages scroll
Open **Settings**, then **Users**, then **People**.

- **Pass:** you can scroll to the bottom of each.
- **Fail:** the `SidebarLayout` scroll fix regressed. ~30 pages are affected;
  report it before testing anything else.

### 3. Paned views did NOT regress
Open **Inbox**, **Chat**, **Drive**, **Docs**.

- **Pass:** each column scrolls independently; headers stay put.
- **Fail:** the same fix over-applied. This is the risk paired with step 2 —
  they must both pass.

---

## Tier 1 — the subdomain split

### 4. Single sign-on across hosts
Already signed in on nexus, open `docs.cybersage.uk` in the same browser.

- **Pass:** document list, already authenticated.
- **Fail → login page:** `COOKIE_DOMAIN=.cybersage.uk` isn't set, or was set
  after your session cookie was issued. Sign out, sign in, retry.
- **Fail → 404:** the middleware rewrite isn't running. Steps 5–7 will fail too.

### 5. Short URLs
`docs.cybersage.uk/sheets` and `docs.cybersage.uk/slides`.

### 6. Drive and Meet
`drive.cybersage.uk`, then `meet.cybersage.uk`.

### 7. Cross-origin navigation — **most likely thing to be broken**
From **Drive**, click a spreadsheet.

- **Pass:** opens the Sheets editor on `docs.cybersage.uk`.
- **Fail → 404:** `AppLink` / `useAppNavigate` isn't resolving. This was a real
  bug found and fixed during the session; a regression here is plausible.

Then: from nexus, use global search to open a spreadsheet. Same expectation.

### 8. The hub still serves everything
`nexus.cybersage.uk/docs` must still work — old bookmarks depend on it.

---

## Tier 2 — data integrity (worst failures if wrong)

### 9. Conflict detection
Open one spreadsheet in two browsers as two different users.
Edit and save in B. Then type in A.

- **Pass:** A sees "Someone else edited this" with **Reload theirs** /
  **Keep mine**.
- **Fail:** silent overwrite — someone's work is being destroyed. Highest
  severity bug on this list. Report immediately.

Then test both buttons.

### 10. Version history round-trip
In a document: edit → open version history → **Restore** an earlier version.

- **Pass:** content reverts, and a **"Before restore"** entry appears.
- The "Before restore" entry is what makes a mistaken restore recoverable. If
  it's missing, restore is a one-way destructive action.

### 11. Comments persist
Add a comment. **Hard-refresh.**

- **Pass:** still there, with your real name.
- **Fail:** it's still using local state — the whole comments feature is
  cosmetic.

Then: reply, resolve, and check the resolved-toggle (eye icon).

### 12. Comment access control
As user B, open a document A shared with you. Add a comment.
Then try to edit **A's** comment.

- **Pass:** blocked.

---

## Tier 3 — the new features

### 13. DOCX export — **verify in real Word**
Create a doc with a heading, bold text, a bulleted list, a table and a link.
Export → **Microsoft Word (.docx)**. Open it in actual Microsoft Word.

- **Pass:** opens with **no "we found a problem / needs repair" prompt**, and
  headings, bold, lists, tables and links all survive.
- This is the single test the automated suite can't fully substitute for.
  Everything else about DOCX is verified; Word's own tolerance is not.

### 14. DOCX import
Export menu → **Import Word (.docx)** with a real Word file.
Content should append, not replace.

### 15. PPTX import
Import a real PowerPoint deck into Slides.

- **Pass:** actual text, images, tables and speaker notes — not a placeholder
  slide.

### 16. Goal Seek
In a sheet: `B1 = 10`, `B5 = =B1*12+500`.
Goal Seek → Set `B5` to `2000` by changing `B1`.

- **Pass:** proposes `B1 ≈ 125`. Click **Apply**; the grid updates.

### 17. Touch — **on an actual phone**
Open a spreadsheet on your phone.

- Tap a cell → selects.
- Drag across cells → selects a range **without scrolling the page**.
- Drag the fill handle → fills.

Then a presentation: drag an element, resize it from the corner.

- **Fail → page scrolls instead:** `touch-action` isn't applying.

### 18. Accessibility checker
In a doc, insert an image (leave the alt-text prompt blank), add an `H1` then
skip to an `H3`, and add a link reading "click here".
Open the accessibility panel.

- **Pass:** flags all three, with WCAG references and a score below 100.

Then press **⌘/** (Ctrl+/) — the shortcut dialog should open.

---

## What automation already covers — don't spend time here

`npm test` (153 tests) already proves:

- The DOCX package is structurally valid and round-trips through mammoth.
- PPTX parsing extracts text, notes, tables and positions correctly.
- All 159 formula functions, including the lambda family.
- Goal Seek converges, and fails cleanly when unsolvable.
- Accessibility rules fire on the right WCAG criteria.
- Doc→slides conversion, including overflow and escaping.

Re-testing those by hand adds nothing. Spend your time on the UI paths above,
which nothing automated can reach.

---

## Known-untested, deliberately

- **Screen-reader behaviour.** The checker finds content problems; it says
  nothing about whether NVDA or VoiceOver can actually drive the editors.
  Still owed before any accessibility claim in a tender.
- **Real-time co-editing.** Not built — conflict detection is the current
  answer. See `office-suite-gap-analysis.md` §3.
