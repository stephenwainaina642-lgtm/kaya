export const ROLES = ['ORG_ADMIN', 'MANAGER', 'AGENT', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;
export type Plan = (typeof PLANS)[number];

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CLIENT_STATUSES = ['ACTIVE', 'INACTIVE', 'WON', 'LOST'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const LEAD_SOURCES = [
  'WEBSITE', 'REFERRAL', 'WALK_IN', 'PHONE', 'SOCIAL_MEDIA', 'PROPERTY_PORTAL', 'WHATSAPP', 'OTHER',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const LEAD_TYPES = ['BUYER', 'TENANT', 'SELLER', 'LANDLORD'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const FOLLOW_UP_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type FollowUpPriority = (typeof FOLLOW_UP_PRIORITIES)[number];

export const TASK_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const CONTACT_METHODS = ['CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const COMM_CHANNELS = ['CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING', 'NOTE'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export const COMM_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type CommDirection = (typeof COMM_DIRECTIONS)[number];

export const COMM_DELIVERY = ['SENT', 'DELIVERED', 'READ', 'FAILED'] as const;
export type CommDelivery = (typeof COMM_DELIVERY)[number];

export const ACTIVITY_TYPES = [
  'STATUS_CHANGE', 'ASSIGNMENT', 'CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING', 'NOTE',
  'VIEWING', 'DEAL', 'OFFER', 'NEGOTIATION', 'REQUIREMENTS', 'OTHER',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const INTENTS = ['BUY', 'RENT', 'SELL', 'LET'] as const;
export type Intent = (typeof INTENTS)[number];

export const SEGMENTS = ['RESIDENTIAL', 'COMMERCIAL', 'LAND'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const FURNISHINGS = ['UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED'] as const;
export type Furnishing = (typeof FURNISHINGS)[number];

export const LISTING_TYPES = ['SALE', 'RENT'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const PROPERTY_TYPES = [
  'APARTMENT', 'MAISONETTE', 'BUNGALOW', 'VILLA', 'TOWNHOUSE', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'LAND',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = ['AVAILABLE', 'UNDER_OFFER', 'LET', 'SOLD', 'WITHDRAWN'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const FEATURE_KINDS = ['AMENITY', 'SECURITY', 'UTILITY', 'OTHER'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const COMMISSION_ARRANGEMENTS = ['PERCENTAGE', 'FIXED'] as const;
export type CommissionArrangement = (typeof COMMISSION_ARRANGEMENTS)[number];

export const INTEREST_LEVELS = ['VERY_INTERESTED', 'INTERESTED', 'NEUTRAL', 'NOT_INTERESTED'] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export const VIEWING_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export const DEAL_TYPES = ['SALE', 'RENT'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_STATUSES = ['OPEN', 'WON', 'LOST', 'CANCELLED'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const OFFER_PARTIES = ['BUYER', 'SELLER'] as const;
export type OfferParty = (typeof OFFER_PARTIES)[number];

export const OFFER_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COUNTERED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const COMMISSION_STATUSES = ['PENDING', 'INVOICED', 'PAID', 'PARTIALLY_PAID'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'AGREEMENT', 'ID', 'CONTRACT', 'PROPERTY_DOCUMENT', 'RECEIPT', 'OFFER_LETTER', 'COMMISSION_AGREEMENT', 'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'FOLLOW_UP_DUE', 'TASK_DUE', 'VIEWING_REMINDER', 'DEAL_STALLED', 'NEW_LEAD', 'ASSIGNMENT', 'OTHER',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
