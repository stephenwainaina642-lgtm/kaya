import type { AgentRef } from './crm';
import type { LeadSource } from './enums';

/** Where a lead/deal currently sits in the "did it ever happen" funnel. */
export interface FunnelStage {
  key: 'LEADS' | 'VIEWED' | 'DEAL_CREATED' | 'WON';
  label: string;
  count: number;
}

export interface LeaderboardRow {
  agent: AgentRef;
  rank: number;
  dealsWon: number;
  dealsLost: number;
  /** 0–1. dealsWon / (dealsWon + dealsLost); 0 when the agent has no decided deals yet. */
  winRate: number;
  commissionEarned: number;
  /** Mean days between a won deal's creation and its actual close date. Null with no won deals. */
  avgDaysToClose: number | null;
}

export interface ForecastBucket {
  /** 'YYYY-MM', or 'UNSCHEDULED' for open deals with no expected close date set. */
  month: string;
  label: string;
  /** Sum of dealValue * (stage/deal probability / 100) — a realistic forecast, not just raw pipeline. */
  weightedValue: number;
  rawValue: number;
  dealCount: number;
}

export interface SourceRoiRow {
  source: LeadSource;
  totalLeads: number;
  dealsWon: number;
  /** 0–1. dealsWon / totalLeads. */
  conversionRate: number;
  commissionEarned: number;
}

export interface AnalyticsData {
  funnel: FunnelStage[];
  leaderboard: LeaderboardRow[];
  forecast: ForecastBucket[];
  sourceRoi: SourceRoiRow[];
}
