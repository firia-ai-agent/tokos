import Image from "next/image";
import { cn } from "@/lib/utils";
import { initialsOf, providerPhotoUrl } from "@/lib/photo";

/**
 * The two grounds a face is ever drawn on (TOK-65).
 *
 * `page` is the white canvas — a public profile, a care-team card, the top of a thread.
 * `rail` is the teal-ink sidebar, where the page's Cloud chip and ink letters would read
 * as a hole punched in the rail. Only the *fallback* differs: a photo is a photo on both.
 */
export type AvatarTone = "page" | "rail";

const TONES: Record<AvatarTone, { frame: string; fallback: string }> = {
  page: { frame: "border-teal/20 bg-secondary", fallback: "text-teal-ink" },
  rail: { frame: "border-white/15 bg-teal", fallback: "text-cloud" },
};

/**
 * A person's face, wherever the product shows one: the sidebar footer, the public
 * profile, the booking page, her own settings, a family's care team, the head of a thread.
 *
 * One rule, and it is the whole point of this component (TOK-65): **a selected headshot
 * wins**. If `photoFileId` is set the photo is drawn — there is no size, surface, or tone
 * at which this falls back to initials, because a chrome showing "MC" over a banner
 * showing Maya's face is the thing that reads broken. Initials are for the one honest
 * case: nobody has uploaded a photo yet.
 */
export function ProviderAvatar({
  name,
  photoFileId,
  size = 160,
  tone = "page",
  className,
}: {
  name: string;
  photoFileId: string | null;
  size?: number;
  tone?: AvatarTone;
  className?: string;
}) {
  const shared = cn(
    "shrink-0 overflow-hidden rounded-full border",
    TONES[tone].frame,
    className,
  );

  if (!photoFileId) {
    return (
      <div
        className={cn(
          shared,
          "flex items-center justify-center font-heading font-semibold",
          TONES[tone].fallback,
        )}
        style={{ width: size, height: size, fontSize: Math.round(size / 2.8) }}
        role="img"
        aria-label={`${name} has no profile photo yet`}
      >
        {initialsOf(name)}
      </div>
    );
  }

  return (
    <Image
      src={providerPhotoUrl(photoFileId)}
      alt={name}
      width={size}
      height={size}
      className={cn(shared, "object-cover")}
      style={{ width: size, height: size }}
    />
  );
}
