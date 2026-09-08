import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { organizations, providerProfiles, users } from "@/db/schema";
import { DemoBanner } from "@/components/brand/shell";
import { ProviderAvatar } from "@/components/brand/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

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
  const qr = await QRCode.toDataURL(shareUrl, { margin: 1, width: 220 });

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <p className="text-xs uppercase tracking-[0.25em] text-teal">{row.org.name}</p>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProviderAvatar name={row.user.name} photoFileId={row.profile.photoFileId} size={128} />
            <div className="space-y-1">
              <h1 className="font-heading text-4xl text-teal-ink">{row.user.name}</h1>
              {row.user.credentialsLabel ? (
                <p className="text-sm uppercase tracking-[0.18em] text-teal">
                  {row.user.credentialsLabel}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-xl text-teal">{row.profile.headline}</p>
          <p className="max-w-prose leading-relaxed text-muted-foreground">{row.profile.bio}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {row.profile.serviceArea ? (
              <span className="rounded-full bg-secondary px-3 py-1">{row.profile.serviceArea}</span>
            ) : null}
            {row.profile.ratesLabel ? (
              <span className="rounded-full bg-secondary px-3 py-1">{row.profile.ratesLabel}</span>
            ) : null}
          </div>
          <Button asChild>
            <Link href={`/p/${slug}/book`}>Book a fit consult</Link>
          </Button>
        </section>
        <Card>
          <CardHeader>
            <CardTitle>Share this page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code linking to this profile" className="w-40" />
            <p className="break-all text-xs text-muted-foreground">{shareUrl}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
