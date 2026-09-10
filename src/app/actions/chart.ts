"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/tenancy";
import { setChartSharePolicy } from "@/lib/chart/access";
import { CARE_PLAN_SHAREABLE_POLICY, DEFAULT_SHARE_POLICY } from "@/lib/chart/share-policy";
import { CHART_DOCUMENT_KEYS, type ChartDocumentKey } from "@/lib/chart/field-defs";

/**
 * Share and revoke for chart records (TOK-45).
 *
 * The actions carry no authority of their own: `setChartSharePolicy` runs the ACL, the
 * signed check and the audit write, and throws `Forbidden` on anything it does not like.
 * That matters most here — a server action is a POST endpoint, so a doula who is not on
 * this family's team posting a care plan id gets the same refusal as one who never saw a
 * link to it.
 *
 * The posted document key and policy are validated, never cast: the whole point of
 * `SHAREABLE_POLICIES` is that "which policies may this document reach" is a table, and a
 * string from a form is exactly the input it exists to answer.
 */

function documentKey(raw: FormDataEntryValue | null): ChartDocumentKey {
  const value = String(raw ?? "").trim();
  const match = CHART_DOCUMENT_KEYS.find((key) => key === value);
  if (!match) throw new Error("Forbidden");
  return match;
}

function revalidateChart(clientId?: string) {
  if (clientId) revalidatePath(`/doula/clients/${clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/passport");
}

/**
 * Open a signed record to the family. The default is the care plan's shareable policy —
 * the one thing Faith's K1 says is safe to hand back — and a birth log may only be posted
 * with `shared_summary`, which still shows no clinical field.
 */
export async function shareChartRecordAction(formData: FormData) {
  const staff = await requireStaff();
  const document = documentKey(formData.get("document"));
  const recordId = String(formData.get("recordId") ?? "").trim();
  const policy = String(formData.get("policy") ?? CARE_PLAN_SHAREABLE_POLICY).trim();

  await setChartSharePolicy({
    actor: staff,
    document,
    recordId,
    policy,
  });

  revalidateChart(String(formData.get("clientId") ?? "").trim() || undefined);
}

/** Close a record back to `staff_only`. Always available to whoever may share it. */
export async function revokeChartShareAction(formData: FormData) {
  const staff = await requireStaff();
  const document = documentKey(formData.get("document"));
  const recordId = String(formData.get("recordId") ?? "").trim();

  await setChartSharePolicy({
    actor: staff,
    document,
    recordId,
    policy: DEFAULT_SHARE_POLICY,
  });

  revalidateChart(String(formData.get("clientId") ?? "").trim() || undefined);
}
