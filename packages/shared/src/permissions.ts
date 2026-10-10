import type { Role } from './enums';

export const RESOURCES = [
  'dashboard', 'leads', 'clients', 'properties', 'owners', 'viewings', 'followups', 'tasks',
  'deals', 'commissions', 'calendar', 'communications', 'documents', 'reports', 'team',
  'settings', 'billing', 'audit',
] as const;
export type Resource = (typeof RESOURCES)[number];

export const WORK_RESOURCES: Resource[] = [
  'leads', 'clients', 'properties', 'owners', 'viewings', 'followups', 'tasks', 'deals', 'communications', 'documents',
];

export type DataScope = 'own' | 'organization';

const SCOPE_RULES: Record<Role, DataScope> = {
  ORG_ADMIN: 'organization',
  MANAGER: 'organization',
  AGENT: 'own',
  VIEWER: 'organization',
};

export function dataScope(role: Role, _resource: Resource): DataScope {
  return SCOPE_RULES[role];
}

export type Permission =
  | `${Resource}:view`
  | `${Resource}:create`
  | `${Resource}:edit`
  | `${Resource}:delete`
  | `${Resource}:manage`;

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, AGENT: 1, MANAGER: 2, ORG_ADMIN: 3 };

const MIN_ROLE_FOR_ACTION: Record<string, Role> = {
  view: 'VIEWER',
  create: 'AGENT',
  edit: 'AGENT',
  delete: 'MANAGER',
  manage: 'ORG_ADMIN',
};

export function can(role: Role, permission: Permission): boolean {
  const action = permission.split(':')[1] ?? 'view';
  const minRole = MIN_ROLE_FOR_ACTION[action] ?? 'ORG_ADMIN';
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}
