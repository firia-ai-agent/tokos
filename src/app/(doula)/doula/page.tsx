import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { revenueHome, stageLabel } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DoulaHomePage() {
  const staff = await requireStaff();
  const home = await revenueHome(staff.organizationId, staff.userId);
  const firstName = (staff.name ?? "there").split(/\s+/)[0];
  const todayLabel = format(new Date(), "EEEE, MMMM d");
  const maxBar = Math.max(...home.monthBars.map((bar) => bar.cents), 1);
  const hasClearedHistory = home.monthBars.some((bar) => bar.cents > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink sm:text-[32px]">
            {greetingFor()}, {firstName}
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            {todayLabel}
            {home.reviewCount > 0
              ? ` · ${home.reviewCount} item${home.reviewCount === 1 ? "" : "s"} need your review`
              : " · practice is clear"}
          </p>
        </div>
        <Link
          href="/doula/clients"
          className="rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:bg-coral/90"
        >
          Open clients
        </Link>
      </header>

      {/* KPI strip — nova density, Cloud cards, Coral/Teal Ink emphasis */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 max-md:[&>*:last-child]:col-span-2">
        {home.kpis.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-xl bg-card p-4 ring-1 ring-teal/15"
          >
            <p className="min-h-[32px] text-[12px] font-semibold uppercase leading-[16px] tracking-[0.08em] text-muted-foreground">
              {kpi.label}
            </p>
            <p
              className={cn(
                "mt-2 font-heading text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums",
                kpi.tone === "coral" ? "text-coral" : "text-teal-ink",
              )}
            >
              {kpi.value}
            </p>
            <p
              className={cn(
                "mt-2 text-[12.5px] leading-snug",
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

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Cleared trend — real paid invoices only; no invented rails/claims */}
        <article className="rounded-xl bg-card p-5 ring-1 ring-teal/15">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl text-teal-ink">Cleared revenue</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Six-month trend from paid invoices — seed and live ledger only
              </p>
            </div>
            <p className="font-heading text-lg tabular-nums text-teal">
              {home.kpis[0]?.value}
            </p>
          </div>
          <div className="mt-6 flex h-40 items-end gap-2 sm:gap-3">
            {home.monthBars.map((bar) => {
              const height = hasClearedHistory
                ? Math.max(6, Math.round((bar.cents / maxBar) * 100))
                : 8;
              return (
                <div key={bar.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-medium tabular-nums text-teal-ink/70">
                    {bar.display}
                  </span>
                  <div className="flex h-28 w-full items-end rounded-md bg-cloud ring-1 ring-teal/10">
                    <div
                      className={cn(
                        "w-full rounded-md transition-all",
                        bar.cents > 0 ? "bg-teal" : "bg-teal/20",
                      )}
                      style={{ height: `${height}%` }}
                      title={`${bar.label}: ${bar.display}`}
                    />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {bar.label}
                  </span>
                </div>
              );
            })}
          </div>
          {!hasClearedHistory ? (
            <p className="mt-4 rounded-lg bg-cloud px-3 py-2 text-[12.5px] text-muted-foreground ring-1 ring-teal/10">
              No cleared invoices yet. When a family pays, the bar fills from the real ledger —
              not demo theater.
            </p>
          ) : null}
        </article>

        {/* Needs review — operational, not AI/claims */}
        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 bg-teal-ink px-5 py-3.5">
            <h2 className="font-heading text-lg text-cloud">Needs your review</h2>
            <p className="mt-0.5 text-[12px] text-cloud/65">
              Real pipeline items. Nothing drafts or sends itself.
            </p>
          </div>
          <ul className="divide-y divide-teal/10">
            {home.attention.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted-foreground">
                Nothing queued — clients, agreements, and invoices are clear.
              </li>
            ) : (
              home.attention.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-teal-ink">{item.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.detail}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-md bg-coral/15 px-2.5 py-1 text-[12px] font-semibold text-coral hover:bg-coral/25"
                  >
                    {item.cta}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      {/* Due-date timeline */}
      <article className="rounded-xl bg-card p-5 ring-1 ring-teal/15">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl text-teal-ink">Due-date timeline</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Active families by weeks to EDD
            </p>
          </div>
          <Badge variant="secondary" className="bg-teal/10 text-teal-ink">
            {home.timeline.length} on board
          </Badge>
        </div>
        {home.timeline.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Add due dates on client records to populate this board.
          </p>
        ) : (
          <ol className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {home.timeline.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-lg bg-cloud px-3.5 py-3 ring-1 ring-teal/10 transition hover:ring-teal/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-teal-ink">
                      <span className="mr-2 font-heading text-coral">{index + 1}</span>
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      EDD {item.eddLabel} · {stageLabel(item.stage)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-teal-ink px-2.5 py-1 text-[11px] font-semibold text-cloud">
                    {item.weeksLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </article>

      {/* Compact client list under the editorial board */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-xl text-teal-ink">My clients</h2>
          <Link href="/doula/clients" className="text-[13px] font-semibold text-teal hover:underline">
            View all
          </Link>
        </div>
        {home.clients.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-teal/15">
            No assigned families yet. A Book Consult on your public profile creates a lead here.
          </p>
        ) : (
          <div className="grid gap-2">
            {home.clients.map(({ client, stage }) => (
              <Link
                key={client.id}
                href={`/doula/clients/${client.id}`}
                className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-teal/15 transition hover:ring-teal/35"
              >
                <div>
                  <p className="text-[14px] font-semibold text-teal-ink">{client.displayName}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Due {client.edd ?? "—"} · {client.city ?? "location TBD"}
                  </p>
                </div>
                <Badge variant="secondary">{stageLabel(stage)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
