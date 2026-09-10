import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { AppShell } from "@/components/brand/shell";
import { shellAttention } from "@/lib/queries";
import {
  shellNavGroups,
  shellNavItems,
  shellNewItems,
  shellPersona,
  shellSearchTargets,
} from "@/lib/shell-persona";
import { providerPhotoFileId } from "@/lib/provider-profile";
import { roleLabel } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function DoulaLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.actorType !== "staff") redirect("/login");

  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.user.organizationId ?? ""))
    .limit(1);

  // The face in the rail is the headshot she selected on her own profile — the same
  // Media id `/p/[slug]` and the profile hero read (TOK-65). One source, so the rail can
  // never disagree with the banner above it.
  const photoFileId = session.user.id
    ? await providerPhotoFileId({
        organizationId: session.user.organizationId ?? "",
        userId: session.user.id,
      })
    : null;

  const role = roleLabel(session.user.membershipRole);
  const orgName = org?.name ?? "Practice";
  const personMeta = `${role} · ${orgName}`;

  // TOK-34 D1: an owner/admin gets the agency shell — roster, brand, email templates,
  // pipeline vocabulary. A member with role `doula` gets a shell scoped to her own
  // practice, with no nav or search route into the agency surfaces she cannot act on.
  const persona = shellPersona(session.user.membershipRole);

  // The bell reads the same rules the review board does, through the same scope: the
  // practice for an agency owner, her own families for an assigned doula (TOK-53).
  const attention = session.user.id
    ? await shellAttention(
        session.user.organizationId ?? "",
        persona === "agency" ? {} : { doulaUserId: session.user.id },
      )
    : { count: 0, items: [] };

  return (
    <AppShell
      brand="Tokos"
      brandHint="Birth work, kept whole"
      personName={session.user.name ?? "Doula"}
      personMeta={personMeta}
      personPhotoFileId={photoFileId}
      nav={shellNavItems(persona, org?.name)}
      navGroups={shellNavGroups(persona, org?.name)}
      tone="doula"
      notifyCount={attention.count}
      notifyItems={attention.items}
      newHref="/doula/clients"
      newItems={shellNewItems(persona)}
      searchTargets={shellSearchTargets(persona)}
    >
      {children}
    </AppShell>
  );
}
