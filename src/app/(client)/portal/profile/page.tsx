import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { updateClientProfileAction } from "@/app/actions/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function ClientProfilePage() {
  const session = await requireClient();
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);
  if (!client) return null;

  return (
    <form action={updateClientProfileAction} className="max-w-lg space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Your profile</h2>
      <div className="space-y-2">
        <Label htmlFor="preferredName">Preferred name</Label>
        <Input id="preferredName" name="preferredName" defaultValue={client.preferredName ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={client.phone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressLine1">Address</Label>
        <Input id="addressLine1" name="addressLine1" defaultValue={client.addressLine1 ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={client.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">State</Label>
          <Input id="region" name="region" defaultValue={client.region ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="postalCode">Postal code</Label>
        <Input id="postalCode" name="postalCode" defaultValue={client.postalCode ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="alternateContactName">Alternate contact</Label>
        <Input
          id="alternateContactName"
          name="alternateContactName"
          defaultValue={client.alternateContactName ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="alternateContactPhone">Alternate phone</Label>
        <Input
          id="alternateContactPhone"
          name="alternateContactPhone"
          defaultValue={client.alternateContactPhone ?? ""}
        />
      </div>
      <Button type="submit">Save</Button>
    </form>
  );
}
