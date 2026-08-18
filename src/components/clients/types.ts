// Shared wire types for the client book. These mirror what /api/clients returns
// — including the per-record `canEdit` flag, which the UI trusts rather than
// re-deriving. Recomputing permissions client-side is how an edit button ends up
// showing for a record the server will refuse.

export type ClientStatus = "PROSPECT" | "ACTIVE" | "ON_HOLD" | "CHURNED";
export type DeliverableStatus =
  | "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "DELIVERED" | "ACCEPTED";
export type FeeKind = "RETAINER" | "PROJECT" | "MILESTONE" | "EXPENSE";
export type FeeStatus =
  | "DRAFT" | "INVOICED" | "PART_PAID" | "PAID" | "OVERDUE" | "WRITTEN_OFF";
export type RequestStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DECLINED";
export type RequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type UserLite = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  customRole?: string | null;
  role?: string;
  email?: string;
};

export type ClientMoney = { billedMinor: number; paidMinor: number };

export type ClientRow = {
  id: string;
  name: string;
  legalName?: string | null;
  region?: string | null;
  industry?: string | null;
  website?: string | null;
  status: ClientStatus;
  currency: string;
  startedAt?: string | null;
  notes?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  owner?: UserLite | null;
  _count?: { deliverables: number; fees: number };
  canEdit: boolean;
  money: ClientMoney | null;
};

export type Deliverable = {
  id: string;
  title: string;
  description?: string | null;
  status: DeliverableStatus;
  dueDate?: string | null;
  deliveredAt?: string | null;
  owner?: UserLite | null;
};

export type Fee = {
  id: string;
  description: string;
  kind: FeeKind;
  amountMinor: number;
  paidMinor: number;
  currency: string;
  status: FeeStatus;
  invoiceRef?: string | null;
  invoicedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  recordedBy?: { id: string; fullName: string } | null;
  confirmedBy?: { id: string; fullName: string } | null;
  deliverable?: { id: string; title: string } | null;
};

export type RequestComment = {
  id: string;
  body: string;
  createdAt: string;
  author: UserLite;
};

export type ClientRequest = {
  id: string;
  subject: string;
  body: string;
  status: RequestStatus;
  priority: RequestPriority;
  createdAt: string;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  raisedBy: UserLite;
  assignedTo?: UserLite | null;
  resolvedBy?: { id: string; fullName: string } | null;
  comments: RequestComment[];
};

/** What the signed-in viewer may do in the client book as a whole. */
export type Viewer = {
  id: string;
  canCreate: boolean;
  canAdmin: boolean;
  canSeeMoney: boolean;
  canManageMoney: boolean;
  /** Read but never write — drives the request-first UI for CEO/CISO/COO. */
  isOversightOnly: boolean;
};

/** A row in the cross-client requests inbox (GET /api/clients/requests). */
export type InboxRequest = {
  id: string;
  subject: string;
  status: RequestStatus;
  priority: RequestPriority;
  createdAt: string;
  client: { id: string; name: string; region?: string | null };
  raisedBy: UserLite;
  assignedTo?: UserLite | null;
  _count: { comments: number };
};

/** Per-record rights returned by the detail endpoint. */
export type ClientRights = {
  canRead: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  canSeeMoney: boolean;
  canManageMoney: boolean;
  isReadOnly: boolean;
};
