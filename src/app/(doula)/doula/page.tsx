import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { needsAttentionCards, revenueHome } from "@/lib/queries";
import { migrateStage, staffStageLabel } from "@/lib/pipeline";
import { reasonSummary } from "@/lib/needs-attention";
import { serviceTypeLabel } from "@/lib/lead-fields";
import { homeClientsEmpty, homeCtaLabel, shellPersona } from "@/lib/shell-persona";
import { REVIEW_BOARD_HREF, reviewQueueLink } from "@/lib/home-queues";
import {
  barHeightPercent,
  clearedTrend,
  edgeClass,
  familyCard,
  familyCards,
  type FamilyCard,
} from "@/lib/home-density";
import { HomeHeader } from "@/components/brand/home-header";
import { cn } from "@/lib/utils";

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The dense family card both Home lists render (TOK-52).
 *
 * Name and stage on the top line, then the facts a doula actually triages on — service,
 * EDD with gestation, where she came from and when she was last touched — then money, then
 * the reasons she is in the queue. Terracotta down the left edge means today.
 */
function FamilyRow({ card, reasons }: { card: FamilyCard; reasons?: boolean }) {
  return (
    <Link
      href={card.href}
      className={cn(
        "block rounded-lg bg-card px-3.5 py-2.5 ring-1 ring-teal/15 transition hover:ring-teal/40",
        edgeClass(card.needsAction),
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-semibold text-teal-ink">{card.name}</p>
        <span className="shrink-0 rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal-ink">
          {card.stageLabel}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[12.5px] leading-snug text-muted-foreground">
          {card.facts.join(" · ")}
        </p>
        {/* Money is never the fact that gets truncated away. */}
        {card.money ? (
          <span
            className={cn(
              "shrink-0 text-[12.5px] font-semibold tabular-nums",
              card.money.tone === "coral" ? "text-coral" : "text-teal",
            )}
          >
            {card.money.label}
          </span>
        ) : null}
      </div>
      {reasons && card.attention ? (
        <p className="mt-0.5 truncate text-[12px] font-semibold text-coral">{card.attention}</p>
      ) : null}
    </Link>
  );
}

export default async function DoulaHomePage() {
  const staff = await requireStaff();
  // TOK-34 D5: "lead" is agency vocabulary. To the doula who will be at the birth, the
  // person who books a consult is a family from the first minute.
  const persona = shellPersona(staff.membershipRole);
  const [home, attention] = await Promise.all([
    // Persona reaches the KPI hints too: "1 in funnel" over a doula's two families was
    // the other half of the TOK-49 Priya fail.
    revenueHome(staff.organizationId, staff.userId, persona),
    // Same rules the board and the leads tab use (TOK-49); an agency sees the practice,
    // a doula sees her own families. The record rides along so the card can carry the
    // same facts the pipeline board does (TOK-52 density).
    needsAttentionCards(
      staff.organizationId,
      persona === "agency" ? {} : { doulaUserId: staff.userId },
    ),
  ]);
  const firstName = (staff.name ?? "there").split(/\s+/)[0];
  const today = new Date();
  const todayLabel = format(today, "EEEE, MMMM d");

  const maxBar = Math.max(...home.monthBars.map((bar) => bar.cents), 1);
  // Six full-height ghost bars over six $0 labels is not a chart, it is a hole in the
  // fold. The panel asks first (TOK-52 density).
  const trend = clearedTrend(home.monthBars, home.clearedTotal);

  const ledgerOf = (clientId: string) => home.ledgerByClient[clientId] ?? {};

  const attentionCards = attention.slice(0, 5).map(({ row, client }) =>
    familyCard(
      {
        id: row.clientId,
        name: row.name,
        href: row.href,
        stageLabel: staffStageLabel(persona, row.stage),
        serviceType: client.serviceType,
        edd: client.edd,
        source: client.source,
        lastContactAt: client.lastContactAt,
        attention: reasonSummary(row),
        ...ledgerOf(row.clientId),
      },
      today,
    ),
  );

  // The same builder over the caseload, so a family reads identically in both lists.
  const attentionById = new Map(attention.map(({ row }) => [row.clientId, reasonSummary(row)]));
  const clientCards = familyCards(
    home.clients.map(({ client, stage, fitConfirmedAt }) => ({
      id: client.id,
      name: client.displayName,
      href: `/doula/clients/${client.id}`,
      stageLabel: staffStageLabel(
        persona,
        migrateStage(stage, { fitConfirmed: Boolean(fitConfirmedAt) }),
      ),
      serviceType: client.serviceType,
      edd: client.edd,
      source: client.source,
      lastContactAt: client.lastContactAt,
      attention: attentionById.get(client.id) ?? null,
      ...ledgerOf(client.id),
    })),
    today,
  );

  return (
    <div className="space-y-4">
      {/* "6 items need your review" was the line Vera circled: true, useful, and unlinked.
          It is the same sentence, and it opens the board it counts (TOK-52). */}
      <HomeHeader
        dateLabel={todayLabel}
        title={`${greetingFor()}, ${firstName}`}
        queue={attention.length > 0 ? reviewQueueLink(attention.length) : null}
        quiet="Practice is clear — nothing is waiting on a review today."
        action={
          <Link
            href="/doula/clients"
            className="rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:bg-coral/90"
          >
            {homeCtaLabel(persona)}
          </Link>
        }
      />

      {/* KPI strip — nova density, Cloud cards, Coral/Teal Ink emphasis */}
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5 max-md:[&>*:last-child]:col-span-2">
        {home.kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-teal/15">
            <p className="min-h-[28px] text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted-foreground">
              {kpi.label}
            </p>
            <p
              className={cn(
                "mt-1.5 font-heading text-[24px] font-semibold leading-none tracking-[-0.01em] tabular-nums",
                kpi.tone === "coral" ? "text-coral" : "text-teal-ink",
              )}
            >
              {kpi.value}
            </p>
            <p
              className={cn(
                "mt-1.5 text-[12px] leading-snug",
                kpi.tone === "coral"
                  ? "font-semibold text-coral"
                  : kpi.tone === "teal"
                    ? "font-semibold text-teal"
                    : "font-medium text-muted-foreground",
              )}
            >
              {kpi.hint}
            </p>
          </article>
        ))}
      </section>

      {/* The `min-w-0` and the explicit `grid-cols-1` on the row list below are both
          load-bearing (TOK-76): a grid track defaults to its items' max-content width, so
          one long fact line in a Needs-attention row would otherwise widen the column past
          the viewport and drag the whole page sideways — with the `truncate` inside it
          never firing, because there was nothing left to truncate against. */}
      <section className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        {/* Needs attention — rule-generated, one row per family, name once and a short
            list of reasons. Clicking a row opens that family. */}
        <article className="min-w-0 rounded-xl bg-card ring-1 ring-teal/15">
          <div className="flex items-center justify-between gap-3 rounded-t-xl bg-teal-ink px-4 py-2.5">
            <div className="min-w-0">
              <h2 className="font-heading text-[17px] leading-tight text-cloud">Needs attention</h2>
              <p className="mt-0.5 truncate text-[11.5px] text-cloud/65">
                Terracotta edge = needs action today
              </p>
            </div>
            <Link
              href={REVIEW_BOARD_HREF}
              className="shrink-0 rounded-md bg-cloud/15 px-2.5 py-1 text-[12px] font-semibold text-cloud hover:bg-cloud/25"
            >
              Open review · {attention.length}
            </Link>
          </div>
          {attentionCards.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nothing queued — every open record has a follow-up, a doula, and a review.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-1.5 p-2">
              {attentionCards.map((card) => (
                <li key={card.id}>
                  <FamilyRow card={card} reasons />
                </li>
              ))}
            </ul>
          )}
        </article>

        <div className="grid min-w-0 gap-3 content-start">
          {/* Cleared trend — real paid invoices only; no invented rails/claims */}
          <article className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-[17px] text-teal-ink">Cleared revenue</h2>
              <p className="font-heading text-[17px] tabular-nums text-teal">
                {home.kpis[0]?.value}
              </p>
            </div>
            {trend.hasHistory ? (
              <>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{trend.note}</p>
                <div
                  className="mt-3 flex items-end gap-1.5"
                  style={{ height: `${trend.chartHeight}px` }}
                >
                  {home.monthBars.map((bar) => (
                    <div key={bar.key} className="flex h-full flex-1 flex-col justify-end gap-1">
                      <div className="flex h-full w-full items-end rounded bg-cloud ring-1 ring-teal/10">
                        <div
                          className={cn("w-full rounded", bar.cents > 0 ? "bg-teal" : "bg-teal/15")}
                          style={{ height: `${barHeightPercent(bar.cents, maxBar)}%` }}
                          title={`${bar.label}: ${bar.display}`}
                        />
                      </div>
                      <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {bar.label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              // An empty chart is a chart that has not earned its space (TOK-52).
              <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
                {trend.note}{" "}
                <Link
                  href="/doula/invoices"
                  className="font-semibold text-teal underline-offset-2 hover:underline"
                >
                  Open invoices
                </Link>
              </p>
            )}
          </article>

          {/* What the six empty bars were standing in front of: the money that is actually
              moving, by family, each row opening the surface that clears it. */}
          <article className="rounded-xl bg-card ring-1 ring-teal/15">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
              <h2 className="font-heading text-[17px] text-teal-ink">Money in motion</h2>
              <Link
                href="/doula/invoices"
                className="text-[12px] font-semibold text-teal hover:underline"
              >
                Invoices
              </Link>
            </div>
            {home.moneyInMotion.length === 0 ? (
              <p className="px-4 pb-3.5 pt-1 text-[12.5px] text-muted-foreground">
                Nothing open and nothing waiting on a signature.
              </p>
            ) : (
              <ul className="divide-y divide-teal/10 px-1 pb-1 pt-1.5">
                {home.moneyInMotion.slice(0, 5).map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition hover:bg-cloud"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-teal-ink">
                          {row.name}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {row.kind} · {row.detail}
                        </span>
                      </span>
                      <span className="shrink-0 font-heading text-[15px] font-semibold tabular-nums text-coral">
                        {row.amount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>

      {/* Due-date timeline */}
      <article className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-[19px] text-teal-ink">Due-date timeline</h2>
          <p className="text-[12px] font-semibold text-muted-foreground">
            {home.timeline.length} on board · by weeks to EDD
          </p>
        </div>
        {home.timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Add due dates on client records to populate this board.
          </p>
        ) : (
          <ol className="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {home.timeline.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-lg bg-cloud px-3 py-2 ring-1 ring-teal/10 transition hover:ring-teal/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-teal-ink">
                      <span className="mr-1.5 font-heading text-coral">{index + 1}</span>
                      {item.name}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {[
                        `EDD ${item.eddLabel}`,
                        serviceTypeLabel(item.serviceType),
                        staffStageLabel(persona, item.stage),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-teal-ink px-2 py-0.5 text-[11px] font-semibold text-cloud">
                    {item.weeksLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </article>

      {/* Compact client list under the editorial board */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-[19px] text-teal-ink">My clients</h2>
          <Link
            href="/doula/clients"
            className="text-[13px] font-semibold text-teal hover:underline"
          >
            View all
          </Link>
        </div>
        {clientCards.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-6 text-center text-sm text-muted-foreground ring-1 ring-teal/15">
            {homeClientsEmpty(persona)}
          </p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {clientCards.map((card) => (
              <FamilyRow key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
