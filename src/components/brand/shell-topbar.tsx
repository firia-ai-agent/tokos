"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REVIEW_BOARD_HREF, type ShellNotifyItem } from "@/lib/home-queues";
import { cn } from "@/lib/utils";

/**
 * The bell's rows are built by the rules, not here (TOK-53) — one per family, with her
 * issues attached. Re-exported so the shell keeps importing the shape from the component
 * that draws it.
 */
export type { ShellNotifyItem } from "@/lib/home-queues";

/** One entry in the staff "New" menu. Built per persona in `@/lib/shell-persona`. */
export type ShellNewItem = { label: string; href: string };

/** Up to three issues under the name; the rest are counted rather than listed. */
const VISIBLE_ISSUES = 3;

/**
 * One family in the bell.
 *
 * The name carries the row and the issues sit under it in small type, terracotta where
 * money or a missed date is involved — the same urgency language the pipeline board and
 * Home already speak, so a founder reads one vocabulary across three surfaces. Focus is
 * the Cloud inset rather than the coral fill the menu primitive defaults to: a whole
 * three-line row painted accent is a shout, not a hover.
 */
function NotifyRow({ item }: { item: ShellNotifyItem }) {
  const shown = item.issues.slice(0, VISIBLE_ISSUES);
  const hidden = item.issues.length - shown.length;

  return (
    <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
      <Link
        href={item.href}
        className={cn(
          "w-full rounded-md border-l-[3px] px-2.5 py-1.5 transition-colors hover:bg-cloud focus:bg-cloud",
          item.urgent ? "border-l-coral" : "border-l-teal/25",
        )}
      >
        {/* `asChild` concatenates the menu item's own `flex items-center` onto the link
            rather than merging it away, so the stack is built one level in where nothing
            competes with it. */}
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="w-full truncate text-[13.5px] font-semibold leading-tight text-teal-ink!">
            {item.title}
          </span>
          <span className="mt-0.5 w-full">
            {shown.map((issue) => (
              <span key={issue.key} className="block truncate text-[11.5px] leading-[1.4]">
                <span
                  className={cn(
                    "font-semibold",
                    issue.urgent ? "text-coral!" : "text-teal-ink/70!",
                  )}
                >
                  {issue.label}
                </span>
                {issue.detail ? (
                  <span className="text-muted-foreground!"> · {issue.detail}</span>
                ) : null}
              </span>
            ))}
            {hidden > 0 ? (
              <span className="block text-[11px] leading-[1.4] text-muted-foreground!">
                +{hidden} more on her record
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function ShellTopBar({
  tone = "doula",
  notifyCount = 0,
  notifyItems = [],
  newHref,
  newItems,
  searchTargets,
}: {
  tone?: "doula" | "client";
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
  /** Primary New destination (intake / pipeline), and the fallback the menu opens with. */
  newHref: string;
  /**
   * Staff New menu. An agency owner opens a pipeline; an assigned doula opens her
   * clients and starts a family from her Book Consult link (TOK-34 D4).
   */
  newItems?: ShellNewItem[];
  searchTargets: { label: string; href: string; keywords: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchTargets
      .filter((target) => target.keywords.toLowerCase().includes(q) || target.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, searchTargets]);

  const placeholder =
    tone === "doula" ? "Search clients, calendar, invoices…" : "Search forms, resources, messages…";

  const newLabel = tone === "doula" ? "New" : "Open";
  const menuItems: ShellNewItem[] =
    newItems && newItems.length > 0 ? newItems : [{ label: "Open pipeline", href: newHref }];

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    if (results[0]) {
      router.push(results[0].href);
      setSearchOpen(false);
      return;
    }
    router.push(tone === "doula" ? "/doula/clients" : "/portal");
    setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-20 hidden items-center gap-2.5 border-b border-teal/15 bg-background/95 px-5 py-2.5 backdrop-blur lg:flex lg:px-8">
      <form className="relative w-full max-w-[320px]" onSubmit={onSearchSubmit} role="search">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => {
            // Allow click on result before close
            window.setTimeout(() => setSearchOpen(false), 120);
          }}
          aria-label={placeholder}
          placeholder={placeholder}
          className="w-full rounded-lg border border-teal/20 bg-card py-2 pl-9 pr-3.5 text-[13px] text-teal-ink placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
        />
        {searchOpen && query.trim() ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-teal/15 bg-card shadow-md">
            {results.length === 0 ? (
              <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                No matches in your workspace. Try Clients or Home.
              </p>
            ) : (
              <ul className="py-1">
                {results.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3 py-2 text-[13px] font-medium text-teal-ink hover:bg-secondary"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </form>

      {/* Actions, not identity (TOK-65). The name·role·avatar block that used to end
          this bar was the sidebar footer said twice; what is left here is the work:
          search, create, and who is waiting. */}
      <div className="ml-auto flex items-center gap-2.5">
        {tone === "doula" ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal px-3.5 text-[13px] font-semibold text-cloud",
                "transition-colors hover:bg-teal-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40",
              )}
            >
              <Plus className="size-[15px]" strokeWidth={2.5} aria-hidden />
              {newLabel}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Create / intake
              </DropdownMenuLabel>
              {menuItems.map((item) => (
                <DropdownMenuItem key={`${item.href}-${item.label}`} asChild>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            href={newHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal px-3.5 text-[13px] font-semibold text-cloud transition-colors hover:bg-teal-ink"
          >
            <Plus className="size-[15px]" strokeWidth={2.5} aria-hidden />
            {newLabel}
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={
              notifyCount > 0
                ? `Notifications — ${notifyCount} ${notifyCount === 1 ? "family needs" : "families need"} your attention`
                : "Notifications — nobody is waiting on you"
            }
            className="relative flex size-9 items-center justify-center rounded-lg border border-teal/20 text-teal-ink/80 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
          >
            <Bell className="size-4" aria-hidden />
            {notifyCount > 0 ? (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-coral ring-2 ring-cloud" />
            ) : null}
          </DropdownMenuTrigger>
          {/* One row per family, her issues underneath (TOK-53). The flat version listed an
              alert at a time, so Jordan Rivera took three of the four slots and the name a
              founder was scanning for arrived three times. */}
          <DropdownMenuContent align="start" className="min-w-[324px] p-1.5">
            <DropdownMenuLabel className="flex items-baseline justify-between gap-3 px-1.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Needs attention
              {notifyItems.length > 0 ? (
                <span className="text-[10.5px] font-semibold tracking-[0.04em] text-coral">
                  {notifyItems.length === 1 ? "1 family" : `${notifyItems.length} families`}
                </span>
              ) : null}
            </DropdownMenuLabel>
            {notifyItems.length === 0 ? (
              <p className="rounded-md bg-cloud px-2.5 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
                Nobody is waiting on you. New agreements, invoices and follow-ups land here.
              </p>
            ) : (
              <div className="space-y-0.5">
                {notifyItems.map((item) => (
                  <NotifyRow key={item.id} item={item} />
                ))}
              </div>
            )}
            <DropdownMenuSeparator className="my-1.5" />
            <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
              <DropdownMenuItem asChild className="px-0 py-0.5 focus:bg-transparent">
                <Link href={tone === "doula" ? "/doula" : "/portal"} className="text-[12.5px] font-semibold text-teal! hover:text-teal-ink!">
                  Go to Home
                </Link>
              </DropdownMenuItem>
              {tone === "doula" && notifyItems.length > 0 ? (
                <DropdownMenuItem asChild className="px-0 py-0.5 focus:bg-transparent">
                  <Link href={REVIEW_BOARD_HREF} className="text-[12.5px] font-semibold text-teal! hover:text-teal-ink!">
                    Work the whole list
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
