import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { providerProfiles, users } from "@/db/schema";
import { publicBookAction } from "@/app/actions/public";
import { DemoBanner } from "@/components/brand/shell";
import { ProviderAvatar } from "@/components/brand/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  SLOT_REJECTION_MESSAGES,
  listOpenSlots,
  organizationTimezone,
  type SlotRejection,
} from "@/lib/calendar";
import { SlotPicker } from "@/components/brand/slot-picker";

export const dynamic = "force-dynamic";

const MISSING_MESSAGE = "Name, email, and a time are required.";

/** A rejected booking says *why* — "already taken" and "missing email" are not the same fix. */
function bookingError(error?: string) {
  if (!error) return null;
  if (error === "missing") return MISSING_MESSAGE;
  return SLOT_REJECTION_MESSAGES[error as SlotRejection] ?? MISSING_MESSAGE;
}

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

  const now = new Date();
  const slots = await listOpenSlots({
    organizationId: row.profile.organizationId,
    userId: row.profile.userId,
    from: now,
  });
  // The practice's clock, not the server's — a visitor booking from Denver still reads
  // the window in the zone the doula keeps (TOK-33 C12).
  const timeZone = await organizationTimezone(row.profile.organizationId);
  const error = bookingError(query.error);
  const firstName = row.user.name.trim().split(/\s+/)[0];

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-xs uppercase tracking-[0.25em] text-teal">Fit consult</p>
        <div className="flex items-center gap-4">
          <ProviderAvatar name={row.user.name} photoFileId={row.profile.photoFileId} size={64} />
          <div>
            <h1 className="font-heading text-3xl text-teal-ink">Book with {row.user.name}</h1>
            {row.user.credentialsLabel ? (
              <p className="text-xs uppercase tracking-[0.18em] text-teal">
                {row.user.credentialsLabel}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mb-6 mt-3 text-sm text-muted-foreground">
          This starts your care conversation — a fit consult on {firstName}&rsquo;s
          calendar. Nothing is signed today, and signing later shows intent, not a finished
          agreement.
        </p>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Tell us how to reach you</CardTitle>
            <CardDescription>We only ask for contact and a due date — not health notes.</CardDescription>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              /* Warm, and with somewhere to go (TOK-71 taste). "No open windows this
                 fortnight" is a closed door in a stranger's words at the exact moment a
                 family worked up the nerve to reach out — so it is her name, what is
                 actually true, and a way through. */
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {firstName} hasn&rsquo;t opened times for the next couple of weeks yet —
                  send her a note and she will find one with you.
                </p>
                <a
                  href={`/p/${slug}`}
                  className="inline-flex text-[13px] font-semibold text-coral hover:underline"
                >
                  Back to {firstName}&rsquo;s page →
                </a>
              </div>
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
                <SlotPicker slots={slots} timeZone={timeZone} now={now} />
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
