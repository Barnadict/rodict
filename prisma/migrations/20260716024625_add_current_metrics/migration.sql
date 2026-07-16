-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "universeId" BIGINT NOT NULL,
    "rootPlaceId" BIGINT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" BIGINT,
    "creatorName" TEXT,
    "creatorType" TEXT,
    "robloxCreatedAt" DATETIME,
    "robloxUpdatedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCollectedAt" DATETIME,
    "allTimePeakPlayers" INTEGER NOT NULL DEFAULT 0,
    "allTimePeakAt" DATETIME,
    "currentPlaying" INTEGER NOT NULL DEFAULT 0,
    "currentVisits" BIGINT NOT NULL DEFAULT 0,
    "currentFavorites" INTEGER NOT NULL DEFAULT 0,
    "currentUpVotes" INTEGER NOT NULL DEFAULT 0,
    "currentDownVotes" INTEGER NOT NULL DEFAULT 0,
    "lastSnapshotAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deadSince" DATETIME,
    "currentGenreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_currentGenreId_fkey" FOREIGN KEY ("currentGenreId") REFERENCES "Genre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("allTimePeakAt", "allTimePeakPlayers", "createdAt", "creatorId", "creatorName", "creatorType", "currentGenreId", "deadSince", "description", "firstSeenAt", "id", "lastCollectedAt", "name", "robloxCreatedAt", "robloxUpdatedAt", "rootPlaceId", "status", "universeId", "updatedAt") SELECT "allTimePeakAt", "allTimePeakPlayers", "createdAt", "creatorId", "creatorName", "creatorType", "currentGenreId", "deadSince", "description", "firstSeenAt", "id", "lastCollectedAt", "name", "robloxCreatedAt", "robloxUpdatedAt", "rootPlaceId", "status", "universeId", "updatedAt" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE UNIQUE INDEX "Game_universeId_key" ON "Game"("universeId");
CREATE INDEX "Game_status_idx" ON "Game"("status");
CREATE INDEX "Game_currentGenreId_idx" ON "Game"("currentGenreId");
CREATE INDEX "Game_allTimePeakPlayers_idx" ON "Game"("allTimePeakPlayers");
CREATE INDEX "Game_firstSeenAt_idx" ON "Game"("firstSeenAt");
CREATE INDEX "Game_currentPlaying_idx" ON "Game"("currentPlaying");
CREATE INDEX "Game_currentVisits_idx" ON "Game"("currentVisits");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
