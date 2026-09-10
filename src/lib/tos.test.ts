import { describe, expect, it } from "vitest";
import {
  TOS_PATH,
  TOS_VERSION,
  acceptedTos,
  tosAcceptance,
  tosGate,
  tosRequiredFor,
} from "./tos";

describe("terms checkbox", () => {
  it("reads a ticked box and nothing else", () => {
    expect(acceptedTos("on")).toBe(true);
    expect(acceptedTos("true")).toBe(true);
    expect(acceptedTos("1")).toBe(true);
    expect(acceptedTos("")).toBe(false);
    expect(acceptedTos(null)).toBe(false);
    expect(acceptedTos(undefined)).toBe(false);
    expect(acceptedTos("off")).toBe(false);
    expect(acceptedTos("no")).toBe(false);
  });

  it("points at a real page, not a placeholder", () => {
    expect(TOS_PATH.startsWith("/")).toBe(true);
    expect(TOS_PATH).not.toBe("#");
  });
});

describe("invite accept gate", () => {
  it("refuses a staff accept with no box ticked", () => {
    expect(tosGate({ kind: "staff", posted: null })).toEqual({ ok: false, reason: "tos" });
    expect(tosGate({ kind: "staff", posted: "" })).toEqual({ ok: false, reason: "tos" });
  });

  it("lets a staff accept through once the box is ticked", () => {
    expect(tosGate({ kind: "staff", posted: "on" }).ok).toBe(true);
  });

  it("holds families to the same terms", () => {
    expect(tosRequiredFor("client")).toBe(true);
    expect(tosGate({ kind: "client", posted: null }).ok).toBe(false);
    expect(tosGate({ kind: "client", posted: "on" }).ok).toBe(true);
  });

  it("defaults an unknown kind to staff rather than waving it through", () => {
    expect(tosGate({ kind: undefined, posted: null }).ok).toBe(false);
    expect(tosGate({ kind: "something-else", posted: null }).ok).toBe(true);
  });
});

describe("what gets stored", () => {
  it("stamps the version alongside the time", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    expect(tosAcceptance(now)).toEqual({ tosAcceptedAt: now, tosVersion: TOS_VERSION });
  });
});
