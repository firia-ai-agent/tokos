import Link from "next/link";
import { requireStaffManager } from "@/lib/tenancy";
import { importLeadsCsvAction } from "@/app/actions/leads";
import { COLUMN_ALIASES, IMPORT_FIELDS, IMPORT_SOURCE_LABEL } from "@/lib/csv-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Lead import (TOK-49). Owner/admin only — `requireStaffManager` throws for anyone else,
 * and the action re-checks rather than trusting that this page was the one that rendered
 * the form.
 *
 * CSV only. There is no Airtable connection here and no credential for one: a one-time
 * migration does not justify holding a standing key to somebody else's base.
 */
export default async function ImportLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireStaffManager();
  const { done, error } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl text-teal-ink">Import leads</h2>
          <p className="text-sm text-muted-foreground">
            Export your board to CSV and drop it here. Everything that arrives this way is
            tagged {IMPORT_SOURCE_LABEL.toLowerCase()}.
          </p>
        </div>
        <Link href="/doula/clients" className="text-[13px] font-semibold text-teal hover:underline">
          ← Back to pipeline
        </Link>
      </div>

      {done ? (
        <p className="rounded-lg bg-teal/12 px-3.5 py-2.5 text-[13px] font-semibold text-teal-ink">
          Import complete — {done}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-coral/12 px-3.5 py-2.5 text-[13px] font-semibold text-coral">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload a CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={importLeadsCsvAction} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="text-[13px] text-teal-ink file:mr-3 file:rounded-md file:border-0 file:bg-teal/12 file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-teal-ink"
            />
            <Button type="submit" size="sm">
              Import
            </Button>
          </form>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Re-importing is safe. Rows are matched on Intake # first and email second, so a
            corrected export updates the same families instead of doubling the board. Your
            intake numbers are preserved. Stage is never overwritten on an existing record —
            the pipeline is Tokos&apos;s, not the spreadsheet&apos;s.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Columns we recognise</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            Header names are matched loosely — case and punctuation do not matter. Anything
            we do not recognise is left alone rather than guessed at.
          </p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <div key={field}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {field}
                </dt>
                <dd className="text-[12.5px] text-teal-ink">
                  {COLUMN_ALIASES[field].slice(0, 4).join(" · ")}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
