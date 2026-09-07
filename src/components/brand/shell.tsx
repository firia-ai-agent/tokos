import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/env";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-teal-ink text-cloud px-4 py-2 text-center text-xs tracking-wide">
      Demo / stub mode — Stripe, Dropbox Sign, Resend, and S3 run locally without paid keys.
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  nav,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: Array<{ href: string; label: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal">Tokos</p>
            <h1 className="font-heading text-2xl text-teal-ink">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {nav.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
