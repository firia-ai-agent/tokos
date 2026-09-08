import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { updateClientProfileAction } from "@/app/actions/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** One labelled section of the form, in the same card chrome as the rest of the portal. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      {note ? <p className="mt-1 text-[12.5px] text-muted-foreground">{note}</p> : null}
      <div className="mt-3.5 space-y-3.5">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  autoComplete,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[13px] text-teal-ink">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
    </div>
  );
}

export default async function ClientProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const query = await searchParams;
  const session = await requireClient();
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, session.clientId), eq(clients.organizationId, session.organizationId)),
    )
    .limit(1);
  if (!client) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          Your profile
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          What {doula.name} sees on your record. Change it any time.
        </p>
      </header>

      {query.saved ? (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-ink ring-1 ring-teal/20">
          Profile saved. {doula.firstName} sees this on your record.
        </p>
      ) : null}

      <form action={updateClientProfileAction} className="space-y-4">
        <Section
          title="Contact"
          note={`Email is how you sign in — ask ${doula.firstName} to change it.`}
        >
          <Field
            name="preferredName"
            label="Preferred name"
            defaultValue={client.preferredName ?? ""}
            autoComplete="given-name"
            placeholder={client.displayName}
          />
          <div className="space-y-1.5">
            <Label className="text-[13px] text-teal-ink">Email</Label>
            <p className="rounded-md bg-cloud px-3 py-2 text-[13.5px] text-teal-ink ring-1 ring-teal/10">
              {client.email}
            </p>
          </div>
          <Field
            name="phone"
            label="Phone"
            defaultValue={client.phone ?? ""}
            type="tel"
            autoComplete="tel"
          />
          <Field
            name="edd"
            label="Estimated due date"
            defaultValue={client.edd ?? ""}
            type="date"
          />
        </Section>

        <Section title="Address" note="Where a home visit would happen.">
          <Field
            name="addressLine1"
            label="Street address"
            defaultValue={client.addressLine1 ?? ""}
            autoComplete="address-line1"
          />
          <Field
            name="addressLine2"
            label="Apartment, suite, floor"
            defaultValue={client.addressLine2 ?? ""}
            autoComplete="address-line2"
          />
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field
              name="city"
              label="City"
              defaultValue={client.city ?? ""}
              autoComplete="address-level2"
            />
            <Field
              name="region"
              label="State"
              defaultValue={client.region ?? ""}
              autoComplete="address-level1"
            />
            <Field
              name="postalCode"
              label="Postal code"
              defaultValue={client.postalCode ?? ""}
              autoComplete="postal-code"
            />
          </div>
        </Section>

        <Section
          title="Alternate"
          note={`Who ${doula.firstName} reaches if you cannot be reached.`}
        >
          <Field
            name="alternateContactName"
            label="Alternate contact"
            defaultValue={client.alternateContactName ?? ""}
          />
          <Field
            name="alternateContactPhone"
            label="Alternate phone"
            defaultValue={client.alternateContactPhone ?? ""}
            type="tel"
          />
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Save profile</Button>
          <p className="text-[12.5px] text-muted-foreground">
            Health detail belongs on your forms, not here.
          </p>
        </div>
      </form>
    </div>
  );
}
