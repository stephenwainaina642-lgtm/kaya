import type { AgentRef } from './crm';
import type { CommChannel, CommDelivery, CommDirection } from './enums';

export interface CommunicationContact {
  kind: 'lead' | 'client' | 'owner';
  id: string;
  fullName: string;
}

export interface CommunicationItem {
  id: string;
  channel: CommChannel;
  direction: CommDirection;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  durationSeconds: number | null;
  deliveryStatus: CommDelivery;
  contact: CommunicationContact;
  propertyTitle: string | null;
  dealName: string | null;
  user: AgentRef;
}

export interface CommunicationPage {
  items: CommunicationItem[];
  total: number;
}
