"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REVIEW_BOARD_HREF, type ShellNotifyItem } from "@/lib/home-queues";
import { notifyBellLabel } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Who is waiting on you — the same bell on a desktop and on a phone (TOK-73).
 *
 * It used to live inside the desktop top bar, which is `lg:` only, so a doula on her
 * phone had no way to see the queue at all. It is its own component now: the top bar
 * mounts it in Cloud-on-white chrome, the mobile bar mounts it on the teal-ink ground,
 * and both read the same rows built by the rules (TOK-53).
 */
export type ShellNotifyTone = "bar" | "rail";

/** Up to three issues under the name; the rest are counted rather than listed. */
const VISIBLE_ISSUES = 3;

const TRIGGER_TONE: Record<ShellNotifyTone, string> = {
  bar: "border border-teal/20 text-teal-ink/80 hover:bg-secondary focus-visible:ring-teal/30",
  rail: "text-cloud/85 hover:bg-white/10 focus-visible:ring-cloud/40",
};

const DOT_TONE: Record<ShellNotifyTone, string> = {
  bar: "ring-cloud",
  rail: "ring-teal-ink",
};

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

export function ShellNotifyBell({
  tone = "doula",
  surface = "bar",
  notifyCount = 0,
  notifyItems = [],
  align = "start",
  className,
}: {
  tone?: "doula" | "client";
  /** Which ground the trigger is drawn on — white top bar, or the teal-ink phone bar. */
  surface?: ShellNotifyTone;
  notifyCount?: number;
  notifyItems?: ShellNotifyItem[];
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={notifyBellLabel(notifyCount)}
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2",
          TRIGGER_TONE[surface],
          className,
        )}
      >
        <Bell className="size-4" aria-hidden />
        {notifyCount > 0 ? (
          <span
            className={cn(
              "absolute right-2 top-2 size-2 rounded-full bg-coral ring-2",
              DOT_TONE[surface],
            )}
          />
        ) : null}
      </DropdownMenuTrigger>
      {/* One row per family, her issues underneath (TOK-53). The flat version listed an
          alert at a time, so Jordan Rivera took three of the four slots and the name a
          founder was scanning for arrived three times. */}
      <DropdownMenuContent
        align={align}
        collisionPadding={12}
        className="w-[min(20.25rem,calc(100vw-1.5rem))] min-w-0 p-1.5"
      >
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
            <Link
              href={tone === "doula" ? "/doula" : "/portal"}
              className="text-[12.5px] font-semibold text-teal! hover:text-teal-ink!"
            >
              Go to Home
            </Link>
          </DropdownMenuItem>
          {tone === "doula" && notifyItems.length > 0 ? (
            <DropdownMenuItem asChild className="px-0 py-0.5 focus:bg-transparent">
              <Link
                href={REVIEW_BOARD_HREF}
                className="text-[12.5px] font-semibold text-teal! hover:text-teal-ink!"
              >
                Work the whole list
              </Link>
            </DropdownMenuItem>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
