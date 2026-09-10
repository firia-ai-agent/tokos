import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { getDb } from "@/db";
import { clientPortalAccess, invites, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { roleLabel } from "@/lib/team";
import {
  TOS_CHECKBOX_LABEL,
  TOS_FIELD,
  TOS_PATH,
  tosAcceptance,
  tosGate,
  tosRequiredFor,
} from "@/lib/tos";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Accepting an invite is where a person joins Tokos, so it is where they agree to be here
 * (TOK-57). The checkbox is required, and `tosGate` — not the browser's `required`
 * attribute — is what actually refuses the accept: the form is a courtesy, the gate is
 * the rule, and a POST that skips the box gets the same answer.
 */
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

  // Terms first: no membership, no user row, no portal access until the box is ticked.
  const gate = tosGate({ kind: invite.kind, posted: formData.get(TOS_FIELD) });
  if (!gate.ok) redirect(`/invite/${encodeURIComponent(token)}?error=${gate.reason}`);
  const accepted = tosAcceptance();

  const passwordHash = await hash(password, 10);
  const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
  const userId = existing?.id ?? newId();
  if (!existing) {
    await db.insert(users).values({
      id: userId,
      email: invite.email,
      name: name || invite.name || invite.email,
      passwordHash,
      ...accepted,
    });
  } else {
    // Someone who already has a login — a family being given staff access, a doula
    // rejoining — still just said yes, and that acceptance is the current one.
    await db.update(users).set({ ...accepted, updatedAt: new Date() }).where(eq(users.id, userId));
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const db = getDb();
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite) notFound();

  const staff = invite.kind === "staff";
  const needsTos = tosRequiredFor(invite.kind);

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="ring-teal/15">
          <CardHeader>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
              {staff ? roleLabel(invite.role) : "Family portal"}
            </p>
            <CardTitle className="text-teal-ink">Accept your Tokos invite</CardTitle>
          </CardHeader>
          <CardContent>
            {error === "tos" ? (
              <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-[13px] text-coral ring-1 ring-coral/20">
                Please accept the Terms of Service to join — we cannot set your account up
                without it.
              </p>
            ) : null}
            <form action={acceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">{invite.email}</p>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required defaultValue={invite.name ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <Input id="password" name="password" type="password" required minLength={8} />
              </div>
              {needsTos ? (
                <label
                  htmlFor={TOS_FIELD}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-cloud p-3 text-[13px] leading-relaxed text-teal-ink ring-1 ring-teal/10"
                >
                  <input
                    id={TOS_FIELD}
                    name={TOS_FIELD}
                    type="checkbox"
                    required
                    className="mt-[3px] size-4 shrink-0 accent-teal"
                  />
                  <span>
                    {TOS_CHECKBOX_LABEL}.{" "}
                    <Link
                      href={TOS_PATH}
                      target="_blank"
                      className="font-semibold text-coral hover:underline"
                    >
                      Read the terms
                    </Link>
                  </span>
                </label>
              ) : null}
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
