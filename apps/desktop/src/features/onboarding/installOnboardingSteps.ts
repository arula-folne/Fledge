export const INSTALL_TUTORIAL_STEPS = [
  'nav',
  'instance',
  'news',
  'skin',
  'settingsAppTheme',
  'settingsMinecraftInitial',
  'settingsResources',
] as const
export type InstallTutorialStepId = (typeof INSTALL_TUTORIAL_STEPS)[number]

export type TutorialStepId = InstallTutorialStepId

/** 初回インストール案内ダイアログのステップ */
export type InstallOnboardingFlowStep =
  | { kind: 'welcome' }
  | { kind: 'terms' }
  | { kind: 'tutorial-offer' }
