"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FileSignature,
  House,
  Library,
  MessageSquare,
  Receipt,
  Settings,
  UserRound,
  Users,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { isActiveNavPath } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export type ShellNavItem = {
  href: string;
  label: string;
};

export type ShellNavGroup = {
  label: string;
  items: ShellNavItem[];
};

const ICONS: Record<string, LucideIcon> = {
  "/doula": House,
  "/doula/clients": Users,
  "/doula/calendar": CalendarDays,
  "/doula/forms": ClipboardList,
  "/doula/resources": Library,
  "/doula/invoices": Receipt,
  "/doula/messages": MessageSquare,
  "/doula/profile": UserRound,
  "/doula/team": UsersRound,
  "/doula/settings": Settings,
  "/portal": House,
  "/portal/forms": ClipboardList,
  "/portal/resources": Library,
  "/portal/contract": FileSignature,
  "/portal/pay": WalletCards,
  "/portal/messages": MessageSquare,
  "/portal/calendar": CalendarDays,
  "/portal/profile": UserRound,
};

/**
 * The two grounds the nav is drawn on, both teal-ink (TOK-73).
 *
 * `rail` is the desktop sidebar. `drawer` is the same list inside the phone's sheet, and
 * differs only in the size of the thing you are aiming a thumb at — same labels, same
 * icons, same groups, so nobody has to learn the product twice. The horizontally
 * scrolling pill row that used to be the phone's nav is gone.
 */
export type ShellNavVariant = "rail" | "drawer";

const NAV_SIZE: Record<ShellNavVariant, { link: string; icon: string; group: string }> = {
  rail: { link: "px-3 py-[7px] text-[13.5px]", icon: "size-4", group: "gap-4" },
  drawer: { link: "px-3 py-2.5 text-[15px]", icon: "size-[18px]", group: "gap-5" },
};

function NavLink({
  item,
  variant,
}: {
  item: ShellNavItem;
  variant: ShellNavVariant;
}) {
  const pathname = usePathname();
  const isActive = isActiveNavPath(pathname, item.href);
  const Icon = ICONS[item.href];
  const size = NAV_SIZE[variant];

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg font-medium transition-colors",
        size.link,
        isActive
          ? "bg-teal text-cloud shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "text-cloud/70 hover:bg-white/8 hover:text-cloud",
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            size.icon,
            "shrink-0",
            isActive ? "text-cloud" : "text-cloud/45 group-hover:text-cloud/85",
          )}
        />
      ) : null}
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
}

export function ShellNav({
  items,
  groups,
  variant = "rail",
}: {
  items?: ShellNavItem[];
  groups?: ShellNavGroup[];
  variant?: ShellNavVariant;
}) {
  const size = NAV_SIZE[variant];

  if (groups && groups.length > 0) {
    return (
      <nav className={cn("flex flex-col", size.group)} aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-cloud/55">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} variant={variant} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {(items ?? []).map((item) => (
        <NavLink key={item.href} item={item} variant={variant} />
      ))}
    </nav>
  );
}
