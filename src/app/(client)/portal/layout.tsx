import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { clientChrome } from "@/lib/client-brand";
import { AppShell } from "@/components/brand/shell";
import type { ShellNavGroup } from "@/components/brand/shell-nav";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/portal", label: "Home" },
  { href: "/portal/forms", label: "Forms" },
  { href: "/portal/resources", label: "Resources" },
  { href: "/portal/contract", label: "Agreement" },
  { href: "/portal/pay", label: "Pay" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/calendar", label: "Visits" },
  { href: "/portal/profile", label: "Profile" },
];

const navGroups: ShellNavGroup[] = [
  {
    label: "Care",
    items: [
      { href: "/portal", label: "Home" },
      { href: "/portal/forms", label: "Forms" },
      { href: "/portal/resources", label: "Resources" },
      { href: "/portal/messages", label: "Messages" },
      { href: "/portal/calendar", label: "Visits" },
    ],
  },
  {
    label: "Agreement",
    items: [
      { href: "/portal/contract", label: "Agreement" },
      { href: "/portal/pay", label: "Pay" },
    ],
  },
  {
    label: "You",
    items: [{ href: "/portal/profile", label: "Profile" }],
  },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "client") redirect("/login");

  const db = getDb();
  const [org] = await db
    .select({ portalName: organizations.portalName, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.user.organizationId ?? ""))
    .limit(1);

  // The client rail leads with the practice, not the product (TOK-39 E4). "Tokos" is
  // the staff shells' word; a family bought NOVA.
  const chrome = clientChrome(org?.portalName, org?.name);

  return (
    <AppShell
      brand={chrome.brand}
      brandHint={chrome.hint}
      personName={session.user.name ?? "Client"}
      personMeta={`Client · ${chrome.portalName}`}
      nav={nav}
      navGroups={navGroups}
      tone="client"
      newHref="/portal/forms"
    >
      {children}
    </AppShell>
  );
}
