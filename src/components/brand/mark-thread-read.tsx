"use client";

import { useEffect, useRef } from "react";

/**
 * Opening a thread is what marks it read. A server component cannot call
 * `revalidatePath` mid-render, so the read is a server action fired once on mount —
 * that lets the action stamp `read_at` *and* revalidate, which is what makes the unread
 * count on Home drop the moment the thread is open.
 *
 * Renders nothing. Only fires when something is actually unread, so a revalidation that
 * re-renders this subtree cannot start a loop: after the first run the count is zero.
 */
export function MarkThreadRead({
  unread,
  action,
}: {
  unread: number;
  action: () => void | Promise<void>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (unread <= 0 || fired.current) return;
    fired.current = true;
    void action();
  }, [unread, action]);

  return null;
}
