import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientPortalAccess, clients, memberships } from "@/db/schema";
import { auth } from "@/auth";
import { clientOwnsRow, staffOwnsClient } from "@/lib/ownership";

export type StaffSession = {
  actorType: "staff";
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  membershipRole: "owner" | "admin" | "doula";
};

export type ClientSession = {
  actorType: "client";
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  clientId: string;
};

export type AppSession = StaffSession | ClientSession;

export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.actorType || !user.organizationId) {
    throw new Error("Unauthorized");
  }
  if (user.actorType === "client") {
    if (!user.clientId) throw new Error("Unauthorized");
    return {
      actorType: "client",
      userId: user.id,
      email: user.email ?? "",
      name: user.name ?? "",
      organizationId: user.organizationId,
      clientId: user.clientId,
    };
  }
  return {
    actorType: "staff",
    userId: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    organizationId: user.organizationId,
    membershipRole: (user.membershipRole ?? "doula") as StaffSession["membershipRole"],
  };
}

export async function requireStaff() {
  const session = await requireSession();
  if (session.actorType !== "staff") throw new Error("Forbidden");
  return session;
}

export async function requireClient() {
  const session = await requireSession();
  if (session.actorType !== "client") throw new Error("Forbidden");
  return session;
}

/** Stub/return pages: send anonymous visitors to login instead of completing sign/pay. */
export async function requireClientPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.actorType !== "client" || !user.clientId || !user.organizationId) {
    redirect("/login");
  }
  return {
    actorType: "client" as const,
    userId: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    organizationId: user.organizationId,
    clientId: user.clientId,
  };
}

export async function requireStaffClient(clientId: string) {
  const staff = await requireStaff();
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client || !staffOwnsClient(staff.organizationId, client)) {
    throw new Error("Forbidden");
  }
  return { staff, client };
}

export async function assertStaffMembership(userId: string, organizationId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function assertClientAccess(userId: string, organizationId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(clientPortalAccess)
    .where(
      and(
        eq(clientPortalAccess.userId, userId),
        eq(clientPortalAccess.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
