"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { ShellNotifyBell } from "@/components/brand/shell-notify-bell";
import type { ShellNotifyItem } from "@/lib/home-queues";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The bell's rows are built by the rules, not here (TOK-53) — one per family, with her
 * issues attached. Re-exported so the shell keeps importing the shape from the component
 * that draws it.
 */
export type { ShellNotifyItem } from "@/lib/home-queues";

/** One entry in the staff "New" menu. Built per persona in `@/lib/shell-persona`. */
export type ShellNewItem = { label: string; href: string };

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

        <ShellNotifyBell
          tone={tone}
          surface="bar"
          notifyCount={notifyCount}
          notifyItems={notifyItems}
        />
      </div>
    </header>
  );
}
