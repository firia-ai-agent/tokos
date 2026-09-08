import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  demoAccount,
  demoLoginGroups,
  demoLoginHintLines,
} from "@/lib/demo-logins";
import { shellPersona } from "@/lib/shell-persona";

const loginPage = readFileSync(
  join(process.cwd(), "src", "app", "(public)", "login", "page.tsx"),
  "utf8",
);
const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

describe("demo roster (TOK-34)", () => {
  it("matches each account's shell to the persona its membership role earns", () => {
    for (const account of DEMO_ACCOUNTS) {
      if (!account.membershipRole) {
        expect(account.shell).toBe("portal");
        continue;
      }
      expect(account.shell).toBe(shellPersona(account.membershipRole));
    }
  });

  it("names Maya the founder and Priya the doula shell", () => {
    expect(demoAccount("maya").membershipRole).toBe("owner");
    expect(demoAccount("maya").shell).toBe("agency");
    expect(demoAccount("priya").membershipRole).toBe("doula");
    expect(demoAccount("priya").shell).toBe("doula");
  });

  it("keeps emails unique, so no two hints can point at the same person", () => {
    const emails = DEMO_ACCOUNTS.map((account) => account.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});

describe("login hint (TOK-34)", () => {
  it("sends a doula-shell smoke test to Priya, never to Maya", () => {
    const doulaLine = demoLoginHintLines().find((line) => line.startsWith("Doula shell:"));
    expect(doulaLine).toContain(demoAccount("priya").email);
    expect(doulaLine).not.toContain(demoAccount("maya").email);
  });

  // The regression that started this: a hint reading "Doula: maya@…" put every smoke
  // test in owner chrome — Team, Settings, Pipeline — and read as a broken doula shell.
  it("never offers Maya under a bare doula label", () => {
    for (const group of demoLoginGroups()) {
      if (group.accounts.some((account) => account.shell === "agency")) {
        expect(group.label.toLowerCase()).toContain("founder");
      }
    }
  });

  it("labels the founder and the clients as plainly as the doula", () => {
    const lines = demoLoginHintLines();
    expect(lines.some((line) => line.startsWith("Founder") && line.includes(demoAccount("maya").email))).toBe(true);
    expect(lines.some((line) => line.includes(demoAccount("jordan").email) && line.includes(demoAccount("avery").email))).toBe(true);
    expect(lines.at(-1)).toBe(`password ${DEMO_PASSWORD}`);
  });

  it("is read from the shared roster rather than inlined on the login page", () => {
    expect(loginPage).toContain("demoLoginGroups");
    for (const account of DEMO_ACCOUNTS) {
      expect(loginPage).not.toContain(account.email);
    }
    expect(loginPage).not.toContain(DEMO_PASSWORD);
  });

  it("keeps the README saying the same thing as the hint", () => {
    expect(readme).toContain(demoAccount("maya").email);
    expect(readme).toContain(demoAccount("priya").email);
    // Whichever row carries Maya must not be the one a reader picks for the doula shell.
    const mayaRow = readme
      .split("\n")
      .find((line) => line.startsWith("|") && line.includes(demoAccount("maya").email));
    expect(mayaRow).toBeDefined();
    expect(mayaRow?.toLowerCase()).toContain("founder");
  });
});
