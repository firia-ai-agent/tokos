"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { INVOICE_TABS } from "@/lib/invoice-dashboard";
import { cn } from "@/lib/utils";

/**
 * The four invoicing surfaces, as real routes (TOK-55).
 *
 * Nested routes rather than a `?tab=` switch, so a doula can send someone the Families
 * tab and it opens on the Families tab. Labels come from the config module — the shot's
 * "Buyers" and "Items" are an agency billing product's words, and there is exactly one
 * place they get translated into this practice's.
 */
export function InvoiceTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-teal/12 pb-2"
      aria-label="Invoicing"
    >
      {INVOICE_TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
              active
                ? "bg-teal text-cloud"
                : "text-teal-ink/70 hover:bg-teal/10 hover:text-teal-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
