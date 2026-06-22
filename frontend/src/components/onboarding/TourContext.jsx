import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { isAdmin } from '../../lib/roleCapabilities'
import { readCompanyCache } from '../../lib/companyCache'
import { TASK_KEYS, getTutorialState } from '../../lib/tutorialState'
import {
  buildWorkspaceTour,
  buildCreateProjectTour,
  buildEditPageTour,
  buildInviteMemberTour,
  buildShareLinkTour,
  buildLeaveCommentTour,
  buildNoProjectFallback,
} from '../../lib/onboardingTours'
import Spotlight from './Spotlight'

/**
 * TourContext — global guided-tour orchestrator.
 *
 * Two modes:
 *
 *   1. SINGLE TOUR — useTour().start(spec) runs one tour and exits
 *      when it finishes or the user skips. Used when the user clicks
 *      a specific task in the OnboardingChecklist to replay/run it.
 *
 *   2. CHAIN — useTour().startFullTutorial(fromTask?) queues every
 *      remaining task (per TASK_KEYS order, skipping ones already
 *      done) and auto-advances from one tour to the next when each
 *      finishes (Listo) OR skips (Saltar / Esc). Used by the
 *      WelcomeModal's "Empezar tour" so the whole onboarding flows
 *      end-to-end without manual clicking between tasks.
 *
 * Step / Tour shape: see onboardingTours.js.
 */

const TourContext = createContext(null)

const EMPTY_TOUR = null
// Small delay between tours in chain mode so React can unmount the
// previous Spotlight (and any navigation triggered by step.route
// can settle) before the next tour mounts. Without this, the next
// step's target rect can resolve against the OUTGOING DOM.
const CHAIN_INTER_TOUR_DELAY_MS = 250

export function TourProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()
  const { accessibleCompanies, currentCompany, currentCompanySlug } = useWorkspace()

  const [tour, setTour] = useState(EMPTY_TOUR)
  const [index, setIndex] = useState(0)
  const onSkipRef = useRef(null)
  const onCompleteRef = useRef(null)
  // Chain mode state — array of task keys still to run, in order.
  // Live in a ref (not state) because we mutate it during transitions
  // without needing a re-render.
  const chainTasksRef = useRef([])

  // Keep latest workspace ctx accessible to the chain dispatcher even
  // when advanceChain() is called from a callback that captured an
  // older closure.
  const ctxRef = useRef({})
  useEffect(() => {
    ctxRef.current = {
      currentUser,
      accessibleCompanies,
      currentCompany,
      currentCompanySlug,
    }
  }, [currentUser, accessibleCompanies, currentCompany, currentCompanySlug])

  const activeSteps = useMemo(() => {
    if (!tour) return null
    return tour.steps.filter((s) => !s.condition || s.condition())
  }, [tour])

  const currentStep = activeSteps && index < activeSteps.length ? activeSteps[index] : null
  const isLast = activeSteps ? index === activeSteps.length - 1 : false

  // ─── Chain dispatch ───────────────────────────────────────────────
  // Resolve the live context every time we build a tour so role /
  // hasProjects / currentCompany are up-to-date.
  function resolveCtx() {
    const { currentUser, currentCompany, currentCompanySlug } = ctxRef.current
    const isPlatformAdmin = isAdmin(currentUser)
    const role =
      currentUser?.rolePreview ||
      currentUser?.memberships?.find((m) => m.companyId === currentCompany?.id)?.role ||
      null
    const cached = currentCompany?.id ? readCompanyCache(currentCompany.id) : null
    const projects = Array.isArray(cached?.projects) ? cached.projects : []
    const hasProjects = projects.length > 0
    const sortedByEdit = [...projects].sort((a, b) => {
      const at = a?.updatedAt || a?.editedAt || ''
      const bt = b?.updatedAt || b?.editedAt || ''
      return bt.localeCompare(at)
    })
    const lastProject = sortedByEdit[0] || null
    return {
      isPlatformAdmin,
      role,
      currentCompanySlug,
      hasProjects,
      projects,
      lastProject,
    }
  }

  function buildTourForTask(taskKey) {
    const ctx = resolveCtx()
    switch (taskKey) {
      case 'discover_workspace':
        return buildWorkspaceTour(ctx)
      case 'invite_member':
        return buildInviteMemberTour(ctx)
      case 'create_project':
        return buildCreateProjectTour(ctx)
      case 'edit_page':
        if (!ctx.lastProject) {
          // Edge case: no project yet (user skipped create_project
          // and has no existing ones). Show a fallback prompt.
          return buildNoProjectFallback({
            ...ctx,
            onCreateNow: () => startFullTutorial('create_project'),
          })
        }
        return buildEditPageTour({
          ...ctx,
          projectType: ctx.lastProject.projectType,
          projectId: ctx.lastProject.id,
        })
      case 'create_share_link':
        return buildShareLinkTour({
          ...ctx,
          projectId: ctx.lastProject?.id || null,
        })
      case 'leave_comment':
        return buildLeaveCommentTour({
          ...ctx,
          projectId: ctx.lastProject?.id || null,
        })
      default:
        return null
    }
  }

  const advanceChain = useCallback(() => {
    if (chainTasksRef.current.length === 0) return
    const [nextTask, ...rest] = chainTasksRef.current
    chainTasksRef.current = rest
    const spec = buildTourForTask(nextTask)
    if (spec && Array.isArray(spec.steps) && spec.steps.length > 0) {
      onSkipRef.current = spec.onSkip || null
      onCompleteRef.current = spec.onComplete || null
      setTour({ id: spec.id, steps: spec.steps })
      setIndex(0)
    } else {
      // No tour for this task → skip and try next.
      advanceChain()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startFullTutorial = useCallback((fromTask = null) => {
    // Build the chain from fromTask onward. NO doneAt filtering —
    // the tutorial is a guided walkthrough; even if a user already
    // has projects/members/etc. (auto-marking some tasks done via
    // syncTasksFromSignals), the chain still teaches each step.
    // The checklist's checkmarks reflect status; the chain teaches
    // the gesture regardless.
    const fromIdx = fromTask ? Math.max(0, TASK_KEYS.indexOf(fromTask)) : 0
    chainTasksRef.current = TASK_KEYS.slice(fromIdx)
    advanceChain()
  }, [advanceChain])

  // ─── Exit / finish hooks ──────────────────────────────────────────
  // Both branches call the originally-registered onSkip / onComplete
  // (so the task-done bookkeeping in onboardingTours.js still runs),
  // then either auto-advance the chain or clear state.

  const exit = useCallback(() => {
    onSkipRef.current?.()
    onSkipRef.current = null
    onCompleteRef.current = null
    if (chainTasksRef.current.length > 0) {
      setTimeout(advanceChain, CHAIN_INTER_TOUR_DELAY_MS)
    } else {
      setTour(EMPTY_TOUR)
      setIndex(0)
    }
  }, [advanceChain])

  const finish = useCallback(() => {
    onCompleteRef.current?.()
    onSkipRef.current = null
    onCompleteRef.current = null
    if (chainTasksRef.current.length > 0) {
      setTimeout(advanceChain, CHAIN_INTER_TOUR_DELAY_MS)
    } else {
      setTour(EMPTY_TOUR)
      setIndex(0)
    }
  }, [advanceChain])

  const start = useCallback((spec) => {
    if (!spec || !Array.isArray(spec.steps) || spec.steps.length === 0) return
    // Starting a single tour from the checklist exits chain mode.
    chainTasksRef.current = []
    onSkipRef.current = spec.onSkip || null
    onCompleteRef.current = spec.onComplete || null
    setTour({ id: spec.id, steps: spec.steps })
    setIndex(0)
  }, [])

  const next = useCallback(async () => {
    if (!activeSteps) return
    const step = activeSteps[index]
    if (step?.onAdvance) {
      try {
        await step.onAdvance({ navigate, exit })
      } catch {
        // Don't trap users if onAdvance throws.
      }
    }
    if (index + 1 >= activeSteps.length) {
      finish()
    } else {
      setIndex((i) => i + 1)
    }
  }, [activeSteps, index, navigate, exit, finish])

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  // On step change, fire route navigation + onEnter.
  const enteredKeyRef = useRef(null)
  useEffect(() => {
    if (!currentStep) {
      enteredKeyRef.current = null
      return
    }
    if (currentStep.route && location.pathname !== currentStep.route) {
      navigate(currentStep.route)
    }
    const enterKey = `${tour?.id || 'tour'}#${index}`
    if (enteredKeyRef.current !== enterKey && currentStep.onEnter) {
      enteredKeyRef.current = enterKey
      try {
        currentStep.onEnter({ navigate, exit })
      } catch {
        // No-op.
      }
    } else {
      enteredKeyRef.current = enterKey
    }
  }, [currentStep, index, tour, location.pathname, navigate, exit])

  const value = useMemo(
    () => ({
      isActive: !!currentStep,
      tourId: tour?.id || null,
      stepIndex: index,
      totalSteps: activeSteps?.length ?? 0,
      currentStep,
      start,
      startFullTutorial,
      next,
      prev,
      exit,
    }),
    [currentStep, tour, index, activeSteps, start, startFullTutorial, next, prev, exit],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {currentStep && (
        <Spotlight
          target={currentStep.target}
          title={currentStep.title}
          body={currentStep.body}
          placement={currentStep.placement}
          stepIndex={index}
          totalSteps={activeSteps.length}
          isLast={isLast}
          onNext={next}
          onPrev={prev}
          onSkip={exit}
          nextLabel={currentStep.nextLabel}
          prevLabel={currentStep.prevLabel}
          skipLabel={currentStep.skipLabel}
        />
      )}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error('useTour must be used inside <TourProvider>')
  }
  return ctx
}
