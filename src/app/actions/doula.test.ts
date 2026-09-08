import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "11111111-1111-4111-8111-111111111112";
const OWN_CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG_CLIENT_ID = "44444444-4444-4444-8444-444444444446";

const fixtures = vi.hoisted(() => {
  const staff = {
    actorType: "staff" as const,
    userId: "22222222-2222-4222-8222-222222222222",
    email: "maya@tokos.test",
    name: "Maya Chen",
    organizationId: "11111111-1111-4111-8111-111111111111",
    membershipRole: "owner" as const,
  };
  const clientsById = new Map([
    [
      "44444444-4444-4444-8444-444444444444",
      {
        id: "44444444-4444-4444-8444-444444444444",
        organizationId: staff.organizationId,
        displayName: "Jordan Reyes",
        preferredName: "Jordan",
        email: "jordan@example.test",
      },
    ],
    [
      "44444444-4444-4444-8444-444444444446",
      {
        id: "44444444-4444-4444-8444-444444444446",
        organizationId: "11111111-1111-4111-8111-111111111112",
        displayName: "Cedar Client",
        preferredName: null,
        email: "cedar@other.test",
      },
    ],
  ]);
  return { staff, clientsById, enqueueEmail: vi.fn() };
});

/** Mirrors the real guard: a client row is only reachable inside the staff org. */
vi.mock("@/lib/tenancy", () => ({
  requireStaff: vi.fn(async () => fixtures.staff),
  requireStaffClient: vi.fn(async (clientId: string) => {
    const client = fixtures.clientsById.get(clientId);
    if (!client || client.organizationId !== fixtures.staff.organizationId) {
      throw new Error("Forbidden");
    }
    return { staff: fixtures.staff, client };
  }),
}));
vi.mock("@/lib/outbox", () => ({ enqueueEmail: fixtures.enqueueEmail }));
vi.mock("@/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/funnel", () => ({
  confirmFit: vi.fn(),
  sendContract: vi.fn(),
  sendIntro: vi.fn(),
  startActiveCare: vi.fn(),
  startFit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { remindFormsAction } = await import("./doula");

describe("remindFormsAction ownership (TOK-20)", () => {
  beforeEach(() => {
    fixtures.enqueueEmail.mockReset();
  });

  it("takes only a client id, so no caller can supply the recipient", () => {
    expect(remindFormsAction.length).toBe(1);
  });

  it("emails the address stored on the staff's own client row", async () => {
    await remindFormsAction(OWN_CLIENT_ID);
    expect(fixtures.enqueueEmail).toHaveBeenCalledTimes(1);
    const call = fixtures.enqueueEmail.mock.calls[0][0] as {
      organizationId: string;
      toEmail: string;
      vars: Record<string, string>;
    };
    expect(call.organizationId).toBe(ORG);
    expect(call.toEmail).toBe("jordan@example.test");
    expect(call.vars.client_name).toBe("Jordan");
  });

  it("refuses a client in another organization", async () => {
    expect(fixtures.clientsById.get(OTHER_ORG_CLIENT_ID)?.organizationId).toBe(OTHER_ORG);
    await expect(remindFormsAction(OTHER_ORG_CLIENT_ID)).rejects.toThrow("Forbidden");
    expect(fixtures.enqueueEmail).not.toHaveBeenCalled();
  });

  it("refuses an unknown client id and ignores an empty one, without sending", async () => {
    await expect(remindFormsAction("44444444-4444-4444-8444-44444444dead")).rejects.toThrow(
      "Forbidden",
    );
    await remindFormsAction("");
    expect(fixtures.enqueueEmail).not.toHaveBeenCalled();
  });
});
