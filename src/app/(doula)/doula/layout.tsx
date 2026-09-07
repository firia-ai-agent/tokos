import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/brand/shell";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/doula", label: "Home" },
  { href: "/doula/clients", label: "Clients" },
  { href: "/doula/calendar", label: "Calendar" },
  { href: "/doula/invoices", label: "Invoices" },
  { href: "/doula/messages", label: "Messages" },
  { href: "/doula/profile", label: "Profile" },
];

export default async function DoulaLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "staff") redirect("/login");
  return (
    <AppShell
      title="Practice home"
      subtitle={`${session.user.name} · ${session.user.membershipRole}`}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
