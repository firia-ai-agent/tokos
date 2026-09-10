import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertAssignableToFamily,
  assignableToFamily,
  audienceLabel,
  familyTemplates,
  FORM_AUDIENCES,
  isFamilyAudience,
  isStaffAudience,
  normalizeFormAudience,
  staffTemplates,
} from "./form-audience";

/**
 * The four titles Dubsado put on a *client's* Incomplete list while their copy asked the
 * reader to complete a visit "with the client". Veri treats any of these appearing on a
 * family surface as a fail, so they are named here rather than described.
 */
const STAFF_TITLES = [
  "Birth doula postpartum visit",
  "Senior birth team postpartum check-in",
  "Prenatal visit notes",
  "Birth log",
];

const LIBRARY = [
  { id: "t1", title: "Getting-to-know-you", audience: "family" },
  { id: "t2", title: "Birth preferences", audience: "family" },
  { id: "t3", title: "First two weeks at home", audience: "family" },
  { id: "t4", title: "Birth partner expectations", audience: "family" },
  { id: "t5", title: "Your birth plan worksheet", audience: "family" },
  { id: "t6", title: "Prenatal visit notes", audience: "staff" },
  { id: "t7", title: "Birth doula postpartum visit", audience: "staff" },
  { id: "t8", title: "Senior birth team postpartum check-in", audience: "staff" },
  { id: "t9", title: "Birth log", audience: "staff" },
];

describe("form audience (TOK-50)", () => {
  it("has exactly two audiences", () => {
    expect(FORM_AUDIENCES).toEqual(["family", "staff"]);
  });

  it("reads anything unrecognised as family, matching the column default", () => {
    expect(normalizeFormAudience(undefined)).toBe("family");
    expect(normalizeFormAudience(null)).toBe("family");
    expect(normalizeFormAudience("")).toBe("family");
    expect(normalizeFormAudience("Staff")).toBe("family");
    expect(normalizeFormAudience("staff")).toBe("staff");
  });

  it("splits the library into the two shelves without losing a template", () => {
    const family = familyTemplates(LIBRARY);
    const staff = staffTemplates(LIBRARY);
    expect(family.length + staff.length).toBe(LIBRARY.length);
    expect(family.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(staff.map((t) => t.id)).toEqual(["t6", "t7", "t8", "t9"]);
  });

  it("keeps every staff title out of a family picker", () => {
    const offered = familyTemplates(LIBRARY).map((template) => template.title);
    for (const title of STAFF_TITLES) expect(offered).not.toContain(title);
  });

  it("refuses to assign a staff template to a family portal", () => {
    for (const template of staffTemplates(LIBRARY)) {
      expect(assignableToFamily(template)).toBe(false);
      expect(() => assertAssignableToFamily(template)).toThrow(/staff form/);
    }
    for (const template of familyTemplates(LIBRARY)) {
      expect(assignableToFamily(template)).toBe(true);
      expect(assertAssignableToFamily(template)).toBe(template);
    }
  });

  it("treats a missing template as unassignable rather than as a family one", () => {
    expect(assignableToFamily(null)).toBe(false);
    expect(assignableToFamily(undefined)).toBe(false);
    expect(() => assertAssignableToFamily(null)).toThrow(/no template/);
  });

  it("accepts a bare audience string as well as a row", () => {
    expect(isFamilyAudience("family")).toBe(true);
    expect(isStaffAudience("staff")).toBe(true);
    expect(isStaffAudience({ audience: "family" })).toBe(false);
  });

  it("labels the shelf a doula is looking at", () => {
    expect(audienceLabel("staff")).toBe("Staff only");
    expect(audienceLabel("family")).toBe("Family");
    expect(audienceLabel(undefined)).toBe("Family");
  });
});

describe("family Incomplete never carries staff work (Veri)", () => {
  /** What a portal list is: assignment rows joined to their template. */
  const assignments = [
    { id: "a1", status: "incomplete", template: LIBRARY[0]! },
    { id: "a2", status: "incomplete", template: LIBRARY[3]! },
    // Rows a bad build could have written. The filter is what makes them harmless.
    { id: "a3", status: "incomplete", template: LIBRARY[6]! },
    { id: "a4", status: "incomplete", template: LIBRARY[8]! },
  ];

  it("drops staff rows even when they exist against the client", () => {
    const visible = assignments.filter((row) => isFamilyAudience(row.template));
    expect(visible.map((row) => row.id)).toEqual(["a1", "a2"]);
  });

  it("shows a family none of the four staff titles", () => {
    const titles = assignments
      .filter((row) => isFamilyAudience(row.template))
      .map((row) => row.template.title);
    for (const staffTitle of STAFF_TITLES) expect(titles).not.toContain(staffTitle);
  });

  it("never says 'Doula' to a family in a form title she can see", () => {
    for (const template of familyTemplates(LIBRARY)) {
      expect(template.title.toLowerCase()).not.toContain("doula's");
      expect(template.title.toLowerCase()).not.toContain("questionnaire");
    }
  });
});


/**
 * The gate has to be in the reads, not only in the helpers. These assert the three
 * places a family's form list is actually built, because a helper nobody calls is not a
 * guard — and the Dubsado bug was a *query* that did not care who a form was for.
 */
describe("the family reads are audience-filtered (defence in depth)", () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

  it("filters the portal Forms page on family audience", () => {
    const page = read("src", "app", "(client)", "portal", "forms", "page.tsx");
    expect(page).toContain('eq(formTemplates.audience, "family")');
  });

  it("filters every read that counts a family's open forms", () => {
    const queries = read("src", "lib", "queries.ts");
    // Two counts now: the family's own checklist, and the grouped one behind the Needs
    // Attention "Forms still open" rule (TOK-58). Rather than assert a number of filters,
    // find every count of `formAssignments` in the file and insist each one reached the
    // template — a new read added without the join fails here.
    const counts = [
      ...queries.matchAll(/\.select\(\{[^}]*count\(\)[^}]*\}\)\s*\.from\(formAssignments\)/g),
    ];
    expect(counts).toHaveLength(2);
    for (const match of counts) {
      const block = queries.slice(match.index ?? 0, (match.index ?? 0) + 600);
      expect(block).toContain("eq(formTemplates.audience, FAMILY_AUDIENCE)");
    }
  });

  it("refuses a staff template in the single assign action", () => {
    const actions = read("src", "app", "actions", "forms.ts");
    expect(actions).toContain("assignableToFamily(template)");
    expect(actions).toContain("error=staff_only");
  });

  it("refuses one in the batch path too, rather than only in the picker", () => {
    const actions = read("src", "app", "actions", "forms.ts");
    expect(actions).toContain("templates.filter((template) => assignableToFamily(template))");
  });

  it("gates the family's own submit on audience, not only the list she sees", () => {
    const clientActions = read("src", "app", "actions", "client.ts");
    expect(clientActions).toContain("isFamilyAudience(row.audience)");
  });
});
