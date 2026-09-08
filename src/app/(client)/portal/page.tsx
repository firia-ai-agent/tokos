import Link from "next/link";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { clientChecklist } from "@/lib/queries";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { checklistCards, checklistSummary, openTaskCount } from "@/lib/checklist";
import { Badge } from "@/components/ui/badge";
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
  const practice = org?.portalName ?? org?.name ?? "Your birth team";

  // One resolve per render: every card names the same person the messages thread does.
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  const cards = checklistCards(checklist, doula.name);
  const open = openTaskCount(checklist);

  return (
    <div className="space-y-6">
      {query.signed ? (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20">
          Signed — thank you. {doula.name} has your agreement. Your care is booked once the
          fit consult is confirmed and the first payment clears.
        </p>
      ) : null}
      {query.paid ? (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20">
          Payment received. Once your fit consult with {doula.firstName} is confirmed, your
          care is booked.
        </p>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            {practice}
          </p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink sm:text-[32px]">
            Welcome, {firstName}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")} · {checklistSummary(checklist)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open > 0 ? (
            <Badge variant="secondary" className="bg-coral/12 text-coral">
              {open} to do
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-teal/12 text-teal-ink">
              Caught up
            </Badge>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              "group rounded-xl bg-card p-4 ring-1 transition",
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
                <p className="mt-2 text-[13px] text-muted-foreground">{card.detail}</p>
              </div>
              <p
                className={cn(
                  "font-heading text-[28px] font-semibold leading-none tabular-nums",
                  card.tone === "coral" ? "text-coral" : "text-teal-ink",
                )}
              >
                {card.count}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {/* The count is never a naked number — it always says what it counts. */}
              <p
                className={cn(
                  "text-[12px] font-semibold",
                  card.tone === "coral" ? "text-coral" : "text-teal-ink/70",
                )}
              >
                {card.countLabel}
              </p>
              <p className="text-[12px] font-semibold text-teal group-hover:underline">Open →</p>
            </div>
          </Link>
        ))}
      </section>

      {org?.confidentialityBlurb || org?.onCallPhone ? (
        <section className="rounded-xl bg-card px-5 py-4 ring-1 ring-teal/15">
          {org.confidentialityBlurb ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {org.confidentialityBlurb}
            </p>
          ) : null}
          {org.onCallPhone ? (
            <p className="mt-2 text-[13px] text-teal-ink">
              <span className="font-semibold">On call</span> · {org.onCallPhone}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
