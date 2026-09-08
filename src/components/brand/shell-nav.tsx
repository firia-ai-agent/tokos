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

const ICONS: Record<string, LucideIcon> = {
  "/doula": House,
  "/doula/clients": Users,
  "/doula/calendar": CalendarDays,
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

export function ShellNav({
  items,
  variant = "rail",
}: {
  items: ShellNavItem[];
  variant?: "rail" | "pills";
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        variant === "rail" ? "flex flex-col gap-0.5" : "flex flex-nowrap items-center gap-1",
      )}
      aria-label="Primary"
    >
      {items.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const Icon = ICONS[item.href];

        if (variant === "rail") {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-white/12 text-cloud"
                  : "text-cloud/65 hover:bg-white/8 hover:text-cloud",
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "size-4",
                    isActive ? "text-coral" : "text-cloud/45 group-hover:text-cloud/80",
                  )}
                />
              ) : null}
              {item.label}
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
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
      })}
    </nav>
  );
}
