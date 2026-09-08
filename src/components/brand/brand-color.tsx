"use client";

import { useState } from "react";
import { contrastInk, sanitizeHexColor } from "@/lib/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The brand colour field and its live chip. Typing shows the colour immediately; the
 * value that reaches the server still goes through `sanitizeHexColor` there, so the
 * preview is a convenience and never the validation.
 */
export function BrandColorField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const resolved = sanitizeHexColor(value, defaultValue);
  const ink = contrastInk(resolved);

  return (
    <div className="space-y-2">
      <Label htmlFor="primaryColor">Primary colour</Label>
      <div className="flex items-center gap-2.5">
        <Input
          id="primaryColor"
          name="primaryColor"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          className="max-w-[10rem] font-mono text-[13px] uppercase"
          aria-describedby="primaryColorHint"
        />
        <input
          type="color"
          value={resolved}
          aria-label="Pick primary colour"
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          className="h-9 w-10 cursor-pointer rounded-md border border-teal/20 bg-card p-1"
        />
        <span
          className="inline-flex h-9 items-center rounded-md px-3 text-[12.5px] font-semibold"
          style={{ backgroundColor: resolved, color: ink }}
        >
          {resolved}
        </span>
      </div>
      <p id="primaryColorHint" className="text-[12px] text-muted-foreground">
        Six-digit hex. Anything else falls back to your current colour on save.
      </p>
    </div>
  );
}
