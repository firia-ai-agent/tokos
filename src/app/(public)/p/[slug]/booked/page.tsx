import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerProfiles, users } from "@/db/schema";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function BookedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // The family just picked a person, so the confirmation names them (TOK-38).
  const db = getDb();
  const [row] = await db
    .select({ name: users.name })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(providerProfiles.slug, slug))
    .limit(1);
  const doulaName = row?.name?.trim() || "your care team";
  const firstName = doulaName.split(/\s+/)[0];
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <h1 className="font-heading text-3xl text-teal-ink">Consult requested</h1>
        <p className="text-muted-foreground">
          You are on {doulaName}&rsquo;s Tokos calendar for a fit consult. If it is a match,
          {" "}
          {firstName} sends a care agreement next. Signing shows intent; care is complete only
          after fit and payment.
        </p>
        <Button asChild>
          <Link href={`/p/${slug}`}>Back to profile</Link>
        </Button>
      </main>
    </div>
  );
}
