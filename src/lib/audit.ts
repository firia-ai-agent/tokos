import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { assertPhiFree } from "@/lib/phi";

export async function writeAudit(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string>;
}) {
  if (input.metadata) assertPhiFree(input.metadata, "audit");
  const db = getDb();
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
  });
}
