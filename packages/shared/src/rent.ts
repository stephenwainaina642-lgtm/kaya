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

export interface StatementDeduction {
  requestId: string;
  propertyTitle: string;
  title: string;
  amount: number;
}

export interface OwnerStatement {
  ownerId: string;
  ownerName: string;
  period: string;
  lines: StatementLine[];
  /** Repairs finished this month that the agency is recharging to the landlord. */
  deductions: StatementDeduction[];
  totals: {
    rentDue: number; collected: number; managementFee: number; withholding: number;
    /** Sum of the deductions above. */
    maintenance: number;
    /** What the agency pays the landlord: rent after fee and tax, less repair costs. */
    netToLandlord: number;
  };
}

export interface RentOverview {
  period: string;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRate: number; // 0..1
  activeLeases: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-03" -> "March 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : period;
}

export interface RentReminderInput {
  tenantName: string;
  propertyTitle: string;
  period: string;
  dueDate: string;
  balance: number;
  daysOverdue: number;
  agencyName: string;
}

/**
 * A polite WhatsApp message for overdue rent. Tone steps up with lateness
 * (friendly, then firm after a month) but never threatens anything: legal
 * wording belongs to the agent, not a template.
 */
export function rentReminderMessage(i: RentReminderInput): string {
  const first = i.tenantName.trim().split(/\s+/)[0] || 'there';
  const amount = `KES ${i.balance.toLocaleString('en-KE')}`;
  const what = `${amount} for ${i.propertyTitle} (${periodLabel(i.period)} rent, due ${i.dueDate})`;
  const body = i.daysOverdue > 30
    ? `Our records show ${what} is still unpaid, now ${i.daysOverdue} days overdue. Please settle it as soon as you can, or contact us today so we can agree a way forward.`
    : `This is a friendly reminder that ${what} is still outstanding. Kindly send the payment when you can and share the M-Pesa code so we can update your account.`;
  return `Hello ${first}, ${body} If you have already paid, please ignore this message. Thank you. ${i.agencyName}`;
}
