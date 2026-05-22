# CyberSage Mail System

Production-ready MVP for sending personalized CyberSage internship/client emails from `noreply@cybersage.uk`.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- Resend
- React Email
- PapaParse CSV upload

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in:

```txt
DATABASE_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL="CyberSage <noreply@cybersage.uk>"
ADMIN_EMAIL="admin@cybersage.uk"
ADMIN_PASSWORD=
ADMIN_SESSION_TOKEN=
RESEND_WEBHOOK_SECRET=
```

4. Generate Prisma and migrate:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## CSV Format

```csv
name,email,status
Peeyush,test@gmail.com,Accepted
Rahul,test2@gmail.com,Rejected
```

Optional columns:

```csv
interviewDate,customMessage
```

## Resend Domain Checklist

Add `cybersage.uk` in Resend, then publish the SPF, DKIM, and DMARC records Resend gives you in DNS. After verification, use:

```txt
noreply@cybersage.uk
internships@cybersage.uk
team@cybersage.uk
```

## Deploying To Vercel

1. Create a PostgreSQL database, for example Neon.
2. Add all environment variables in Vercel.
3. Run Prisma migration against production before first send.
4. Deploy.

The app runs in dry-run mode when `RESEND_API_KEY` is missing, which is useful for UI testing without sending real email.

## Phase 2 Additions

- Direct paste recipients from plain email lists, comma-separated rows, or `Name <email>` format.
- Recipient deduplication across CSV and pasted contacts.
- Message safety checks for insecure or risky links.
- Resend webhook endpoint at `/api/webhooks/resend` for delivered, opened, clicked, bounced, and complaint status updates.

Set `RESEND_WEBHOOK_SECRET` and send the same value as the `x-cybersage-webhook-secret` header from your webhook configuration.
