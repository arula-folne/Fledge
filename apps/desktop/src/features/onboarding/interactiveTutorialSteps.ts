import type { SettingsSection } from '../../stores/appStores'
import type { InstallTutorialStepId } from './installOnboardingSteps'

export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right'

export type TutorialContext = {
  firstInstanceId: string | null
}

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
    id: 'home',
    route: '/',
    target: 'tutorial-home-library',
    placement: 'bottom',
    bodyKey: 'onboarding.tutorial.home.body',
  },
  {
    id: 'browse',
    route: '/browse',
    target: 'tutorial-browse-tabs',
    placement: 'bottom',
    bodyKey: 'onboarding.tutorial.browse.body',
  },
  {
    id: 'content',
    route: (ctx) => (ctx.firstInstanceId ? `/library/${ctx.firstInstanceId}?tab=content` : '/'),
    target: (ctx) => (ctx.firstInstanceId ? 'tutorial-content-tabs' : 'tutorial-home-create'),
    placement: 'bottom',
    bodyKey: (ctx) =>
      ctx.firstInstanceId
        ? 'onboarding.tutorial.content.body'
        : 'onboarding.tutorial.content.bodyNoInstance',
  },
  {
    id: 'settings',
    route: '/settings',
    target: 'tutorial-settings-theme',
    placement: 'top',
    settingsSection: 'appTheme',
    bodyKey: 'onboarding.tutorial.settings.body',
  },
]

export const INTERACTIVE_TUTORIAL_STEP_COUNT = INTERACTIVE_TUTORIAL_STEPS.length
