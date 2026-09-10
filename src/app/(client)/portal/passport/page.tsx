import { format } from "date-fns";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { clientChartPassport } from "@/lib/chart/access";
import { EmptyState } from "@/components/brand/states";

/**
 * The family's own preferences, handed back (TOK-45).
 *
 * Thin on purpose. This is not the chart — it is the one part of it Faith's K1 says a
 * family may read: the preferences they gave, once a doula has signed them and opened
 * them. Nothing on this page decides what that is. `clientChartPassport` reads only signed,
 * shared rows and every answer on screen came through `clientVisibleFieldKeys`, which
 * refuses every clinical field under every policy — so there is no arrangement of this
 * page that can show a dilation curve, an APGAR or a degree of tearing.
 *
 * Labels are the form's own words (`lib/chart/field-defs`). Nothing here narrates a birth.
 */
export default async function PassportPage() {
  const session = await requireClient();
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const entries = await clientChartPassport({
    organizationId: session.organizationId,
    clientId: session.clientId,
    actorUserId: session.userId,
  });

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing to read yet"
        body={`Your birth preferences appear here once ${doula.name} has signed them with you.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Birth preferences
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          What you and {doula.firstName} decided, in your own words. Yours to read any time.
        </p>
      </header>

      {entries.map((entry) => (
        <article key={entry.id} className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">{entry.label}</h2>
            {entry.signedAt ? (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Signed {format(entry.signedAt, "MMMM d, yyyy")}
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-teal/10">
            {entry.sections.map((section) => (
              <section key={section.key} className="px-5 py-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal">
                  {section.label}
                </h3>
                <dl className="mt-3 space-y-3">
                  {section.fields.map((field) => (
                    <div key={field.key}>
                      <dt className="text-[12.5px] text-muted-foreground">{field.label}</dt>
                      <dd className="mt-0.5 text-[14px] leading-relaxed text-teal-ink">
                        {field.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </article>
      ))}

      <p className="text-[12.5px] text-muted-foreground">
        Only what {doula.firstName} signed and shared shows up here. Ask any time to change
        something.
      </p>
    </div>
  );
}
