/**
 * The family's care team, as the family reads it (TOK-35).
 *
 * Portal Home used to open on counts alone: a checklist and nothing about the care those
 * chores belong to. A Birth Prep portal opens on the arrangement — who is with you, what
 * you booked, when you are due, and where. Those four facts already live in the database
 * (`engagements`, `contracts`, `clients`, `provider_profiles`); this module is the layer
 * that picks between them and words them, so Home never shows a raw `date` column or a
 * pipeline stage.
 *
 * Everything above `resolveCareTeamCard` is pure and tested. The async part is only the
 * reads, in the same shape as `@/lib/assigned-doula`.
 */

import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { differenceInCalendarWeeks, format } from "date-fns";
import { getDb } from "@/db";
import { clients, contracts, engagements, providerProfiles, users } from "@/db/schema";

/** Where a location came from, so the card can label it honestly. */
export type LocationSource = "client" | "engagement" | "serviceArea";

export type CareTeamLocation = {
  label: string;
  source: LocationSource;
};

export type PackageCandidate = {
  label: string | null | undefined;
  /** Contract status, when this candidate is a contract. */
  status?: string | null;
  source: "contract" | "engagement";
};

/** Contracts in these states are not the arrangement any more. */
const DEAD_CONTRACT_STATUSES = new Set(["void", "draft"]);

/**
 * What the family bought, preferring the agreement over the engagement — the engagement
 * is the office's working row, the contract is the thing they were actually sent. A void
 * or still-being-drafted contract is skipped rather than shown; a family should not read
 * a package off paperwork that has not left the office.
 */
export function pickPackageLabel(candidates: readonly PackageCandidate[]): string | null {
  const usable = candidates.filter((candidate) => {
    if (!candidate.label?.trim()) return false;
    if (candidate.source === "contract" && DEAD_CONTRACT_STATUSES.has(candidate.status ?? "")) {
      return false;
    }
    return true;
  });
  const contract = usable.find((candidate) => candidate.source === "contract");
  return (contract ?? usable[0])?.label?.trim() ?? null;
}

/**
 * A `date` column is a wall-clock day, not an instant. Anchoring at noon keeps
 * "2026-09-29" reading as September 29 in every US zone instead of slipping a day west.
 */
function eddDate(edd: string | null | undefined): Date | null {
  const value = String(edd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "September 29, 2026". Null when there is no EDD on file yet. */
export function formatEdd(edd: string | null | undefined): string | null {
  const date = eddDate(edd);
  return date ? format(date, "MMMM d, yyyy") : null;
}

/**
 * The quiet second line under the date: "in 3 weeks", "this week". Past the date it goes
 * silent — a family who is overdue knows, and a counter that keeps climbing is a nag,
 * not care.
 */
export function formatEddNote(
  edd: string | null | undefined,
  today: Date = new Date(),
): string | null {
  const date = eddDate(edd);
  if (!date) return null;
  const weeks = differenceInCalendarWeeks(date, today);
  if (weeks < 0) return null;
  if (weeks === 0) return "this week";
  return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
}

/**
 * Where care happens. The family's own city wins, then whatever the engagement recorded,
 * then the practice's service area — which is a different claim ("we cover Arlington")
 * and is labelled as such by the caller, not passed off as the family's address.
 */
export function pickLocationLabel(input: {
  city?: string | null;
  region?: string | null;
  engagementLocation?: string | null;
  serviceArea?: string | null;
}): CareTeamLocation | null {
  const city = input.city?.trim();
  const region = input.region?.trim();
  if (city || region) {
    return { label: [city, region].filter(Boolean).join(", "), source: "client" };
  }
  const engagement = input.engagementLocation?.trim();
  if (engagement) return { label: engagement, source: "engagement" };
  const serviceArea = input.serviceArea?.trim();
  if (serviceArea) return { label: serviceArea, source: "serviceArea" };
  return null;
}

/** "Location" for the family's own, "Service area" for the practice's coverage. */
export function locationFieldLabel(source: LocationSource): string {
  return source === "serviceArea" ? "Service area" : "Location";
}

/**
 * `(703) 555-0148` from whatever shape the settings form accepted. Anything that is not a
 * plain US number — an extension, an international number — is handed back trimmed rather
 * than mangled into a format it does not have.
 */
export function formatPhoneNumber(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10 || /[a-z]/i.test(value)) return value;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** `tel:` needs the digits, not the punctuation. */
export function phoneHref(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export type CareTeamCard = {
  /** "Birth support · full", or null before anything is agreed. */
  packageLabel: string | null;
  /** "September 29, 2026" */
  eddLabel: string | null;
  /** "in 3 weeks" */
  eddNote: string | null;
  location: CareTeamLocation | null;
  /** The assigned doula's letters, for the line under her name. */
  credentialsLabel: string | null;
  photoFileId: string | null;
};

/**
 * The facts behind Home's care card, org-scoped on every read. `doulaUserId` is whoever
 * `resolveAssignedDoulaName` settled on — null when the family has not been matched, in
 * which case there is no photo or service area to show and the card is just the package,
 * the date, and the city.
 */
export const resolveCareTeamCard = cache(async function resolveCareTeamCard({
  organizationId,
  clientId,
  doulaUserId,
}: {
  organizationId: string;
  clientId: string;
  doulaUserId: string | null;
}): Promise<CareTeamCard> {
  const db = getDb();

  const [client] = await db
    .select({ edd: clients.edd, city: clients.city, region: clients.region })
    .from(clients)
    .where(and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)))
    .limit(1);

  const [engagement] = await db
    .select({
      packageLabel: engagements.packageLabel,
      locationLabel: engagements.locationLabel,
      targetDate: engagements.targetDate,
    })
    .from(engagements)
    .where(
      and(eq(engagements.organizationId, organizationId), eq(engagements.clientId, clientId)),
    )
    .orderBy(desc(engagements.createdAt))
    .limit(1);

  const [contract] = await db
    .select({ packageLabel: contracts.packageLabel, status: contracts.status })
    .from(contracts)
    .where(and(eq(contracts.organizationId, organizationId), eq(contracts.clientId, clientId)))
    .orderBy(desc(contracts.createdAt))
    .limit(1);

  const profile = doulaUserId
    ? (
        await db
          .select({
            serviceArea: providerProfiles.serviceArea,
            photoFileId: providerProfiles.photoFileId,
            credentialsLabel: users.credentialsLabel,
          })
          .from(providerProfiles)
          .innerJoin(users, eq(users.id, providerProfiles.userId))
          .where(
            and(
              eq(providerProfiles.organizationId, organizationId),
              eq(providerProfiles.userId, doulaUserId),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  // The client record is where a family edits their own due date, so it wins over the
  // engagement's target date, which is the office's copy of the same thing.
  const edd = client?.edd ?? engagement?.targetDate ?? null;

  return {
    packageLabel: pickPackageLabel([
      { label: contract?.packageLabel, status: contract?.status, source: "contract" },
      { label: engagement?.packageLabel, source: "engagement" },
    ]),
    eddLabel: formatEdd(edd),
    eddNote: formatEddNote(edd),
    location: pickLocationLabel({
      city: client?.city,
      region: client?.region,
      engagementLocation: engagement?.locationLabel,
      serviceArea: profile?.serviceArea,
    }),
    credentialsLabel: profile?.credentialsLabel ?? null,
    photoFileId: profile?.photoFileId ?? null,
  };
});
