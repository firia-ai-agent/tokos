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
    <AppShell
      brand="Tokos"
      brandHint="NOVA Birth Prep"
      personName={session.user.name ?? "Client"}
      personMeta="Your care portal"
      nav={nav}
      tone="client"
    >
      {children}
    </AppShell>
  );
}
