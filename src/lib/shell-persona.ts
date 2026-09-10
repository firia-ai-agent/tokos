/**
 * Doula shell vs agency shell (TOK-34).
 *
 * `canManageTeam` already decides who may *write* the roster, the brand, and the email
 * templates. It never decided what the shell offers to look at, so a solo doula inside
 * someone else's agency saw the whole agency: a Team tab she cannot act on, Brand
 * settings that are not hers, and a board labelled "Pipeline" over families she was
 * assigned. Two personas, one set of routes:
 *
 * - `agency`  — owner/admin. Runs NOVA: roster, brand, email templates, org-wide board.
 * - `doula`   — role `doula`. Runs a practice inside it: her families, calendar, library.
 *
 * Everything here is pure so the split is testable without a session or a database.
 */
import { canManageTeam } from "@/lib/team";
import { STAGE_LABELS } from "@/lib/pipeline";
import type { ShellNavGroup } from "@/components/brand/shell-nav";

export type ShellPersona = "agency" | "doula";

export type ShellSearchTarget = { label: string; href: string; keywords: string };
export type ShellNewItem = { label: string; href: string };

/** Owner/admin get the agency shell; every other staff role gets the doula shell. */
export function shellPersona(role: string | null | undefined): ShellPersona {
  return canManageTeam(role) ? "agency" : "doula";
}

/**
 * Rail heading for the first nav group. A doula's is her own — "My practice". An
 * agency's is the practice she works for, short enough to sit on one 11px line, so
 * "NOVA Birth Partners" becomes "NOVA" rather than wrapping. Anything unusable falls
 * back to the generic word rather than truncating a real name into nonsense.
 */
export function agencyNavLabel(orgName: string | null | undefined): string {
  const name = String(orgName ?? "").trim();
  if (!name) return "Agency";
  if (name.length <= 12) return name;
  const first = name.split(/\s+/)[0] ?? "";
  return first.length >= 3 && first.length <= 12 ? first : "Agency";
}

export function navGroupLabel(persona: ShellPersona, orgName: string | null | undefined): string {
  return persona === "doula" ? "My practice" : agencyNavLabel(orgName);
}

/**
 * The rail. Both personas share Practice / Care library / Money; only the agency
 * carries Team and Brand+email Settings into Workspace (D1).
 */
export function shellNavGroups(
  persona: ShellPersona,
  orgName: string | null | undefined,
): ShellNavGroup[] {
  return [
    {
      label: navGroupLabel(persona, orgName),
      items: [
        { href: "/doula", label: "Home" },
        { href: "/doula/clients", label: "Clients" },
        { href: "/doula/calendar", label: "Calendar" },
      ],
    },
    {
      label: "Care library",
      items: [
        { href: "/doula/forms", label: "Forms" },
        { href: "/doula/resources", label: "Resources" },
      ],
    },
    {
      label: "Money",
      items: [{ href: "/doula/invoices", label: "Invoices" }],
    },
    {
      label: "Workspace",
      items:
        persona === "agency"
          ? [
              { href: "/doula/messages", label: "Messages" },
              { href: "/doula/team", label: "Team" },
              { href: "/doula/settings", label: "Settings" },
              { href: "/doula/profile", label: "Profile" },
            ]
          : [
              { href: "/doula/messages", label: "Messages" },
              { href: "/doula/profile", label: "Profile" },
            ],
    },
  ];
}

/** Flat nav for the mobile pill strip — the same items, in rail order. */
export function shellNavItems(persona: ShellPersona, orgName: string | null | undefined) {
  return shellNavGroups(persona, orgName).flatMap((group) => group.items);
}

/** Top-bar search. A doula has no Team or Settings to jump to, and no pipeline (D6). */
export function shellSearchTargets(persona: ShellPersona): ShellSearchTarget[] {
  const shared: ShellSearchTarget[] = [
    { label: "Home", href: "/doula", keywords: "home review revenue" },
    {
      label: persona === "agency" ? "Clients / pipeline" : "Clients",
      href: "/doula/clients",
      keywords:
        persona === "agency"
          ? "clients pipeline intake lead family board agency unassigned"
          : "clients families assigned caseload",
    },
    {
      label: "Calendar",
      href: "/doula/calendar",
      keywords: "calendar availability schedule consult",
    },
    {
      label: "Forms",
      href: "/doula/forms",
      keywords: "forms templates assign intake co-complete questions",
    },
    {
      label: "Resources",
      href: "/doula/resources",
      keywords: "resources handouts library share education",
    },
    { label: "Invoices", href: "/doula/invoices", keywords: "invoices money pay billing" },
    { label: "Messages", href: "/doula/messages", keywords: "messages inbox" },
  ];

  if (persona === "doula") {
    return [
      ...shared,
      { label: "Profile", href: "/doula/profile", keywords: "profile book consult public" },
    ];
  }

  return [
    ...shared,
    {
      label: "Team",
      href: "/doula/team",
      keywords: "team roster invite doula staff match primary agency",
    },
    {
      label: "Settings · brand",
      href: "/doula/settings",
      keywords: "settings brand portal name color footer timezone on-call",
    },
    {
      label: "Settings · email",
      href: "/doula/settings/email",
      keywords: "email templates transactional subject trigger",
    },
    { label: "Profile", href: "/doula/profile", keywords: "profile book consult public" },
  ];
}

/**
 * The "New" menu (D4). There is no in-app create-a-client form — families arrive by
 * booking a consult — so "New family" points a doula at the public profile that carries
 * her Book Consult link and QR, rather than at a button that does not exist.
 */
export function shellNewItems(persona: ShellPersona): ShellNewItem[] {
  if (persona === "doula") {
    return [
      { label: "Open clients", href: "/doula/clients" },
      { label: "New family · share Book Consult", href: "/doula/profile" },
      { label: "Form · template or assign", href: "/doula/forms" },
      { label: "Resource · write or share", href: "/doula/resources" },
      { label: "Calendar · availability", href: "/doula/calendar" },
    ];
  }
  return [
    { label: "Open pipeline", href: "/doula/clients" },
    { label: "Needs attention", href: "/doula/clients?tab=attention" },
    { label: "Import leads · CSV", href: "/doula/clients/import" },
    { label: "Form · template or assign", href: "/doula/forms" },
    { label: "Resource · write or share", href: "/doula/resources" },
    { label: "Public profile · Book Consult", href: "/doula/profile" },
    { label: "Calendar · availability", href: "/doula/calendar" },
  ];
}

/** `/doula/clients` heading (D2). A doula has families; an agency has a pipeline. */
export function clientsHeading(persona: ShellPersona): string {
  return persona === "agency" ? "Pipeline" : "Your families";
}

/**
 * The stage legend (D2). Staff stage names are agency vocabulary — an assigned doula
 * gets one plain line about what she is looking at instead of the funnel.
 */
export function clientsLegend(persona: ShellPersona): string {
  return persona === "agency"
    ? `${STAGE_LABELS.new_lead} → ${STAGE_LABELS.outreach_sent} → ${STAGE_LABELS.consult_scheduled} → ${STAGE_LABELS.consult_done} → ${STAGE_LABELS.fit_confirmed} → ${STAGE_LABELS.agreement_signed} (intent) → ${STAGE_LABELS.complete} (fit + payment) → ${STAGE_LABELS.active_care}`
    : "Everyone you are assigned to, with where their care stands.";
}

/** Empty `/doula/clients` (D3). */
export function clientsEmpty(persona: ShellPersona): { title: string; body: string } {
  return persona === "agency"
    ? {
        title: "Pipeline is empty",
        body: "Share your profile QR or send a Book Consult link.",
      }
    : {
        title: "No families yet",
        body: "Families land here once they book a consult with you or your agency assigns you. Your Book Consult link is on your public profile.",
      };
}

/** Empty "My clients" on `/doula` (D5). A family is never a lead to the doula who has her. */
export function homeClientsEmpty(persona: ShellPersona): string {
  return persona === "agency"
    ? "No assigned families yet. A Book Consult on your public profile creates a lead here."
    : "No families yet. A Book Consult on your public profile creates a family here.";
}

/** The Home header call to action, matching the board it opens. */
export function homeCtaLabel(persona: ShellPersona): string {
  return persona === "agency" ? "Open pipeline" : "Open clients";
}

/**
 * The hint under Home's "Active clients" tile (TOK-49 soft fold).
 *
 * The tile counts families a doula is assigned to; the hint says what state they are in.
 * An agency reads its own funnel there. A doula does not have one — she has two families
 * — and "1 in funnel" over their names was the second half of Vera's Priya fail. Care
 * beats capture in both voices: whoever is in active care is named first.
 */
export function homeCaseloadHint(
  persona: ShellPersona,
  counts: { inCare: number; openLeads: number },
): string {
  const inCare = Math.max(0, counts.inCare);
  const openLeads = Math.max(0, counts.openLeads);
  if (inCare > 0) return `${inCare} in care`;
  if (persona === "agency") return `${openLeads} in funnel`;
  if (openLeads === 0) return "No families yet";
  return `${openLeads} famil${openLeads === 1 ? "y" : "ies"}`;
}

/**
 * The second line on a Needs-attention row for an open lead. "Keep the funnel moving" is
 * the agency's own nudge; a doula is being told to get back to a person.
 */
export function openLeadNudge(persona: ShellPersona): string {
  return persona === "agency" ? "Keep the funnel moving" : "Check in when you can";
}

/**
 * One line over the agency board (D7) naming what an assignment-scoped list cannot show:
 * how many families in the org still have nobody named as primary.
 */
export function agencyBoardSummary(total: number, unassigned: number): string {
  const families = `${total} famil${total === 1 ? "y" : "ies"}`;
  if (total === 0) return "No families in this practice yet";
  return unassigned === 0
    ? `${families} · every one has a primary doula`
    : `${families} · ${unassigned} without a primary doula`;
}
