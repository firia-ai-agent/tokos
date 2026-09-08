import { createHmac, timingSafeEqual } from "node:crypto";

export type DropboxSignVerifyInput = {
  apiKey?: string;
  eventTime?: string;
  eventType?: string;
  eventHash?: string;
};

export type DropboxSignVerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Dropbox Sign / HelloSign callback: HMAC-SHA256 of event_time + event_type
 * using the API key. Unsigned or wrong hashes never mark an agreement signed.
 */
export function verifyDropboxSignEvent(input: DropboxSignVerifyInput): DropboxSignVerifyResult {
  if (!input.apiKey) {
    return { ok: false, reason: "missing_api_key" };
  }
  if (!input.eventTime || !input.eventType || !input.eventHash) {
    return { ok: false, reason: "missing_event_hash" };
  }

  const expected = createHmac("sha256", input.apiKey)
    .update(`${input.eventTime}${input.eventType}`)
    .digest("hex");

  if (!safeEqualHex(expected, input.eventHash)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

function safeEqualHex(expected: string, provided: string): boolean {
  try {
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(provided, "hex");
    if (left.length === 0 || left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
