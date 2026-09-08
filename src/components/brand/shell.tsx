import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";
import { ShellNav, type ShellNavGroup, type ShellNavItem } from "@/components/brand/shell-nav";
import {
  ShellTopBar,
  type ShellNotifyItem,
} from "@/components/brand/shell-topbar";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-teal-ink px-4 py-1.5 text-center text-[11px] tracking-[0.04em] text-cloud/85">
      Demo mode — payment, signature, email, and media adapters run without paid keys.
    </div>
  );
}

export function AppShell({
  brand = "Tokos",
  brandHint,
  personName,
  personMeta,
  nav,
  navGroups,
  children,
  tone = "doula",
  notifyCount = 0,
  notifyItems = [],
  newHref,
  searchTargets,
}: {
  brand?: string;
  brandHint?: string;
  personName?: string;
  personMeta?: string;
  nav: ShellNavItem[];
  navGroups?: ShellNavGroup[];
  children: React.ReactNode;
  tone?: "doula" | "client";
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
  newHref?: string;
  searchTargets?: { label: string; href: string; keywords: string }[];
}) {
  const initials = (personName ?? "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const resolvedNewHref =
    newHref ?? (tone === "doula" ? "/doula/clients" : "/portal/forms");
  const resolvedSearch =
    searchTargets ??
    (tone === "doula"
      ? [
          { label: "Home", href: "/doula", keywords: "home review revenue" },
          { label: "Clients / pipeline", href: "/doula/clients", keywords: "clients pipeline intake lead family" },
          { label: "Calendar", href: "/doula/calendar", keywords: "calendar availability schedule consult" },
          { label: "Forms", href: "/doula/forms", keywords: "forms templates assign intake co-complete questions" },
          { label: "Resources", href: "/doula/resources", keywords: "resources handouts library share education" },
          { label: "Invoices", href: "/doula/invoices", keywords: "invoices money pay billing" },
          { label: "Messages", href: "/doula/messages", keywords: "messages inbox" },
          { label: "Team", href: "/doula/team", keywords: "team roster invite doula staff match primary agency" },
          { label: "Settings · brand", href: "/doula/settings", keywords: "settings brand portal name color footer timezone on-call" },
          { label: "Settings · email", href: "/doula/settings/email", keywords: "email templates transactional subject trigger" },
          { label: "Profile", href: "/doula/profile", keywords: "profile book consult public" },
        ]
      : [
          { label: "Home", href: "/portal", keywords: "home checklist" },
          { label: "Forms", href: "/portal/forms", keywords: "forms questions preferences" },
          { label: "Resources", href: "/portal/resources", keywords: "resources education" },
          { label: "Agreement", href: "/portal/contract", keywords: "agreement contract sign" },
          { label: "Pay", href: "/portal/pay", keywords: "pay invoice" },
          { label: "Messages", href: "/portal/messages", keywords: "messages" },
          { label: "Consults", href: "/portal/calendar", keywords: "consults calendar" },
          { label: "Profile", href: "/portal/profile", keywords: "profile" },
        ]);

  return (
    <div className="flex min-h-screen flex-col bg-cloud">
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col bg-teal-ink px-3.5 py-5 lg:flex">
          <div className="px-2 pb-4">
            <Link href={nav[0]?.href ?? "/"} className="block">
              <p className="font-heading text-[18px] font-semibold leading-none tracking-[0.28em] text-cloud">
                {brand.toUpperCase()}
              </p>
              {brandHint ? (
                <p className="mt-1.5 max-w-[11.5rem] text-[11.5px] font-medium leading-snug text-coral [text-wrap:balance]">
                  {brandHint}
                </p>
              ) : null}
            </Link>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            <ShellNav items={nav} groups={navGroups} variant="rail" />
          </div>
          <div className="mt-auto border-t border-white/10 px-2 pt-3">
            {personName ? (
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-cloud">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-cloud">{personName}</p>
                  {personMeta ? (
                    <p className="truncate text-[11px] text-cloud/55">{personMeta}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start px-2 text-cloud/70 hover:bg-white/10 hover:text-cloud"
              >
                Sign out
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-teal-ink lg:hidden">
            <div className="flex h-12 items-center justify-between px-4">
              <div>
                <p className="font-heading text-[15px] font-semibold tracking-[0.22em] text-cloud">
                  {brand.toUpperCase()}
                </p>
                {brandHint ? <p className="text-[10px] text-coral">{brandHint}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {personName ? (
                  <span className="hidden max-w-[9rem] truncate text-[12px] font-medium text-cloud/85 sm:inline">
                    {personName}
                  </span>
                ) : null}
                <form action={logoutAction}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-cloud/80 hover:bg-white/10 hover:text-cloud"
                  >
                    Sign out
                  </Button>
                </form>
              </div>
            </div>
            <div className="overflow-x-auto px-2 py-1.5">
              <ShellNav items={nav} groups={navGroups} variant="pills" />
            </div>
          </header>

          <ShellTopBar
            personName={personName}
            personMeta={personMeta}
            tone={tone}
            notifyCount={notifyCount}
            notifyItems={notifyItems}
            newHref={resolvedNewHref}
            searchTargets={resolvedSearch}
          />

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
