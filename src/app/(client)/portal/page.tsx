import Link from "next/link";
import { requireClient } from "@/lib/tenancy";
import { clientChecklist, stageLabel } from "@/lib/queries";
import { getFunnelFlags } from "@/lib/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ signed?: string; paid?: string }>;
}) {
  const query = await searchParams;
  const session = await requireClient();
  const checklist = await clientChecklist(session.organizationId, session.clientId);
  const funnel = await getFunnelFlags(session.organizationId, session.clientId);

  const items = [
    { href: "/portal/forms", label: "Incomplete forms", count: checklist.incompleteForms },
    { href: "/portal/contract", label: "Agreements to sign", count: checklist.unsignedContracts },
    { href: "/portal/pay", label: "Open invoices", count: checklist.openInvoices },
    { href: "/portal/messages", label: "Unread notes", count: checklist.unreadMessages },
    { href: "/portal/resources", label: "Resources to read", count: checklist.openResources },
    { href: "/portal/calendar", label: "Upcoming consults", count: checklist.upcomingConsults },
  ];

  return (
    <div className="space-y-6">
      {query.signed ? (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
          Agreement signed. That is intent — complete still waits on fit and payment.
        </p>
      ) : null}
      {query.paid ? (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
          Payment cleared. If fit is confirmed, your contract is complete.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-2xl text-teal-ink">Checklist</h2>
        <Badge>{stageLabel(funnel.stage)}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-3xl text-teal">{item.count}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
