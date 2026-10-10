import type { AgentRef } from './crm';
import type { DocumentType } from './enums';

export interface DocumentLinks {
  clientId: string | null;
  propertyId: string | null;
  ownerId: string | null;
  dealId: string | null;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  sizeBytes: number;
  links: DocumentLinks;
  uploadedBy: AgentRef;
  createdAt: string;
}

export interface DocumentPage {
  items: DocumentItem[];
  total: number;
}
