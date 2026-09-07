"use client";

import { ErrorState } from "@/components/brand/states";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-20">
      <ErrorState message="The last action could not finish. Try again, or return home." />
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
