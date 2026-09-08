import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { AppShell } from "@/components/brand/shell";
import type { ShellNavGroup } from "@/components/brand/shell-nav";
import { shellAttention } from "@/lib/queries";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/doula", label: "Home" },
  { href: "/doula/clients", label: "Clients" },
  { href: "/doula/calendar", label: "Calendar" },
  { href: "/doula/invoices", label: "Invoices" },
  { href: "/doula/messages", label: "Messages" },
  { href: "/doula/profile", label: "Profile" },
];

const navGroups: ShellNavGroup[] = [
  {
    label: "Practice",
    items: [
      { href: "/doula", label: "Home" },
      { href: "/doula/clients", label: "Clients" },
      { href: "/doula/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Money",
    items: [{ href: "/doula/invoices", label: "Invoices" }],
  },
  {
    label: "Workspace",
    items: [
      { href: "/doula/messages", label: "Messages" },
      { href: "/doula/profile", label: "Profile" },
    ],
  },
];

function roleLabel(role?: string | null) {
  if (role === "owner") return "Founder";
  if (role === "admin") return "Admin";
  return "Doula";
}

export default async function DoulaLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "staff") redirect("/login");

  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.user.organizationId ?? ""))
    .limit(1);

  const attention = session.user.id
    ? await shellAttention(session.user.organizationId ?? "", session.user.id)
    : { count: 0, items: [] };

  const role = roleLabel(session.user.membershipRole);
  const orgName = org?.name ?? "Practice";
  const personMeta = `${role} · ${orgName}`;

  return (
    <AppShell
      brand="Tokos"
      brandHint="Birth work, kept whole"
      personName={session.user.name ?? "Doula"}
      personMeta={personMeta}
      nav={nav}
      navGroups={navGroups}
      tone="doula"
      notifyCount={attention.count}
      notifyItems={attention.items}
      newHref="/doula/clients"
    >
      {children}
    </AppShell>
  );
}
