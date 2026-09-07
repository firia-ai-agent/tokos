import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, portalMessages } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { EmptyState } from "@/components/brand/states";
import Link from "next/link";

export default async function DoulaMessagesPage() {
  const staff = await requireStaff();
  const db = getDb();
  const rows = await db
    .select({ message: portalMessages, client: clients })
    .from(portalMessages)
    .innerJoin(clients, eq(clients.id, portalMessages.clientId))
    .where(eq(portalMessages.organizationId, staff.organizationId))
    .orderBy(desc(portalMessages.sentAt));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Inbox is quiet"
        body="Two-way portal messages live here. No SMS in this milestone."
      />
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-2xl text-teal-ink">Messages</h2>
      {rows.map(({ message, client }) => (
        <Link
          key={message.id}
          href={`/doula/clients/${client.id}`}
          className="block rounded-xl border bg-card p-4"
        >
          <p className="text-sm font-medium">{client.displayName}</p>
          <p className="text-sm text-muted-foreground">{message.body}</p>
        </Link>
      ))}
    </div>
  );
}
