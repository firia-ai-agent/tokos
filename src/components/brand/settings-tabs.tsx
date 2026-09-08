"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/doula/settings", label: "Brand" },
  { href: "/doula/settings/email", label: "Email templates" },
  { href: "/doula/team", label: "Team" },
];

/** One strip across the workspace-settings surfaces, so brand / email / roster read as one place. */
export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Settings">
      {TABS.map((tab) => {
        const active =
          tab.href === "/doula/settings"
            ? pathname === "/doula/settings"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              active
                ? "bg-teal text-cloud"
                : "text-teal-ink/70 ring-1 ring-teal/15 hover:bg-teal/10 hover:text-teal-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
