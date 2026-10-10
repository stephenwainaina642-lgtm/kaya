import type {
  ListingType, PropertyType, Segment, Furnishing, PropertyStatus, FeatureKind,
  CommissionArrangement, DealStatus, DealType,
  OfferParty, OfferStatus,
  CommissionStatus, PaymentStatus,
  ViewingStatus, InterestLevel,
} from './enums';
import type { AgentRef } from './crm';
import type { ScheduleItem } from './dashboard';

export interface PropertyFeatureItem {
  id: string;
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
  status: PropertyStatus;
  coverImageUrl: string | null;
  assignedAgent: AgentRef | null;
}

export interface PropertyDetail extends PropertyListItem {
  address: string | null;
  lat: number | null;
  lng: number | null;
  sizeSqm: number | null;
  parkingSpaces: number | null;
  furnishing: Furnishing | null;
  availableFrom: string | null;
  description: string | null;
  videoUrl: string | null;
  virtualTourUrl: string | null;
  internalNotes: string | null;
  ownerId: string;
  images: PropertyImage[];
  features: PropertyFeatureItem[];
  listedAt: string | null;
}

export interface OwnerRef {
  id: string;
  name: string;
}

export interface OwnerListItem {
  id: string;
  fullName: string | null;
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
  total: number;
  budget: number;
  location: number;
  bedrooms: number;
  propertyType: number;
  amenities: number;
}

export interface PropertyMatch {
  property: PropertyListItem;
  score: MatchScore;
  verdict: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  dismissed: boolean;
}

export interface PropertyMatchPage {
  items: PropertyMatch[];
  total: number;
}

export interface PersonMatch {
  contact: { kind: 'lead' | 'client'; id: string; name: string };
  score: MatchScore;
  verdict: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export interface PersonMatchPage {
  items: PersonMatch[];
  total: number;
}

export interface ShortlistItem {
  id: string;
  property: PropertyListItem;
  note: string | null;
  position: number;
}

export interface ShortlistSummary {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  itemCount: number;
  shareToken: string;
  shareExpiresAt: string | null;
  createdAt: string;
}

export interface ShortlistDetail extends ShortlistSummary {
  items: ShortlistItem[];
}

export interface PublicProperty {
  title: string;
  listingType: ListingType;
  propertyType: PropertyType;
  price: number;
  currency: string;
  location: string;
  bedrooms: number | null;
  bathrooms: number | null;
  images: PropertyImage[];
}

export interface PublicShortlist {
  title: string;
  agencyName: string;
  items: { property: PublicProperty; note: string | null }[];
}

export interface ViewingPropertyRef {
  id: string;
  title: string;
  location: string;
  coverImageUrl: string | null;
}

export interface ViewingPerson {
  id: string;
  name: string;
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
  client: ViewingPerson | null;
  lead: ViewingPerson | null;
  agent: AgentRef;
  scheduledAt: string;
  durationMinutes: number;
  status: ViewingStatus;
  meetingLocation: string | null;
  notes: string | null;
  feedback: ViewingFeedbackItem | null;
}

export interface ViewingCounts {
  scheduled: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface ViewingPage {
  items: ViewingItem[];
  total: number;
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
  commissionAmount: number | null;
  stageEnteredAt: string;
  isStalled: boolean;
}

export interface BoardStage extends DealStageInfo {
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
  client: { id: string; name: string };
  property: { id: string; title: string } | null;
  owner: { id: string; name: string } | null;
  agent: AgentRef;
  dealValue: number;
  commissionRate: number | null;
  commissionAmount: number | null;
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
}

export interface CommissionListItem {
  id: string;
  dealNumber: string;
  dealName: string;
  agent: AgentRef;
  amount: number;
  paidAmount: number;
  status: CommissionStatus;
  earnedAt: string | null;
  paidAt: string | null;
}

export interface CommissionPage {
  items: CommissionListItem[];
  total: number;
  totalOutstanding: number;
  totalPaid: number;
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
