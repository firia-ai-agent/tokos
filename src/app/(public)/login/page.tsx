import { loginAction } from "@/app/actions/auth";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEMO_PASSWORD, demoLoginGroups } from "@/lib/demo-logins";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal">Tokos</p>
          <h1 className="font-heading text-3xl text-teal-ink">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Staff use a membership. Families use client portal access.
          </p>
        </div>
        {params.error ? (
          <Alert variant="destructive">
            <AlertDescription>Those credentials did not match a Tokos login.</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Email and password</CardTitle>
            <CardDescription>Demo logins are listed below and printed by the seed.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={loginAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-1 text-xs text-muted-foreground">
          {demoLoginGroups().map((group) => (
            <p key={group.label}>
              <span className="font-medium text-teal-ink">{group.label}:</span>{" "}
              {group.accounts.map((account) => account.email).join(", ")}
            </p>
          ))}
          <p>password {DEMO_PASSWORD}</p>
        </div>
      </div>
    </div>
  );
}
