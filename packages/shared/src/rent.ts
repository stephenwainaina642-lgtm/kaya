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
  /** Amount kept from the deposit for damage or arrears. Meaningful once settled. */
  depositDeduction: number;
  depositNotes: string | null;
  /** Set once the deposit has been settled; null while it is still held. */
  depositSettledAt: string | null;
}

export interface RentChargeExtra {
  id: string;
  label: string;
  amount: number;
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
  /** Extra items such as water or garbage, already included in `amount`. */
  extras: RentChargeExtra[];
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
  /** ISO code of the agency's currency; defaults to KES. */
  currency?: string;
}

/**
 * A polite WhatsApp message for overdue rent. Tone steps up with lateness
 * (friendly, then firm after a month) but never threatens anything: legal
 * wording belongs to the agent, not a template.
 */
export function rentReminderMessage(i: RentReminderInput): string {
  const first = i.tenantName.trim().split(/\s+/)[0] || 'there';
  const amount = `${i.currency ?? 'KES'} ${i.balance.toLocaleString('en-US')}`;
  const what = `${amount} for ${i.propertyTitle} (${periodLabel(i.period)} rent, due ${i.dueDate})`;
  const body = i.daysOverdue > 30
    ? `Our records show ${what} is still unpaid, now ${i.daysOverdue} days overdue. Please settle it as soon as you can, or contact us today so we can agree a way forward.`
    : `This is a friendly reminder that ${what} is still outstanding. Kindly send the payment when you can and share the M-Pesa code so we can update your account.`;
  return `Hello ${first}, ${body} If you have already paid, please ignore this message. Thank you. ${i.agencyName}`;
}

export interface VacancyRow {
  propertyId: string;
  propertyTitle: string;
  location: string;
  /** Asking rent per month, KES. */
  rent: number;
  /** Days since the last lease ended, or since the listing was added if it was never let. */
  daysVacant: number;
  lastTenant: string | null;
}

export interface VacancyReport {
  /** Rent forgone per month while these units stand empty. */
  monthlyLoss: number;
  rows: VacancyRow[];
}

export interface TenantStatementRow {
  period: string;
  dueDate: string;
  /** Rent plus any extras for the month. */
  charged: number;
  extras: RentChargeExtra[];
  paid: number;
  /** Running balance owed after this month, oldest first. */
  balance: number;
  payments: RentPaymentItem[];
}

export interface TenantStatement {
  leaseId: string;
  tenantName: string;
  propertyTitle: string;
  rentAmount: number;
  rows: TenantStatementRow[];
  totals: { charged: number; paid: number; balance: number };
}

export interface LeaseImportResult {
  created: number;
  /** Tenants that were not yet in Kaya and were added as clients. */
  tenantsCreated: number;
  /** Rows left out because the property already has an active lease. */
  skipped: number;
  invalid: { row: number; reason: string }[];
}

export interface PortalUnit {
  propertyTitle: string;
  location: string;
  /** The tenant's name while the unit is let; null when vacant. */
  tenantName: string | null;
  rent: number | null;
  /** Unit label inside a building, when it has one. */
  building: string | null;
  unitNumber: string | null;
  /** What the unit is listed at (rent per month, or sale price). */
  listPrice: number;
  listingType: 'RENT' | 'SALE';
  /** Let (active lease), vacant, or off the market for another reason. */
  state: 'LET' | 'VACANT' | 'OTHER';
  /** Live on the agency's public listings page right now. */
  advertised: boolean;
  /** Path of the public listing page while advertised, otherwise null. */
  listingPath: string | null;
  coverImageUrl: string | null;
}

export interface PortalRepair {
  title: string;
  propertyTitle: string;
  priority: string;
  status: string;
  createdAt: string;
}

/** What a landlord sees on their private, read-only link. */
/** One month of the landlord's business: rent due, rent actually collected, and what reaches them after fees. */
export interface PortalTrendPoint { period: string; expected: number; collected: number; net: number }

/** A tenant of this landlord who is behind, with how much and for how many months. */
export interface PortalOwing { propertyTitle: string; tenantName: string; amount: number; months: number }

export interface PortalPortfolio {
  units: number;
  let: number;
  vacant: number;
  /** let / units, 0..1. */
  occupancy: number;
  /** Rent per month across all active leases. */
  monthlyRent: number;
  /** What tenants currently owe across the landlord's units. */
  owedByTenants: number;
  /** Active leases ending within 60 days. */
  leasesEndingSoon: number;
}

export interface PortalView {
  agencyName: string;
  agencySlug: string;
  currency: string;
  ownerName: string;
  period: string;
  statement: OwnerStatement;
  units: PortalUnit[];
  openRepairs: PortalRepair[];
  /** The six months up to and including `period`, oldest first. */
  trend: PortalTrendPoint[];
  owing: PortalOwing[];
  portfolio: PortalPortfolio;
}

/** The numbers an agency wants on the home screen each morning. */
export interface RentSummary {
  period: string;
  expected: number;
  collected: number;
  collectionRate: number;
  /** Everything tenants still owe, all months. */
  overdueTotal: number;
  overdueTenants: number;
  vacantUnits: number;
  monthlyLoss: number;
  /** Active leases ending within 60 days. */
  expiringSoon: number;
  openRepairs: number;
  urgentRepairs: number;
}

export interface MpesaTransaction {
  code: string;
  amount: number;
  /** Sender's name as Safaricom printed it. May be empty. */
  name: string;
  /** Digits, possibly masked with asterisks. May be empty. */
  phone: string;
  /** ISO timestamp, or null when the message carried no date. */
  paidAt: string | null;
}

export interface MpesaMatch extends MpesaTransaction {
  chargeId: string;
  tenantName: string;
  propertyTitle: string;
  period: string;
  /** What is still owed on that month before this payment. */
  balance: number;
  /** What would be recorded: the payment, capped at the balance. */
  applyAmount: number;
  /** Part of the payment that is more than the balance and needs handling by hand. */
  leftover: number;
  /** HIGH: the phone number matches. MEDIUM: only the name matches. */
  confidence: 'HIGH' | 'MEDIUM';
}

export interface MpesaMatchResult {
  found: number;
  matches: MpesaMatch[];
  /** Codes already recorded in Kaya. */
  duplicates: MpesaTransaction[];
  unmatched: (MpesaTransaction & { reason: string })[];
}

export interface MpesaApplyResult {
  recorded: number;
  failed: { code: string; error: string }[];
}

/** What a tenant sees on their private, read-only link. */
/** A tenant's "I have paid" note, waiting for the agency to check it against M-Pesa. */
export interface PaymentClaim {
  id: string;
  tenantName: string;
  propertyTitle: string;
  amount: number;
  mpesaCode: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  createdAt: string;
}

export interface TenantClaim { amount: number; mpesaCode: string; status: PaymentClaim['status']; createdAt: string }

export interface TenantPortalView {
  /** The agency has set up M-Pesa collection, so the portal can send a PIN prompt to the tenant's phone. */
  canPayNow: boolean;
  /** How to pay this agency (Paybill/Till, account number, bank). Null until the agency sets it. */
  payInfo: string | null;
  claims: TenantClaim[];
  agencyName: string;
  currency: string;
  /** The agency's public slug, used to link to its "report a problem" page. */
  agencySlug: string;
  tenantName: string;
  propertyTitle: string;
  rentAmount: number;
  dueDay: number;
  statement: TenantStatement;
}

export interface MpesaSettingsView {
  configured: boolean;
  mode: 'sandbox' | 'production';
  accountType: 'PAYBILL' | 'TILL';
  shortcode: string | null;
  callbackUrl: string | null;
}

export interface TenantPayStatus {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  amount: number;
  message: string | null;
  receipt: string | null;
}

export interface ReminderResult {
  /** Tenants sent a text. */
  sent: number;
  /** Skipped: no usable Kenyan mobile number on file. */
  noPhone: number;
  /** Skipped: already reminded in the last few days. */
  recentlyReminded: number;
  /** The provider rejected or could not be reached. */
  failed: number;
  /** False when SMS is not set up for this server, so nothing could be sent. */
  smsConfigured: boolean;
}

export type CollectionRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CollectionsPlanItem {
  leaseId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyTitle: string;
  owed: number;
  monthsOverdue: number;
  risk: CollectionRisk;
  /** Why the AI rated it this way, in one sentence. */
  reason: string;
  /** The next step the agent should take. */
  action: string;
  /** A ready-to-send message in the language that suits the tenant; the agent still sends it. */
  message: string;
}

export interface CollectionsPlan {
  /** Two or three sentences on the whole picture. */
  briefing: string;
  items: CollectionsPlanItem[];
  /** Overdue tenants left out to keep the plan short (largest balances are covered first). */
  omitted: number;
}

export interface RenewalSuggestion {
  currentRent: number;
  /** Suggested new monthly rent, never below today's and capped at a 15% rise. */
  suggestedRent: number;
  /** What the agency's own comparable active leases (same area and bedrooms) rent for; null with fewer than two. */
  comparables: { count: number; median: number } | null;
  /** How the tenant has paid over the last year, in one sentence. */
  paymentSummary: string;
  rationale: string;
  /** A ready-to-send renewal offer; the agent reviews and sends it. */
  message: string;
}

export interface HealthComponent {
  key: 'COLLECTION' | 'OCCUPANCY' | 'REPAIRS' | 'LEASES';
  label: string;
  /** 0-100, or null when there is nothing to measure yet (it is then left out of the overall score). */
  score: number | null;
  weight: number;
  detail: string;
}

export interface HealthAction {
  text: string;
  /** Points the overall score would gain if this were fully fixed. */
  gain: number;
  to: string;
}

export interface PortfolioHealth {
  /** 0-100, or null when no component can be measured yet. */
  score: number | null;
  label: 'Excellent' | 'Healthy' | 'Needs attention' | 'At risk' | 'Not enough data';
  components: HealthComponent[];
  actions: HealthAction[];
}
