import QRCode from "qrcode";
import { findProviderProfile } from "@/lib/provider-profile";
import { requireStaff } from "@/lib/tenancy";
import { removeProfilePhotoAction, saveProfileAction } from "@/app/actions/doula";
import { appUrl } from "@/lib/env";
import { photoErrorMessage } from "@/lib/photo";
import { ProviderAvatar } from "@/components/brand/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function DoulaProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ photoError?: string }>;
}) {
  const staff = await requireStaff();
  const photoError = photoErrorMessage((await searchParams).photoError);
  const profile = await findProviderProfile({
    organizationId: staff.organizationId,
    userId: staff.userId,
  });
  // Before the first save there is no public page yet. Falling back to another doula's slug
  // would put her face behind this doula's QR code, so the card says so instead (TOK-63).
  const shareUrl = profile ? `${appUrl()}/p/${profile.slug}` : null;
  const qr = shareUrl ? await QRCode.toDataURL(shareUrl, { margin: 1, width: 200 }) : null;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Identity</p>
        <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Public profile
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Face first — families meet you on /p before they book.
        </p>
      </header>
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <Card className="ring-teal/15">
        <CardHeader>
          <CardTitle className="text-teal-ink">Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          {photoError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{photoError}</AlertDescription>
            </Alert>
          ) : null}
          <form action={saveProfileAction} className="space-y-4">
            <div className="flex items-center gap-4">
              <ProviderAvatar name={staff.name} photoFileId={profile?.photoFileId ?? null} size={80} />
              <div className="flex-1 space-y-2">
                <Label htmlFor="photo">Profile photo</Label>
                <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, or WebP, up to 2MB. Families see this on your public profile.
                </p>
              </div>
            </div>
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
          {profile?.photoFileId ? (
            <form action={removeProfilePhotoAction} className="mt-3">
              <Button type="submit" variant="outline" size="sm">
                Remove photo
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
      <Card className="ring-teal/15">
        <div className="bg-teal-ink px-4 py-2.5">
          <p className="text-[0.62rem] uppercase tracking-[0.24em] text-cloud/75">Intro QR</p>
        </div>
        <CardContent className="space-y-3 pt-4">
          {qr && shareUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Profile QR" className="w-40 rounded-lg ring-1 ring-teal/15" />
              <p className="break-all text-xs text-muted-foreground">{shareUrl}</p>
              <a
                href={shareUrl}
                className="inline-flex text-[13px] font-semibold text-coral hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Open public profile →
              </a>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Save your profile once and your public page and QR code appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
