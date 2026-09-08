import Link from "next/link";
import { format } from "date-fns";
import { requireClient } from "@/lib/tenancy";
import { clientChecklist, stageLabel } from "@/lib/queries";
import { getFunnelFlags } from "@/lib/funnel";
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
  const funnel = await getFunnelFlags(session.organizationId, session.clientId);
  const firstName = (session.name ?? "there").split(/\s+/)[0];

  const items = [
    {
      href: "/portal/forms",
      label: "Forms",
      detail: "Getting-to-know-you and preferences",
      count: checklist.incompleteForms,
      tone: "teal" as const,
    },
    {
      href: "/portal/contract",
      label: "Agreement",
      detail: "Review and sign when ready",
      count: checklist.unsignedContracts,
      tone: "coral" as const,
    },
    {
      href: "/portal/pay",
      label: "Pay",
      detail: "Open invoices in your portal",
      count: checklist.openInvoices,
      tone: "coral" as const,
    },
    {
      href: "/portal/messages",
      label: "Messages",
      detail: "Notes from your doula",
      count: checklist.unreadMessages,
      tone: "teal" as const,
    },
    {
      href: "/portal/resources",
      label: "Resources",
      detail: "Handouts shared for birth prep",
      count: checklist.openResources,
      tone: "teal" as const,
    },
    {
      href: "/portal/calendar",
      label: "Consults",
      detail: "Upcoming fit visits",
      count: checklist.upcomingConsults,
      tone: "teal" as const,
    },
  ];

  const due = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {query.signed ? (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20">
          Agreement signed. That is intent — complete still waits on fit and payment.
        </p>
      ) : null}
      {query.paid ? (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20">
          Payment cleared. If fit is confirmed, your contract is complete.
        </p>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            NOVA Birth Prep
          </p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink sm:text-[32px]">
            Welcome, {firstName}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")}
            {due > 0 ? ` · ${due} item${due === 1 ? "" : "s"} on your checklist` : " · you are caught up"}
          </p>
        </div>
        <Badge className="bg-teal-ink text-cloud hover:bg-teal-ink">{stageLabel(funnel.stage)}</Badge>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl bg-card p-4 ring-1 ring-teal/15 transition hover:ring-teal/35"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">{item.detail}</p>
              </div>
              <p
                className={cn(
                  "font-heading text-[28px] font-semibold leading-none tabular-nums",
                  item.count > 0 && item.tone === "coral" ? "text-coral" : "text-teal-ink",
                )}
              >
                {item.count}
              </p>
            </div>
            <p className="mt-4 text-[12px] font-semibold text-teal group-hover:underline">
              Open →
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
