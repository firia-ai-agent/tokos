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

**Tenancy probe:** as Maya, `/doula/clients/44444444-4444-4444-8444-444444444446` (Riley / Cedar) must 404. As Jordan, Avery's contract/invoice/stub URLs must not complete or leak.

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

Covers the pipeline state machine, the complete rule (signed ≠ complete; no signed-before-fit; pay-then-sign still completes), stub pay-fail honesty, Dropbox Sign webhook HMAC, and tenant ownership guards.

## Built vs deferred

**In this slice**

- App Router route groups `(public)` / `(doula)` / `(client)`
- Drizzle P1 schema + multi-tenant `organization_id`
- Auth.js credentials: Membership for staff, ClientPortalAccess for families
- Revenue-first doula Home, enforced funnel, send contract, invoices
- Client portal checklist, sign, pay, two-way PortalMessage, forms, resources, profile
- Tokos calendar availability + Book Consult
- Public provider profile + QR + provider photo / credentials (TOK-25)
- Outbox drain (Resend or stub) + Vercel Cron
- Adapters with stub fallbacks

**Deferred (later slices / TOK-7)**

- Full EmailTemplate editor polish and branded preview
- Embedded e-sign
- Agency roster / match UI
- SMS / HIPAA messaging
- AI (TOK-7)
- Claims / Medicaid
- Acuity
- Dubsado historical migrate
- Full bookkeeping / 1099
