# ── Base stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat curl

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build

# ── Web server (Next.js + Socket.IO) ─────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Production node_modules (socket.io, ioredis, next, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Built Next.js app (pages, API routes, static assets)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
# Custom server entry point
COPY --from=builder /app/server.js ./
COPY package.json ./

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]

# ── Worker (BullMQ) ───────────────────────────────────────────────────────────
FROM base AS worker
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY package.json tsconfig.json ./

RUN npm install -g tsx

CMD ["tsx", "scripts/worker.ts"]
