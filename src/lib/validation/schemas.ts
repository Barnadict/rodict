/**
 * Runtime schemas for Roblox API responses. TypeScript types (src/lib/roblox/types.ts)
 * describe what we EXPECT; these zod schemas check what we actually GOT — Roblox's
 * API is semi-official and unversioned, so a field can go null/missing/garbage
 * without warning. Nothing gets written to the DB without passing one of these.
 */
import { z } from "zod";

const isoDateString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "not a valid ISO date string" });

export const gameDetailSchema = z
  .object({
    id: z.number().int().positive(),
    rootPlaceId: z.number().int().positive(),
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    creator: z.object({
      id: z.number().int().nonnegative(),
      name: z.string(),
      type: z.enum(["User", "Group"]),
      hasVerifiedBadge: z.boolean(),
    }),
    playing: z.number().int().nonnegative(),
    visits: z.number().int().nonnegative(),
    maxPlayers: z.number().int().nonnegative(),
    created: isoDateString,
    updated: isoDateString,
    genre: z.string().nullable(),
    genre_l1: z.string().nullable(),
    genre_l2: z.string().nullable(),
    favoritedCount: z.number().int().nonnegative(),
  })
  .refine((d) => Date.parse(d.updated) >= Date.parse(d.created), {
    message: "updated timestamp is before created timestamp",
    path: ["updated"],
  });

export const gameVotesSchema = z.object({
  id: z.number().int().positive(),
  upVotes: z.number().int().nonnegative(),
  downVotes: z.number().int().nonnegative(),
});

export const gameIconSchema = z.object({
  universeId: z.number().int().positive(),
  imageUrl: z.string().url().nullable(),
  state: z.string(),
});

export const searchGameSchema = z.object({
  universeId: z.number().int().positive(),
  rootPlaceId: z.number().int().nonnegative(),
  name: z.string().trim().min(1),
  playerCount: z.number().int().nonnegative(),
});
