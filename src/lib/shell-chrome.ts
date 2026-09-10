/**
 * What the shell chrome says, and how it decides what is current (TOK-73).
 *
 * The phone shell used to be the desktop one with the rail deleted: a horizontally
 * scrolling row of nav pills under a top bar that already carried the brand, the face,
 * and Sign out. Replacing it with a hamburger meant three surfaces suddenly needed the
 * *same* answers — which item is current, what the trigger is called, what the bell says
 * when nobody is waiting — so those answers live here rather than being retyped in the
 * rail, the drawer, and the top bar.
 *
 * Everything is pure, so the mobile shell is testable without a viewport.
 */
import type { ShellNavItem } from "@/components/brand/shell-nav";

/** The one way out, worded once — rail footer on a desktop, drawer footer on a phone. */
export const SIGN_OUT_LABEL = "Sign out";

/** The hamburger. Named for what it opens, not for what it looks like. */
export const MOBILE_NAV_LABEL = "Open navigation";
export const MOBILE_NAV_CLOSE_LABEL = "Close navigation";

/** The drawer's screen-reader description — a dialog owes one, and this is the honest one. */
export function mobileNavDescription(brand: string): string {
  return `${brand} navigation, your account, and Sign out.`;
}

/**
 * Is this nav item the page we are on?
 *
 * Home is exact — `/doula` prefixes every staff route, so a prefix match would light it
 * on every screen in the product. Everything else matches its own subtree, so a client
 * record still shows Clients as current.
 */
export function isActiveNavPath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/doula" || href === "/portal") return false;
  return pathname.startsWith(`${href}/`) || pathname.startsWith(href);
}

/**
 * The current item's label, for the phone's top bar.
 *
 * The mobile bar orients you after the hamburger, and the word it uses is the word the
 * drawer uses — read off the same nav, never a second table of route titles. The longest
 * matching href wins so `/doula/messages` is "Messages" rather than "Home".
 */
export function activeNavLabel(
  pathname: string,
  items: readonly ShellNavItem[],
): string | null {
  let best: ShellNavItem | null = null;
  for (const item of items) {
    if (!isActiveNavPath(pathname, item.href)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best?.label ?? null;
}

/**
 * The bell's accessible name. A count read out as a number alone is a riddle; this says
 * who it is about, and says the good news out loud when the number is zero.
 */
export function notifyBellLabel(count: number): string {
  if (count <= 0) return "Notifications — nobody is waiting on you";
  return `Notifications — ${count} ${count === 1 ? "family needs" : "families need"} your attention`;
}

/**
 * Does the phone's top bar carry the bell?
 *
 * Staff do: the queue behind it is their work (TOK-53). A family's bell is empty by
 * construction — nothing in the product ever files a notification to a client — so on her
 * phone it would be a control that can only ever say "nothing here". The hamburger and
 * the practice name are the whole bar in the portal.
 */
export function showsMobileNotifyBell(tone: "doula" | "client"): boolean {
  return tone === "doula";
}
