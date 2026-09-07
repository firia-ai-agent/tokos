import Link from "next/link";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";

export default async function BookedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <h1 className="font-heading text-3xl text-teal-ink">Consult requested</h1>
        <p className="text-muted-foreground">
          You are on the Tokos calendar as a fit consult. If this is a match, your doula will
          send a care agreement. Signing shows intent; the contract is complete only after fit
          and payment.
        </p>
        <Button asChild>
          <Link href={`/p/${slug}`}>Back to profile</Link>
        </Button>
      </main>
    </div>
  );
}
