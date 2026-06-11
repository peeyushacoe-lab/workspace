# Nexus / CyberSage — Production Handover

**Project:** Nexus (branded product of CyberSage)  
**Owner:** Peeyush — peeyushmaster21@gmail.com  
**Target domain:** `cybersage.uk`  
**Date:** 2026-05-30  

---

## Overview

Nexus is a unified workspace platform (Teams + Outlook combined) consisting of three apps that all share one Next.js backend:

| App | Stack | Current (free tier) |
|-----|-------|---------------------|
| **Web / Backend** | Next.js 15 (App Router) + Postgres (Prisma) + Redis/BullMQ + Cloudflare R2 | Vercel free — `cybersage-mail.vercel.app` |
| **Desktop** | Electron 42 + Vite 6 + React 19 | Points to Vercel free URL |
| **Mobile (iOS + Android)** | Expo SDK 56 + React Native 0.85 | EAS builds, points to Vercel free URL |

---

## 1. Infrastructure to Provision

### 1a. PostgreSQL Database
The current DB is Neon free tier. Migrate to a proper instance:

- **Recommended:** Neon Pro, Supabase Pro, PlanetScale, or your own managed Postgres (AWS RDS / Railway)
- Run the existing migration after new DB is created:
  ```bash
  # Set DATABASE_URL in .env.local first
  npx prisma migrate deploy
  ```
- Migration file is at `prisma/migrations/20260511003327_v2/`
- Schema file: `prisma/schema.prisma`

### 1b. Redis
Used for BullMQ job queues (email workers, background jobs).
- **Recommended:** Upstash Redis (serverless, fits Vercel) or Redis Cloud
- Environment variable: `REDIS_URL`

### 1c. Cloudflare R2 (file storage)
Already configured for Drive feature. Keep or replace with S3-compatible storage.
- Variables needed: `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`

---

## 2. Domain Setup — cybersage.uk

### DNS Records to add at your DNS provider:

```
# Vercel — point root domain to deployment
A       @           76.76.19.61
CNAME   www         cname.vercel-dns.com.

# Email (Resend) — for sending from noreply@cybersage.uk
TXT     @           "v=spf1 include:amazonses.com ~all"
CNAME   resend._domainkey   [get from Resend dashboard after domain add]
TXT     _dmarc      "v=DMARC1; p=quarantine; rua=mailto:admin@cybersage.uk"
MX      @           feedback-smtp.us-east-1.amazonses.com (priority 10)
```

Add `cybersage.uk` in your **Resend dashboard → Domains** to get the actual DKIM CNAME values.

---

## 3. Vercel Deployment

### 3a. Add custom domain in Vercel
1. Go to your Vercel project → **Settings → Domains**
2. Add `cybersage.uk` and `www.cybersage.uk`
3. Vercel will give you the exact DNS values to confirm

### 3b. Upgrade to Vercel Pro
Free tier has: 100GB bandwidth, no team members, no SLAs.  
Pro adds: 1TB bandwidth, team access, 99.99% uptime SLA, priority support.

### 3c. Environment Variables to set in Vercel dashboard

Go to **Project → Settings → Environment Variables** and add all of these:

```env
# Database
DATABASE_URL=postgresql://USER:PASS@HOST:5432/nexus?sslmode=require

# Redis (BullMQ)
REDIS_URL=redis://default:PASS@HOST:PORT

# Authentication secrets
AUTH_SECRET=<64-char random string — generate with: openssl rand -hex 32>
ADMIN_EMAIL=admin@cybersage.uk
ADMIN_PASSWORD=<strong password>
ADMIN_SESSION_TOKEN=<64-char random string>

# Email sending via Resend
RESEND_API_KEY=re_<your_key>
RESEND_FROM_EMAIL=Nexus <noreply@cybersage.uk>
RESEND_WEBHOOK_SECRET=<webhook signing secret from Resend>

# Cloudflare R2 (Drive / file storage)
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=nexus-drive
CLOUDFLARE_R2_PUBLIC_URL=https://pub-XXXX.r2.dev

# AI (Claude — used by mobile AI Brain)
ANTHROPIC_API_KEY=sk-ant-...

# Sentry (error monitoring)
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=

# App URL (update this after domain is live)
NEXT_PUBLIC_APP_URL=https://cybersage.uk
```

### 3d. Deploy
```bash
# From repo root — one-time link to Vercel project
vercel link

# Deploy to production
vercel --prod
```

Or just `git push origin main` if the Vercel project is already connected to the GitHub repo.

---

## 4. Code Changes Required Before Deploying

There are **3 hardcoded free-tier URLs** that must be updated to `cybersage.uk`:

### 4a. Desktop app — `apps/desktop/electron/main.ts`

Find this function (around line 20–30):
```typescript
function getBackendUrl(): string {
  if (process.env.CYBERSAGE_URL) return process.env.CYBERSAGE_URL;
  return "https://cybersage-mail.vercel.app";   // ← CHANGE THIS
}
```
Change to:
```typescript
  return "https://cybersage.uk";
```
Then rebuild the desktop app:
```bash
cd apps/desktop
npm run build
npx electron-builder --mac       # macOS DMGs
npx electron-builder --win       # Windows EXE
```

### 4b. Mobile app API fallback — `apps/workspace-mobile/src/api/client.ts`

Line 4:
```typescript
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://cybersage-mail.vercel.app";
```
Change fallback to:
```typescript
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://cybersage.uk";
```

### 4c. EAS build config — `apps/workspace-mobile/eas.json`

Update `EXPO_PUBLIC_API_URL` in all three profiles (`development`, `preview`, `production`):
```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://cybersage.uk"
}
```

### 4d. Meetings join URL — `apps/workspace-mobile/app/(tabs)/meetings.tsx`

Line 83:
```typescript
const url = `https://cybersage-mail.vercel.app/meet/${m.roomName}`;
```
Change to:
```typescript
const url = `https://cybersage.uk/meet/${m.roomName}`;
```

---

## 5. Desktop App — Release & Auto-Update

### Current build outputs (in `apps/desktop/release/`):
| File | Platform | Size |
|------|----------|------|
| `Nexus-Mac-arm64.dmg` | macOS Apple Silicon | ~115 MB |
| `Nexus-Mac-x64.dmg` | macOS Intel | ~120 MB |
| `Nexus-Portable.exe` | Windows (no install needed) | ~145 MB |
| `NexusSetup.exe` | Windows installer | ~145 MB |

### GitHub Releases (auto-update is already wired up)
The `electron-builder.yml` already points to:
```yaml
publish:
  - provider: github
    owner: peeyushacoe-lab
    repo: workspace
```

To publish a release:
1. Create a GitHub repo at `github.com/peeyushacoe-lab/workspace` (private is fine)
2. Create a Personal Access Token with `repo` scope
3. Set `GH_TOKEN=your_token` in your environment
4. Run:
   ```bash
   cd apps/desktop
   npx electron-builder --mac --win --publish always
   ```
   This builds AND pushes to GitHub Releases automatically.

Users will get auto-update prompts inside the app when you push new versions.

### Code signing (optional but recommended for no Gatekeeper warnings):
- **macOS:** Need Apple Developer account ($99/yr). Set `CSC_LINK` (p12 cert) and `CSC_KEY_PASSWORD` env vars
- **Windows:** EV code signing certificate (~$300/yr). Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`

Without signing, users must right-click → Open the first time (macOS) or click "More info → Run anyway" (Windows).

---

## 6. Mobile App — iOS App Store & Google Play Store

### App identifiers (already set in `app.json`):
- **iOS Bundle ID:** `uk.cybersage.workspace`
- **Android Package:** `uk.cybersage.workspace`
- **App Name:** Nexus

---

### 6a. iOS — Apple App Store

#### Prerequisites
- Apple Developer Program membership: **$99/year** — enroll at `developer.apple.com/enroll`
- Use Peeyush's Apple ID: `peeyushmaster21@gmail.com`

#### Step 1 — Create the app in App Store Connect
1. Go to `appstoreconnect.apple.com` → **My Apps → +**
2. Select **New App**
3. Fill in:
   - **Platform:** iOS
   - **Name:** Nexus
   - **Bundle ID:** `uk.cybersage.workspace` (must match `app.json` exactly)
   - **SKU:** `nexus-cybersage-001` (any unique string)
   - **User Access:** Full Access

#### Step 2 — Get your Apple Team ID
Go to `developer.apple.com/account` → **Membership** → copy **Team ID** (10-char string like `A1B2C3D4E5`)

#### Step 3 — Update eas.json
In `apps/workspace-mobile/eas.json`, fill in the `submit.production.ios` section:
```json
"ios": {
  "appleId": "peeyushmaster21@gmail.com",
  "ascAppId": "<the numeric App ID from App Store Connect>",
  "appleTeamId": "<your Team ID>"
}
```
The `ascAppId` is the number shown in App Store Connect URL: `appstoreconnect.apple.com/apps/XXXXXXXXXX`

#### Step 4 — Build for App Store
```bash
cd apps/workspace-mobile

# Make sure you've logged in
eas login

# Build production .ipa (takes 15-30 min on EAS servers)
eas build --platform ios --profile production
```
EAS will handle certificates and provisioning profiles automatically — no Xcode required.

#### Step 5 — Submit to App Store
```bash
eas submit --platform ios --profile production
```
This uploads the `.ipa` directly to TestFlight. You will then need to:
1. Go to App Store Connect → your app → **TestFlight** to verify the build
2. Fill in **App Store listing**: description, screenshots (required sizes: 6.9" iPhone, 6.5" iPhone), keywords, category (Productivity), support URL
3. Submit for **App Review** (takes 1-3 days for first submission)

#### Required App Store assets to prepare:
| Asset | Size |
|-------|------|
| App Icon | Already in `assets/icon.png` (must be 1024×1024 PNG, no alpha) |
| iPhone 6.9" screenshots | 1320×2868 px — at least 3 |
| iPhone 6.5" screenshots | 1242×2688 px — at least 3 |
| Privacy Policy URL | Host a simple page at e.g. `cybersage.uk/privacy` |
| Support URL | `cybersage.uk/support` or just the main site |

---

### 6b. Android — Google Play Store

#### Prerequisites
- Google Play Developer account: **one-time $25 fee** — enroll at `play.google.com/console`

#### Step 1 — Create the app in Play Console
1. Go to `play.google.com/console` → **Create app**
2. Fill in:
   - **App name:** Nexus
   - **Default language:** English (UK)
   - **App type:** App
   - **Free or paid:** Free
3. Accept the declarations and click **Create app**

#### Step 2 — Create a Google Service Account for automated submission
1. In Play Console → **Setup → API access**
2. Click **Link to a Google Cloud project** → create new or link existing
3. Click **Create service accounts** → follow the Google Cloud Console link
4. In Google Cloud Console: **Create Service Account** → name it `eas-submission`
5. Grant it the role **Service Account User**
6. Create a **JSON key** → download it
7. Back in Play Console: click **Refresh service accounts**, grant the new account **Release Manager** access
8. Save the downloaded JSON as `apps/workspace-mobile/google-services-key.json`

> ⚠️ Never commit `google-services-key.json` to git — add it to `.gitignore`

#### Step 3 — Build for Play Store
```bash
cd apps/workspace-mobile

# Build production .aab (Android App Bundle)
eas build --platform android --profile production
```

#### Step 4 — Submit to Play Store
```bash
eas submit --platform android --profile production
```

#### Required Play Store assets to prepare:
| Asset | Size |
|-------|------|
| App Icon | 512×512 PNG |
| Feature Graphic | 1024×500 PNG (banner shown at top of listing) |
| Phone screenshots | At least 2, min 320px on shortest side |
| Short description | Max 80 characters |
| Full description | Max 4000 characters |
| Privacy Policy URL | `cybersage.uk/privacy` (mandatory for apps with accounts) |

#### First release — Internal Testing track
For the very first upload, Google requires you to start on **Internal Testing** (max 100 testers):
1. After `eas submit` completes, go to Play Console → **Testing → Internal testing**
2. Add testers by email
3. Once satisfied, promote to **Production** via **Promote release**

---

### 6c. Build both platforms at once
```bash
cd apps/workspace-mobile
eas build --platform all --profile production
# Then submit both:
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

---

### 6d. Over-the-air updates (no App Store review needed)
For JS-only changes (UI tweaks, bug fixes — not native code), you can push updates instantly:
```bash
cd apps/workspace-mobile
eas update --branch production --message "Fix: calendar event display"
```
Users get the update silently in the background on next app launch. No review required.

---

## 7. Repository Setup

The project is currently a local monorepo. To enable CI/CD and auto-deploys:

```bash
cd "/Users/peeyush/Desktop/builder/Custom email provider V2/cybersage-mail"

git init
git add .
git commit -m "Initial commit — Nexus v1.0"

# Create repo on GitHub then:
git remote add origin git@github.com:peeyushacoe-lab/workspace.git
git push -u origin main
```

Connect the GitHub repo to Vercel and it will auto-deploy on every push to `main`.

---

## 8. Environment File Reference

Copy this to `.env.local` in the repo root for local development (never commit this file):

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
AUTH_SECRET=
ADMIN_EMAIL=admin@cybersage.uk
ADMIN_PASSWORD=
ADMIN_SESSION_TOKEN=
RESEND_API_KEY=
RESEND_FROM_EMAIL=Nexus <noreply@cybersage.uk>
RESEND_WEBHOOK_SECRET=
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=nexus-drive
CLOUDFLARE_R2_PUBLIC_URL=
ANTHROPIC_API_KEY=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_APP_URL=https://cybersage.uk
```

---

## 9. Full File Map (what was built)

```
cybersage-mail/
├── src/app/                        Next.js App Router pages
│   ├── api/
│   │   ├── mobile/                 Mobile-specific API routes (JWT Bearer auth)
│   │   │   ├── notes/route.ts      GET list / POST create notes
│   │   │   ├── notes/[id]/route.ts GET / PUT / DELETE single note
│   │   │   ├── meetings/route.ts   GET list / POST create meetings
│   │   │   ├── ai/chat/route.ts    POST — Claude Haiku AI chat
│   │   │   ├── calendar/           Events CRUD
│   │   │   ├── auth/               JWT login/register for mobile
│   │   │   ├── drive/              File upload/list
│   │   │   ├── inbox/              Email list/read
│   │   │   └── chat/               Real-time messages
│   │   └── auth/me/route.ts        Session check (use this, NOT /api/me)
│   └── (app)/                      Web UI
├── prisma/
│   ├── schema.prisma               Full DB schema
│   └── migrations/                 20260511003327_v2 (only migration)
├── apps/
│   ├── desktop/                    Electron app
│   │   ├── electron/main.ts        Main process (IPC, tray, Mac menu)
│   │   ├── src/                    Renderer (React)
│   │   ├── electron-builder.yml    Build config (appId: uk.cybersage.nexus)
│   │   └── release/                Built DMG + EXE files ← ready to ship
│   └── workspace-mobile/           Expo / React Native app
│       ├── app/(tabs)/
│       │   ├── index.tsx           Inbox
│       │   ├── chat.tsx            Chat
│       │   ├── calendar.tsx        Monthly calendar with events
│       │   ├── drive.tsx           File manager
│       │   ├── activity.tsx        Activity feed
│       │   ├── notes.tsx           Notes (Google Keep style)
│       │   ├── ai.tsx              AI Brain chat (Claude Haiku)
│       │   ├── meetings.tsx        Meetings (Live / Scheduled / Past)
│       │   ├── settings.tsx        User settings
│       │   └── more.tsx            App grid launcher
│       ├── src/api/client.ts       API base URL config
│       ├── app.json                Bundle ID: uk.cybersage.workspace
│       └── eas.json                EAS build profiles
└── setup-mac.sh                    One-shot Mac dev environment setup
```

---

## 10. Quick Checklist for Go-Live

- [ ] Provision production Postgres DB, run `prisma migrate deploy`
- [ ] Provision Redis
- [ ] Add domain `cybersage.uk` in Vercel, set DNS records
- [ ] Add all environment variables in Vercel dashboard
- [ ] Update 4 hardcoded URLs (sections 4a–4d above)
- [ ] `git push origin main` → Vercel auto-deploys
- [ ] Verify `https://cybersage.uk` loads correctly
- [ ] Add `cybersage.uk` domain in Resend, add DNS/DKIM records
- [ ] Test email sending from `noreply@cybersage.uk`
- [ ] Rebuild desktop app after URL change, publish to GitHub Releases
- [ ] Run `eas build --platform all --profile production` for mobile
- [ ] Submit to App Store / Play Store

---

## Contact

**Peeyush:** peeyushmaster21@gmail.com  
**Expo account:** linked to the above email  
**Apple Developer:** linked to the above email (fill Team ID in eas.json)  
**Vercel project:** `cybersage-mail` (currently free tier — upgrade to Pro)  
**Sentry org:** `cybersage`, project: `mail`
