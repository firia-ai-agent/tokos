import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { organizations, providerProfiles, users } from "@/db/schema";
import { DemoBanner } from "@/components/brand/shell";
import { ProviderAvatar } from "@/components/brand/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** The identity block leads with the face, so the photo is sized as art, not as a bullet. */
const PHOTO_SIZE = 240;

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  const [row] = await db
    .select({
      profile: providerProfiles,
      user: users,
      org: organizations,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .where(eq(providerProfiles.slug, slug))
    .limit(1);

  if (!row || !row.profile.published) notFound();

  const shareUrl = `${appUrl()}/p/${slug}`;
  const qr = await QRCode.toDataURL(shareUrl, { margin: 0, width: 176 });
  const firstName = row.user.name.split(/\s+/)[0];

  const facts = [
    { label: "Service area", value: row.profile.serviceArea },
    { label: "Rates", value: row.profile.ratesLabel },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  return (
    <div className="min-h-screen bg-cloud">
      <DemoBanner />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12">
          <article className="space-y-7">
            <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
              <ProviderAvatar
                name={row.user.name}
                photoFileId={row.profile.photoFileId}
                size={PHOTO_SIZE}
                className="rounded-2xl border-0 ring-1 ring-teal/20"
              />
              <div className="space-y-2 sm:pb-1">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-teal">
                  {row.org.name}
                </p>
                <h1 className="font-heading text-4xl leading-[1.05] text-teal-ink sm:text-5xl">
                  {row.user.name}
                </h1>
                {row.user.credentialsLabel ? (
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-teal">
                    {row.user.credentialsLabel}
                  </p>
                ) : null}
                <p className="font-heading text-lg leading-snug text-teal sm:text-xl">
                  {row.profile.headline}
                </p>
              </div>
            </header>

            <p className="max-w-[62ch] text-[0.95rem] leading-7 text-teal-ink/80">
              {row.profile.bio}
            </p>

            {facts.length > 0 ? (
              // Hairline grid: the gap is the rule, so two facts read as one dense block.
              <dl className="grid gap-px overflow-hidden rounded-xl bg-teal/15 ring-1 ring-teal/15 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="bg-cloud px-4 py-3">
                    <dt className="text-[0.62rem] uppercase tracking-[0.22em] text-teal">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 text-sm text-teal-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </article>

          <aside className="lg:sticky lg:top-8 lg:h-fit">
            <Card size="sm" className="gap-0 py-0 ring-teal/15">
              <div className="bg-teal-ink px-4 py-2.5">
                <p className="text-[0.62rem] uppercase tracking-[0.24em] text-cloud/75">
                  Work with {firstName}
                </p>
              </div>
              <div className="space-y-3 p-3">
                <Button
                  asChild
                  size="lg"
                  className="h-10 w-full bg-coral text-accent-foreground hover:bg-coral/85"
                >
                  <Link href={`/p/${slug}/book`}>Book a fit consult</Link>
                </Button>
                <div className="flex items-center gap-3 rounded-lg bg-cloud p-2.5 ring-1 ring-teal/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt={`QR code linking to ${row.user.name}'s profile`}
                    className="size-20 shrink-0 rounded bg-card"
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-[0.62rem] uppercase tracking-[0.2em] text-teal">
                      Scan or share
                    </p>
                    <p className="break-all text-[0.68rem] leading-4 text-teal-ink/60">
                      {shareUrl}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
