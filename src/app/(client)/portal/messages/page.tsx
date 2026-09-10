import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, portalMessages } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { unreadFor } from "@/lib/messages";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { resolveCareTeamCard } from "@/lib/care-team";
import { clientChrome } from "@/lib/client-brand";
import {
  COMPOSER_COPY,
  MESSAGES_TITLE,
  portalHeaderLine,
  portalThreadEmpty,
  portalUnreadBadge,
} from "@/lib/message-inbox";
import {
  markPortalMessagesReadAction,
  sendPortalMessageAction,
} from "@/app/actions/client";
import { MessageComposer, MessageThread } from "@/components/brand/messages";
import { MarkThreadRead } from "@/components/brand/mark-thread-read";
import { ProviderAvatar } from "@/components/brand/avatar";

/**
 * `/portal/messages` — the family's one thread, with a person.
 *
 * The bar here is a text conversation with your doula, not a support ticket: her face and
 * her name sit at the top of the thread, the date dividers and bubbles carry the warmth
 * (TOK-56 shot 20), and reading the page is what clears the count on Home. Every string
 * comes from `@/lib/message-inbox` so the family side and the staff side stay one voice.
 */
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
  // Her photo and letters, the same ones Home's care card shows — one face across the
  // portal, not a name here and an avatar there.
  const care = await resolveCareTeamCard({
    organizationId: session.organizationId,
    clientId: session.clientId,
    doulaUserId: doula.userId,
  });

  const unread = unreadFor(rows, "client");
  const empty = portalThreadEmpty(doula.firstName);

  return (
    <div className="space-y-5">
      {/* Reading the thread is what clears the unread count on Home. */}
      <MarkThreadRead unread={unread} action={markPortalMessagesReadAction} />

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          {practice}
        </p>
        <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          {MESSAGES_TITLE}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {portalHeaderLine({
            total: rows.length,
            unread,
            doulaName: doula.name,
            doulaFirstName: doula.firstName,
          })}
        </p>
      </header>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
        {/* Who you are talking to, at the top of the conversation — the same header a
            phone puts on a thread, so the portal never reads like a contact form. */}
        <div className="flex items-center gap-3 border-b border-teal/12 px-4 py-3">
          <ProviderAvatar name={doula.name} photoFileId={care.photoFileId} size={42} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[19px] font-semibold tracking-[-0.01em] text-teal-ink">
              {doula.name}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {[doula.userId ? "Your doula" : practice, care.credentialsLabel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {unread > 0 ? (
            <span className="shrink-0 rounded-full bg-coral/12 px-2.5 py-1 text-[12px] font-semibold text-coral">
              {portalUnreadBadge(unread)}
            </span>
          ) : null}
        </div>

        <div className="px-4 py-4">
          <MessageThread
            messages={rows}
            viewer="client"
            theirName={doula.name}
            emptyTitle={empty.title}
            emptyBody={empty.body}
          />
        </div>

        <MessageComposer
          action={sendPortalMessageAction}
          placeholder={COMPOSER_COPY.portal.placeholder(doula.firstName)}
          hint={COMPOSER_COPY.portal.hint(doula.firstName)}
          submitLabel={COMPOSER_COPY.portal.submitLabel}
          chrome="bare"
        />
      </div>
    </div>
  );
}
