import type { AgentRef, Page } from './crm';
import type {
  CommissionArrangement, DealStatus, DealTypeEnum, FeatureKind, Furnishing, ListingType,
  OfferPartyEnum, OfferStatusEnum, PaymentStatusEnum, PropertyStatus, PropertyType, Segment,
  CommissionStatusEnum, InterestLevelEnum, ViewingStatus,
} from './enums';
import type { ScheduleItem } from './dashboard';

export type DealType = DealTypeEnum;
export type OfferStatus = OfferStatusEnum;
export type OfferParty = OfferPartyEnum;
export type CommissionStatus = CommissionStatusEnum;
export type PaymentStatus = PaymentStatusEnum;
export type InterestLevel = InterestLevelEnum;

export interface PropertyFeatureItem {
  key: string;
  label: string;
  kind: FeatureKind;
}

export interface PropertyImage {
  id: string;
  url: string;
  alt: string | null;
  isCover: boolean;
  position: number;
}

export interface PropertyListItem {
  id: string;
  reference: string;
  title: string;
  listingType: ListingType;
  propertyType: PropertyType;
  segment: Segment;
  price: number;
  currency: string;
  location: string;
  neighborhood: string | null;
  city: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sizeSqm: number | null;
  status: PropertyStatus;
  coverImageUrl: string | null;
  assignedAgent: AgentRef | null;
}

export interface PropertyDetail extends PropertyListItem {
  address: string | null;
  lat: number | null;
  lng: number | null;
  parkingSpaces: number | null;
  furnishing: Furnishing | null;
  availableFrom: string | null;
  description: string | null;
  videoUrl: string | null;
  virtualTourUrl: string | null;
  internalNotes: string | null;
  ownerId: string;
  owner: OwnerRef | null;
  images: PropertyImage[];
  features: PropertyFeatureItem[];
  listedAt: string;
  updatedAt: string;
}

export interface OwnerRef {
  id: string;
  fullName: string;
}

export interface OwnerListItem {
  id: string;
  fullName: string;
  companyName: string | null;
  phone: string;
  email: string | null;
  propertyCount: number;
}

export interface OwnerDetail extends OwnerListItem {
  whatsapp: string | null;
  agreementType: string | null;
  agreementStart: string | null;
  agreementEnd: string | null;
  commissionArrangement: CommissionArrangement | null;
  commissionRate: number | null;
  commissionFixedAmount: number | null;
  agreementNotes: string | null;
  notes: string | null;
}

export interface MatchScore {
  overall: number;
  budget: number;
  location: number;
  type: number;
  features: number;
}

export interface PropertyMatch {
  property: PropertyListItem;
  score: MatchScore;
  verdict: 'STRONG' | 'GOOD' | 'PARTIAL' | 'WEAK';
  breakdown: string[];
  dismissed: boolean;
}

export interface PropertyMatchPage {
  items: PropertyMatch[];
}

export interface PersonMatch {
  kind: 'lead' | 'client';
  id: string;
  fullName: string;
  score: MatchScore;
  verdict: 'STRONG' | 'GOOD' | 'PARTIAL' | 'WEAK';
}

export interface PersonMatchPage {
  items: PersonMatch[];
}

export interface ShortlistItem {
  propertyId: string;
  property: PropertyListItem;
  note: string | null;
  position: number;
}

export interface ShortlistSummary {
  id: string;
  clientId: string;
  title: string;
  itemCount: number;
  shareToken: string;
  shareExpiresAt: string | null;
  createdAt: string;
}

export interface ShortlistDetail extends ShortlistSummary {
  items: ShortlistItem[];
}

export interface PublicProperty {
  id: string;
  title: string;
  listingType: ListingType;
  propertyType: PropertyType;
  price: number;
  currency: string;
  location: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sizeSqm: number | null;
  images: string[];
  description: string | null;
}

export interface PublicShortlist {
  title: string;
  organizationName: string;
  agentName: string;
  agentPhone: string | null;
  items: { property: PublicProperty; note: string | null }[];
}

export interface ViewingPropertyRef {
  id: string;
  title: string;
  location: string;
  coverImageUrl: string | null;
}

export interface ViewingPerson {
  kind: 'lead' | 'client';
  id: string;
  fullName: string;
  phone: string;
}

export interface ViewingFeedbackItem {
  interestLevel: InterestLevel;
  rating: number | null;
  feedback: string | null;
  objections: string | null;
  nextAction: string | null;
  followUpDate: string | null;
}

export interface ViewingItem {
  id: string;
  property: ViewingPropertyRef;
  person: ViewingPerson;
  agent: AgentRef;
  scheduledAt: string;
  durationMinutes: number;
  status: ViewingStatus;
  meetingLocation: string | null;
  notes: string | null;
  feedback: ViewingFeedbackItem | null;
  completedAt: string | null;
}

export interface ViewingCounts {
  upcoming: number;
  today: number;
  completed: number;
  cancelled: number;
}

export interface ViewingPage {
  items: ViewingItem[];
  counts: ViewingCounts;
}

export interface ViewingConflict {
  agentId: string;
  conflictingViewingId: string;
  scheduledAt: string;
}

export const DEAL_STALLED_AFTER_DAYS = 5;

export const DEFAULT_COMMISSION_RATE: Record<DealType, number> = {
  SALE: 2.5,
  RENT: 8.33,
};

export interface DealStageInfo {
  id: string;
  key: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

export interface DealCard {
  id: string;
  dealNumber: string;
  name: string;
  dealType: DealType;
  status: DealStatus;
  stageId: string;
  clientName: string;
  propertyTitle: string | null;
  agent: AgentRef;
  value: number;
  commissionAmount: number;
  isStalled: boolean;
  lastActivityAt: string;
}

export interface BoardStage {
  stage: DealStageInfo;
  deals: DealCard[];
  totalValue: number;
}

export interface DealBoard {
  stages: BoardStage[];
}

export interface DealOffer {
  id: string;
  amount: number;
  madeBy: OfferParty;
  status: OfferStatus;
  conditions: string | null;
  notes: string | null;
  offeredAt: string;
}

export interface DealCommissionItem {
  id: string;
  agent: AgentRef;
  sharePercent: number;
  amount: number;
  paidAmount: number;
  status: CommissionStatus;
  earnedAt: string | null;
  paidAt: string | null;
}

export interface DealDetail {
  id: string;
  dealNumber: string;
  name: string;
  dealType: DealType;
  status: DealStatus;
  stage: DealStageInfo;
  clientId: string;
  clientName: string;
  propertyId: string | null;
  propertyTitle: string | null;
  leadId: string | null;
  ownerId: string | null;
  agent: AgentRef;
  dealValue: number;
  commissionRate: number;
  commissionAmount: number;
  probability: number;
  offerPrice: number | null;
  finalPrice: number | null;
  expectedCloseDate: string | null;
  actualCloseDate: string | null;
  lostReason: string | null;
  notes: string | null;
  paymentStatus: PaymentStatus;
  offers: DealOffer[];
  commissions: DealCommissionItem[];
  stageEnteredAt: string;
  lastActivityAt: string;
  isStalled: boolean;
  createdAt: string;
}

export interface CommissionListItem {
  id: string;
  dealId: string;
  dealName: string;
  agent: AgentRef;
  sharePercent: number;
  amount: number;
  paidAmount: number;
  status: CommissionStatus;
  earnedAt: string | null;
  paidAt: string | null;
}

export interface CommissionPage extends Page<CommissionListItem> {
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
}

export function effectiveDealValue(d: { finalPrice?: number | null; offerPrice?: number | null; dealValue: number }): number {
  return d.finalPrice ?? d.offerPrice ?? d.dealValue;
}

export function calculateCommission(value: number, ratePercent: number): number {
  return Math.round(value * (ratePercent / 100) * 100) / 100;
}

export interface CalendarItem extends ScheduleItem {
  endAt: string | null;
}

export interface CalendarPage {
  items: CalendarItem[];
}
