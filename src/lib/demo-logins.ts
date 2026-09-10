/**
 * The demo roster, in one place (TOK-34).
 *
 * The seed, the login hint, and the README each used to spell the demo accounts out for
 * themselves, and they drifted: the login page said "Doula: maya@…" while Maya's
 * membership is `owner`. Anyone smoke-testing the doula shell signed in as the founder,
 * landed in agency chrome — Team, Settings, Pipeline, the NOVA rail — and read that as
 * the doula shell being broken.
 *
 * So the accounts live here, with the shell each one actually lands in, and every
 * surface that names them reads from this list rather than retyping it.
 */
import type { ShellPersona } from "@/lib/shell-persona";

/** Where an account lands after sign-in. Families get the portal, not a staff shell. */
export type DemoShell = ShellPersona | "portal";

export type DemoAccount = {
  key: string;
  name: string;
  email: string;
  /** Membership role for staff; `null` for a family, who signs in on portal access. */
  membershipRole: "owner" | "doula" | null;
  shell: DemoShell;
  /** Which seeded tenant the account belongs to. */
  tenant: "nova" | "cedar";
  /** One line for the seed footer — what this account is for. */
  note: string;
};

export const DEMO_PASSWORD = "tokos-demo";

export const DEMO_ACCOUNTS = [
  {
    key: "maya",
    name: "Maya Chen",
    email: "maya@novabirthpartners.com",
    membershipRole: "owner",
    shell: "agency",
    tenant: "nova",
    note: "founder of NOVA — owner, so she gets the agency shell: Team, Settings, org-wide Pipeline",
  },
  {
    key: "priya",
    name: "Priya Raman",
    email: "priya@novabirthpartners.com",
    membershipRole: "doula",
    shell: "doula",
    tenant: "nova",
    note: 'role=doula, so she gets the doula shell: no Team, no Settings, "Your families" instead of Pipeline, "My practice" instead of the agency rail. Backup on Avery, so her list is one family while Maya\'s owner board is org-wide',
  },
  {
    key: "jordan",
    name: "Jordan Rivera",
    email: "jordan.rivera@example.com",
    membershipRole: null,
    shell: "portal",
    tenant: "nova",
    note: "primary happy-path family",
  },
  {
    key: "avery",
    name: "Avery Kim",
    email: "avery.kim@example.com",
    membershipRole: null,
    shell: "portal",
    tenant: "nova",
    note: "second NOVA family, at outreach_sent with an overdue follow-up — Priya is her backup",
  },
  {
    key: "sam",
    name: "Sam Ortega",
    email: "sam@cedarbirth.co",
    membershipRole: "owner",
    shell: "agency",
    tenant: "cedar",
    note: "owner of Cedar — must not reach NOVA clients",
  },
  {
    key: "riley",
    name: "Riley Voss",
    email: "riley.voss@example.com",
    membershipRole: null,
    shell: "portal",
    tenant: "cedar",
    note: "other org — Maya must not see",
  },
] as const satisfies readonly DemoAccount[];

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]["key"];

export function demoAccount(key: DemoAccountKey): DemoAccount {
  const found = DEMO_ACCOUNTS.find((account) => account.key === key);
  if (!found) throw new Error(`Unknown demo account: ${key}`);
  return found;
}

export type DemoLoginGroup = { label: string; accounts: DemoAccount[] };

/**
 * The sign-in hint, grouped by the shell each account lands in rather than by job title
 * — "Doula" describes both women here, and picking the wrong one is the whole bug.
 */
export function demoLoginGroups(): DemoLoginGroup[] {
  return [
    { label: "Founder · agency shell", accounts: [demoAccount("maya")] },
    { label: "Doula shell", accounts: [demoAccount("priya")] },
    { label: "Clients · portal", accounts: [demoAccount("jordan"), demoAccount("avery")] },
  ];
}

/** The same hint as plain lines, for anywhere without markup (the seed footer). */
export function demoLoginHintLines(): string[] {
  return [
    ...demoLoginGroups().map(
      (group) => `${group.label}: ${group.accounts.map((a) => a.email).join(", ")}`,
    ),
    `password ${DEMO_PASSWORD}`,
  ];
}
