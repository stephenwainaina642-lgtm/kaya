export const LEASE_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const RENT_PAYMENT_METHODS = ['MPESA', 'BANK', 'CASH', 'CHEQUE'] as const;
export type RentPaymentMethod = (typeof RENT_PAYMENT_METHODS)[number];

export type ChargeStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface LeaseItem {
  id: string;
  propertyId: string;
  propertyTitle: string;
  tenantId: string;
  tenantName: string;
  ownerId: string | null;
  ownerName: string | null;
  rentAmount: number;
  depositAmount: number;
  dueDay: number;
  startDate: string;
  endDate: string | null;
  /** Agency's management fee, in basis points of rent collected (1000 = 10%). */
  feeBps: number;
  /** Tax withheld from the landlord's share, in basis points. Set by the agency; Kaya does not assume a rate. */
  withholdingBps: number;
  status: LeaseStatus;
}

export interface RentChargeItem {
  id: string;
  leaseId: string;
  propertyTitle: string;
  tenantName: string;
  period: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: ChargeStatus;
}

export interface RentPaymentItem {
  id: string;
  amount: number;
  method: RentPaymentMethod;
  reference: string | null;
  paidAt: string;
}

export interface GenerateRentResult {
  period: string;
  created: number;
  alreadyExisted: number;
}

export interface ArrearsRow {
  chargeId: string;
  propertyTitle: string;
  tenantName: string;
  tenantPhone: string | null;
  period: string;
  dueDate: string;
  balance: number;
  daysOverdue: number;
}

export interface ArrearsReport {
  total: number;
  rows: ArrearsRow[];
}

export interface StatementLine {
  leaseId: string;
  propertyTitle: string;
  tenantName: string;
  rentDue: number;
  collected: number;
  managementFee: number;
  withholding: number;
  netToLandlord: number;
}

export interface OwnerStatement {
  ownerId: string;
  ownerName: string;
  period: string;
  lines: StatementLine[];
  totals: { rentDue: number; collected: number; managementFee: number; withholding: number; netToLandlord: number };
}

export interface RentOverview {
  period: string;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRate: number; // 0..1
  activeLeases: number;
}
