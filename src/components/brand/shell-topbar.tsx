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
import { cn } from "@/lib/utils";

export type ShellNotifyItem = {
  id: string;
  title: string;
  detail?: string;
  href: string;
};

export function ShellTopBar({
  personName,
  personMeta,
  tone = "doula",
  notifyCount = 0,
  notifyItems = [],
  newHref,
  searchTargets,
}: {
  personName?: string;
  personMeta?: string;
  tone?: "doula" | "client";
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
  /** Primary New destination (intake / pipeline). */
  newHref: string;
  searchTargets: { label: string; href: string; keywords: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const initials = (personName ?? "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

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
    <header className="sticky top-0 z-20 hidden items-center gap-2.5 border-b border-teal/15 bg-cloud/95 px-5 py-2.5 backdrop-blur lg:flex lg:px-8">
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
            <DropdownMenuItem asChild>
              <Link href={newHref}>Open pipeline</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/doula/profile">Public profile · Book Consult</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/doula/calendar">Calendar · availability</Link>
            </DropdownMenuItem>
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
              ? `Notifications — ${notifyCount} items need review`
              : "Notifications"
          }
          className="relative flex size-9 items-center justify-center rounded-lg border border-teal/20 text-teal-ink/80 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
        >
          <Bell className="size-4" aria-hidden />
          {notifyCount > 0 ? (
            <span className="absolute right-2 top-2 size-2 rounded-full bg-coral ring-2 ring-cloud" />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[280px]">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Needs attention
          </DropdownMenuLabel>
          {notifyItems.length === 0 ? (
            <p className="px-2 py-2 text-[12.5px] leading-snug text-muted-foreground">
              Nothing queued here. Open Home for the live review list from your ledger.
            </p>
          ) : (
            notifyItems.slice(0, 5).map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link href={item.href} className="flex flex-col items-start gap-0.5 py-2">
                  <span className="text-[13px] font-medium">{item.title}</span>
                  {item.detail ? (
                    <span className="text-[11.5px] text-muted-foreground">{item.detail}</span>
                  ) : null}
                </Link>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={tone === "doula" ? "/doula" : "/portal"}>Go to Home</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto">
        <div className="flex items-center gap-3">
          {personName ? (
            <div className="hidden text-right md:block">
              <p className="text-[13px] font-semibold leading-tight text-teal-ink">{personName}</p>
              {personMeta ? (
                <p className="text-[12px] leading-tight text-muted-foreground">{personMeta}</p>
              ) : null}
            </div>
          ) : null}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal text-[12.5px] font-bold text-cloud">
            {initials || "T"}
          </span>
        </div>
      </div>
    </header>
  );
}
