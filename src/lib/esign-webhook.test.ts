import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyDropboxSignEvent } from "./esign-webhook";

function hashEvent(apiKey: string, eventTime: string, eventType: string) {
  return createHmac("sha256", apiKey).update(`${eventTime}${eventType}`).digest("hex");
}

describe("Dropbox Sign webhook HMAC (TOK-19)", () => {
  const apiKey = "test-dropbox-sign-key";
  const eventTime = "1348177752";
  const eventType = "signature_request_all_signed";

  it("accepts a matching event_hash", () => {
    const result = verifyDropboxSignEvent({
      apiKey,
      eventTime,
      eventType,
      eventHash: hashEvent(apiKey, eventTime, eventType),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing or wrong hash", () => {
    expect(
      verifyDropboxSignEvent({
        apiKey,
        eventTime,
        eventType,
      }).ok,
    ).toBe(false);
    expect(
      verifyDropboxSignEvent({
        apiKey,
        eventTime,
        eventType,
        eventHash: "deadbeef",
      }).ok,
    ).toBe(false);
  });

  it("rejects unsigned events when no API key is configured", () => {
    const result = verifyDropboxSignEvent({
      apiKey: undefined,
      eventTime,
      eventType,
      eventHash: hashEvent("other", eventTime, eventType),
    });
    expect(result.ok).toBe(false);
  });
});
