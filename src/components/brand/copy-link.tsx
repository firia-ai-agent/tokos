"use client";

import { useState } from "react";

/**
 * The booking link, copyable (TOK-54).
 *
 * A URL a doula has to select by hand and hope she got the whole thing is not a share
 * affordance. The field is read-only rather than disabled so the text is still
 * selectable when the clipboard API is unavailable — an insecure origin, an older
 * browser — and the button falls back to selecting the text instead of silently
 * doing nothing.
 */
export function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const field = document.getElementById("booking-link") as HTMLInputElement | null;
      field?.select();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        id="booking-link"
        readOnly
        value={url}
        aria-label={label ?? "Booking link"}
        onFocus={(event) => event.currentTarget.select()}
        className="h-8 min-w-0 flex-1 rounded-lg bg-cloud px-2.5 text-[12.5px] text-teal-ink ring-1 ring-teal/15 outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
      />
      <button
        type="button"
        onClick={copy}
        className="h-8 shrink-0 rounded-lg bg-teal px-3 text-[12.5px] font-semibold text-cloud transition-colors hover:bg-teal-ink"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
