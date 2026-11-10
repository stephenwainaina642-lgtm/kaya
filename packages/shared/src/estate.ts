import type { PropertyStatus, ListingType, PropertyType } from './enums';

/** Everyone connected to one property, in one place. */
export interface PropertyNetwork {
  owner: { id: string; name: string; phone: string; email: string | null; whatsapp: string | null } | null;
  agent: { id: string; name: string; email: string | null } | null;
  /** Buyers/tenants who have viewed it, made an offer on it, or have a deal attached. */
  interested: NetworkContact[];
  tenant: { id: string; name: string; phone: string; rentAmount: number; since: string } | null;
}

export interface NetworkContact {
  kind: 'CLIENT' | 'LEAD';
  id: string;
  name: string;
  phone: string;
  /** Strongest connection first: DEAL > VIEWING. */
  stage: 'DEAL' | 'VIEWING';
  detail: string;
  agentName: string | null;
  at: string;
}

export interface BuildingSummary {
  building: string;
  location: string;
  city: string;
  ownerNames: string[];
  units: number;
  vacant: number;
  occupied: number;
  other: number;
  occupancyPct: number;
  /** Rent roll: sum of active lease rents, whole currency units per month. */
  monthlyRent: number;
  /** What it would earn at 100% occupancy, based on listed unit prices. */
  potentialRent: number;
  currency: string;
  arrears: number;
}

export interface BuildingUnit {
  id: string;
  unitNumber: string | null;
  title: string;
  bedrooms: number | null;
  price: number;
  status: PropertyStatus;
  tenantName: string | null;
  arrears: number;
  advertised: boolean;
}

export interface BuildingDetail extends BuildingSummary {
  unitList: BuildingUnit[];
}

export interface BulkUnitsInput {
  building: string;
  ownerId: string;
  location: string;
  city?: string;
  listingType: ListingType;
  propertyType: PropertyType;
  floors: number;
  unitsPerFloor: number;
  /** Optional first-floor number, default 1. */
  startFloor?: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price: number;
  currency?: string;
  assignedAgentId?: string | null;
}

export interface PublicListingCard {
  id: string;
  title: string;
  listingType: ListingType;
  propertyType: PropertyType;
  price: number;
  currency: string;
  location: string;
  city: string;
  bedrooms: number | null;
  bathrooms: number | null;
  building: string | null;
  coverImageUrl: string | null;
}

export interface PublicListings {
  agency: { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };
  items: PublicListingCard[];
}

export interface PublicListingDetail extends PublicListingCard {
  description: string | null;
  sizeSqm: number | null;
  parkingSpaces: number | null;
  furnishing: string | null;
  availableFrom: string | null;
  images: { url: string; alt: string | null }[];
  features: { label: string }[];
  agent: { name: string } | null;
  agency: PublicListings['agency'];
}
