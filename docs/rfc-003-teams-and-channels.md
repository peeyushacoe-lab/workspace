# RFC-003 — Teams, channels and channel tabs

Status: **schema landed, build pending**
Supersedes: gotcha #12 in `CLAUDE.md` ("Teams are static definitions")

## The gap, stated precisely

Nexus already has more of Microsoft Teams than it looks. Before designing
anything, this is what the schema *already* supports and what it does not — an
earlier version of this analysis overstated the gap badly, and building
duplicates of existing models would have been the expensive mistake.

**Already modelled, no work needed:**

| Capability | Where |
|---|---|
| Threaded replies | `ChatMessage.parentId` + `replies` (ThreadReplies) |
| Inline quote-reply | `ChatMessage.quotedMessageId` |
| @mentions | `ChatMessage.mentionedUserIds String[]` |
| Reactions, polls, voice notes, attachments | `ChatReaction`, `ChatPoll`, `voiceNote*`, `attachment*` |
| Read receipts | `ChatMessageRead` |
| Pinning, saving, forwarding, urgent flag | `isPinned`, `SavedChatMessage`, `forwardedFromId`, `isUrgent` |
| Teams with members and leads | `Team`, `TeamMember` (RFC-001) |
| Private / broadcast channels | `ChatChannel.isPrivate`, `isBroadcast` |

**The actual gap:** `ChatChannel` had no `teamId`. Channels floated free of
teams, so a "team" was a list of people with no place to work, and a channel
belonged to nobody. Everything that feels missing about Nexus-versus-Teams
descends from that one absent foreign key.

## Schema (landed)

```prisma
model Team {
  // …existing RFC-001 fields
  channels      ChatChannel[]
  driveFolderId String?      // one folder per team
}

model ChatChannel {
  // …existing fields
  teamId   String?      // nullable: DMs and org-wide channels have no team
  team     Team?        @relation(fields: [teamId], references: [id], onDelete: Cascade)
  position Int @default(0)
  tabs     ChannelTab[]

  @@index([teamId, position])
}

model ChannelTab {
  id, channelId, kind, label, target, position, createdById, createdAt
}

enum ChannelTabKind { FILES DOC SHEET SLIDE BOARD LINK }
```

`teamId` is **nullable on purpose**. Every existing channel keeps working
untouched — this migration must not orphan live conversations, and a
`NOT NULL` column would force a backfill decision we have no data to make.

`onDelete: Cascade` on the team relation is deliberate: deleting a team should
take its channels with it, the way deleting a Teams team does. DMs are
unaffected because their `teamId` is null.

## Why channel tabs are the differentiator

A channel with a chat log is a group chat. A channel with **Files, a Doc, a
Sheet and a task board pinned across the top** is a place where one piece of
work lives. That is the single structural thing Teams has that Nexus does not,
and Nexus is unusually well placed to build it — Docs, Sheets, Slides, Tasks
and Drive already exist as first-class apps. Teams has to embed SharePoint and
Planner through an iframe SDK; we can render ours natively.

## Build order

1. **Migration + `npm run prisma:generate`.** Nothing else compiles first.
2. **Team channel list.** `GET/POST /api/teams/[id]/channels`; creating a team
   seeds a `General` channel at `position: 0`.
3. **Team drive folder.** Create on team creation, store `driveFolderId`, and
   route uploads from a team channel into it.
4. **Channel tabs.** `GET/POST/DELETE /api/channels/[id]/tabs`; render as a tab
   strip above the message list. `FILES` first (it needs no picker), then
   `DOC`/`SHEET`/`SLIDE` behind the existing document pickers.
5. **Activity feed.** `mentionedUserIds` is already populated — a feed is a
   query, not a new subsystem. This is the cheapest high-value item on the list
   and should probably jump the queue.
6. **Meet-now in a channel**, with the meeting's chat persisting into that
   channel afterwards.

## Access control

Channel membership must be derived from `TeamMember` for team channels rather
than duplicated into `ChatMember` — two sources of truth for "who can see this"
is how a security product leaks a channel. Gate the tab APIs on the existing
RBAC engine (`can(userId, "chat.manage")` for tab mutation); do not invent a
second permission model.

## Not in scope

External/guest access. It is a real Teams feature and a real enterprise
requirement, but it is an identity-federation project, not a chat feature, and
it should not be smuggled into this one.
