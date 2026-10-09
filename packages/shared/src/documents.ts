import type { DocumentType } from './enums';
import type { AgentRef } from './crm';

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
  uploadedBy: AgentRef | null;
  createdAt: string;
}

export interface DocumentPage {
  items: DocumentItem[];
  total: number;
}
