import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRIMARY_COLOR, contrastInk } from "./brand";

/**
 * Faith's four (TOK-40). A palette lives in a stylesheet nothing else type-checks, so the
 * only thing standing between "pinned" and "somebody nudged the teal" is this file.
 */
const PALETTE = {
  cloud: "#F7F5F0",
  teal: "#0F6E56",
  "teal-ink": "#04342C",
  coral: "#D85A30",
} as const;

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** WCAG relative luminance, so the contrast claims here are the real ratio. */
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("brand palette (TOK-40)", () => {
  it.each(Object.entries(PALETTE))("pins --%s to its exact hex", (token, hex) => {
    expect(css).toContain(`--${token}: ${hex};`);
  });

  it("keeps the palette in hex, not a colour space that rounds", () => {
    expect(css).not.toMatch(/oklch|hsl\(|rgb\(/);
  });

  it("uses the pinned Teal as the default org colour", () => {
    expect(DEFAULT_PRIMARY_COLOR).toBe(PALETTE.teal);
  });

  it("keeps body text readable on Cloud", () => {
    // Teal Ink is the body colour; Teal carries labels and links.
    expect(contrast(PALETTE["teal-ink"], PALETTE.cloud)).toBeGreaterThan(7);
    expect(contrast(PALETTE.teal, PALETTE.cloud)).toBeGreaterThan(4.5);
  });

  it("keeps Cloud readable on Teal and Teal Ink, which is how the chrome is built", () => {
    expect(contrast(PALETTE.cloud, PALETTE.teal)).toBeGreaterThan(4.5);
    expect(contrast(PALETTE.cloud, PALETTE["teal-ink"])).toBeGreaterThan(7);
    // …which is exactly the ink the settings preview chip picks for a Teal swatch.
    expect(contrastInk(PALETTE.teal)).toBe("#FFFFFF");
  });
});
