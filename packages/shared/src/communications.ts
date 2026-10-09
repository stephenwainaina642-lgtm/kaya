import type { CommChannel, CommDirection, CommDelivery } from './enums';
import type { AgentRef } from './crm';

export interface CommunicationContact {
  kind: 'lead' | 'client' | 'owner';
  id: string;
  name: string;
}

export interface CommunicationItem {
  id: string;
  channel: CommChannel;
  direction: CommDirection;
  subject: string | null;
  body: string | null;
  deliveryStatus: CommDelivery | null;
  durationSeconds: number | null;
  contact: CommunicationContact | null;
  user: AgentRef | null;
  occurredAt: string;
}

export interface CommunicationPage {
  items: CommunicationItem[];
  total: number;
}
