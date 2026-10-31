export const ONBOARDING_STEPS = ['branding', 'property', 'lead', 'teammate', 'viewing'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStatus {
  /** True once an org admin dismissed the checklist. */
  dismissed: boolean;
  steps: { key: OnboardingStepKey; done: boolean }[];
  completed: number;
  total: number;
}
