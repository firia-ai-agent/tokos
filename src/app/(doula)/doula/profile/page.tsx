import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { providerProfiles } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { saveProfileAction } from "@/app/actions/doula";
import { appUrl } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function DoulaProfilePage() {
  const staff = await requireStaff();
  const db = getDb();
  const [profile] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, staff.userId))
    .limit(1);
  const shareUrl = `${appUrl()}/p/${profile?.slug ?? "maya-chen"}`;
  const qr = await QRCode.toDataURL(shareUrl, { margin: 1, width: 200 });

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveProfileAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input id="headline" name="headline" defaultValue={profile?.headline} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" rows={6} defaultValue={profile?.bio} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceArea">Service area</Label>
              <Input id="serviceArea" name="serviceArea" defaultValue={profile?.serviceArea ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ratesLabel">Rates</Label>
              <Input id="ratesLabel" name="ratesLabel" defaultValue={profile?.ratesLabel ?? ""} />
            </div>
            <Button type="submit">Save profile</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Intro QR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Profile QR" className="w-40" />
          <p className="break-all text-xs text-muted-foreground">{shareUrl}</p>
        </CardContent>
      </Card>
    </div>
  );
}
