// Auth module — authentication, sessions, MFA, RBAC
export {
  parseSessionUser,
  getSessionUserFromCookieStore,
  canAccessPath,
  portalNavItems,
  portalHome,
  type SessionUser,
  type PortalNavItem,
} from "@/lib/auth";

export type { UserRole } from "@/generated/prisma/enums";

export { signPayload, verifyPayload, generateSessionToken } from "@/lib/session-crypto";
export { getCurrentUser } from "@/lib/session";
export { createSession } from "@/lib/session-tracker";
export { checkRateLimit } from "@/lib/rate-limit";
