# CyberSage / Nexus Workspace — Project Context for Claude

> Onboarding doc for any future Claude session. Read this first. Especially the **Painful Lessons** section — at least one of them has cost hours of work already.

---

## 1. What this is

**CyberSage** is a "Teams + Outlook combined" workspace platform, branded as **Nexus** in the client apps. The whole stack lives in this one repo (`cybersage-mail`).

Three positioning tiers (the user's mental model):
- **Workspace** — productivity (mail, chat, calendar, drive, notes, meet, AI)
- **Sentinel** — security/SOC (alerts, DLP, behavioural rules) — partially built
- **Brain** — orchestration/AI agents — partially built

Day-to-day work is on **Workspace**.

---

## 2. Repo layout

```
cybersage-mail/
├── src/                      Next.js app — backend API + web client
│   └── app/api/              API routes (Next 15 App Router, NOT classic Next)
│
├── apps/
│   ├── desktop/              Electron + Vite + React desktop client (Win/Mac)
│   ├── mobile/               (Expo, currently dormant)
│   └── workspace-mobile/     newer mobile attempt
│
├── prisma/                   Prisma schema (Postgres via DATABASE_URL)
├── public/                   Web static assets + service worker
│
├── AGENTS.md                 → "This is NOT the Next.js you know"
├── CLAUDE.md                 → re-exports AGENTS.md
└── PROJECT-CONTEXT.md        this file
```

The user works from `e:\Custom email provider V2\cybersage-mail\` on Windows. **Path with spaces** — always quote shell paths.

---

## 3. Next.js backend (`src/app/api/`)

It's a heavily modified Next.js 15 — internal APIs may differ from anything in your training data. **If you're about to write Next.js code, read `node_modules/next/dist/docs/` first.** Deprecation notices matter.

Auth is **cookie-based**:
- `POST /api/auth/login` accepts `application/x-www-form-urlencoded` with `email`, `password`, `next`. Sets `cybersage_session` + `cybersage_user` HTTP-only cookies. Returns `{ redirectTo }`.
- `GET /api/auth/me` returns `SessionUser` or 401.
- `POST /api/auth/logout` clears.

**There is also an `/api/me` route that is NOT deployed.** Always call `/api/auth/me`. (We spent hours on this once.)

Deployed at **`https://cybersage-mail.vercel.app`** (Vercel, auto-deploys on push to `main`).

Heavily-used endpoints by domain (all behind cookie auth):
| Domain | Endpoints |
|---|---|
| Inbox | `GET /api/inbox`, `GET /api/inbox/[id]`, `PUT /api/inbox/[id]`, `POST /api/inbox/compose`, `GET\|POST /api/inbox/folders`, `GET /api/inbox/unread-count` |
| Chat | `GET\|POST /api/chat/channels`, `GET\|POST /api/chat/channels/[id]/messages`, `GET /api/chat/channels/[id]/stream` (SSE), `PUT\|DELETE /api/chat/messages/[id]`, `POST /api/chat/messages/[id]/reactions`, `POST /api/chat/messages/[id]/pin` |
| Calendar | `GET\|POST /api/calendar/events`, `GET\|PUT\|DELETE /api/calendar/events/[id]`, `POST /api/calendar/events/[id]/rsvp`, `GET /api/calendar/availability` |
| Drive | `GET /api/drive/files`, `GET\|POST /api/drive/folders`, `POST /api/drive/upload` (multipart), `POST /api/drive/upload-base64` (desktop-only) |
| Meet | `GET\|POST /api/meet`, `POST /api/meet/[id]/join`, `GET\|POST /api/meet/signal` (SSE) |
| Notes | `GET\|POST /api/notes`, `PUT\|DELETE /api/notes/[id]` |
| AI | `POST /api/ai/chat`, plus many specialized routes |
| People | `GET /api/workspace/members`, `GET /api/contacts`, `GET /api/users` (admin only) |
| Search | `GET /api/search?q=` — returns `{ mail, chat, people }` |
| Other | `GET /api/signatures`, `GET\|POST /api/notifications`, `POST /api/push/subscribe` |

Workers/queues run on Redis + BullMQ (`src/lib/queues/`). Storage is **Cloudflare R2** via S3 SDK (`src/lib/s3.ts`).

Realtime is Redis pub/sub → SSE for chat and meet signaling.

---

## 4. Desktop client (`apps/desktop/`) — the main focus

Stack: **Electron 42 + Vite 6 + React 19 + React Router + TypeScript + Tailwind v3**.

### High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Renderer (React)                       │
│  - All UI lives here (src/screens/*)                         │
│  - NO direct network calls — uses window.nexus.api.request   │
│  - NO direct cookie access                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────▼──────────────────────────────────┐
│                       Main process                           │
│  - Holds the cookie jar (in-memory Map)                      │
│  - net.fetch to Vercel with Cookie header                    │
│  - Absorbs Set-Cookie on every response                      │
│  - Persists encrypted via safeStorage → session.enc          │
│  - SSE pipe for /api/meet/signal (ipcMain → webContents)     │
└──────────────────────────────────────────────────────────────┘
```

### Critical files
| File | Purpose |
|---|---|
| `electron/main.ts` | App lifecycle, BrowserWindow, IPC handlers (`api:request`, `meet:subscribe`, …), cookie jar, app:// protocol handler, tray, single-instance lock |
| `electron/preload.ts` | `contextBridge` exposing `window.nexus.*` to renderer |
| `electron-builder.yml` | Build/packaging config |
| `src/main.tsx` + `App.tsx` | React entry + routing |
| `src/api/client.ts` | All API functions used by screens. Single source of truth for types. |
| `src/store/auth.ts` | Auth context (uses `getMe()`, `login`, `logout`) |
| `src/types/global.d.ts` | Types for `window.nexus` |
| `src/screens/Shell.tsx` | App shell (sidebar nav + main route outlet + Ctrl+K palette + DND/tray hooks) |
| `src/screens/Login.tsx` | Login form |
| `src/screens/Inbox.tsx` | + `screens/inbox/{Compose,ThreadView}.tsx` — Outlook-grade inbox |
| `src/screens/Chat.tsx` | + `screens/chat/{NewChannelModal,ThreadPanel,MessageItem}.tsx` — Teams-grade chat |
| `src/screens/Calendar.tsx` | Month/week/day views + new/detail modals |
| `src/screens/Drive.tsx` | Upload/folders/star/delete + preview panel |
| `src/screens/Meetings.tsx` | List + create + WebRTC call room |
| `src/screens/Notes.tsx` | List + editor with autosave |
| `src/screens/AI.tsx` | Chat with AI |
| `src/screens/Settings.tsx` | Profile / appearance / about |
| `src/screens/CommandPalette.tsx` | Ctrl+K palette (global search + nav) |

### How API calls work
```ts
// Renderer
import { getInbox } from "@/api/client";
const threads = await getInbox();   // returns typed Thread[]
```
Internally this calls:
```ts
window.nexus.api.request({ method: "GET", path: "/api/inbox" })
  → IPC → main process → net.fetch(API_BASE + "/api/inbox", { Cookie: … })
```
- If the request fails, `request()` throws `ApiError(status, msg)` — the client wraps `res.data.error || res.error || HTTP ${status}`. So **always include `res.error`** in the message chain, not just `res.data.error`.

### API base URL resolution (`main.ts:resolveApiBase`)
1. If dev (`!app.isPackaged`): `http://localhost:3000`
2. Else read `userData/config.json` → `apiUrl`
3. Else default: `https://cybersage-mail.vercel.app`

### Renderer in production
- Vite build → `dist/renderer/` → copied to `resources/renderer/` via `extraResources`.
- Main registers `app://` privileged scheme and serves files via `protocol.handle("app", …)`.
- **Windows file:// gotcha:** `path.join` produces `\` but `file://` needs `/`. Use `.replace(/\\/g, "/")` and `file:///` (THREE slashes for Windows absolute paths starting with drive letter).
- We **clear Chromium HTTP cache** on every startup (`session.defaultSession.clearCache()`) and serve protocol responses with `Cache-Control: no-store`. Otherwise stale renderers persist across builds.

### Build / packaging
```powershell
# From apps/desktop/
npm run build              # vite build + tsc -p electron/tsconfig.json
npx electron-builder --win portable    # → release/Nexus-Portable.exe + win-unpacked/
```
Output:
- `release/win-unpacked/Nexus.exe` — directory build, **always run THIS for dev testing**
- `release/Nexus-Portable.exe` — single-file self-extracting portable for distribution

`asar: false` is set deliberately (see Painful Lessons #5).

For Mac: cannot cross-compile from Windows. See [`apps/desktop/BUILD-MAC.md`](apps/desktop/BUILD-MAC.md). The user moves the repo to their MacBook and runs `npx electron-builder --mac`.

---

## 5. PAINFUL LESSONS — read every word

These cost hours of "why isn't anything changing?!" debugging. Don't make the user re-explain.

### #1 — The Singleton Zombie (biggest time-sink so far)
`main.ts` uses `app.requestSingleInstanceLock()`. On close, the window **hides to tray** (`e.preventDefault(); mainWindow.hide()`), it does NOT quit. The Nexus process stays alive in the tray.

When the user double-clicks `Nexus.exe` again, the singleton lock fires `second-instance` on the old process, which restores its OLD window. The new exe exits silently. **The user sees the OLD UI no matter how many times they rebuild.**

If the user says "still the same, nothing changed":
1. `Get-Process -Name Nexus` to find all running instances.
2. `Stop-Process -Force` all of them.
3. ALSO delete `C:\Users\<user>\AppData\Local\Temp\<random>\Nexus.exe` directory (the portable self-extracts there — see #2).
4. THEN launch the build.

Always verify with `Get-Process -Name Nexus | Select Path` that the running process is from `release\win-unpacked\Nexus.exe` and NOT from a Temp directory.

### #2 — Portable self-extracts to AppData/Local/Temp
`Nexus-Portable.exe` is a self-extracting 7-zip. When run, it extracts to `C:\Users\<u>\AppData\Local\Temp\<rand>\Nexus.exe` and runs that. **Editing `win-unpacked/` or rebuilding does NOT affect a running portable instance** — it's a snapshot.

Test against `release\win-unpacked\Nexus.exe` during development. Only build the portable for shipping.

### #3 — `/api/me` is NOT deployed; `/api/auth/me` IS
Earlier code called `/api/me`. That route exists in `src/app/api/me/route.ts` but was never committed/deployed. Login would succeed but `getMe()` would return 401 and the renderer would show "connection error".

Always use `/api/auth/me`.

### #4 — Chromium caches `app://` responses aggressively
Even with new builds on disk, the renderer can be loaded from `%APPDATA%\Nexus\Cache\`. The fix already in place:
```ts
// main.ts boot
await session.defaultSession.clearCache();
// protocol handler
net.fetch(`file:///${file}`, { headers: { "Cache-Control": "no-store" } });
```
If you ever see "BUILD-FINGERPRINT-X" missing from the rendered UI despite being in the bundle, suspect the user is running an OLD instance (see #1) — NOT a cache issue.

### #5 — asar integrity hash is baked into the EXE
electron-builder embeds the asar SHA-256 hash into `Nexus.exe`. **Manually patching files inside the asar fails silently** — the EXE rejects the mismatched hash and falls back to old behaviour.

We set `asar: false` in `electron-builder.yml` so app files are plain directories. If you ever re-enable asar, you must rebuild — never patch.

### #6 — Windows `file://` URL formatting
`path.join("C:\\foo", "bar")` returns `C:\foo\bar`. `file://` URLs need forward slashes and `file:///` (three slashes) for Windows absolute paths. The protocol handler does:
```ts
const file = path.join(process.resourcesPath, "renderer", fileName).replace(/\\/g, "/");
return net.fetch(`file:///${file}`, …);
```

### #7 — Error message propagation
`net.fetch` failures return `{ ok: false, status: 0, data: null, error: "..." }`. Renderer's `client.ts request()` extracts the error via:
```ts
const msg = (res.data as { error?: string })?.error ?? res.error ?? `HTTP ${res.status}`;
```
**Don't skip the `res.error` fallback** — otherwise network errors surface as "HTTP 0" instead of the actual cause.

### #8 — TypeScript `baseUrl` deprecation
TS 7 deprecated `baseUrl`. `apps/desktop/tsconfig.json` has `"ignoreDeprecations": "6.0"` to silence it. Don't add `noEmit`-changing or `module`-changing fixes "to clean it up" — the workaround is intentional.

### #9 — User communication style
The user has limited patience for repeated mistakes. If something isn't working:
- Do NOT assume "it must be a cache issue, just rebuild" — find the root cause.
- Verify your assumptions before claiming success. Don't say "Wave X done" until the user has tested it.
- The user spotted that "Nexus" window title (vs `Nexus [DEBUG-…]`) proves which build was running. Use unique fingerprints (banner text, window title suffix) as ground truth during debug.

### #10 — File uploads from desktop use base64, not multipart
Multipart over IPC is awkward. I added `POST /api/drive/upload-base64` (in `src/app/api/drive/upload-base64/route.ts`) that takes `{ name, type, size, base64, folderId }`. The desktop client reads files via `FileReader` and posts JSON. **This route is in the repo but may not be deployed yet — confirm `git log src/app/api/drive/upload-base64/route.ts` shows it's pushed.** If not, `git push origin main` to deploy via Vercel.

---

## 6. What's been built (chronological state)

### Pre-existing (when this Claude session started)
- Login, Inbox (read-only snippet view), Chat (basic channel + send), Calendar (month view + create), Drive (read-only browse), Notes, AI, Settings, Shell, tray, IPC plumbing.
- Wave 1–4 below were all built in **this single conversation** after fixing the login issue.

### Wave 1 — Inbox to Outlook-grade
Three-pane layout (folders / threads / detail):
- System folders: Inbox, Starred, Unread, Sent, Archive, Trash + custom folders (create via "+ New folder")
- Searchable thread list (debounced 350ms over subject/sender/body)
- Multi-message thread view with HTML body rendering (sanitized: scripts/iframes/event handlers stripped, see `ThreadView.sanitizeHtml`)
- Attachment chips → opens external
- Toolbar: Reply / Reply All / Forward / Star / Archive / Delete with optimistic updates
- Compose modal with To/Cc/Bcc autocomplete (from `/api/workspace/members`), subject, body, signature toggle (from `/api/signatures`)
- Auto-marks thread read on open, 30s auto-poll

Files: `screens/Inbox.tsx`, `screens/inbox/Compose.tsx`, `screens/inbox/ThreadView.tsx`. Email body CSS in `styles.css`.

### Wave 2 — Chat to Teams-grade
- Sidebar split into **Channels** vs **Direct Messages** sections, each with own + button
- New channel modal (with workspace member multi-select, public/private, optional description) OR new DM (single-person picker)
- `@mention` autocomplete dropdown over workspace members
- Per-message hover toolbar: 4 quick reactions + more-reactions picker, reply-in-thread, edit (own), delete (own)
- Edit own message inline; deleted shows "(message deleted)"
- Reactions are toggleable (highlight when mine)
- **Thread side panel** with replies + own input + parent message at top
- **File attach** button → uploads to Drive + posts message linking it
- Urgent flag (red triangle button) + URGENT badge on message
- Members side panel (presence dot, role)
- Polls every 3s

Files: `screens/Chat.tsx`, `screens/chat/{NewChannelModal,ThreadPanel,MessageItem}.tsx`.

### Wave 3 — Calendar + Drive + Search
**Calendar:**
- Switch between **Month / Week / Day** (toolbar buttons)
- Month: 6-row grid with up to 3 event chips per cell, +N more
- Week: 7-day × 24-hour grid with hour lines and current-time red line
- Day: full timeline with current-time line
- Click any event → detail modal with Edit (organizer) / Delete (organizer) / RSVP (attendee: Accepted/Maybe/Declined)
- New event modal: title, start/end, location, meeting URL, color (8 swatches), attendee picker

Files: `screens/Calendar.tsx`.

**Drive:**
- Sidebar with Upload button (multi-file), New folder, All / Starred / Shared filters
- Header breadcrumb navigation + search + list/grid toggle
- Drag-and-drop upload anywhere in the panel
- Per-file hover actions (star, delete) + double-click to open external
- File preview panel: image inline preview / icon, metadata, Open / Star / Trash buttons
- Uses `/api/drive/upload-base64` for uploads (Painful Lesson #10)

Files: `screens/Drive.tsx`.

**Search (Cmd/Ctrl+K command palette):**
- Wired into `Shell.tsx` via global keydown
- Searches mail subjects + chat messages + workspace people via `/api/search`
- Plus nav commands ("Go to Inbox", etc.)
- ↑↓ + Enter to navigate, Esc to close

Files: `screens/CommandPalette.tsx`.

### Wave 4 — Meetings (WebRTC video calls)
- Meeting list with LIVE / Scheduled / Ended badges, Join button
- Create modal with Instant / Scheduled tabs + attendee picker
- **Full WebRTC call room**:
  - `getUserMedia({ video, audio })` for local stream
  - Adaptive grid layout (1, 2, 2×2, 3×3)
  - Mute / camera off / **screen share** (track replacement so peers see screen) / leave
  - Per-peer connection via `RTCPeerConnection` with Google STUN
  - Local mirror flip on local video
  - "Copy invite" button
- **Signaling**: SSE from `/api/meet/signal?roomId=` piped through main process (`meet:subscribe` IPC) → renderer event. Signals sent via `sendMeetSignal` → `POST /api/meet/signal`.
- New IPC channels in `electron/main.ts`: `meet:subscribe`, `meet:unsubscribe`. Renderer entry: `window.nexus.meet.subscribe(roomId, cb)`.

Files: `screens/Meetings.tsx`, additions to `electron/main.ts` and `electron/preload.ts`.

---

## 7. Known issues / TODO

- **`/api/drive/upload-base64` route may not be deployed yet** — check `git log -- src/app/api/drive/upload-base64/route.ts`. Until pushed to Vercel, desktop file upload returns 404.
- **Chat uses polling** (3s), not SSE. The chat SSE endpoint exists (`/api/chat/channels/[id]/stream`) but renderer can't easily consume it (cookie jar lives in main). Could add another IPC pipe like the meet one.
- **Drive "Shared with me"** filter is wired in the sidebar but the backend route `/api/drive/files/shared` isn't called yet — needs another client function.
- **Calendar week/day view** doesn't auto-scroll to current hour on mount.
- **Sent folder in Inbox** uses a weak heuristic (`t.mailbox === t.lastMessage?.from`). Real implementation needs the backend to return per-thread folder/sent state.
- **Drafts and scheduled send** — endpoints exist (`/api/drafts`, `/api/inbox/scheduled`), no UI wired yet.
- **Rich-text email composer** — currently plain text + signature HTML appended.
- **Meeting signal SSE** survives normal use but suspended laptops / network changes leave it stale (no reconnect logic).
- **`api:upload` IPC** — could replace the base64 endpoint by streaming multipart from main. Not done yet.
- **Mobile (`apps/mobile/`, `apps/workspace-mobile/`)** — separate codebases, mostly idle. Not part of this Claude's work.
- **Web client (`src/app/(routes)/...`)** — mostly untouched in recent sessions, may diverge from desktop UX.
- **Email DKIM/SPF/DMARC** — `cybersage.uk` DNS records not verified in Resend; outgoing email to external addresses may go to spam. Code is fine; DNS is the gap.

---

## 8. Auto-memory directory

`C:\Users\Peeyush\.claude\projects\e--Custom-email-provider-V2-cybersage-mail\memory\` holds persistent memories across sessions:
- `MEMORY.md` — index
- `project_roadmap.md` — 10-phase enterprise roadmap
- `project_phase1.md` — phase 1 done state

You may add/update memory files there per the auto-memory rules in your global instructions. Don't duplicate this PROJECT-CONTEXT.md content into memory — link to it.

---

## 9. The user

- Identity: **Peeyush** (`peeyush@cybersage.uk`)
- Owns CyberSage, working solo
- Prefers fast, decisive execution and concrete results over long explanations
- Will tell you bluntly when something doesn't work ("nothing changed"); investigate, don't dismiss
- Tests on Windows primarily, also on MacBook
- When asking to "build everything", they mean wave-by-wave with verification between, not literally all-at-once

---

## 10. Quick reference — common tasks

| Task | Where |
|---|---|
| Add a new API endpoint to call | `apps/desktop/src/api/client.ts` |
| Add a new screen | `apps/desktop/src/screens/<Name>.tsx`, wire in `Shell.tsx` `<Routes>` and `navItems` |
| Add a new IPC method | `electron/main.ts` (`ipcMain.handle`) + `electron/preload.ts` (`contextBridge`) + `src/types/global.d.ts` |
| Rebuild + test | Kill all Nexus → `npm run build` (in `apps/desktop/`) → run `release\win-unpacked\Nexus.exe` |
| Ship | `npx electron-builder --win portable` → `release/Nexus-Portable.exe` |
| Mac build | On Mac: `cd apps/desktop && npm install && npm run build && npx electron-builder --mac` |
| Backend API | Edit `src/app/api/.../route.ts`, commit + push to `main`, Vercel auto-deploys |
| Style tokens | Tailwind classes `bg-brand`, `text-brand`, `bg-bg-card`, `border-brand-border`, `text-text-{primary,secondary,muted}` — defined in `tailwind.config.ts` |

---

## 11. Conventions

- TypeScript strict, no `any` unless forced. Prefer typed API responses.
- Tailwind for all styling. No CSS modules. Global CSS only in `styles.css`.
- No inline comments unless explaining a non-obvious WHY. Identifiers should self-document.
- React function components only. Hooks. No class components.
- No new dependencies without a strong reason — bundle size matters (current ~350KB gzipped renderer).
- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- Error handling: only at system boundaries. Don't wrap every call in try/catch; let errors bubble to the UI level.

---

Welcome to the project. When in doubt, read the relevant route in `src/app/api/` to understand the data shape before wiring UI to it.
