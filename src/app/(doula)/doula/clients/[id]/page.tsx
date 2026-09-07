import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  contracts,
  formAssignments,
  formTemplates,
  invoices,
  pipelineEvents,
  portalMessages,
} from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { allowedDoulaActions } from "@/lib/pipeline";
import { getFunnelFlags } from "@/lib/funnel";
import { stageLabel } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import {
  confirmFitAction,
  sendContractAction,
  sendIntroAction,
  startCareAction,
  startFitAction,
  sendClientMessageAction,
  coCompleteFormAction,
} from "@/app/actions/doula";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client) notFound();

  const funnel = await getFunnelFlags(staff.organizationId, client.id);
  const actions = allowedDoulaActions(funnel.stage, funnel.flags);
  const events = await db
    .select()
    .from(pipelineEvents)
    .where(eq(pipelineEvents.clientId, client.id))
    .orderBy(desc(pipelineEvents.at));
  const contractRows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.clientId, client.id))
    .orderBy(desc(contracts.createdAt));
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.clientId, client.id));
  const messages = await db
    .select()
    .from(portalMessages)
    .where(eq(portalMessages.clientId, client.id))
    .orderBy(desc(portalMessages.sentAt));
  const forms = await db
    .select({ assignment: formAssignments, template: formTemplates })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .where(eq(formAssignments.clientId, client.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl text-teal-ink">{client.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            {client.email} · due {client.edd ?? "—"}
          </p>
        </div>
        <Badge className="text-sm">{stageLabel(funnel.stage)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match-to-contract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Fit confirmed: {funnel.flags.fitConfirmed ? "yes" : "no"} · Signed:{" "}
            {funnel.flags.agreementSigned ? "yes (intent)" : "no"} · Payment:{" "}
            {funnel.flags.paymentCleared ? "cleared" : "due"}
          </p>
          <div className="flex flex-wrap gap-2">
            {actions.includes("send_intro") ? (
              <form action={sendIntroAction.bind(null, client.id)}>
                <Button type="submit">Send intro</Button>
              </form>
            ) : null}
            {actions.includes("start_fit") ? (
              <form action={startFitAction.bind(null, client.id)}>
                <Button type="submit" variant="outline">
                  Start fit
                </Button>
              </form>
            ) : null}
            {actions.includes("confirm_fit") ? (
              <form action={confirmFitAction.bind(null, client.id)}>
                <Button type="submit">Confirm fit</Button>
              </form>
            ) : null}
            {actions.includes("send_contract") ? (
              <form action={sendContractAction.bind(null, client.id)}>
                <Button type="submit" variant="secondary">
                  Send contract
                </Button>
              </form>
            ) : null}
            {actions.includes("start_care") ? (
              <form action={startCareAction.bind(null, client.id)}>
                <Button type="submit">Start active care</Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contracts & invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contractRows.length === 0 ? <p>No contract sent yet.</p> : null}
            {contractRows.map((contract) => (
              <p key={contract.id}>
                {contract.packageLabel} · {contract.status} ·{" "}
                {formatCents(contract.amountCents)}
              </p>
            ))}
            {invoiceRows.map((invoice) => (
              <p key={invoice.id}>
                {invoice.number} · {invoice.status} · {formatCents(invoice.amountCents)}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stage history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {events.map((event) => (
              <p key={event.id}>
                {event.fromStage ?? "—"} → {event.toStage} · {event.reason}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forms (co-complete)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {forms.map(({ assignment, template }) => (
            <form key={assignment.id} action={coCompleteFormAction} className="space-y-3 rounded-lg border p-3">
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <p className="font-medium">
                {template.title}{" "}
                <Badge variant="outline">{assignment.status}</Badge>
              </p>
              {template.schemaJson.fields.map((field) => (
                <div key={field.id} className="space-y-1">
                  <label className="text-sm" htmlFor={`${assignment.id}-${field.id}`}>
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <Textarea id={`${assignment.id}-${field.id}`} name={`field-${field.id}`} />
                  ) : (
                    <Input id={`${assignment.id}-${field.id}`} name={`field-${field.id}`} />
                  )}
                </div>
              ))}
              <Button type="submit" size="sm" variant="outline">
                Save with client
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portal messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg bg-muted p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {message.direction === "outbound" ? "You" : "Client"}
                </p>
                <p>{message.body}</p>
              </div>
            ))}
          </div>
          <form action={sendClientMessageAction} className="space-y-2">
            <input type="hidden" name="clientId" value={client.id} />
            <Textarea name="body" required placeholder="Write to this family" />
            <Button type="submit">Send</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
