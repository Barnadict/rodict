-- CreateTable
CREATE TABLE "Game" (
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
    "status" TEXT NOT NULL DEFAULT 'active',
    "deadSince" DATETIME,
    "currentGenreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_currentGenreId_fkey" FOREIGN KEY ("currentGenreId") REFERENCES "Genre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GameTheme" (
    "gameId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    PRIMARY KEY ("gameId", "themeId"),
    CONSTRAINT "GameTheme_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameGenreHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'roblox_tag',
    "note" TEXT,
    CONSTRAINT "GameGenreHistory_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameGenreHistory_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playing" INTEGER NOT NULL,
    "visits" BIGINT NOT NULL,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "upVotes" INTEGER NOT NULL DEFAULT 0,
    "downVotes" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER,
    CONSTRAINT "GameSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenreSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genreId" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "totalPlaying" INTEGER NOT NULL DEFAULT 0,
    "totalVisits" BIGINT NOT NULL DEFAULT 0,
    "totalFavorites" BIGINT NOT NULL DEFAULT 0,
    "avgPlaying" REAL NOT NULL DEFAULT 0,
    "medianPlaying" REAL,
    CONSTRAINT "GenreSnapshot_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "payload" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_universeId_key" ON "Game"("universeId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "Game_currentGenreId_idx" ON "Game"("currentGenreId");

-- CreateIndex
CREATE INDEX "Game_allTimePeakPlayers_idx" ON "Game"("allTimePeakPlayers");

-- CreateIndex
CREATE INDEX "Game_firstSeenAt_idx" ON "Game"("firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug");

-- CreateIndex
CREATE INDEX "GameTheme_themeId_idx" ON "GameTheme"("themeId");

-- CreateIndex
CREATE INDEX "GameGenreHistory_gameId_assignedAt_idx" ON "GameGenreHistory"("gameId", "assignedAt");

-- CreateIndex
CREATE INDEX "GameGenreHistory_genreId_idx" ON "GameGenreHistory"("genreId");

-- CreateIndex
CREATE INDEX "GameSnapshot_gameId_collectedAt_idx" ON "GameSnapshot"("gameId", "collectedAt");

-- CreateIndex
CREATE INDEX "GameSnapshot_collectedAt_idx" ON "GameSnapshot"("collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameSnapshot_gameId_collectedAt_key" ON "GameSnapshot"("gameId", "collectedAt");

-- CreateIndex
CREATE INDEX "GenreSnapshot_genreId_collectedAt_idx" ON "GenreSnapshot"("genreId", "collectedAt");

-- CreateIndex
CREATE INDEX "GenreSnapshot_collectedAt_idx" ON "GenreSnapshot"("collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenreSnapshot_genreId_collectedAt_key" ON "GenreSnapshot"("genreId", "collectedAt");

-- CreateIndex
CREATE INDEX "AnalyticsResult_kind_scopeType_scopeId_idx" ON "AnalyticsResult"("kind", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "AnalyticsResult_computedAt_idx" ON "AnalyticsResult"("computedAt");
