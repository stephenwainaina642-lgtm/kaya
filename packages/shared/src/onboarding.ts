export const ONBOARDING_STEPS = ['branding', 'property', 'lead', 'teammate', 'viewing'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStatus {
  /** True once an org admin dismissed the checklist. */
  dismissed: boolean;
  steps: { key: OnboardingStepKey; done: boolean }[];
  completed: number;
  total: number;
  /** True while the demo records are present. */
  sampleLoaded: boolean;
}

export interface SampleDataStatus {
  loaded: boolean;
}

export interface LeadImportResult {
  created: number;
  duplicates: number;
  invalid: { row: number; reason: string }[];
}

export interface SearchHit {
  type: 'lead' | 'client' | 'property' | 'owner';
  id: string;
  title: string;
  subtitle: string;
  /** In-app route to open the record. */
  to: string;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
}

export interface PropertyImportResult {
  created: number;
  /** Landlords that were not yet in Kaya and were added as owners. */
  ownersCreated: number;
  /** Rows left out because that property is already in Kaya. */
  duplicates: number;
  invalid: { row: number; reason: string }[];
}
