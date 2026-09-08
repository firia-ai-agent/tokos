/**
 * Transactional email templates: which variables a trigger is allowed to mention, how a
 * saved edit becomes a new immutable version, and the sample render behind the preview
 * panel.
 *
 * The variable allowlist *is* the PHI firewall for this editor. Templates are org-owned
 * free text, so the only thing standing between an owner and `{{answer_1}}` in a subject
 * line is `unknownVars` refusing the save. Nothing here reads form submissions.
 */

/** Vars every template may use, whatever its trigger. */
const COMMON_VARS = ["org_name", "client_name", "portal_url"] as const;

/** Extra vars a specific trigger supplies at enqueue time. */
const TRIGGER_VARS: Record<string, readonly string[]> = {
  client_welcome: ["profile_url"],
  client_portal_invite: ["invite_url"],
  agreement_sent: ["sign_url"],
  invoice_due: ["invoice_number"],
  doula_invited: ["invite_url", "invite_role", "token"],
  form_reminder: ["open_forms"],
};

/** What the trigger is for, in one line, above the editor. */
export const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  client_welcome: "Sent when a doula sends an intro to a new lead.",
  client_portal_invite: "Sent when a family is given portal access.",
  agreement_sent: "Sent with the care agreement, carrying the signing link.",
  invoice_due: "Sent when an invoice opens in the family's portal.",
  doula_invited: "Sent to a doula or admin invited to this workspace.",
  form_reminder: "Sent when a doula nudges a family about open forms.",
};

export function allowedVars(triggerKey: string): string[] {
  return [...COMMON_VARS, ...(TRIGGER_VARS[triggerKey] ?? [])];
}

const VAR_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function templateVars(tpl: string): string[] {
  const found = new Set<string>();
  for (const match of String(tpl ?? "").matchAll(VAR_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * Every `{{var}}` across the subject and both bodies that this trigger does not supply.
 * A non-empty result is a rejected save: an unknown var renders as an empty string at
 * send time, and the ones an author would reach for are exactly the form answers this
 * editor must never carry.
 */
export function unknownVars(
  triggerKey: string,
  parts: { subjectTpl?: string; bodyTextTpl?: string; bodyHtmlTpl?: string },
): string[] {
  const allowed = new Set(allowedVars(triggerKey));
  const used = new Set<string>();
  for (const part of [parts.subjectTpl, parts.bodyTextTpl, parts.bodyHtmlTpl]) {
    for (const name of templateVars(part ?? "")) used.add(name);
  }
  return [...used].filter((name) => !allowed.has(name)).sort();
}

export type TemplateContent = {
  subjectTpl: string;
  bodyTextTpl: string;
  bodyHtmlTpl: string;
};

/** A save that changed nothing does not deserve a version row. */
export function templateChanged(before: TemplateContent, after: TemplateContent): boolean {
  return (
    before.subjectTpl !== after.subjectTpl ||
    before.bodyTextTpl !== after.bodyTextTpl ||
    before.bodyHtmlTpl !== after.bodyHtmlTpl
  );
}

/**
 * Versions are append-only and numbered from the rows that exist, so a template with
 * v1..v3 publishes v4 — never a reused number, and never a gap-filling one.
 */
export function nextTemplateVersion(existing: Array<number | string | null | undefined>): number {
  let max = 0;
  for (const value of existing) {
    const n = Number(value ?? 0);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Sample values for the preview panel. Invented, never read from a client record. */
export function sampleVars(triggerKey: string, orgName: string): Record<string, string> {
  const base: Record<string, string> = {
    org_name: orgName,
    client_name: "Sample Family",
    portal_url: "https://example.com/portal",
    profile_url: "https://example.com/p/your-profile",
    invite_url: "https://example.com/invite/sample-token",
    invite_role: "Doula",
    token: "sample-token",
    sign_url: "https://example.com/portal/contract",
    invoice_number: "INV-1001",
    open_forms: "2",
  };
  const allowed = new Set(allowedVars(triggerKey));
  return Object.fromEntries(Object.entries(base).filter(([key]) => allowed.has(key)));
}

/**
 * Preview-only render. `renderTemplate` in `@/lib/phi` is the one used for real sends —
 * this one is deliberately dumb and never touches the outbox.
 */
export function renderPreview(tpl: string, vars: Record<string, string>): string {
  return String(tpl ?? "").replace(VAR_PATTERN, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
