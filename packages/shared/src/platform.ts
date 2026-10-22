import type { Plan } from './enums';
import type { Role } from './enums';

export interface PlatformAdminRef {
  id: string;
  name: string;
  email: string;
}

export interface PlatformLoginResult {
  accessToken: string;
  admin: PlatformAdminRef;
}

export interface PlatformOrgListItem {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  currency: string;
  suspended: boolean;
  createdAt: string;
  userCount: number;
  dealCount: number;
  pipelineValue: number;
}

export interface PlatformOrgPage {
  items: PlatformOrgListItem[];
  total: number;
}

export interface PlatformOrgUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PlatformOrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  currency: string;
  timezone: string;
  phone: string | null;
  suspended: boolean;
  createdAt: string;
  users: PlatformOrgUser[];
  counts: {
    leads: number;
    clients: number;
    properties: number;
    deals: number;
  };
  pipelineValue: number;
}

export interface PlatformStats {
  totalOrganizations: number;
  totalUsers: number;
  totalPipelineValue: number;
  suspendedOrganizations: number;
  byPlan: { plan: Plan; count: number }[];
  recentOrganizations: { id: string; name: string; slug: string; plan: Plan; createdAt: string }[];
}
