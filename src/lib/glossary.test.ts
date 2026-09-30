import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GLOSSARY, glossaryHref, type GlossaryKey } from "@/lib/glossary";

describe("glossary", () => {
  it("links every entry to an anchor /about actually has", () => {
    const about = readFileSync(join(process.cwd(), "src/app/about/page.tsx"), "utf8");
    const anchored = new Set(
      [...about.matchAll(/id=\{GLOSSARY\.(\w+)\.anchor\}/g)].map(
        (m) => GLOSSARY[m[1] as GlossaryKey].anchor,
      ),
    );
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(anchored, `${key} → #${entry.anchor}`).toContain(entry.anchor);
    }
  });

  it("keeps definitions to one line", () => {
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.definition).not.toContain("\n");
      expect(entry.definition.length).toBeLessThan(160);
    }
  });

  it("builds /about links", () => {
    expect(glossaryHref("session")).toBe("/about#est-session");
  });
});
