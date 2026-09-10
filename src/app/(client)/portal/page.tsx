import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { clientAgreementStatuses, clientChecklist } from "@/lib/queries";
import { resourcesUnlocked } from "@/lib/resource-gate";
import { clientChrome } from "@/lib/client-brand";
import { portalBanners } from "@/lib/client-copy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import {
  formatPhoneNumber,
  locationFieldLabel,
  phoneHref,
  resolveCareTeamCard,
} from "@/lib/care-team";
import { checklistCards, openTaskCount } from "@/lib/checklist";
import { portalMessageAffordance, portalUnreadBadge } from "@/lib/message-inbox";
import { waitingQueueLink } from "@/lib/home-queues";
import { HomeHeader } from "@/components/brand/home-header";
import { ProviderAvatar } from "@/components/brand/avatar";
import { cn } from "@/lib/utils";

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ signed?: string; paid?: string }>;
}) {
  const query = await searchParams;
  const session = await requireClient();
  const checklist = await clientChecklist(session.organizationId, session.clientId);
  const firstName = (session.name ?? "there").split(/\s+/)[0];
  // The practice's own brand, edited at /doula/settings — never a hardcoded tenant name.
  const db = getDb();
  const [org] = await db
    .select({
      portalName: organizations.portalName,
      name: organizations.name,
      onCallPhone: organizations.onCallPhone,
      confidentialityBlurb: organizations.confidentialityBlurb,
    })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);
  const practice = clientChrome(org?.portalName, org?.name).portalName;

  // One resolve per render: every card names the same person the messages thread does.
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  // The arrangement behind the chores (TOK-35): package, due date, where care happens.
  const care = await resolveCareTeamCard({
    organizationId: session.organizationId,
    clientId: session.clientId,
    doulaUserId: doula.userId,
  });

  // Home must draw the same gate `/portal/resources` does, or the card promises a shelf
  // the next click refuses to open (TOK-39 E2).
  const agreement = await clientAgreementStatuses(session.organizationId, session.clientId);
  const cards = checklistCards(checklist, doula.name, {
    resourcesLocked: !resourcesUnlocked(agreement),
  });

  // `source: "organization"` means the practice is standing in for a person who has not
  // been matched yet — the card says so rather than captioning a practice "primary doula".
  const matched = doula.source !== "organization";
  const facts: { label: string; value: string; note?: string }[] = [];
  if (care.packageLabel) facts.push({ label: "Package", value: care.packageLabel });
  if (care.eddLabel) {
    facts.push({ label: "Due date", value: care.eddLabel, note: care.eddNote ?? undefined });
  }
  if (care.location) {
    facts.push({ label: locationFieldLabel(care.location.source), value: care.location.label });
  }

  // The one way to reach her, addressed from config so Home and the thread never drift.
  const messageDoula = portalMessageAffordance(doula.name);

  const banners = portalBanners(query, doula.firstName);

  const onCall = formatPhoneNumber(org?.onCallPhone);
  const onCallHref = phoneHref(org?.onCallPhone);

  return (
    <div className="space-y-4">
      {/* The copy is `client-copy.ts`, not this page (TOK-39 E6) — the old signed banner
          recited the Complete rule out loud because it was written where it was shown. */}
      {banners.map((banner) => (
        <p
          key={banner.key}
          className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20"
        >
          {banner.text}
        </p>
      ))}

      {/* Date at the top of the band, then the greeting, then the one line worth acting
          on — and that line opens the board it counts (TOK-52). It is said once: a second
          "6 to do" chip read like a queue. */}
      <HomeHeader
        dateLabel={format(new Date(), "EEEE, MMMM d")}
        eyebrow={practice}
        title={`Welcome, ${firstName}`}
        queue={openTaskCount(checklist) > 0 ? waitingQueueLink(checklist) : null}
        quiet={`Nothing waiting on you today. ${doula.firstName} will say if that changes.`}
      />

      {matched || facts.length > 0 ? (
        <section className="rounded-xl bg-card px-5 py-4 ring-1 ring-teal/15">
          <div className="flex items-center gap-3.5">
            {matched ? (
              <ProviderAvatar name={doula.name} photoFileId={care.photoFileId} size={52} />
            ) : null}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
                Your care team
              </p>
              {/* The name and the way to reach her, together. Reading who your doula is
                  and then hunting the nav for Messages was the gap (TOK-52 → TOK-56). The
                  button turns terracotta while she is waiting on you, so the affordance
                  doubles as the unread glance instead of needing a second tile. */}
              <p className="mt-1 flex flex-wrap items-center gap-2 font-heading text-[21px] font-semibold tracking-[-0.01em] text-teal-ink">
                {doula.name}
                <Link
                  href={messageDoula.href}
                  aria-label={
                    checklist.unreadMessages > 0
                      ? `${messageDoula.ariaLabel} — ${portalUnreadBadge(checklist.unreadMessages)}`
                      : messageDoula.ariaLabel
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-sans text-[12.5px] font-semibold ring-1 transition",
                    checklist.unreadMessages > 0
                      ? "bg-coral/12 text-coral ring-coral/30 hover:ring-coral/55"
                      : "bg-cloud text-teal ring-teal/20 hover:ring-teal/45",
                  )}
                >
                  <MessageCircle aria-hidden className="size-4" />
                  {messageDoula.label}
                  {checklist.unreadMessages > 0 ? (
                    <span className="rounded-full bg-coral px-1.5 text-[11px] font-semibold tabular-nums text-cloud">
                      {checklist.unreadMessages}
                    </span>
                  ) : null}
                </Link>
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {matched
                  ? ["Primary doula", care.credentialsLabel].filter(Boolean).join(" · ")
                  : "Your doula is named here as soon as you are matched"}
              </p>
            </div>
          </div>
          {facts.length > 0 ? (
            <dl className="mt-3 grid gap-x-8 gap-y-2 border-t border-teal/10 pt-3 sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="mt-0.5 text-[14px] text-teal-ink">
                    {fact.value}
                    {fact.note ? (
                      <span className="text-muted-foreground"> · {fact.note}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              "group rounded-xl bg-card px-4 py-3.5 ring-1 transition",
              card.actionable
                ? "ring-coral/30 hover:ring-coral/55"
                : "ring-teal/15 hover:ring-teal/35",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {card.label}
                  {card.key === "unreadMessages" && card.count > 0 ? (
                    <span
                      aria-hidden
                      className="inline-flex min-w-4 items-center justify-center rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-bold leading-none text-cloud tabular-nums"
                    >
                      {card.count}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                  {card.detail}
                </p>
              </div>
              {/* A locked card shows no number — see `checklistCards` (E2). */}
              {card.locked ? null : (
                <p
                  className={cn(
                    "font-heading text-[34px] font-semibold leading-none tabular-nums",
                    card.tone === "coral" ? "text-coral" : "text-teal-ink/80",
                  )}
                >
                  {card.count}
                </p>
              )}
            </div>
            {/* Every card carried an "Open →" (TOK-39 E5). Six of them, all saying the
                same thing about a card that is already a link — the arrow was chrome,
                and it crowded out the one line that carries meaning. */}
            <div className="mt-2.5">
              {/* The count is never a naked number — it always says what it counts. */}
              <p
                className={cn(
                  "text-[12.5px] font-semibold",
                  card.tone === "coral" ? "text-coral" : "text-teal-ink/70",
                )}
              >
                {card.countLabel}
              </p>
            </div>
          </Link>
        ))}
      </section>

      {/* The practice, reachable: who they are, the number that is answered, and what
          stays private. Dubsado's Home carries the same strip (TOK-35). */}
      {onCall || org?.confidentialityBlurb ? (
        <section className="rounded-xl bg-card px-5 py-4 ring-1 ring-teal/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
            {practice}
          </p>
          {onCall ? (
            <p className="mt-1.5 text-[14px] text-teal-ink">
              On call, day or night ·{" "}
              {onCallHref ? (
                <a
                  href={onCallHref}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {onCall}
                </a>
              ) : (
                <span className="font-semibold">{onCall}</span>
              )}
            </p>
          ) : null}
          {org?.confidentialityBlurb ? (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {org.confidentialityBlurb}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
