-- Add scoped RoomApiToken table for Streamable HTTP MCP authentication
CREATE TABLE IF NOT EXISTS "RoomApiToken" (
  "id" TEXT NOT NULL,
  "roomId" INTEGER NOT NULL,
  "sceneId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'editor',
  "label" TEXT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomApiToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoomApiToken_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomApiToken_tokenHash_key" ON "RoomApiToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RoomApiToken_roomId_idx" ON "RoomApiToken"("roomId");
CREATE INDEX IF NOT EXISTS "RoomApiToken_createdById_idx" ON "RoomApiToken"("createdById");
