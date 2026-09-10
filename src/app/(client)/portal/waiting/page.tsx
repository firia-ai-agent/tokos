import Link from "next/link";
import { requireClient } from "@/lib/tenancy";
import { clientAgreementStatuses, clientChecklist } from "@/lib/queries";
import { resourcesUnlocked } from "@/lib/resource-gate";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { waitingBoard, type WaitingItem } from "@/lib/home-queues";
import { cn } from "@/lib/utils";

/**
 * Waiting for you (TOK-52) — where the count on Home lands.
 *
 * Home's six cards are a map of the portal: forms over here, pay over there. This is the
 * list, in the order a person would actually work it, with the open chores first and the
 * finished ones still visible underneath — because "your agreement is signed" is worth
 * reading when you are trying to remember whether you signed it.
 *
 * Family voice only. Nothing on this page knows what a pipeline is.
 */
function WaitingRow({ item }: { item: WaitingItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 ring-1 transition",
          item.tone === "coral"
            ? "ring-coral/30 hover:ring-coral/55"
            : "ring-teal/15 hover:ring-teal/35",
        )}
      >
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {item.title}
          </p>
          <p
            className={cn(
              "mt-1 text-[16px] font-semibold",
              item.tone === "coral" ? "text-coral" : "text-teal-ink",
            )}
          >
            {item.ask}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{item.detail}</p>
        </div>
        <span className="shrink-0 text-[13px] font-semibold text-teal">{item.action} →</span>
      </Link>
    </li>
  );
}

export default async function PortalWaitingPage() {
  const session = await requireClient();
  const checklist = await clientChecklist(session.organizationId, session.clientId);

  // Same resolve Home does, so the board names the same person her cards do.
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  // Same gate `/portal/resources` draws (TOK-39 E2) — the board must not send a family
  // at a shelf that will refuse to open.
  const agreement = await clientAgreementStatuses(session.organizationId, session.clientId);
  const board = waitingBoard(checklist, doula.name, {
    resourcesLocked: !resourcesUnlocked(agreement),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          Waiting for you
        </p>
        <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink sm:text-[32px]">
          {board.summary}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {board.open.length === 0
            ? `Nothing is open right now. ${doula.firstName} will let you know when something needs you.`
            : `Everything ${doula.name} is waiting on, in one place. Come back to it whenever you have a minute.`}
        </p>
      </header>

      {board.open.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="font-heading text-xl text-teal-ink">Still open</h2>
          <ol className="grid gap-2.5">
            {board.open.map((item) => (
              <WaitingRow key={item.key} item={item} />
            ))}
          </ol>
        </section>
      ) : null}

      {/* Handouts and visits are not homework, so they never sit in the open list — but a
          family looking for "what is going on with my care" wants them on this page. */}
      {board.alsoHere.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="font-heading text-xl text-teal-ink">Also here for you</h2>
          <ol className="grid gap-2.5">
            {board.alsoHere.map((item) => (
              <WaitingRow key={item.key} item={item} />
            ))}
          </ol>
        </section>
      ) : null}

      {board.done.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="font-heading text-xl text-teal-ink">Already done</h2>
          <ol className="grid gap-2.5">
            {board.done.map((item) => (
              <WaitingRow key={item.key} item={item} />
            ))}
          </ol>
        </section>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Not sure about any of it?{" "}
        <Link
          href="/portal/messages"
          className="font-semibold text-teal underline-offset-2 hover:underline"
        >
          Message {doula.name}
        </Link>{" "}
        — no question is too small.
      </p>
    </div>
  );
}
