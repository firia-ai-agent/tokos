import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalMessages } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { sendPortalMessageAction } from "@/app/actions/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/brand/states";

export default async function PortalMessagesPage() {
  const session = await requireClient();
  const db = getDb();
  const rows = await db
    .select()
    .from(portalMessages)
    .where(
      and(
        eq(portalMessages.organizationId, session.organizationId),
        eq(portalMessages.clientId, session.clientId),
      ),
    )
    .orderBy(desc(portalMessages.sentAt));

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Messages</h2>
      {rows.length === 0 ? (
        <EmptyState title="No messages yet" body="Write your doula here. This stays in Tokos." />
      ) : (
        <div className="space-y-2">
          {rows.map((message) => (
            <div key={message.id} className="rounded-xl border bg-card p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {message.direction === "inbound" ? "You" : "Your doula"}
              </p>
              <p>{message.body}</p>
            </div>
          ))}
        </div>
      )}
      <form action={sendPortalMessageAction} className="space-y-2">
        <Textarea name="body" required placeholder="Reply to your doula" />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
