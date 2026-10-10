import type {
  ClientStatus, Furnishing, Intent, LeadSource, LeadStatus, LeadType, PropertyType, Role, Segment, Temperature,
  FollowUpStatus, FollowUpPriority, CommChannel, TaskStatus, TaskPriority,
} from './enums';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AgentRef {
  id: string;
  name: string;
}

export interface Requirements {
  intent: Intent | null;
  segment: Segment | null;
  budgetMin: number | null;
  budgetMax: number | null;
  locations: string[];
  propertyTypes: PropertyType[];
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  parkingMin: number | null;
  furnishing: Furnishing | null;
  amenities: string[];
  moveBy: string | null;
  timeline: string | null;
  notes: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export interface LeadListItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  temperature: Temperature;
  leadType: LeadType;
  assignedAgent: AgentRef | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

export interface LeadDetail extends LeadListItem {
  whatsapp: string | null;
  tags: string[];
  notes: string | null;
  lostReason: string | null;
  clientId: string | null;
  firstResponseAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  requirements: Requirements | null;
  updatedAt: string;
}

export interface ClientListItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: ClientStatus;
  leadType: LeadType;
  assignedAgent: AgentRef | null;
  lastContactedAt: string | null;
  createdAt: string;
}

export interface ClientDetail extends ClientListItem {
  whatsapp: string | null;
  tags: string[];
  notes: string | null;
  leadId: string | null;
  requirements: Requirements | null;
  updatedAt: string;
}

export interface TimelineEntry {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  actor: AgentRef | null;
  occurredAt: string;
}

export interface TimelinePage {
  items: TimelineEntry[];
  nextCursor: string | null;
}

export interface FollowUpItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  channel: CommChannel | null;
  leadId: string | null;
  clientId: string | null;
  contactName: string;
  assignedTo: AgentRef | null;
  completedAt: string | null;
}

export interface FollowUpPage {
  items: FollowUpItem[];
  counts: { overdue: number; today: number; upcoming: number; completed: number };
}

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  leadId: string | null;
  clientId: string | null;
  assignedTo: AgentRef | null;
  completedAt: string | null;
}

export interface TaskPage {
  items: TaskItem[];
  counts: { open: number; overdue: number; completed: number };
}

export interface DuplicateContact {
  kind: 'lead' | 'client';
  id: string;
  fullName: string;
  phone: string;
}
