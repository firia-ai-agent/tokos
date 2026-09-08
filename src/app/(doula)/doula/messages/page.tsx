import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, portalMessages } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { messageStamp, messageStampFull, previewLine, summarizeThreads } from "@/lib/messages";
import { EmptyState } from "@/components/brand/states";
import { Badge } from "@/components/ui/badge";

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
        body="Two-way portal messages live here, one thread per family. No SMS in this milestone."
      />
    );
  }

  // One row per family instead of one per message: the inbox is a list of conversations.
  const threads = summarizeThreads(
    rows.map((row) => ({
      clientId: row.client.id,
      clientName: row.client.preferredName ?? row.client.displayName,
      message: row.message,
    })),
  );
  const now = new Date();
  const waiting = threads.filter((thread) => thread.unreadInbound > 0).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Messages
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {threads.length} thread{threads.length === 1 ? "" : "s"} ·{" "}
          {waiting === 0 ? "nothing waiting on you" : `${waiting} waiting on you`}
        </p>
      </header>

      <div className="grid gap-2.5">
        {threads.map((thread) => (
          <Link
            key={thread.clientId}
            href={`/doula/clients/${thread.clientId}`}
            className="group rounded-xl bg-card p-4 ring-1 ring-teal/15 transition hover:ring-teal/35"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex items-center gap-2 font-medium text-teal-ink">
                {thread.clientName}
                {thread.unreadInbound > 0 ? (
                  <Badge variant="secondary" className="bg-coral/12 text-coral">
                    {thread.unreadInbound} unread
                  </Badge>
                ) : null}
              </p>
              <p
                className="text-[12px] text-muted-foreground"
                title={messageStampFull(thread.lastSentAt)}
              >
                {messageStamp(thread.lastSentAt, now)}
              </p>
            </div>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              <span className="font-semibold text-teal-ink/70">
                {thread.lastDirection === "outbound" ? "You: " : ""}
              </span>
              {previewLine(thread.lastBody)}
            </p>
            <p className="mt-2.5 text-[12px] font-semibold text-teal group-hover:underline">
              Open thread →
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
