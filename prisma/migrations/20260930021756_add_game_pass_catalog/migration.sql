-- CreateTable
CREATE TABLE "GamePassCatalog" (
    "gameId" TEXT NOT NULL PRIMARY KEY,
    "passes" TEXT NOT NULL,
    "forSaleCount" INTEGER NOT NULL,
    "totalRobux" INTEGER NOT NULL,
    "changedAt" DATETIME NOT NULL,
    CONSTRAINT "GamePassCatalog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
