import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { canManageTeam } from "@/lib/team";
import { DEFAULT_PRIMARY_COLOR, TIMEZONES, contrastInk } from "@/lib/brand";
import { saveOrgBrandAction } from "@/app/actions/settings";
import { BrandColorField } from "@/components/brand/brand-color";
import { SettingsTabs } from "@/components/brand/settings-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  brand: { tone: "teal", text: "Brand saved. Families see it on their next page load." },
  org: { tone: "coral", text: "Sign in again — your workspace could not be read." },
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export default async function DoulaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  const manages = canManageTeam(staff.membershipRole);
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);

  const notice = NOTICES[query.error ?? ""] ?? NOTICES[query.saved ?? ""];
  const color = org?.primaryColor ?? DEFAULT_PRIMARY_COLOR;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Workspace</p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Brand
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            The name, colour, and words families meet in the portal and at the bottom of
            every transactional email.
          </p>
        </div>
        <SettingsTabs />
      </header>

      {notice ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm ring-1",
            notice.tone === "coral"
              ? "bg-coral/10 text-coral ring-coral/20"
              : "bg-teal/10 text-teal-ink ring-teal/20",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">Practice identity</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {manages
                ? "Owner and admin only. Saved values show here on reload."
                : "Read-only — your founder or an admin edits the brand."}
            </p>
          </div>
          <div className="px-5 py-4">
            <form action={saveOrgBrandAction} className="space-y-4">
              <fieldset disabled={!manages} className="space-y-4 disabled:opacity-70">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="portalName">Portal name</Label>
                    <Input
                      id="portalName"
                      name="portalName"
                      defaultValue={org?.portalName ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <select
                      id="timezone"
                      name="timezone"
                      className={SELECT_CLASS}
                      defaultValue={org?.timezone ?? "America/New_York"}
                    >
                      {TIMEZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <BrandColorField defaultValue={color} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="websiteUrl">Website</Label>
                    <Input
                      id="websiteUrl"
                      name="websiteUrl"
                      defaultValue={org?.websiteUrl ?? ""}
                      placeholder="https://yourpractice.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onCallPhone">On-call phone</Label>
                    <Input
                      id="onCallPhone"
                      name="onCallPhone"
                      defaultValue={org?.onCallPhone ?? ""}
                      placeholder="(703) 555-0148"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confidentialityBlurb">Confidentiality note</Label>
                  <Textarea
                    id="confidentialityBlurb"
                    name="confidentialityBlurb"
                    rows={3}
                    defaultValue={org?.confidentialityBlurb ?? ""}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Shown to families in the portal. Plain text — tags are stripped.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="footerHtml">Email footer</Label>
                  <Textarea
                    id="footerHtml"
                    name="footerHtml"
                    rows={3}
                    defaultValue={org?.footerHtml ?? ""}
                    className="font-mono text-[12.5px]"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Light HTML only — <code>b</code>, <code>i</code>, <code>a</code>,{" "}
                    <code>br</code>, <code>p</code>, <code>span</code>, <code>small</code>.
                    Scripts and handlers are removed on save.
                  </p>
                </div>

                <Button type="submit">Save brand</Button>
              </fieldset>
            </form>
          </div>
        </section>

        <section className="space-y-4">
          <article className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
            <div className="px-4 py-3" style={{ backgroundColor: color, color: contrastInk(color) }}>
              <p className="text-[0.62rem] uppercase tracking-[0.24em] opacity-80">Portal header</p>
              <p className="mt-0.5 font-heading text-[17px] font-semibold leading-tight">
                {org?.portalName ?? "Your practice"}
              </p>
            </div>
            <div className="space-y-2 px-4 py-3.5 text-[12.5px] text-muted-foreground">
              <p>
                <span className="font-semibold text-teal-ink">Colour</span>{" "}
                <span className="font-mono">{color}</span>
              </p>
              <p>
                <span className="font-semibold text-teal-ink">On call</span>{" "}
                {org?.onCallPhone ?? "—"}
              </p>
              <p>
                <span className="font-semibold text-teal-ink">Website</span>{" "}
                {org?.websiteUrl ?? "—"}
              </p>
              <p>
                <span className="font-semibold text-teal-ink">Timezone</span>{" "}
                {org?.timezone ?? "—"}
              </p>
            </div>
          </article>

          <article className="rounded-xl bg-card ring-1 ring-teal/15">
            <div className="border-b border-teal/10 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Email footer, as saved
              </p>
            </div>
            <div className="px-4 py-3.5 text-[12.5px] leading-relaxed text-teal-ink">
              {org?.footerHtml ? (
                <div dangerouslySetInnerHTML={{ __html: org.footerHtml }} />
              ) : (
                <p className="text-muted-foreground">No footer set.</p>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
