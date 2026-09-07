import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="font-heading text-3xl text-teal-ink">That page is not here</h1>
      <p className="mt-2 text-muted-foreground">Try the home page or sign in.</p>
      <Button asChild className="mt-6">
        <Link href="/">Back to Tokos</Link>
      </Button>
    </main>
  );
}
