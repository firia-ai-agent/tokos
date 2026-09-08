import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The seed is copy as much as it is data: its resource bodies and email templates are the
 * first words a demo family reads, and nothing at runtime would notice them regressing to
 * role-speak. These assertions are the same rules the pages are held to (TOK-32, TOK-38),
 * applied to the content that fills them.
 */
const seed = readFileSync(join(process.cwd(), "scripts", "seed.ts"), "utf8");

/** Quoted string literals in the seed — the copy, without the code around it. */
function seedStrings(): string[] {
  return [...seed.matchAll(/"((?:[^"\\]|\\.){12,})"/g)].map((m) => m[1]);
}

describe("seeded client copy", () => {
  it("never falls back to 'your doula' (TOK-38 B11)", () => {
    for (const line of seedStrings()) {
      expect(line.toLowerCase()).not.toContain("your doula");
    }
  });

  it("names the sender in the welcome email rather than a role", () => {
    expect(seed).toContain("{{doula_name}} shared an introduction");
  });

  it("sends families to their portal, not to the product (TOK-41 G4)", () => {
    for (const line of seedStrings()) {
      expect(line).not.toMatch(/sign in Tokos|in Tokos:/);
    }
  });

  it("gives every seeded resource a title of its own (TOK-41 G7)", () => {
    // Two handouts a family cannot tell apart in a list is the same bug as no title.
    const titles = [...seed.matchAll(/title: "([^"]+)",\n\s+kind: "(?:handout|checklist|link)"/g)].map(
      (m) => m[1],
    );
    expect(titles.length).toBeGreaterThan(1);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("keeps the birth preferences form free of the internal disclaimer (TOK-41 G5)", () => {
    expect(seed).toContain('title: "Birth preferences"');
    expect(seed).not.toContain("non-clinical");
  });
});
