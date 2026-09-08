# Tokos

OS for birth work. First customer: **NOVA Birth Partners**.

This repository is Linear **[TOK-10](https://linear.app/tokos/issue/TOK-10/phase-1-milestone-intake-signed-contract-in-tokos)** Slice 1: a NOVA doula can take a client from intake → signed/**complete** contract, and that client can use the Tokos portal.

Architecture is locked by **TOK-6 Accepted 2026-09-07**. Do not freelance vendors.

## Accepted stack

- Next.js App Router on Vercel Pro
- Neon Launch Postgres + **Drizzle**
- **Auth.js** (NextAuth v5) for staff/doula/client
- Dropbox Sign Essentials via **redirect** e-sign
- Stripe Checkout / PaymentIntents
- **Tokos calendar SoR** (first-party, cal.com-shaped — no Acuity)
- Resend for PHI-free transactional email
- S3 for signed evidence / file objects
- Outbox + Cron for reliable sends

Explicitly out: AI, claims/Medicaid, Acuity, SMS/HIPAA messaging, Dubsado migrate, investor/network chrome, clinical branding.

## Complete rule

`agreement_signed` is **intent only**.

`contract_complete` only when **(a) fit is confirmed** and **(b) payment is cleared**.

Illegal: `agreement_signed` before `fit`.

Canonical stages: `new_lead` → `intro` → `fit` → `agreement_signed` → `contract_complete` → `active_care`.

## Local run

Postgres 16 on localhost is enough for demo. Production uses Neon (`DATABASE_URL` from the Vercel Neon integration).

```bash
# 1. Create a local database (once)
sudo -u postgres psql -c "CREATE USER tokos WITH PASSWORD 'tokos_local' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE tokos OWNER tokos;"

# 2. Env
cp .env.example .env.local
# set AUTH_SECRET (openssl rand -base64 32)

# 3. Install, migrate, seed, dev
npm install
npm run db:push
npm run db:seed
npm run test
npm run dev
```

App: [http://127.0.0.1:43127](http://127.0.0.1:43127)

Demo logins after seed (password `tokos-demo`):

| Role | Email | Notes |
| --- | --- | --- |
| Doula / owner | `maya@novabirthpartners.com` | Sees Jordan **and** Avery (NOVA) |
| Client | `jordan.rivera@example.com` | Primary happy-path client |
| Client | `avery.kim@example.com` | Second NOVA client at `new_lead` |
| Other-org client | `riley.voss@example.com` | Cedar Birth Collective — Maya must not see |
| Other-org doula / owner | `sam@cedarbirth.co` | Owns Cedar Birth Collective — must not see or write to NOVA clients (IDOR / TOK-20 probe) |

Public profile + Book Consult: `/p/maya-chen`

**Provider photo (TOK-25):** as Maya, `/doula/profile` → **Profile photo** → pick a JPEG/PNG/WebP
up to 2MB → **Save profile**. It shows on `/p/maya-chen` and `/p/maya-chen/book` alongside her
credentials, and **Remove photo** puts the initials fallback back. Photos go to S3 when keys are
set; without them the bytes stay on the `file_objects` row so preview deploys still render.
Uploads are sniffed by magic bytes, so a renamed PDF or an SVG is rejected whatever the browser
declared. `/api/media/<id>` serves provider photos only — it will not hand back signed contract
evidence, which shares that table. The seed already attaches a generated placeholder portrait to
Maya and Sam through that same upload path, so both public profiles have a face out of the box —
use **Remove photo** to see the initials fallback.

**Tokos calendar (TOK-26):** as Maya, `/doula/calendar` sets the weekly availability windows
(scoped to her org **and** her user) and **My schedule** lists the upcoming events on her Tokos
calendar. Public `/p/<slug>/book` and the client portal's **Book consult** both create the
lead/event straight on that calendar, behind the same `isSlotOpen` gate — a posted time that is in
the past, outside a window, or already taken is rejected server-side and the page says which.
Clients see their future consults on `/portal/calendar` under **Upcoming consults**. Slots expand
in `America/New_York` wall clock, so a 10:00 window stays 10:00 across DST. No Acuity.

**Forms, resources, and co-complete (TOK-27):** as Maya, `/doula/forms` is the hub —
**New template** builds one from a plain list (`Label | type | sensitive`, one per line),
and each template card assigns to a family with who fills it in, an optional due date, and
an optional email nudge. `/doula/resources` is the same shape for handouts: write or link
one, share it to a family's portal, and watch the read counter. **In flight** shows every
assignment, and a complete one prints its answers inline. Families do their side at
`/portal/forms` — the card shows what is waiting, saves answers, and then shows them back.
A doula finishes a form *with* a family from **Forms (co-complete)** on the client record,
prefilled from whatever the family already typed; **Reopen** hands it back for edits.

**Client portal home, messaging, and profile (TOK-28):** `/portal` is the family's
checklist. The four things they actually owe — **Forms**, **Agreement**, **Pay**, and
unread **Messages** — are counted from real rows by `clientChecklist`, and every count is
labelled ("2 open", "1 to sign", "1 unread") rather than left as a bare number. Anything
still open is coral; once it is clear the card goes Teal Ink and says so ("Nothing due",
"No new messages"). **Resources** and **Consults** stay on the grid as context and never go
coral. Messages carries a small coral badge while something is unread.

Messaging is one thread per family, rendered from the same `portal_messages` rows on both
sides by `MessageThread` in `src/components/brand/messages.tsx`: chronological, bubbled,
with the sender named, a relative stamp ("3 hrs ago", full date in the `title`), day
dividers, and a composer that sticks to the bottom of the thread. The family reads and
writes at `/portal/messages`; the doula answers from **Portal messages** on the client
record. `/doula/messages` is now an inbox of conversations — one card per family, newest
first, with the last line and an unread count, linking to that family's record. **Opening a
thread is what marks it read**: `/portal/messages` stamps `read_at` on the doula's unread
notes (org + client scoped) and revalidates `/portal`, so the Home unread count drops;
opening the client record does the mirror for what the family wrote. Still no SMS — this
stays in Tokos.

`/portal/profile` is the family's own record: **Contact** (preferred name, read-only
sign-in email, phone, estimated due date), **Address** (including line 2), and
**Alternate**, in the same `rounded-xl bg-card ring-teal/15` chrome as the rest of the
portal, with a saved banner after the redirect. An emptied EDD writes `NULL`, not `""`.
Health detail belongs on forms, not here.

**Agency roster, brand, and email templates (TOK-29):** `/doula/team` is the agency
surface. **Roster** lists every membership with the person's credentials, the role
(Founder / Admin / Doula), and how many families they are primary on. **Invite a doula**
takes a work email and a role — `doula` or `admin` only, because ownership is not handed
out by email — writes an `invites` row with a CSPRNG token that expires in 7 days, and
queues the `doula_invited` template with an absolute `/invite/<token>` accept link. The
existing public accept page turns that into a membership. **Invites waiting** shows the
live ones with their accept URL (handy without Resend keys) and a **Withdraw** button.

**Match** names the primary doula on each family's `engagements` row, creating the
engagement when a family does not have one. It is additive: the newly matched doula picks
the family up on their own Clients list, and whoever was already carrying them keeps their
assignment. The same control sits on the client record under **Care team**, and the
pipeline card now reads "Primary: Maya Chen" or "No primary yet". Owner/admin only —
`canAssignPrimaryDoula` re-derives the actor's org, the client's org, **and** the
membership org of the doula being named before anything is written, so a Cedar user id
posted into NOVA is refused rather than saved.

`/doula/settings` edits the practice brand: portal name, primary colour (with a live
preview chip and a colour picker), website, on-call phone, confidentiality note, email
footer, and timezone. Everything goes through `sanitizeBrand` on the way in — a bad hex
falls back to the current colour instead of reaching an inline style, a `javascript:`
website reads back as null, and the footer HTML is narrowed to inline formatting with
script blocks and `on*=` handlers removed. Families see the portal name and the
confidentiality / on-call strip at `/portal` on their next load.

`/doula/settings/email` is the EmailTemplate editor. Each of the six triggers can be
enabled or disabled and have its from name, reply-to, subject, plain text, and HTML
edited, with a preview panel that renders the current draft against invented sample
values. Saving updates the live template **and** appends an `email_template_versions` row
at `max(version) + 1` — wording changes publish a version, a toggle or a reply-to change
alone does not. The variable allowlist is the firewall here: a template may only mention
what its trigger actually supplies, so `{{answer_1}}` — or `{{sign_url}}` on a form
reminder — is refused on save with the offending names named. Seeded templates stay
editable; the editor is org-scoped, so a template id from another tenant reads back as
nothing.

**PHI firewall (TOK-27):** a question marked `| sensitive` — or worded as health, notes,
history, or medication — gets a coral **Sensitive** badge everywhere it appears and never
leaves the portal. Form emails carry three vars only: `client_name`, `portal_url`,
`open_forms`. `assertAnswersNotInEmail` re-checks the outgoing vars against the latest
submission before any enqueue, so a var that repeats something the family typed throws
instead of sending. Covered in `src/lib/forms.test.ts`.

Reseed (wipes local/demo data, then recreates the tenants above):

```bash
npm run db:seed
```

### Demo path (intake → complete contract)

1. Sign in as Maya. Jordan **and** Avery are `new_lead` on Home / Clients. Repeat the same path for Avery, or use Avery to confirm Jordan cannot open another client's portal IDs.
2. Open Jordan → **Send intro** → **Start fit** (or book a consult from `/p/maya-chen`).
3. **Confirm fit**. Fit confirmation is required for complete; a signature is not enough.
4. **Send contract**. This creates a Tokos contract, Stripe invoice, Dropbox Sign request (stub without keys), and outbox emails.
5. Sign out. Sign in as Jordan.
6. Checklist → Agreement → **Review and sign** (Dropbox Sign redirect, or `/stub/sign` in demo). You must be signed in as that client — a bare UUID does not complete sign.
7. Pay → **Pay with card** (Stripe Checkout, or `/stub/pay` in demo). Same auth rule: logged-in Jordan only.
8. Stage becomes `contract_complete` only after steps 3 and 7 (sign-then-pay **or** pay-then-sign). Jordan can use forms, resources, messages, and consults in `/portal`.

**Pay-fail (Veri):** while signed in as Jordan, open `/stub/pay?invoiceId=<id>&result=fail` and click **Simulate failed payment** (or `result=canceled`). Invoice stays due / not paid, `payment_statuses` is `failed` or `canceled` (not cleared), and the stage does not become `contract_complete`.

**Forms + resources (Veri):** as Maya, `/doula/forms` shows 3 templates and 6 open
assignments (3 each for Jordan and Avery); **First two weeks at home** carries two
**Sensitive** questions. Assign one, then open Jordan's record → **Forms (co-complete)** →
fill the postpartum form → **Save with client**: the card flips to **Complete** and prints
the answers, and Jordan sees the same answers at `/portal/forms`. **Reopen** puts it back.
On `/doula/resources`, share **Comfort measures you can practice this week** with a family
and it lands in their portal; **Mark read** flips the counter to read. Every reminder email
in `outbox_messages` carries only a name, a portal link, and a count — no answers, and no
question wording.

**Portal home + messaging (Veri):** sign in as Jordan. `/portal` shows **Messages 1 ·
"1 unread"** in coral with a badge, alongside the labelled Forms / Agreement / Pay counts,
and the header says how many items are on the checklist. Open **Messages**: the thread
reads oldest-first with Maya's welcome on the left and Jordan's seeded reply on the right,
under **Yesterday** / **Today** dividers. Go back to `/portal` — Messages is now Teal Ink
and reads **"No new messages"**, because opening the thread stamped `read_at`. Send a
reply, then sign in as Maya: `/doula/messages` lists Jordan's thread first with a coral
**unread** badge and the last line; open the record and the same thread is mirrored, with
Maya's own notes on the right. `/portal/profile` → add an apartment line and an estimated
due date → **Save profile** → the page comes back with **Profile saved**, and the values
are still there on reload.

**Roster, brand, and templates (Veri):** as Maya (Founder), `/doula/team` shows her on the
roster and one **pending** invite for `alex@novabirthpartners.com`. Invite
`someone@novabirthpartners.com` as **Doula** — it lands in **Invites waiting** with an
expiry ~7 days out and an accept link, and an `outbox_messages` row appears for the
`doula_invited` trigger carrying that link. Inviting the same address again says "already
a live invite"; inviting `maya@novabirthpartners.com` says she is already here. Under
**Match · primary doula**, set Jordan's primary to Maya → the row reads "Primary: Maya
Chen", and so does her card on `/doula/clients` and **Care team** on her record.

`/doula/settings` → change the portal name and set the colour to `#8A3B2F` → **Save
brand** → the banner says saved and both values are still there on reload, with the
preview chip and the portal header swatch in the new colour. Type `notahex` and save: the
colour falls back to what it was. Sign in as Jordan — `/portal` carries the new practice
name and the confidentiality / on-call strip.

`/doula/settings/email` → open **Form reminder** → put `{{answer_1}}` in the subject and
save: it is refused, naming `answer_1`, and nothing is written. Edit the subject properly
and save: the banner says a new version was published and the badge reads **v2**. Toggle
**Enabled** off and save again — the version stays **v2**, because a toggle is not
wording.

**Tenancy probe:** as Maya, `/doula/clients/44444444-4444-4444-8444-444444444446` (Riley / Cedar) must 404. As Jordan, Avery's contract/invoice/stub URLs must not complete or leak. Form and resource writes are org-scoped the same way: a template, assignment, resource, or share id posted from another tenant reads back as nothing.

Without Stripe / Dropbox Sign / Resend / S3 keys, adapters run in **stub mode**. PHI (visit notes, health detail) is never written to email bodies, Stripe metadata, or e-sign custom fields.

## Vercel deploy

1. Create a Vercel Pro project from this repo.
2. Add the **Neon Launch** Marketplace integration and pull `DATABASE_URL`.
3. Set `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and `CRON_SECRET`.
4. Optionally set Stripe, Dropbox Sign, Resend, and S3 keys. Omit them to keep stub mode on preview.
5. `vercel.json` schedules `GET /api/cron/outbox` every 5 minutes. Authorize with `Authorization: Bearer $CRON_SECRET`.
6. Run `npm run db:push` (or `db:migrate` after `db:generate`) against the Neon URL, then `npm run db:seed` for the NOVA demo tenants (Jordan + Avery) and the Cedar IDOR tenant.

`drizzle-kit` and `tsx` do not load `.env.local` themselves — npm scripts wrap them with `dotenv-cli`.

## Tests

```bash
npm run test
npm run smoke   # mutates the seeded client through the funnel; re-run db:seed after
```

Covers the pipeline state machine, the complete rule (signed ≠ complete; no signed-before-fit; pay-then-sign still completes), stub pay-fail honesty, Dropbox Sign webhook HMAC, tenant ownership guards, the form PHI firewall (sensitive-field detection, template parsing, and the guard that refuses to let an answer into an email), the TOK-28 portal helpers: thread ordering, day grouping, timestamps, per-viewer unread counts, doula inbox thread rollup (`src/lib/messages.test.ts`), and the Home checklist labels and coral/Teal-Ink tones (`src/lib/checklist.test.ts`), and the TOK-29 agency helpers: invite token shape and uniqueness, expiry, pending/expired/accepted status, the invite and match guards including the cross-tenant refusals (`src/lib/team.test.ts`), brand sanitising for hex / URL / phone / footer HTML (`src/lib/brand.test.ts`), and the template variable allowlist and version bump (`src/lib/email-templates.test.ts`).

## Built vs deferred

**In this slice**

- App Router route groups `(public)` / `(doula)` / `(client)`
- Drizzle P1 schema + multi-tenant `organization_id`
- Auth.js credentials: Membership for staff, ClientPortalAccess for families
- Revenue-first doula Home, enforced funnel, send contract, invoices
- Agency roster: staff invite with expiring token, pending list, withdraw (TOK-29)
- Primary-doula match on the engagement, from Team or the client record (TOK-29)
- Org brand editor: portal name, colour, website, on-call, footer, timezone (TOK-29)
- Full EmailTemplate editor: enable, wording, preview, append-only versions (TOK-29)
- Client portal checklist with labelled counts, sign, pay, forms, resources (TOK-28)
- Two-way portal messaging: shared thread UI, read receipts, doula inbox by family (TOK-28)
- Client-editable profile: contact, address (incl. line 2), EDD, alternate (TOK-28)
- Doula form hub: template builder → assignment → submission, with co-complete (TOK-27)
- Doula resource library + share to portal, with a real read counter (TOK-27)
- PHI firewall on form email: sensitive badges, answers never enqueued (TOK-27)
- Tokos calendar availability + Book Consult
- Public provider profile + QR + provider photo / credentials (TOK-25)
- Outbox drain (Resend or stub) + Vercel Cron
- Adapters with stub fallbacks

**Deferred (later slices / TOK-7)**

- Embedded e-sign
- Logo upload and per-org custom domain
- Capacity-aware / suggested matching
- SMS / HIPAA messaging
- AI (TOK-7)
- Claims / Medicaid
- Acuity
- Dubsado historical migrate
- Full bookkeeping / 1099
