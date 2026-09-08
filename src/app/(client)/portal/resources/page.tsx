import { format } from "date-fns";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { resources, resourceShares } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { markResourceDoneAction } from "@/app/actions/client";
import { Badge } from "@/components/ui/badge";
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
    )
    .orderBy(desc(resourceShares.sharedAt));

  if (rows.length === 0) {
    return <EmptyState title="No handouts yet" body="Shared resources will appear here." />;
  }

  const unread = rows.filter((row) => !row.share.completedAt).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Resources
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {unread === 0
            ? "You have read everything your doula shared."
            : `${unread} new from your doula.`}
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(({ share, resource }) => (
          <article
            key={share.id}
            className="flex flex-col rounded-xl bg-card p-4 ring-1 ring-teal/15"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-heading text-lg text-teal-ink">{resource.title}</h2>
              <Badge
                variant="secondary"
                className={
                  share.completedAt ? "bg-teal/12 text-teal-ink" : "bg-coral/12 text-coral"
                }
              >
                {share.completedAt ? "Read" : "New"}
              </Badge>
            </div>
            <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
              {resource.kind} · shared {format(share.sharedAt, "MMM d")}
            </p>
            {resource.body ? (
              <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                {resource.body}
              </p>
            ) : null}
            {(resource.tags ?? []).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(resource.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-teal/10 text-teal-ink">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3 pt-1">
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[12.5px] font-semibold text-teal hover:underline"
                >
                  Open link ↗
                </a>
              ) : null}
              {share.completedAt ? (
                <p className="text-[12.5px] text-teal">
                  Marked read {format(share.completedAt, "MMM d")}
                </p>
              ) : (
                <form action={markResourceDoneAction.bind(null, share.id)}>
                  <Button type="submit" size="sm" variant="outline">
                    Mark read
                  </Button>
                </form>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
