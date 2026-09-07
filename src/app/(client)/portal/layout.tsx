import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/brand/shell";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/portal", label: "Home" },
  { href: "/portal/forms", label: "Forms" },
  { href: "/portal/resources", label: "Resources" },
  { href: "/portal/contract", label: "Agreement" },
  { href: "/portal/pay", label: "Pay" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/calendar", label: "Consults" },
  { href: "/portal/profile", label: "Profile" },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "client") redirect("/login");
  return (
    <AppShell title="Your care portal" subtitle={session.user.name ?? "Client"} nav={nav}>
      {children}
    </AppShell>
  );
}
