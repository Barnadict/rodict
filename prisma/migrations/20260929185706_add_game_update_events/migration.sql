-- CreateTable
CREATE TABLE "GameUpdate" (
    "gameId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "previousUpdatedAt" DATETIME,
    "detectedAt" DATETIME NOT NULL,

    PRIMARY KEY ("gameId", "updatedAt"),
    CONSTRAINT "GameUpdate_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GameUpdate_updatedAt_idx" ON "GameUpdate"("updatedAt");

-- Seed: each game's current timestamp is the one update we already know about,
-- so history starts now instead of at the first change after deploy. One row
-- per game with a timestamp (~5.3K rows once, ≈0.05% of the monthly write cap).
INSERT INTO "GameUpdate" ("gameId", "updatedAt", "previousUpdatedAt", "detectedAt")
SELECT "id", "robloxUpdatedAt", NULL, COALESCE("lastCollectedAt", "firstSeenAt")
FROM "Game"
WHERE "robloxUpdatedAt" IS NOT NULL;
