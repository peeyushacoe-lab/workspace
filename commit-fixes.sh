#!/bin/bash
set -e
cd "$(dirname "$0")"

# Remove stale lock if present
rm -f .git/index.lock

git add \
  next.config.ts \
  public/favicon.ico \
  src/app/favicon.ico \
  src/app/layout.tsx \
  "src/app/(portal)/meet/[roomId]/page.tsx" \
  "src/app/(portal)/users/page.tsx" \
  src/app/api/drive/folders/route.ts \
  src/app/api/drive/upload/route.ts \
  src/components/MeetView.tsx \
  "src/app/api/users/[id]/resend-invite/route.ts" \
  "src/app/api/inbox/[id]/route.ts" \
  src/app/api/users/route.ts \
  src/app/api/chat/channels/route.ts \
  "src/app/api/chat/channels/[id]/messages/route.ts" \
  src/components/InboxView.tsx \
  src/components/ChatView.tsx \
  src/components/WorkspaceDashboard.tsx \
  src/app/api/inbox/compose/route.ts \
  src/lib/email.tsx \
  prisma/schema.prisma \
  src/generated/prisma/models/ChatChannel.ts \
  "prisma/migrations/20260611_add_channel_broadcast/migration.sql"

git commit -m "feat: broadcast channels + email attachments + tester bug fixes

feat: broadcast channels (Instagram/WhatsApp style)
- prisma: add isBroadcast Boolean field to ChatChannel (default false)
- chat/channels/route.ts: accept isBroadcast on channel creation
- chat/channels/[id]/messages/route.ts: block POST when isBroadcast=true
  and member role is not ADMIN — only channel creator can post
- ChatView.tsx: isBroadcast toggle in New Channel modal with description,
  Megaphone icon in sidebar + header for broadcast channels, 'Broadcast'
  badge in header, read-only notice in compose area for non-admin members

feat: email attachment support
- WorkspaceDashboard.tsx (SimpleComposer): paperclip button, file list with
  remove, 10 MB limit, FormData send when attachments present
- inbox/compose/route.ts: parse multipart/form-data, pass files to Resend
- lib/email.tsx: optional attachments[] param on sendEmail()

fix: inbox star/archive 404 — checkThreadAccess now accepts mailbox owners
fix: Forward button in thread detail (Fwd: subject + quoted body)
fix: chat 403 — auto-join users to public channels on load + creation
prev: CSP, favicon, Jitsi, Drive folder/upload, invite resend"

git push origin main
echo "Done!"
