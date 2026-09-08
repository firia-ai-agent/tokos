import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, portalMessages } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { unreadFor } from "@/lib/messages";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { clientChrome } from "@/lib/client-brand";
import {
  markPortalMessagesReadAction,
  sendPortalMessageAction,
} from "@/app/actions/client";
import { MessageComposer, MessageThread } from "@/components/brand/messages";
import { MarkThreadRead } from "@/components/brand/mark-thread-read";

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
    .orderBy(asc(portalMessages.sentAt));

  const [org] = await db
    .select({ portalName: organizations.portalName, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);
  const practice = clientChrome(org?.portalName, org?.name).portalName;

  // The thread is with a person, so it is signed with that person's name (TOK-38).
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  const unread = unreadFor(rows, "client");

  return (
    <div className="space-y-5">
      {/* Reading the thread is what clears the unread count on Home. */}
      <MarkThreadRead unread={unread} action={markPortalMessagesReadAction} />

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          {practice}
        </p>
        <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Messages
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {rows.length === 0
            ? `One thread with ${doula.name}, kept inside your portal.`
            : unread > 0
              ? `${unread} new from ${doula.firstName}.`
              : `You are up to date with ${doula.firstName}.`}
        </p>
      </header>

      <div className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
        <MessageThread
          messages={rows}
          viewer="client"
          theirName={doula.name}
          emptyTitle="Start the conversation"
          emptyBody={`Ask about a visit, a symptom you are wondering about, or anything on your mind. ${doula.firstName} answers here, and it all stays in your portal.`}
        />
        <MessageComposer
          action={sendPortalMessageAction}
          placeholder={`Write to ${doula.firstName}…`}
          hint="Stays in your portal. Not a text, not an email thread."
          className="mt-5"
        />
      </div>
    </div>
  );
}
