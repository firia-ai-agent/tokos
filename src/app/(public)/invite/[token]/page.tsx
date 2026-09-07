import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { getDb } from "@/db";
import { clientPortalAccess, invites, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function acceptInvite(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const db = getDb();
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    redirect("/login?error=invite");
  }
  const passwordHash = await hash(password, 10);
  const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
  const userId = existing?.id ?? newId();
  if (!existing) {
    await db.insert(users).values({
      id: userId,
      email: invite.email,
      name: name || invite.email,
      passwordHash,
    });
  }
  if (invite.kind === "staff") {
    await db.insert(memberships).values({
      id: newId(),
      organizationId: invite.organizationId,
      userId,
      role: invite.role,
    });
  } else if (invite.clientId) {
    await db
      .update(clientPortalAccess)
      .set({ userId, status: "active", updatedAt: new Date() })
      .where(eq(clientPortalAccess.clientId, invite.clientId));
  }
  await db.update(invites).set({ acceptedAt: new Date(), updatedAt: new Date() }).where(eq(invites.id, invite.id));
  redirect("/login");
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getDb();
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite) notFound();

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Accept your Tokos invite</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={acceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">{invite.email}</p>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <Input id="password" name="password" type="password" required minLength={8} />
              </div>
              <Button type="submit" className="w-full">
                Join Tokos
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
