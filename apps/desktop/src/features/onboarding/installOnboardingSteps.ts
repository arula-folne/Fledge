export const INSTALL_TUTORIAL_STEPS = ['nav', 'home', 'browse', 'content', 'settings'] as const
export type InstallTutorialStepId = (typeof INSTALL_TUTORIAL_STEPS)[number]

export type InstallOnboardingFlowStep =
  | { kind: 'welcome' }
  | { kind: 'terms' }
  | { kind: 'tutorial-offer' }
