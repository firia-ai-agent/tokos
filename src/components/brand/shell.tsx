import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";
import { shellSearchTargets } from "@/lib/shell-persona";
import { ProviderAvatar } from "@/components/brand/avatar";
import { ShellNav, type ShellNavGroup, type ShellNavItem } from "@/components/brand/shell-nav";
import {
  ShellTopBar,
  type ShellNewItem,
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
  personPhotoFileId = null,
  nav,
  navGroups,
  children,
  tone = "doula",
  notifyCount = 0,
  notifyItems = [],
  newHref,
  newItems,
  searchTargets,
}: {
  brand?: string;
  brandHint?: string;
  personName?: string;
  personMeta?: string;
  /**
   * The signed-in person's selected headshot, if she has uploaded one (TOK-65).
   *
   * The shell used to draw its own initials from `personName` and nothing else, so a
   * doula who had just attached a photo saw her face on her profile and two grey letters
   * in the rail underneath it. There is one Media id for a person and this is where it
   * enters the chrome; `ProviderAvatar` does the rest, and never falls back while it is set.
   */
  personPhotoFileId?: string | null;
  nav: ShellNavItem[];
  navGroups?: ShellNavGroup[];
  children: React.ReactNode;
  tone?: "doula" | "client";
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
  newHref?: string;
  newItems?: ShellNewItem[];
  searchTargets?: { label: string; href: string; keywords: string }[];
}) {
  const resolvedNewHref =
    newHref ?? (tone === "doula" ? "/doula/clients" : "/portal/forms");
  // The staff shell builds its own targets per persona (TOK-34 D6) and passes them in;
  // a doula must not be able to search her way to Team or Brand settings.
  const resolvedSearch =
    searchTargets ??
    (tone === "doula"
      ? shellSearchTargets("doula")
      : [
          { label: "Home", href: "/portal", keywords: "home checklist" },
          { label: "Forms", href: "/portal/forms", keywords: "forms questions preferences" },
          { label: "Resources", href: "/portal/resources", keywords: "resources education" },
          { label: "Agreement", href: "/portal/contract", keywords: "agreement contract sign" },
          { label: "Pay", href: "/portal/pay", keywords: "pay invoice" },
          { label: "Messages", href: "/portal/messages", keywords: "messages" },
          { label: "Visits", href: "/portal/calendar", keywords: "visits consults calendar fit" },
          { label: "Profile", href: "/portal/profile", keywords: "profile" },
        ]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
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
            {/* The only place the product says who you are (TOK-65): photo, name, role,
                Sign out — persistent, beside the nav, and never repeated in the top bar. */}
            {personName ? (
              <div className="mb-2.5 flex items-center gap-2.5">
                <ProviderAvatar
                  name={personName}
                  photoFileId={personPhotoFileId}
                  size={32}
                  tone="rail"
                />
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
                  <span className="flex items-center gap-2">
                    <ProviderAvatar
                      name={personName}
                      photoFileId={personPhotoFileId}
                      size={24}
                      tone="rail"
                    />
                    <span className="hidden max-w-[9rem] truncate text-[12px] font-medium text-cloud/85 sm:inline">
                      {personName}
                    </span>
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
            tone={tone}
            notifyCount={notifyCount}
            notifyItems={notifyItems}
            newHref={resolvedNewHref}
            newItems={newItems}
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
