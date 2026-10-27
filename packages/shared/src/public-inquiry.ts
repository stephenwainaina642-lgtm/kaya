import type { LeadType } from './enums';

/** What the public inquiry page is allowed to know about an agency —
 * nothing else leaks through the unauthenticated /inquire/:slug route. */
export interface PublicOrgInfo {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

/** An agency's own branding settings, as seen/edited from inside the app. */
export interface OrgBranding {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface PublicInquiryInput {
  fullName: string;
  phone: string;
  email?: string | null;
  leadType: LeadType;
  message?: string | null;
  propertyId?: string | null;
  /** Honeypot — real visitors never fill this in; bots usually do. */
  website?: string;
}

export interface InquiryLink {
  slug: string;
}
