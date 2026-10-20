import type { AgentRef } from './crm';

export const VIEWING_REQUEST_STATUSES = ['PENDING', 'CONFIRMED', 'DECLINED'] as const;
export type ViewingRequestStatus = (typeof VIEWING_REQUEST_STATUSES)[number];

/** A document as shown on the client self-service portal — enough to list it
 * and know whether it still needs a signature. */
export interface PortalDocument {
  id: string;
  name: string;
  requiresSignature: boolean;
  signed: boolean;
  signedAt: string | null;
}

export interface ViewingRequestPublicInput {
  propertyId: string;
  preferredAt: string; // ISO datetime
  notes?: string | null;
}

export interface SignDocumentInput {
  signerName: string;
  signatureDataUrl: string; // data: URL PNG from the portal's signature pad
}

/** Staff-facing view of a client's self-booked viewing request. */
export interface ViewingRequest {
  id: string;
  clientName: string;
  propertyTitle: string;
  propertyId: string;
  preferredAt: string;
  notes: string | null;
  status: ViewingRequestStatus;
  viewingId: string | null;
  respondedBy: AgentRef | null;
  respondedAt: string | null;
  responseNote: string | null;
  createdAt: string;
}

export interface ViewingRequestDecision {
  responseNote?: string | null;
  /** Only used when confirming: which agent the resulting viewing is assigned to (defaults to whoever confirms it) and its duration. */
  agentId?: string | null;
  durationMinutes?: number;
}
