import type { LeadSource, FollowUpPriority, ContactMethod } from './enums';
import type { AgentRef } from './crm';

export const ASSIGN_STRATEGIES = ['ROUND_ROBIN', 'SPECIFIC_AGENT'] as const;
export type AssignStrategy = (typeof ASSIGN_STRATEGIES)[number];

export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface AutomationRule {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  sourceFilter: LeadSource | null;
  strategy: AssignStrategy;
  specificAgent: AgentRef | null;
  agentPool: AgentRef[];
  createdAt: string;
}

export interface AutomationRuleInput {
  name: string;
  active: boolean;
  priority: number;
  sourceFilter: LeadSource | null;
  strategy: AssignStrategy;
  specificAgentId?: string | null;
  agentPoolIds?: string[];
}

export interface DripStep {
  id: string;
  stepOrder: number;
  offsetHours: number;
  title: string;
  notes: string | null;
  channel: ContactMethod | null;
  priority: FollowUpPriority;
}

export interface DripStepInput {
  offsetHours: number;
  title: string;
  notes?: string | null;
  channel?: ContactMethod | null;
  priority?: FollowUpPriority;
}

export interface DripSequence {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sourceFilter: LeadSource | null;
  steps: DripStep[];
  activeEnrollments: number;
  createdAt: string;
}

export interface DripSequenceInput {
  name: string;
  description?: string | null;
  active: boolean;
  sourceFilter?: LeadSource | null;
  steps: DripStepInput[];
}

export interface DripEnrollment {
  id: string;
  sequenceId: string;
  sequenceName: string;
  contactName: string;
  leadId: string | null;
  clientId: string | null;
  status: EnrollmentStatus;
  stepsDone: number;
  stepsTotal: number;
  enrolledAt: string;
  completedAt: string | null;
}
