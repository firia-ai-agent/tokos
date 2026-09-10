import Link from "next/link";
import { DemoBanner } from "@/components/brand/shell";
import { TOS_VERSION } from "@/lib/tos";

export const metadata = {
  title: "Terms of Service · Tokos",
};

/**
 * The terms an invitee accepts on `/invite/[token]` (TOK-57).
 *
 * Written to be read, not to be scrolled past: short sections, plain sentences, and the
 * two things a doula or a family actually wants to know — what Tokos does with what they
 * write down, and that nobody's health information travels out by email. Deliberately
 * PHI-free itself, and deliberately not legal boilerplate someone would have to pretend
 * to have read.
 */

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "What Tokos is",
    body:
      "Tokos is software a doula practice uses to run its work: leads, agreements, visits, forms, messages, and invoices. It is not a medical provider, it does not give medical advice, and it never stands between a family and their midwife, doctor, or emergency care.",
  },
  {
    title: "Your account",
    body:
      "Your login is yours. Keep the password to yourself, and tell the practice that invited you if you think someone else has it. A workspace owner can add or remove people on their team; removing someone ends their access to that practice's records the same day.",
  },
  {
    title: "What we do with what you write",
    body:
      "Records you create belong to the practice that created them. Tokos stores them so the people on that family's care team can read them, and nobody else. We do not sell them, we do not use them to advertise, and we do not read them to train anything.",
  },
  {
    title: "Health information stays inside",
    body:
      "Form answers, visit notes, and anything that reads as health detail live in the portal and stay there. Email from Tokos carries a name and a link — never an answer. If you need to send something sensitive, send it in the portal, not in a reply.",
  },
  {
    title: "Payments",
    body:
      "Invoices are issued by the practice, not by Tokos, and money moves through the practice's own payment provider. Questions about a charge go to the practice; questions about the software come to us.",
  },
  {
    title: "Ending it",
    body:
      "You can stop using Tokos whenever you like, and a practice can export its own records. If we ever need to end an account for misuse, we will say why and give the practice its records first.",
  },
  {
    title: "Changes",
    body:
      "If these terms change in a way that matters, we will ask you to accept the new version the next time you sign in rather than quietly swapping the page.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-2xl px-6 py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Tokos</p>
        <h1 className="mt-1.5 font-heading text-[34px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
          Terms of Service
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          Version {TOS_VERSION}. Short on purpose — you are agreeing to this to join a
          practice, so it should be readable in the time that takes.
        </p>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-xl bg-cloud p-5 ring-1 ring-teal/10">
              <h2 className="font-heading text-lg text-teal-ink">{section.title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-teal-ink/80">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-[13px] text-muted-foreground">
          Questions before you accept? Ask the practice that invited you — they can reach us.{" "}
          <Link href="/login" className="font-semibold text-coral hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
