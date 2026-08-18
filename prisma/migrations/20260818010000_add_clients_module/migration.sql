-- Clients & revenue module (Business Manager).
--
-- Money columns are INTEGER minor units (pence/cents/paise), never numeric or
-- float — see the note above the models in schema.prisma.

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'ON_HOLD', 'CHURNED');
CREATE TYPE "DeliverableStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DELIVERED', 'ACCEPTED');
CREATE TYPE "FeeKind" AS ENUM ('RETAINER', 'PROJECT', 'MILESTONE', 'EXPENSE');
CREATE TYPE "FeeStatus" AS ENUM ('DRAFT', 'INVOICED', 'PART_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF');
CREATE TYPE "ClientRequestStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DECLINED');
CREATE TYPE "ClientRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "region" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "ownerId" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "startedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientDeliverable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientDeliverable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientFee" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "kind" "FeeKind" NOT NULL DEFAULT 'PROJECT',
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "FeeStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceRef" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientFee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "feeId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ClientRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ClientRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "raisedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientRequestComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");
CREATE INDEX "Client_ownerId_idx" ON "Client"("ownerId");
CREATE INDEX "Client_organizationId_region_idx" ON "Client"("organizationId", "region");
CREATE INDEX "ClientDeliverable_clientId_status_idx" ON "ClientDeliverable"("clientId", "status");
CREATE INDEX "ClientDeliverable_dueDate_idx" ON "ClientDeliverable"("dueDate");
CREATE INDEX "ClientFee_clientId_status_idx" ON "ClientFee"("clientId", "status");
CREATE INDEX "ClientFee_status_dueAt_idx" ON "ClientFee"("status", "dueAt");
CREATE INDEX "ClientFee_deliverableId_idx" ON "ClientFee"("deliverableId");
CREATE INDEX "ClientRequest_clientId_status_idx" ON "ClientRequest"("clientId", "status");
CREATE INDEX "ClientRequest_assignedToId_status_idx" ON "ClientRequest"("assignedToId", "status");
CREATE INDEX "ClientRequest_raisedById_idx" ON "ClientRequest"("raisedById");
CREATE INDEX "ClientRequestComment_requestId_createdAt_idx" ON "ClientRequestComment"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientDeliverable" ADD CONSTRAINT "ClientDeliverable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientDeliverable" ADD CONSTRAINT "ClientDeliverable_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientFee" ADD CONSTRAINT "ClientFee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFee" ADD CONSTRAINT "ClientFee_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ClientDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientFee" ADD CONSTRAINT "ClientFee_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientFee" ADD CONSTRAINT "ClientFee_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ClientDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "ClientFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientRequestComment" ADD CONSTRAINT "ClientRequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientRequestComment" ADD CONSTRAINT "ClientRequestComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
