export const MAINTENANCE_CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'STRUCTURAL', 'PAINTING', 'SECURITY', 'CLEANING', 'OTHER'] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export interface MaintenanceItem {
  id: string;
  propertyId: string;
  propertyTitle: string;
  tenantId: string | null;
  tenantName: string | null;
  title: string;
  description: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  /** When true, the finished cost is deducted from the landlord's monthly statement. */
  chargeToLandlord: boolean;
  resolvedAt: string | null;
  createdAt: string;
}
