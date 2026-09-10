import Link from "next/link";
import { chaseInvoiceAction } from "@/app/actions/invoices";
import { resendAgreementAction, sendContractAction } from "@/app/actions/doula";
import { MarkPaidButton } from "@/components/brand/mark-paid-dialog";
import { MONEY_COPY, type FamilyMoney } from "@/lib/family-money";
import { cn } from "@/lib/utils";

/**
 * Contracts & invoices on a family record (TOK-77).
 *
 * The rule this card is built around: **every money row ends in a verb**. What it
 * replaces printed `Postpartum package · sent · $1,200.00` three times over and offered
 * nothing to press, so the next step — chase the invoice, open the agreement, record the
 * cheque that arrived — always happened on some other page.
 *
 * Which verbs appear is decided in `@/lib/family-money`, not here, so a settled invoice
 * cannot sprout a Chase button in one layout and not another. This file's only judgement
 * is emphasis, and it has one rule: **filled means something is owed of you**. Resend,
 * Mark paid and Send contract are filled; Open agreement and Open invoice are outlined,
 * because reading a record is not a task. A settled row therefore has no filled button at
 * all, which is the honest thing for a row where nothing is outstanding.
 */

const STATUS_TONE = {
  coral: "bg-coral/12 text-coral",
  teal: "bg-teal/12 text-teal",
  ink: "bg-secondary text-teal-ink",
} as const;

const NOTICE_TONE = {
  teal: "bg-teal/10 text-teal-ink ring-teal/20",
  coral: "bg-coral/10 text-coral ring-coral/20",
} as const;

const PRIMARY_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-lg bg-teal px-3 text-[12.5px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90";
const SECONDARY_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-lg border border-teal/25 bg-card px-3 text-[12.5px] font-semibold text-teal-ink transition-colors hover:bg-teal/10";

function StatusChip({ label, tone }: { label: string; tone: keyof typeof STATUS_TONE }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        STATUS_TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

/** Name, money, human status and the dates on one dense line pair. */
function MoneyRow({
  title,
  amountLabel,
  status,
  meta,
  children,
}: {
  title: string;
  amountLabel: string;
  status: { label: string; tone: keyof typeof STATUS_TONE };
  meta: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg bg-cloud px-3 py-2.5 ring-1 ring-teal/12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-[13.5px] font-semibold text-teal-ink">{title}</p>
        <p className="shrink-0 font-heading text-[15px] font-semibold tabular-nums text-teal-ink">
          {amountLabel}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip label={status.label} tone={status.tone} />
        {meta ? <span className="text-[12px] text-muted-foreground">{meta}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </li>
  );
}

export function FamilyMoneyCard({
  money,
  clientId,
  familyName,
  notice,
}: {
  money: FamilyMoney;
  clientId: string;
  familyName: string;
  notice: { tone: "teal" | "coral"; text: string } | null;
}) {
  return (
    <section
      id="money"
      className="scroll-mt-24 rounded-xl bg-card ring-1 ring-teal/15"
      aria-labelledby="money-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-teal/12 px-4 py-2.5">
        <h2 id="money-heading" className="font-heading text-[17px] text-teal-ink">
          {MONEY_COPY.title}
        </h2>
        <Link
          href="/doula/invoices"
          className="text-[12.5px] font-semibold text-coral hover:underline"
        >
          {MONEY_COPY.ledgerLink} →
        </Link>
      </header>

      <div className="space-y-2 p-3">
        {notice ? (
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-[12.5px] font-semibold ring-1",
              NOTICE_TONE[notice.tone],
            )}
          >
            {notice.text}
          </p>
        ) : null}

        {money.empty ? (
          <p className="px-1 pb-1 text-[13px] leading-snug text-muted-foreground">
            {MONEY_COPY.empty}
          </p>
        ) : null}

        <ul className="space-y-2">
          {money.contracts.map((contract) => (
            <MoneyRow
              key={contract.id}
              title={contract.packageLabel}
              amountLabel={contract.amountLabel}
              status={contract.status}
              meta={contract.whenLabel}
            >
              {contract.agreementHref ? (
                <Link href={contract.agreementHref} className={SECONDARY_BUTTON}>
                  {MONEY_COPY.openAgreement}
                </Link>
              ) : null}
              {contract.canResend ? (
                <form action={resendAgreementAction}>
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="clientId" value={clientId} />
                  <button type="submit" className={PRIMARY_BUTTON}>
                    {MONEY_COPY.resendAgreement}
                  </button>
                </form>
              ) : null}
            </MoneyRow>
          ))}

          {money.invoices.map((invoice) => (
            <MoneyRow
              key={invoice.id}
              title={invoice.number}
              amountLabel={invoice.amountLabel}
              status={invoice.status}
              meta={invoice.dueLabel}
            >
              <Link href={invoice.openHref} className={SECONDARY_BUTTON}>
                {MONEY_COPY.openInvoice}
              </Link>
              {invoice.canMarkPaid ? (
                <MarkPaidButton
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.number}
                  familyName={familyName}
                  amountLabel={invoice.amountLabel}
                  returnClientId={clientId}
                  label={MONEY_COPY.markPaid}
                />
              ) : null}
              {invoice.canChase ? (
                <form action={chaseInvoiceAction}>
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <input type="hidden" name="returnClientId" value={clientId} />
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {MONEY_COPY.chase}
                  </button>
                </form>
              ) : null}
            </MoneyRow>
          ))}
        </ul>

        {money.canSendContract ? (
          <div className="rounded-lg border border-dashed border-teal/25 px-3 py-2.5">
            <form action={sendContractAction.bind(null, clientId)}>
              <button type="submit" className={PRIMARY_BUTTON}>
                {MONEY_COPY.sendContract}
              </button>
            </form>
            <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
              {MONEY_COPY.sendContractHint}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
