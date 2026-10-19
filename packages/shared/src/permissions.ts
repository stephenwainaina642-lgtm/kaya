import type { Role } from './enums';

export const RESOURCES = [
  'dashboard', 'leads', 'clients', 'properties', 'owners', 'viewings', 'followups', 'tasks',
  'deals', 'commissions', 'calendar', 'communications', 'documents', 'reports', 'team',
  'settings', 'billing', 'audit', 'automation',
] as const;
export type Resource = (typeof RESOURCES)[number];

export const WORK_RESOURCES: Resource[] = [
  'leads', 'clients', 'properties', 'owners', 'viewings', 'followups', 'tasks', 'deals', 'commissions',
];

export type Permission = `${Resource}:${'view' | 'create' | 'edit' | 'delete'}`;

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, AGENT: 1, MANAGER: 2, ORG_ADMIN: 3 };

const RESOURCE_MIN_ROLE: Partial<Record<Resource, Record<'view' | 'create' | 'edit' | 'delete', Role>>> = {
  billing: { view: 'ORG_ADMIN', create: 'ORG_ADMIN', edit: 'ORG_ADMIN', delete: 'ORG_ADMIN' },
  settings: { view: 'MANAGER', create: 'ORG_ADMIN', edit: 'ORG_ADMIN', delete: 'ORG_ADMIN' },
  team: { view: 'MANAGER', create: 'ORG_ADMIN', edit: 'ORG_ADMIN', delete: 'ORG_ADMIN' },
  audit: { view: 'MANAGER', create: 'ORG_ADMIN', edit: 'ORG_ADMIN', delete: 'ORG_ADMIN' },
  automation: { view: 'MANAGER', create: 'MANAGER', edit: 'MANAGER', delete: 'ORG_ADMIN' },
  reports: { view: 'AGENT', create: 'MANAGER', edit: 'MANAGER', delete: 'MANAGER' },
};

export function can(role: Role, permission: Permission): boolean {
  const [resource, action] = permission.split(':') as [Resource, 'view' | 'create' | 'edit' | 'delete'];
  if (role === 'VIEWER' && action !== 'view') return false;
  const override = RESOURCE_MIN_ROLE[resource]?.[action];
  const minRole = override ?? 'AGENT';
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** 'own' = user may only act on records assigned to them; 'organization' = scoped to the whole org. */
export function dataScope(role: Role, resource: Resource): 'own' | 'organization' {
  if (role === 'ORG_ADMIN' || role === 'MANAGER') return 'organization';
  if (resource === 'team' || resource === 'settings' || resource === 'billing' || resource === 'reports' || resource === 'automation') {
    return 'organization';
  }
  return 'own';
}
