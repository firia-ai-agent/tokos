import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formAssignments, formTemplates } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { completeFormAction } from "@/app/actions/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/brand/states";

export default async function PortalFormsPage() {
  const session = await requireClient();
  const db = getDb();
  const rows = await db
    .select({ assignment: formAssignments, template: formTemplates })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .where(
      and(
        eq(formAssignments.organizationId, session.organizationId),
        eq(formAssignments.clientId, session.clientId),
      ),
    );

  if (rows.length === 0) {
    return <EmptyState title="No forms yet" body="Your doula will assign these when you are ready." />;
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl text-teal-ink">Forms</h2>
      {rows.map(({ assignment, template }) => (
        <form key={assignment.id} action={completeFormAction} className="space-y-3 rounded-xl border bg-card p-4">
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{template.title}</h3>
            <Badge variant="outline">{assignment.status}</Badge>
          </div>
          {template.schemaJson.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <label className="text-sm" htmlFor={field.id}>
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <Textarea id={field.id} name={`field-${field.id}`} />
              ) : (
                <Input id={field.id} name={`field-${field.id}`} />
              )}
            </div>
          ))}
          <Button type="submit" disabled={assignment.status === "complete"}>
            {assignment.status === "complete" ? "Completed" : "Save"}
          </Button>
        </form>
      ))}
    </div>
  );
}
