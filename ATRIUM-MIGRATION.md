# Atrium migration — handoff

Nexus moved from the dark theme (plus its `filter: invert()` light-mode hack) to **Atrium**: light-first, floating white panels on a warm neutral canvas, indigo accent, colour reserved for meaning. Dark mode survives as opt-in.

Design reference: `design-preview.html` (direction **D · Atrium**) — open it in a browser.

---

## Run this locally before pushing

```bash
npm run prisma:generate     # prisma client isn't generated in this checkout
npm run check               # icons + Atrium design system
npm run build               # the real gate — could not complete in the sandbox
```

### Diagnostic results

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint src` (full repo) | **0 errors**, 11 warnings — all pre-existing `<img>`/unused-directive lint |
| `npm run check:icons` | 757 files clean |
| `npm run check:atrium` | 835 files clean, contrast AA in light **and** dark |
| Tailwind compile + class emit | 261 distinct token classes used, 260 emitted (the 1 miss is pre-existing — see below) |
| Route coverage | 65 routes, **0 carrying legacy colour** |
| WCAG AA contrast | 20 token pairings × 2 themes, 0 failures |
| `next build` | **not verified** — hangs in the sandbox, matching the known iCloud-synced-Desktop issue |

`npm run check:atrium` is new (`scripts/check-atrium.py`) and guards nine rules: legacy hex, arbitrary colour utilities, raw palette shades, pre-Atrium `rgba()`, translucent-white hairlines, white text on a light fill, viewport-height calc inside the panel, contrast in both themes, and `dark` hardcoded on `<html>`. It's self-tested — feeding it a file containing one of each fault produces 11 findings; the real tree produces none.

### What the diagnostic sweep caught that the first pass missed

The first migration was hex-only and `\b`-anchored, which left four blind spots. All are now fixed.

1. **`rgba()` was never touched — 68 instances, including the old cyan.** `bg-[rgba(0,210,255,0.08)]` and friends survived across `/profile/presence`, `/admin/backups`, `/admin/reliability`, `/access`, `PresenceStatusPicker`, `LoginForm`, `CalendarView` and `ui/tokens.ts`. These would have rendered cyan tints on an indigo theme. 35 arbitrary utilities → tokens, 33 bare `rgba()` → `color-mix`/`var()`.
2. **8-digit hex with alpha — 7 instances.** `#1a56db10` is colour-plus-alpha, so `#[0-9a-f]{6}\b` never matched it (`\b` fails between two hex digits). My *first audit script shared the same bug*, which is why it reported zero. Now `color-mix(in srgb, var(--accent) 6%, transparent)`.
3. **Five genuinely invisible-text bugs.** The Compose window header (`bg-surface-sunken` + `text-white`), the offline toast (`bg-surface` + `text-white`, both branches), the `/download` page headings, the `/onboarding` heading, and the GitHub connect button. All were white-on-white after the recolour.
4. **An 8px layout overflow across ~25 pages.** The floating panel's interior is `100vh − 64px` (56px top bar + 8px gutter), but panes still asked for `100vh − 56px`. Also 55 `min-h-screen` and 59 page-level `bg-canvas` declarations that fought the panel. Panes now use `lg:h-full` against a panel with a definite `lg` height.

Three contrast failures were also corrected in the token set itself: light `--subtle` `#9b9a93 → #8e8d87` (was 2.82:1, needs 3.0), light `--violet` `#7c5cd6 → #7557cb` (4.19:1 on its own chip), and dark `--accent` `#7c74f0 → #8b84f2` (4.49:1, just under AA).

### Known pre-existing issue, not a regression

`InboxView.tsx:2050` styles rendered email HTML with `prose prose-sm prose-a:text-accent`, but **`@tailwindcss/typography` is not installed**, so none of those classes exist and email bodies get no typographic styling. It was equally dead before (as `prose-a:text-[#00C2FF]`). Either add the plugin or replace those classes with explicit styles.

---

## What changed

150 files, roughly 7,800 lines each way.

### 1. `src/app/globals.css` — rewritten

- Deleted `html:not(.dark) body { filter: invert(0.9) hue-rotate(180deg) }` and its counter-filters. That hack existed because every component hardcoded dark hex; it is what made light mode look washed out and hue-shifted.
- New token set in `:root` (light) and `.dark` (dark), exposed as Tailwind utilities via `@theme inline`.
- Removed the aurora corner glow, glass blur, shimmer sweep, breathing glow, and the `.dark .bg-\[\#12151D\].rounded-xl` auto-frost rules (those selectors matched hex classes that no longer exist).
- Legacy utility names (`glass`, `glass-panel`, `glass-card`, `glow-*`, `hover-lift`, `shimmer`, `text-aurora`, `border-card`, `font-label`, `btn-primary`, `btn-danger`) are still defined but now resolve to flat Atrium surfaces, so no call site had to be touched to keep compiling.

### 2. Colour migration — nothing is hardcoded any more

| Pass | Count | What |
|---|---|---|
| Arbitrary-hex utilities | **11,401** | `bg-[#12151D]` → `bg-surface`, `text-[#8A92A6]` → `text-muted`, `border-[#262A35]` → `border-border`, `text-[#00C2FF]` → `text-accent`, … |
| Raw Tailwind palette | **936** | `text-red-400` → `text-crit`, `text-emerald-400` → `text-ok`, `text-amber-400` → `text-warn`, `bg-purple-500` → `bg-violet`, … These `*-400` shades were picked to read on a dark canvas and were low-contrast on white. |
| Bare hex → CSS var | **77** | hex inside JSX `style={{ }}` objects and imperative `.style.x =` assignments |
| Bare hex → Atrium literal | **431** | contexts CSS variables cannot reach — email HTML, pdf-lib, Jitsi config, `<meta theme-color>`, canvas, and document content |
| `border-white/[0.07]` etc. | **36** | dark-theme translucent hairlines, invisible on light → `border-border` |
| `bg-white` / `bg-white/α` | **23** | → `bg-surface` / `bg-surface-sunken` |
| `text-white` on accent fills | **18** | → `text-accent-foreground`, so it flips in dark mode |
| Modal scrims | **5** | → `bg-overlay` |

Remaining hardcoded colours are deliberate:

- **18 raw palette utilities** — the note-colour chips in `NotesView.tsx` and the role-colour pink in `users/page.tsx` / `UserPicker.tsx`. These are categorical content palettes where distinct hues are the point.
- **Literal hex in** `src/lib/email.tsx`, `src/emails/`, `src/lib/hr-letters.ts`, `whiteboard/page.tsx`, Jitsi config, `<meta theme-color>` — email clients, pdf-lib and canvas can't read CSS variables. All retargeted to Atrium light values.

### 3. Shell structure — `SidebarLayout.tsx`

This is what makes it Atrium rather than a recolour:

- Sidebar and top bar now ride directly on `bg-canvas` with no borders or panel background.
- Page content is wrapped in **one floating panel** — `bg-surface lg:rounded-panel lg:border lg:shadow-panel` — inset by a gutter.
- Mobile drawer and bottom tab bar are solid `bg-surface`; the drawer scrim uses `bg-overlay`.

### 4. Light mode is now the default — `src/app/layout.tsx`

`dark` was hardcoded on `<html>`. It's removed, so `:root` (light) applies. `themeColor` is now `#f0efec`.

To add a theme toggle later, set the class server-side rather than from an inline `<script>` — the latter would reintroduce the need for `'unsafe-inline'` in the CSP `script-src`, which this app deliberately dropped.

### 5. Logo assets were inverted

`nexusLogo-dark.png` is **light artwork for dark backgrounds** (mean luma 196) — near-invisible on the Atrium canvas. `nexusLogo.png` is the dark artwork (mean luma 50). Both are now rendered with `dark:hidden` / `hidden dark:block`. `LoginForm.tsx:91` still points at the dark-background variant — worth a look once you see the login page.

### 6. `CLAUDE.md` design system section rewritten

It documented the June 2026 Google-grey light system, which the dark theme had already superseded. It now documents Atrium, the token table, and the hard rules — including *never hardcode a colour*, with the named exceptions.

---

## Two real bugs this surfaced

1. **`SlidesEditor.tsx`** — the "Clean Light" slide theme had `bg: "#ffffff"` with `text: "#E6E9F0"`. White text on a white slide. The literal pass retargeted it to `#1a1a18`, so it's fixed, but it means that theme was unusable before.
2. **Duplicate iCloud conflict files** are in `src/` and were migrated along with everything else: `ChallengesPanel 2.tsx`, `HRLifecyclePanel 2.tsx`, `HRLifecyclePanel 3.tsx`, `InternGrowth 2.tsx`, `MentorInterns 2.tsx`, `MentorInterns 3.tsx`, `people/[id]/page 2.tsx`, `page 3.tsx`, `hr-letters 2.ts`, `api/redirect/route 2.ts`. Nothing imports them. I left them alone rather than deleting — say the word and I'll remove them.

---

## Worth checking first when you run it

- `/inbox`, `/chat`, `/drive`, `/soc`, `/dashboard` — the five screens the preview covers
- Any modal or dropdown (scrims and popovers changed)
- The login page (logo variant, see above)
- A sent email (`src/lib/email.tsx` templates were retargeted to light literals)
- An HR letter PDF (`hr-letters.ts` rgb() values changed)
