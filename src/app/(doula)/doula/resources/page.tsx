import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { listOrgClients, resourcesHub } from "@/lib/queries";
import {
  createResourceAction,
  shareResourcesWithFamiliesAction,
  unshareResourceAction,
} from "@/app/actions/resources";
import {
  isPersonalResource,
  RESOURCE_OWNER_FIELD,
  RESOURCE_OWNER_MINE,
  RESOURCE_OWNER_PRACTICE,
} from "@/lib/provider-resources";
import { PickHeading, PickList } from "@/components/brand/send-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  resource: { tone: "teal", text: "Saved to your library. Share it with a family below." },
  share: { tone: "teal", text: "Added to their portal." },
  title: { tone: "coral", text: "A resource needs a title." },
  empty: { tone: "coral", text: "Add a link or some text — a resource needs something to open." },
  duplicate: { tone: "coral", text: "They already have those handouts." },
  share_pick: { tone: "coral", text: "Tick at least one handout and one family." },
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export default async function DoulaResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string; shared?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  const hub = await resourcesHub(staff.organizationId, staff.userId);
  const clients = await listOrgClients(staff.organizationId, staff.userId);
  const notice = NOTICES[query.error ?? ""] ?? NOTICES[query.created ?? ""];
  const sharedCount = Number(query.shared ?? 0);

  const shareCountFor = (resourceId: string) =>
    hub.shares.filter((row) => row.resource.id === resourceId).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Resources
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            Your handout library. Share into a family portal and see what has been read.
          </p>
        </div>
        <div className="flex gap-3">
          <article className="rounded-xl bg-card px-4 py-3 ring-1 ring-teal/15">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              In library
            </p>
            <p className="mt-1 font-heading text-[22px] font-semibold leading-none tabular-nums text-teal-ink">
              {hub.library.length}
            </p>
          </article>
          <article className="rounded-xl bg-card px-4 py-3 ring-1 ring-teal/15">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Read by families
            </p>
            <p className="mt-1 font-heading text-[22px] font-semibold leading-none tabular-nums text-teal">
              {hub.readCount}/{hub.shares.length}
            </p>
          </article>
        </div>
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
          {notice.tone === "teal" && sharedCount > 0
            ? ` ${sharedCount} handout${sharedCount === 1 ? "" : "s"} went out.`
            : null}
        </p>
      ) : null}

      {/* Share a handout (TOK-50 / CRM-FIRST §2B). The Family dropdown used to live in
          every card; picking three handouts for one family meant three round trips.
          One picker of handouts, one of families, one button. */}
      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Share a handout</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Tick the handouts, tick who they are for, add them once.
          </p>
        </div>
        {hub.library.length === 0 || clients.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            {hub.library.length === 0
              ? "Nothing in the library yet. Write your first handout below."
              : "No assigned families yet — a family lands here once she books a consult with you."}
          </p>
        ) : (
          <form action={shareResourcesWithFamiliesAction} className="space-y-4 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <PickHeading>Handouts</PickHeading>
                <PickList
                  name="resourceIds"
                  items={hub.library.map((resource) => ({
                    id: resource.id,
                    label: resource.title,
                    hint: `${resource.kind} · with ${shareCountFor(resource.id)} famil${
                      shareCountFor(resource.id) === 1 ? "y" : "ies"
                    }`,
                  }))}
                  emptyLabel="Nothing in the library yet."
                />
              </div>
              <div className="space-y-2">
                <PickHeading>Families</PickHeading>
                <PickList
                  name="clientIds"
                  items={clients.map(({ client }) => ({
                    id: client.id,
                    label: client.displayName,
                    hint: client.edd ? `due ${client.edd}` : undefined,
                  }))}
                  emptyLabel="No assigned families yet."
                />
              </div>
            </div>
            <Button type="submit" size="sm">
              Add to their portal
            </Button>
          </form>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">Library</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Prep handouts you have written or linked.
            </p>
          </div>
          {hub.library.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Nothing in the library yet. Add your first handout on the right.
            </p>
          ) : (
            <ul className="divide-y divide-teal/10">
              {hub.library.map((resource) => (
                <li key={resource.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-teal-ink">{resource.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {resource.kind} · shared with {shareCountFor(resource.id)} famil
                        {shareCountFor(resource.id) === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Says out loud which sheets are in her own voice (TOK-70) — the
                          practice's handouts carry no such mark because they are simply
                          everyone's. */}
                      {isPersonalResource(resource) ? (
                        <Badge variant="secondary" className="bg-coral/12 text-coral">
                          Yours
                        </Badge>
                      ) : null}
                      {(resource.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-teal/10 text-teal-ink">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {resource.body ? (
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                      {resource.body}
                    </p>
                  ) : null}
                  {resource.url ? (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-block text-[12.5px] font-semibold text-teal hover:underline"
                    >
                      Open link ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 bg-teal-ink px-5 py-3.5">
            <h2 className="font-heading text-lg text-cloud">New resource</h2>
            <p className="mt-0.5 text-[12px] text-cloud/65">
              Write a handout or point at something you trust.
            </p>
          </div>
          <form action={createResourceAction} className="space-y-3 px-5 py-4">
            <div className="space-y-1.5">
              <label htmlFor="resource-title" className="text-[13px] font-medium text-teal-ink">
                Title
              </label>
              <Input id="resource-title" name="title" required placeholder="Comfort measures at home" />
            </div>
            {/* Whose handout this is (TOK-70). A sheet written in the first person is
                hers; anything the practice wrote belongs to the whole roster. */}
            <div className="space-y-1.5">
              <label htmlFor="resource-owner" className="text-[13px] font-medium text-teal-ink">
                Whose is it
              </label>
              <select
                id="resource-owner"
                name={RESOURCE_OWNER_FIELD}
                defaultValue={RESOURCE_OWNER_PRACTICE}
                className={SELECT_CLASS}
              >
                <option value={RESOURCE_OWNER_PRACTICE}>
                  The whole practice — everyone here can share it
                </option>
                <option value={RESOURCE_OWNER_MINE}>
                  Mine — written in my voice, only in my library
                </option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-kind" className="text-[13px] font-medium text-teal-ink">
                Kind
              </label>
              <select id="resource-kind" name="kind" defaultValue="handout" className={SELECT_CLASS}>
                <option value="handout">Handout</option>
                <option value="link">Link</option>
                <option value="checklist">Checklist</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-url" className="text-[13px] font-medium text-teal-ink">
                Link (optional)
              </label>
              <Input id="resource-url" name="url" type="url" placeholder="https://" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-body" className="text-[13px] font-medium text-teal-ink">
                Text
              </label>
              <Textarea id="resource-body" name="body" rows={5} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-tags" className="text-[13px] font-medium text-teal-ink">
                Tags
              </label>
              <Input id="resource-tags" name="tags" placeholder="comfort, labor" />
            </div>
            <Button type="submit">Save resource</Button>
          </form>
        </article>
      </section>

      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Shared with families</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            &ldquo;Read&rdquo; is the family marking it done in their portal — nothing is inferred.
          </p>
        </div>
        {hub.shares.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Nothing shared yet. Tick a handout and a family above.
          </p>
        ) : (
          <ul className="divide-y divide-teal/10">
            {hub.shares.map(({ share, resource, client }) => (
              <li
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-teal-ink">
                    {resource.title}
                    <Link
                      href={`/doula/clients/${client.id}`}
                      className="ml-2 text-[13px] font-medium text-teal hover:underline"
                    >
                      {client.displayName}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    Shared {format(share.sharedAt, "MMM d")}
                    {share.completedAt ? ` · read ${format(share.completedAt, "MMM d")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      share.completedAt ? "bg-teal/12 text-teal-ink" : "bg-coral/12 text-coral"
                    }
                  >
                    {share.completedAt ? "Read" : "Unread"}
                  </Badge>
                  <form action={unshareResourceAction}>
                    <input type="hidden" name="shareId" value={share.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Unshare
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
