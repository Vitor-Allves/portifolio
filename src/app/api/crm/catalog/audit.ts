// Every Personalização change goes to the audit trail.
import { writeAudit } from "@/lib/audit-log";
import type { CrmSession } from "@/lib/crm-auth";

export function auditCatalog(actor: CrmSession, targetId: string, targetLabel: string, metadata: Record<string, unknown>) {
  return writeAudit({
    actorUserId: actor.userId,
    actorLabel: actor.userName,
    actorKind: "admin",
    action: "crm.catalog_change",
    targetType: "crm_catalog",
    targetId,
    targetLabel,
    metadata,
  });
}
