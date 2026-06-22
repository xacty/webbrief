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
import Spotlight from './Spotlight'

/**
 * TourContext — global guided-tour orchestrator.
 *
 * Mounted once near the root (inside <BrowserRouter> so useNavigate
 * works). Any descendant can call useTour().start(id, steps) to kick
 * off a multi-step Spotlight tour. The provider holds the active tour
 * + step index and renders the current step's Spotlight.
 *
 * Step shape:
 * {
 *   key?: string,                              // optional id for debug/state persistence
 *   target: string | Element | RefObject | null,
 *   title: string,
 *   body: string | ReactNode,
 *   placement?: 'top'|'bottom'|'left'|'right',
 *   condition?: () => boolean,                 // filter at start time
 *   route?: string,                            // navigate here on enter if not already there
 *   onEnter?: (helpers) => void | Promise<void>,
 *   onAdvance?: (helpers) => void | Promise<void>,
 *   nextLabel?: string,
 *   prevLabel?: string,
 *   skipLabel?: string,
 * }
 *
 * helpers = { navigate, exit }
 *
 * Tour spec passed to start():
 * {
 *   id: string,
 *   steps: Step[],
 *   onComplete?: () => void,    // called after last step's onAdvance
 *   onSkip?: () => void,        // called when user skips/Esc
 * }
 */

const TourContext = createContext(null)

const EMPTY_TOUR = null

export function TourProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [tour, setTour] = useState(EMPTY_TOUR)
  // Index inside the FILTERED step list (after applying step.condition).
  const [index, setIndex] = useState(0)
  const onSkipRef = useRef(null)
  const onCompleteRef = useRef(null)

  // Resolve the step list once at start time so condition()s aren't
  // re-evaluated mid-tour (would cause indices to shift under us).
  const activeSteps = useMemo(() => {
    if (!tour) return null
    return tour.steps.filter((s) => !s.condition || s.condition())
  }, [tour])

  const currentStep = activeSteps && index < activeSteps.length ? activeSteps[index] : null
  const isLast = activeSteps ? index === activeSteps.length - 1 : false

  const exit = useCallback(() => {
    onSkipRef.current?.()
    onSkipRef.current = null
    onCompleteRef.current = null
    setTour(EMPTY_TOUR)
    setIndex(0)
  }, [])

  const finish = useCallback(() => {
    onCompleteRef.current?.()
    onSkipRef.current = null
    onCompleteRef.current = null
    setTour(EMPTY_TOUR)
    setIndex(0)
  }, [])

  const start = useCallback((spec) => {
    if (!spec || !Array.isArray(spec.steps) || spec.steps.length === 0) return
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
        // Don't trap users in a step if their onAdvance throws.
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

  // On step change, if step.route is set and we're not on it, navigate.
  // Also fire step.onEnter once per index.
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
        // No-op — same rationale as onAdvance.
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
      next,
      prev,
      exit,
    }),
    [currentStep, tour, index, activeSteps, start, next, prev, exit],
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
