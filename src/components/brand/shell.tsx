import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";
import { ShellNav, type ShellNavItem } from "@/components/brand/shell-nav";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-teal-ink px-4 py-2 text-center text-[11px] tracking-[0.04em] text-cloud/85">
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
  children,
}: {
  brand?: string;
  brandHint?: string;
  personName?: string;
  personMeta?: string;
  nav: ShellNavItem[];
  children: React.ReactNode;
  /** retained for callers; shell chrome is shared */
  tone?: "doula" | "client";
}) {
  const initials = (personName ?? "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-screen flex-col bg-cloud">
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col bg-teal-ink px-3 py-5 lg:flex">
          <div className="px-2 pb-5">
            <Link href={nav[0]?.href ?? "/"} className="block">
              <p className="font-heading text-[18px] font-semibold leading-none tracking-[0.28em] text-cloud">
                {brand.toUpperCase()}
              </p>
              {brandHint ? (
                <p className="mt-1.5 max-w-[11rem] text-[11.5px] font-medium leading-snug text-coral">
                  {brandHint}
                </p>
              ) : null}
            </Link>
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
            <ShellNav items={nav} variant="rail" />
          </div>
          <div className="mt-auto border-t border-white/10 px-2 pt-4">
            {personName ? (
              <div className="mb-3 flex items-center gap-2.5">
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
            <div className="overflow-x-auto px-2 py-1.5">
              <ShellNav items={nav} variant="pills" />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-7 sm:px-6 lg:px-9 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
