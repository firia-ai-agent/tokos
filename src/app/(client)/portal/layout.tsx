import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { clientPortalChrome } from "@/lib/queries";
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

/**
 * The browser tab is client chrome too. Left to the root layout it read "Tokos — OS for
 * birth work" over a family's portal, which is the same leak as the rail (TOK-39 E4).
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "client") return {};
  const chrome = await clientPortalChrome(session.user.organizationId ?? "");
  return { title: chrome.portalName };
}

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "client") redirect("/login");

  // The client rail leads with the practice, not the product (TOK-39 E4). "Tokos" is
  // the staff shells' word; a family bought NOVA.
  const chrome = await clientPortalChrome(session.user.organizationId ?? "");

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
