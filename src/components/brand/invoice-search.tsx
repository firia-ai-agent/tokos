"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The lone search box the Families and Packages tabs use. Same URL-first behaviour as the
 * Invoicing toolbar — the query lives in the address bar, so a filtered view is a link.
 */
export function InvoiceSearch({
  placeholder,
  defaultValue,
}: {
  placeholder: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    startTransition(() =>
      router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, {
        scroll: false,
      }),
    );
  };

  return (
    <form onSubmit={submit} className={cn("relative", pending && "opacity-70")}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-[16rem] rounded-lg border border-teal/20 bg-card pl-8 pr-2 text-[12.5px] text-teal-ink placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
      />
    </form>
  );
}
