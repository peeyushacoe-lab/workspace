CREATE TABLE "Passkey" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "name"         TEXT NOT NULL DEFAULT 'My passkey',
    "credentialId" TEXT NOT NULL,
    "publicKey"    BYTEA NOT NULL,
    "counter"      BIGINT NOT NULL DEFAULT 0,
    "deviceType"   TEXT NOT NULL,
    "backedUp"     BOOLEAN NOT NULL DEFAULT false,
    "transports"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"   TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
