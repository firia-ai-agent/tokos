import Link from "next/link";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
        <p className="text-xs uppercase tracking-[0.25em] text-teal">Tokos</p>
        <div className="space-y-4">
          <h1 className="font-heading text-4xl leading-tight text-teal-ink sm:text-5xl">
            The operating system for birth work.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            One NOVA doula can take a family from intake to a signed, paid, complete
            contract — then keep the engagement in a shared portal. Built for birth
            work, not a clinic. No investor theater.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/p/maya-chen">Meet Maya · Book a consult</Link>
          </Button>
        </div>
        <ol className="grid gap-4 text-sm sm:grid-cols-2">
          {[
            "Intro — share a living profile",
            "Fit — Tokos calendar, not a third-party booker",
            "Agreement signed — intent, not complete",
            "Complete — fit confirmed and payment cleared",
          ].map((item) => (
            <li key={item} className="rounded-xl border bg-card p-4">
              {item}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
