import type { AgentRef } from './crm';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  actor: AgentRef | null;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
}
