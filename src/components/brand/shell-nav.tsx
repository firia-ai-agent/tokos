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
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
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
  "/portal": House,
  "/portal/forms": ClipboardList,
  "/portal/resources": Library,
  "/portal/contract": FileSignature,
  "/portal/pay": WalletCards,
  "/portal/messages": MessageSquare,
  "/portal/calendar": CalendarDays,
  "/portal/profile": UserRound,
};

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/doula" || href === "/portal") return false;
  return pathname.startsWith(`${href}/`) || pathname.startsWith(href);
}

function NavLink({
  item,
  variant,
}: {
  item: ShellNavItem;
  variant: "rail" | "pills";
}) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, item.href);
  const Icon = ICONS[item.href];

  if (variant === "rail") {
    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors",
          isActive
            ? "bg-teal text-cloud shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "text-cloud/70 hover:bg-white/8 hover:text-cloud",
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              "size-4",
              isActive ? "text-cloud" : "text-cloud/45 group-hover:text-cloud/85",
            )}
          />
        ) : null}
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        isActive
          ? "bg-white/15 text-cloud"
          : "text-cloud/60 hover:bg-white/10 hover:text-cloud",
      )}
    >
      {item.label}
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
  variant?: "rail" | "pills";
}) {
  if (variant === "pills") {
    const flat = groups?.flatMap((group) => group.items) ?? items ?? [];
    return (
      <nav className="flex flex-nowrap items-center gap-1" aria-label="Primary">
        {flat.map((item) => (
          <NavLink key={item.href} item={item} variant="pills" />
        ))}
      </nav>
    );
  }

  if (groups && groups.length > 0) {
    return (
      <nav className="flex flex-col gap-4" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-cloud/55">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} variant="rail" />
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
        <NavLink key={item.href} item={item} variant="rail" />
      ))}
    </nav>
  );
}
