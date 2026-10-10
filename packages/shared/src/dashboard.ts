import type { AgentRef } from './crm';
import type { LeadSource } from './enums';

export type ScheduleItemType = 'VIEWING' | 'FOLLOW_UP' | 'TASK' | 'DEAL_DEADLINE';

export interface ScheduleItem {
  id: string;
  type: ScheduleItemType;
  title: string;
  subtitle: string | null;
  at: string;
  status: string;
  link: string;
}

export interface DashboardKpis {
  activeLeads: number;
  activeClients: number;
  viewingsThisWeek: number;
  dealsInProgress: number;
  pipelineValue: number;
  commissionsEarnedThisMonth: number;
  wonDealsThisMonth: number;
}

export const ATTENTION_BASE_SCORE = 10;

export interface AttentionItem {
  id: string;
  kind: 'OVERDUE_FOLLOW_UP' | 'STALLED_DEAL' | 'UNASSIGNED_LEAD' | 'OVERDUE_TASK';
  title: string;
  subtitle: string | null;
  score: number;
  link: string;
}

export interface LeadSourceBreakdown {
  source: LeadSource;
  count: number;
}

export interface LeadPipelineStage {
  status: string;
  count: number;
}

export interface RevenueTrendPoint {
  month: string;
  commissionEarned: number;
  dealsWon: number;
}

export interface AgentPerformance {
  agent: AgentRef;
  activeLeads: number;
  dealsWon: number;
  commissionEarned: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  attention: AttentionItem[];
  schedule: ScheduleItem[];
  leadSources: LeadSourceBreakdown[];
  pipeline: LeadPipelineStage[];
  revenueTrend: RevenueTrendPoint[];
  agentPerformance: AgentPerformance[];
}
