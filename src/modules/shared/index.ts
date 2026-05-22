// Shared module — cross-cutting infrastructure
export { prisma } from "@/lib/prisma";
export { redis, redisConnection, createDedicatedRedis } from "@/lib/redis";
export { logger } from "@/lib/logger";
export { cn } from "@/lib/utils";
export { emitEvent, onEvent, workspaceEvents, type WorkspaceEventMap, type WorkspaceEventKey } from "@/lib/events";
export { ALL_QUEUE_NAMES, type QueueName } from "@/lib/queues";
export type { TemplateDefinition } from "@/lib/types";
