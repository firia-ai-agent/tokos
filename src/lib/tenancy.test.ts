import { describe, expect, it } from "vitest";
import { clientOwnsRow, staffOwnsClient } from "./ownership";

describe("tenant ownership guards (TOK-20 / TOK-21)", () => {
  const jordan = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    clientId: "44444444-4444-4444-8444-444444444444",
  };
  const avery = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    clientId: "44444444-4444-4444-8444-444444444445",
  };
  const cedar = {
    organizationId: "11111111-1111-4111-8111-111111111112",
    clientId: "44444444-4444-4444-8444-444444444446",
  };

  it("binds a client session to its own contract or invoice row", () => {
    expect(clientOwnsRow(jordan, jordan)).toBe(true);
    expect(clientOwnsRow(jordan, avery)).toBe(false);
    expect(clientOwnsRow(jordan, cedar)).toBe(false);
  });

  it("binds staff writes to clients in the staff org only", () => {
    expect(staffOwnsClient(jordan.organizationId, { organizationId: jordan.organizationId })).toBe(
      true,
    );
    expect(staffOwnsClient(jordan.organizationId, { organizationId: cedar.organizationId })).toBe(
      false,
    );
  });
});
