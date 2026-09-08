# What NOVA still keeps in Dubsado (TOK-39 E3)

Inventory, not a roadmap. NOVA Birth Partners is leaving Dubsado's Birth Prep portal
(`clientportal.novabirthpartners.com`), and most of what a family did there they now do in
Tokos. This file lists the birth details and documents that a NOVA family or doula would
still have to open Dubsado to find, so nobody discovers one of them mid-cutover.

Each row says what Dubsado holds, what Tokos holds today, and what the gap actually costs.
Nothing here is scheduled and nothing here is half-built — if a capability is listed as
missing, there is no partial implementation of it in the repo.

## Closed by TOK-39

| Dubsado | Tokos today |
|---|---|
| Home counts (forms, invoices, emails) | `/portal` checklist cards, `lib/checklist.ts` |
| Contract/invoice states in family wording | `contractStatusLabel` / `invoiceStatusLabel` in `lib/client-status.ts` |
| Resources gated until signed + paid | `resourcesUnlocked` / `resourceGate` in `lib/resource-gate.ts`, enforced on the page *and* in `markResourceDoneAction` |
| Portal wears the practice's name | `clientChrome` in `lib/client-brand.ts`; org `portalName` "NOVA Birth Prep" |
| Branded portal mail | In-portal Messages (`/portal/messages`) — a thread, not an inbox |

## Still Dubsado-only

### 1. Birth details as a record, not as answers

Dubsado's Birth Prep questionnaires carry the operational facts a doula pulls up on the
way to a birth: care provider and practice, delivery location, planned support people,
allergies, previous births.

Tokos stores the same information only as **free-text form answers**
(`form_submissions.answersJson`, keyed by field id). `lib/forms.ts` supports three field
types — `text`, `textarea`, `date` — so there is no structured provider, hospital, or
birth-history record to query, filter, or show on a client header. The `clients` row
carries `edd`, address, and one `alternateContact*` pair; everything else lives in prose.

**Cost:** a doula can read a family's birth details, but cannot list "everyone delivering
at Inova this month" or see the provider name anywhere except inside the form that asked
for it.

### 2. Client-uploaded documents

Dubsado lets a family attach a file — a hospital packet, an insurance card, a birth plan
they wrote elsewhere.

Tokos moves files one direction. `resources` may carry a `fileObjectId` and staff share
them through `resource_shares`; there is no client-side upload action anywhere in
`src/app/actions/client.ts`. A family who has a document sends a message about it.

### 3. Birth plan as a document

Dubsado's birth-plan output is a document NOVA prints and hands to a birth team.

Tokos has the seeded **Birth preferences** template — two open questions about atmosphere
and the first hours — which is the conversation, not the artifact. There is no
printable/exportable birth plan, no PDF render of form answers, and no version of a plan
that survives leaving the portal.

### 4. Postpartum and birth outcome

Dubsado holds the after: birth outcome, postpartum visit notes, feeding follow-up.

Tokos has the seeded **First two weeks at home** form and `portal_messages`. There is no
birth outcome field, no visit note type, and `calendar_events` records that a visit
happened without recording what happened in it.

### 5. Contract library and templates

Dubsado stores NOVA's contract templates and clause library.

Tokos `contracts` rows are per-client with a package label and an e-sign artifact; there
is no reusable contract template table. New agreements are authored per client. (Email
*does* have templates — `email_templates` / `email_template_versions` — contracts do not.)

### 6. Payment plans and scheduled invoices

Dubsado schedules a payment plan against a package.

Tokos `invoices` + `invoice_lines` are one bill at a time, created when someone creates
them. Nothing generates the second and third installment on a date.

---

## Deliberately not parity

Not gaps — decisions. Listed so they are not re-opened as gaps later.

- **No SMS.** Messages stay in the portal (`components/brand/messages.tsx`). Dubsado's SMS
  is out of scope.
- **No third-party scheduler.** The Tokos calendar is the system of record (TOK-26); there
  is no Acuity sync.
- **Emails inbox → one thread.** Dubsado shows a branded mail archive; Tokos shows a single
  conversation with the assigned doula, which is what a family actually reads.
- **No stage badges on client surfaces.** Dubsado leaks workflow state to the family;
  `lib/client-status.ts` exists specifically so Tokos does not.
