"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { Menu, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { ProviderAvatar } from "@/components/brand/avatar";
import { ShellNav, type ShellNavGroup, type ShellNavItem } from "@/components/brand/shell-nav";
import { ShellNotifyBell } from "@/components/brand/shell-notify-bell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ShellNotifyItem } from "@/lib/home-queues";
import {
  MOBILE_NAV_CLOSE_LABEL,
  MOBILE_NAV_LABEL,
  SIGN_OUT_LABEL,
  activeNavLabel,
  mobileNavDescription,
  showsMobileNotifyBell,
} from "@/lib/shell-chrome";

/**
 * The phone's shell (TOK-73).
 *
 * Below `lg` the product used to be the desktop with the rail deleted: the brand, a face,
 * Sign out, and the whole nav as a horizontally scrolling row of pills that clipped
 * "Invoices" to "Invoic" and dragged the page sideways. Founder call — **the top bar is a
 * hamburger.** So the bar is three things wide: open nav, where you are, and (for staff)
 * who is waiting. Everything else moved inside the drawer.
 *
 * Identity is not one of the three. TOK-65 gave the product a single place that says who
 * you are — the sidebar footer — and on a phone the drawer footer *is* that sidebar
 * footer: photo, name, role, Sign out, once.
 */
export type ShellMobileBarProps = {
  brand: string;
  brandHint?: string;
  personName?: string;
  personMeta?: string;
  personPhotoFileId?: string | null;
  nav: ShellNavItem[];
  navGroups?: ShellNavGroup[];
  tone: "doula" | "client";
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
};

export function ShellMobileBar({
  brand,
  brandHint,
  personName,
  personMeta,
  personPhotoFileId = null,
  nav,
  navGroups,
  tone,
  notifyCount = 0,
  notifyItems = [],
}: ShellMobileBarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const homeHref = nav[0]?.href ?? "/";
  // The word in the bar is the word in the drawer — read off the same nav, never a second
  // table of route titles kept in sync by hand.
  const pageLabel = activeNavLabel(pathname, navGroups?.flatMap((group) => group.items) ?? nav);
  const barSubline = pageLabel ?? brandHint;

  // Arriving somewhere closes the door behind you — including on a back gesture, which no
  // click handler ever sees. Adjusting during the render that brought the new pathname is
  // React's own answer here; an effect would paint the drawer over the new page first.
  const [drawnAt, setDrawnAt] = useState(pathname);
  if (drawnAt !== pathname) {
    setDrawnAt(pathname);
    setOpen(false);
  }

  /**
   * Tapping the page you are already on does not change the pathname, so the check above
   * never fires and the drawer would sit there over the answer. One delegated listener
   * closes on any nav link rather than threading an `onClick` through `ShellNav`.
   */
  function closeOnNavigate(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-teal-ink lg:hidden">
      <div className="flex h-14 items-center gap-2 px-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            aria-label={MOBILE_NAV_LABEL}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-cloud transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud/40"
          >
            <Menu className="size-[22px]" aria-hidden />
          </SheetTrigger>

          {/* The rail, on its side. Same ground, same nav, same footer — a phone should not
              be a different product. */}
          <SheetContent
            side="left"
            showCloseButton={false}
            className="gap-0 border-r-white/10 bg-teal-ink text-cloud"
          >
            <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
              <Link href={homeHref} className="min-w-0">
                <SheetTitle className="truncate font-heading text-[18px] font-semibold leading-none tracking-[0.28em] text-cloud">
                  {brand.toUpperCase()}
                </SheetTitle>
                {brandHint ? (
                  <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-coral [text-wrap:balance]">
                    {brandHint}
                  </p>
                ) : null}
              </Link>
              <SheetDescription className="sr-only">
                {mobileNavDescription(brand)}
              </SheetDescription>
              <SheetClose
                aria-label={MOBILE_NAV_CLOSE_LABEL}
                className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-cloud/70 transition-colors hover:bg-white/10 hover:text-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud/40"
              >
                <X className="size-[18px]" aria-hidden />
              </SheetClose>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3"
              onClick={closeOnNavigate}
            >
              <ShellNav items={nav} groups={navGroups} variant="drawer" />
            </div>

            {/* The one place the product says who you are (TOK-65), on this side of `lg`. */}
            <div className="border-t border-white/10 px-5 pb-5 pt-3.5">
              {personName ? (
                <div className="mb-3 flex items-center gap-3">
                  <ProviderAvatar
                    name={personName}
                    photoFileId={personPhotoFileId}
                    size={36}
                    tone="rail"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-cloud">{personName}</p>
                    {personMeta ? (
                      <p className="truncate text-[11.5px] text-cloud/55">{personMeta}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="h-10 w-full justify-start px-2 text-[14px] text-cloud/75 hover:bg-white/10 hover:text-cloud"
                >
                  {SIGN_OUT_LABEL}
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>

        <Link href={homeHref} className="min-w-0 flex-1">
          <p className="truncate font-heading text-[15px] font-semibold leading-tight tracking-[0.2em] text-cloud">
            {brand.toUpperCase()}
          </p>
          {/* Where you are, under the mark. The page still draws its own H1 — this is the
              line you read to know the hamburger took you somewhere. */}
          {barSubline ? (
            <p className="truncate text-[11px] leading-tight text-cloud/55">{barSubline}</p>
          ) : null}
        </Link>

        {showsMobileNotifyBell(tone) ? (
          <ShellNotifyBell
            surface="rail"
            tone={tone}
            notifyCount={notifyCount}
            notifyItems={notifyItems}
            align="end"
          />
        ) : null}
      </div>
    </header>
  );
}
