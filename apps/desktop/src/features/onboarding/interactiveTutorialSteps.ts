import type { SettingsSection } from '../../stores/appStores'
import type { InstallTutorialStepId } from './installOnboardingSteps'
import { INSTALL_TUTORIAL_STEPS } from './installOnboardingSteps'

export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right'

export type TutorialContext = Record<string, never>

export type InteractiveTutorialStep = {
  id: InstallTutorialStepId
  route: string | ((ctx: TutorialContext) => string)
  target: string | ((ctx: TutorialContext) => string)
  placement: TutorialPlacement
  settingsSection?: SettingsSection
  bodyKey: string | ((ctx: TutorialContext) => string)
}

function resolve<T>(value: T | ((ctx: TutorialContext) => T), ctx: TutorialContext): T {
  return typeof value === 'function' ? (value as (ctx: TutorialContext) => T)(ctx) : value
}

export function tutorialStepRoute(step: InteractiveTutorialStep, ctx: TutorialContext): string {
  return resolve(step.route, ctx)
}

export function tutorialStepTarget(step: InteractiveTutorialStep, ctx: TutorialContext): string {
  return resolve(step.target, ctx)
}

export function tutorialStepBodyKey(step: InteractiveTutorialStep, ctx: TutorialContext): string {
  return resolve(step.bodyKey, ctx)
}

export const INTERACTIVE_TUTORIAL_STEPS: InteractiveTutorialStep[] = [
  {
    id: 'nav',
    route: '/',
    target: 'tutorial-sidebar',
    placement: 'right',
    bodyKey: 'onboarding.tutorial.nav.body',
  },
  {
    id: 'instance',
    route: '/',
    target: 'tutorial-home-create',
    placement: 'bottom',
    bodyKey: 'onboarding.tutorial.instance.body',
  },
  {
    id: 'news',
    route: '/',
    target: 'tutorial-home-news',
    placement: 'left',
    bodyKey: 'onboarding.tutorial.news.body',
  },
  {
    id: 'skin',
    route: '/skin',
    target: 'tutorial-skin',
    placement: 'bottom',
    bodyKey: 'onboarding.tutorial.skin.body',
  },
  {
    id: 'settingsAppTheme',
    route: '/settings',
    target: 'tutorial-settings-page',
    placement: 'left',
    settingsSection: 'appTheme',
    bodyKey: 'onboarding.tutorial.settingsAppTheme.body',
  },
  {
    id: 'settingsMinecraftInitial',
    route: '/settings',
    target: 'tutorial-settings-page',
    placement: 'left',
    settingsSection: 'minecraftInitial',
    bodyKey: 'onboarding.tutorial.settingsMinecraftInitial.body',
  },
  {
    id: 'settingsResources',
    route: '/settings',
    target: 'tutorial-settings-page',
    placement: 'left',
    settingsSection: 'resources',
    bodyKey: 'onboarding.tutorial.settingsResources.body',
  },
]

export const INTERACTIVE_TUTORIAL_STEP_COUNT = INSTALL_TUTORIAL_STEPS.length
