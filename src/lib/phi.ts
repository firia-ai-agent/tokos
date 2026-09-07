const BLOCKED = /note|diagnos|health|pregnan|birth.?log|visit.?note|\bphi\b|ssn|medical|clinical/i;

export function assertPhiFree(
  payload: Record<string, unknown> | undefined,
  context: string,
) {
  if (!payload) return;
  for (const [key, value] of Object.entries(payload)) {
    if (BLOCKED.test(key)) {
      throw new Error(`PHI firewall: blocked key "${key}" in ${context}`);
    }
    if (typeof value === "string" && BLOCKED.test(value) && value.length > 40) {
      throw new Error(`PHI firewall: blocked value in ${context}`);
    }
  }
}

export function phiSafeIds(input: {
  organizationId?: string;
  clientId?: string;
  contractId?: string;
  invoiceId?: string;
  engagementId?: string;
}) {
  const out: Record<string, string> = {};
  if (input.organizationId) out.organization_id = input.organizationId;
  if (input.clientId) out.client_id = input.clientId;
  if (input.contractId) out.contract_id = input.contractId;
  if (input.invoiceId) out.invoice_id = input.invoiceId;
  if (input.engagementId) out.engagement_id = input.engagementId;
  assertPhiFree(out, "phiSafeIds");
  return out;
}

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  assertPhiFree(vars, "email template vars");
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
