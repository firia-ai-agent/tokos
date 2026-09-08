import Image from "next/image";
import { cn } from "@/lib/utils";
import { initialsOf, providerPhotoUrl } from "@/lib/photo";

/**
 * A provider's face on the public profile, the booking page, and their own settings.
 * Falls back to initials so an unset photo still reads as a person rather than a gap.
 */
export function ProviderAvatar({
  name,
  photoFileId,
  size = 160,
  className,
}: {
  name: string;
  photoFileId: string | null;
  size?: number;
  className?: string;
}) {
  const shared = cn(
    "shrink-0 overflow-hidden rounded-full border border-teal/20 bg-secondary",
    className,
  );

  if (!photoFileId) {
    return (
      <div
        className={cn(shared, "flex items-center justify-center font-heading text-teal-ink")}
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
