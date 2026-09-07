import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { resources, resourceShares } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { markResourceDoneAction } from "@/app/actions/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";

export default async function ResourcesPage() {
  const session = await requireClient();
  const db = getDb();
  const rows = await db
    .select({ share: resourceShares, resource: resources })
    .from(resourceShares)
    .innerJoin(resources, eq(resources.id, resourceShares.resourceId))
    .where(
      and(
        eq(resourceShares.organizationId, session.organizationId),
        eq(resourceShares.clientId, session.clientId),
      ),
    );

  if (rows.length === 0) {
    return <EmptyState title="No handouts yet" body="Shared resources will appear here." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Resources</h2>
      {rows.map(({ share, resource }) => (
        <article key={share.id} className="rounded-xl border bg-card p-4">
          <h3 className="font-medium">{resource.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{resource.body}</p>
          {!share.completedAt ? (
            <form action={markResourceDoneAction.bind(null, share.id)} className="mt-3">
              <Button type="submit" size="sm" variant="outline">
                Mark read
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-teal">Completed</p>
          )}
        </article>
      ))}
    </div>
  );
}
