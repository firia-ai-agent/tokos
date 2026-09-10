import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, demoAccount, demoLoginHintLines } from "../src/lib/demo-logins";
import { providerHandoutTitle } from "../src/lib/provider-resources";

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
    // Provider-named handouts are computed rather than typed (TOK-70), so they are
    // resolved through the same helper the seed calls before the titles are compared.
    const literal = [...seed.matchAll(/title: "([^"]+)",\n\s+kind: "(?:handout|checklist|link)"/g)].map(
      (m) => m[1],
    );
    // The seed names its people by constant (`MAYA.name`); resolve each back to the demo
    // account it refers to so the assertion compares the titles the product would render.
    const named = [...seed.matchAll(/title: providerHandoutTitle\((\w+)\.name\)/g)].map((m) => {
      const key = m[1].toLowerCase();
      const account = DEMO_ACCOUNTS.find((row) => row.key === key);
      expect(account, `seed references ${m[1]}, which is not a demo account`).toBeDefined();
      return providerHandoutTitle(account?.name);
    });
    const titles = [...literal, ...named];
    expect(named.length).toBeGreaterThan(1);
    expect(titles.length).toBeGreaterThan(1);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("never hardcodes one provider's name into a handout title (TOK-70)", () => {
    // The bug this replaced: an org-wide row literally titled "What Maya does (and does
    // not do)", which every other doula then found sitting in her own library.
    expect(seed).not.toMatch(/title: "What \w+ does \(and does not do\)"/);
    // Copy only — the prose above the seed's resource rows is free to explain the bug
    // by name; what must not carry one is a string the product would render.
    for (const line of seedStrings()) {
      for (const account of DEMO_ACCOUNTS) {
        const first = account.name.trim().split(/\s+/)[0];
        expect(line).not.toContain(`What ${first} does`);
      }
    }
  });

  it("gives each seeded provider handout an owner, so it cannot bleed (TOK-70)", () => {
    // Every computed title in the seed sits next to an `ownerUserId`. Without one the
    // row is org-wide, which is exactly how the founder's handout reached Priya.
    const blocks = [...seed.matchAll(/ownerUserId: (\w+),\n\s+title: providerHandoutTitle\(/g)];
    const named = [...seed.matchAll(/title: providerHandoutTitle\(/g)];
    expect(blocks.length).toBe(named.length);
  });

  it("keeps the birth preferences form free of the internal disclaimer (TOK-41 G5)", () => {
    expect(seed).toContain('title: "Birth preferences"');
    expect(seed).not.toContain("non-clinical");
  });
});

describe("seeded roster (TOK-34 D8)", () => {
  it("keeps a second doula whose role is not owner, so the doula shell is reachable", () => {
    expect(demoAccount("priya").email).toBe("priya@novabirthpartners.com");
    // The membership that makes her a `doula` rather than another owner is the whole
    // point — without it there is nobody to sign in as and see the minimal shell.
    expect(seed).toMatch(/userId: PRIYA_USER_ID,\n\s+role: "doula",/);
  });

  it("gives her a family, so 'Your families' is not only ever an empty state", () => {
    expect(seed).toMatch(/userId: PRIYA_USER_ID,\n\s+role: "backup",/);
  });

  it("prints how to sign in as her when the seed finishes", () => {
    // The footer is built from the shared roster, so it cannot drift from the login page.
    expect(seed).toContain("demoLoginHintLines()");
    expect(demoLoginHintLines().join("\n")).toContain("priya@novabirthpartners.com");
  });

  it("gives her a provider profile of her own, so her first photo has somewhere to go", () => {
    // TOK-63: only Maya and Cedar's Sam were seeded a `provider_profiles` row, so Priya's
    // upload dead-ended on `no_profile`. The row is the fix; the slug has to be hers.
    const slugs = [...seed.matchAll(/slug: "([^"]+)",/g)].map((match) => match[1]!);
    expect(slugs).toContain("priya-raman");
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(seed).toMatch(/userId: PRIYA_USER_ID,\n\s+slug: "priya-raman",/);
  });

  it("takes every seeded identity from the shared roster rather than retyping it", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(seed).not.toContain(`"${account.email}"`);
    }
  });
});


/**
 * TOK-50. The seed is where the audience split becomes real: it is the only place that
 * writes both kinds of template, and Jordan's portal is filled from the same file. A
 * staff title reaching her Incomplete list is a Veri fail, so it is asserted against the
 * seed source rather than left to a live walk to discover.
 */
describe("seeded form audiences (TOK-50)", () => {
  /** `title` → `audience` for every template literal in the seed. */
  function seededTemplates(): Array<{ title: string; audience: string }> {
    return [...seed.matchAll(/title: "([^"]+)",\n\s+kind: "[^"]+",\n\s+audience: "(family|staff)"/g)].map(
      (match) => ({ title: match[1]!, audience: match[2]! }),
    );
  }

  /** The const names the assignment rows reference, e.g. `templateId: intakeId`. */
  function assignedTemplateVars(): string[] {
    const block = seed.slice(seed.indexOf("await db.insert(formAssignments)"));
    return [...block.matchAll(/templateId: (\w+),/g)].map((match) => match[1]!);
  }

  it("marks every seeded template with an explicit audience", () => {
    const templates = seededTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(9);
    expect(templates.filter((t) => t.audience === "family").length).toBeGreaterThanOrEqual(5);
    expect(templates.filter((t) => t.audience === "staff").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the three original family forms family-facing", () => {
    const family = seededTemplates()
      .filter((t) => t.audience === "family")
      .map((t) => t.title);
    expect(family).toContain("Getting-to-know-you");
    expect(family).toContain("Birth preferences");
    expect(family).toContain("First two weeks at home");
  });

  it("adds the two TOK-50 family worksheets without the questionnaire chrome", () => {
    const family = seededTemplates()
      .filter((t) => t.audience === "family")
      .map((t) => t.title);
    expect(family).toContain("Birth partner expectations");
    expect(family).toContain("Your birth plan worksheet");
    for (const title of family) {
      expect(title.toLowerCase()).not.toContain("questionnaire");
      expect(title.toLowerCase()).not.toContain("assessment");
      expect(title.toLowerCase()).not.toContain("doula's");
    }
  });

  it("marks all four staff forms staff, Birth log included", () => {
    const staff = seededTemplates()
      .filter((t) => t.audience === "staff")
      .map((t) => t.title);
    expect(staff).toContain("Prenatal visit notes");
    expect(staff).toContain("Birth doula postpartum visit");
    expect(staff).toContain("Senior birth team postpartum check-in");
    expect(staff).toContain("Birth log");
  });

  it("does not rename the Birth log into a family journal to fake a share", () => {
    // The clinical grid stays clinical and stays staff-side. A family birth story, if we
    // ever want one, is its own surface — not this one with a friendlier label.
    expect(seed).not.toMatch(/title: "[^"]*journal[^"]*"/i);
    expect(seed).not.toMatch(/title: "[^"]*birth story[^"]*"/i);
  });

  it("assigns only family templates to a client — never a staff one", () => {
    const staffVars = ["prenatalNotesId", "postpartumVisitId", "seniorCheckInId", "birthLogId"];
    const assigned = assignedTemplateVars();
    expect(assigned.length).toBeGreaterThan(0);
    for (const staffVar of staffVars) expect(assigned).not.toContain(staffVar);
  });

  it("drops the Birth Concierge role name and the EHR signature help", () => {
    // Copy only: the comments above the templates are allowed to name what was cut.
    for (const line of seedStrings()) {
      expect(line).not.toContain("Birth Concierge");
      expect(line.toLowerCase()).not.toContain("no longer editable");
      expect(line.toLowerCase()).not.toContain("completing this record");
    }
  });
});
