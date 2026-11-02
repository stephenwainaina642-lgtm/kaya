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
