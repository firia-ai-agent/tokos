import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { providerProfiles, users } from "@/db/schema";
import { publicBookAction } from "@/app/actions/public";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatSlot, listOpenSlots } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export default async function BookConsultPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const db = getDb();
  const [row] = await db
    .select({ profile: providerProfiles, user: users })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(providerProfiles.slug, slug))
    .limit(1);
  if (!row) notFound();

  const slots = await listOpenSlots({
    organizationId: row.profile.organizationId,
    userId: row.profile.userId,
  });

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-xs uppercase tracking-[0.25em] text-teal">Fit consult</p>
        <h1 className="font-heading text-3xl text-teal-ink">Book with {row.user.name}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This opens a lead on their Tokos calendar. A signature is never complete by itself.
        </p>
        {query.error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>Name, email, and a time are required.</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Tell us how to reach you</CardTitle>
            <CardDescription>We only ask for contact and a due date — not health notes.</CardDescription>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open windows this fortnight. Write {row.user.name} after you receive a portal
                invite.
              </p>
            ) : (
              <form action={publicBookAction} className="space-y-4">
                <input type="hidden" name="slug" value={slug} />
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edd">Estimated due date</Label>
                  <Input id="edd" name="edd" type="date" />
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Open times</legend>
                  {slots.slice(0, 12).map((slot) => (
                    <label key={slot.startsAt.toISOString()} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="slot"
                        value={`${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`}
                        required
                      />
                      {formatSlot(slot.startsAt)}
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" className="w-full">
                  Request this consult
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
