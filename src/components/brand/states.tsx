import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h2 className="font-heading text-xl text-teal-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Something did not go through</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
