import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lesson, LessonStep, ProblemFormat, ProblemStep } from '../models/lesson';
import {
  isOrderCorrect,
  isSortCorrect,
  isStageCorrect,
  numericAnswersMatch,
  serializeOrderAnswer,
  serializeSortAnswer,
} from '../services/answerCheck';
import {
  calculateLessonProgress,
  initializeProgress,
  loadProgress,
  loadLessonProgress,
  saveMasterySummary,
  saveLessonProgress,
  StepProgress,
  updateUserStreak,
} from '../services/progressService';

export type FeedbackState = 'idle' | 'correct' | 'incorrect' | 'revealed';

/** Transient UI state for the question currently on screen. */
export interface QuestionView {
  /** How many progressive hints to reveal for the active free-response prompt. */
  revealedHints: number;
  /** Index of the active stage in a multi-stage question. */
  activeStageIndex: number;
  /** Which stages of a multi-stage question have been resolved (correct OR revealed). */
  resolvedStages: boolean[];
  /**
   * Which resolved stages were resolved by REVEALING the answer rather than
   * answering correctly. A revealed stage must never render with the "correct"
   * treatment, so this flag is what keeps the green ✓ badge/feedback off a
   * stage the learner only revealed. Parallel to `resolvedStages` by index.
   */
  revealedStages: boolean[];
}

const initialQuestionView: QuestionView = {
  revealedHints: 0,
  activeStageIndex: 0,
  resolvedStages: [],
  revealedStages: [],
};

function applyVariant(step: LessonStep, variantIndices: Record<string, number>): LessonStep {
  if (step.type !== 'problem') return step;
  const idx = variantIndices[step.stepId];
  if (idx === undefined) return step;
  const variant = (step as ProblemStep).variants?.[idx];
  if (!variant) return step;
  return { ...step, ...variant };
}

function problemFormat(step: ProblemStep): ProblemFormat {
  return step.format ?? 'multiple-choice';
}

/**
 * Formats whose answer is a single tolerant numeric value graded by
 * `numericAnswersMatch` against `acceptedAnswer`: free-response typed entry and
 * the slider (whose setting is the submitted value). Both share the same submit,
 * hint, reveal, and restore handling.
 */
function isNumericEntryFormat(format: ProblemFormat): boolean {
  return format === 'free-response' || format === 'slider';
}

/**
 * The canonical correct answer string for the interaction formats (`sort` and
 * `order`), used to restore a solved question and to power "Reveal answer".
 * Returns null for any other format.
 */
function interactionSolution(step: ProblemStep, format: ProblemFormat): string | null {
  if (format === 'sort') return serializeSortAnswer(step.sortSolution ?? {});
  if (format === 'order') return serializeOrderAnswer(step.orderSolution ?? []);
  return null;
}

/** A snapshot of the transient question UI for a single step. */
interface StepViewSnapshot {
  feedbackState: FeedbackState;
  selectedChoice: string | null;
  questionView: QuestionView;
}

/**
 * Reconstruct the question UI for a step from persisted attempts alone (used when
 * there is no richer in-session snapshot, e.g. right after returning to the
 * lesson). A previously solved/revealed question comes back showing its answer
 * instead of resetting to a blank prompt. The `step` should already have any
 * active variant applied.
 */
function computeRestoredView(step: LessonStep, stepAttempts: Record<string, StepProgress>): StepViewSnapshot {
  if (step.type === 'problem') {
    const problem = step as ProblemStep;
    const format = problemFormat(problem);
    const attempt = stepAttempts[step.stepId];
    if (attempt?.lastResult === 'correct') {
      if (format === 'multi-stage') {
        const count = problem.stages?.length ?? 0;
        return {
          feedbackState: 'correct',
          selectedChoice: null,
          questionView: {
            revealedHints: 0,
            activeStageIndex: Math.max(count - 1, 0),
            resolvedStages: Array.from({ length: count }, () => true),
            // Persisted progress alone cannot tell which stages were revealed vs
            // answered (no per-stage reveal marker on StepProgress), so a full
            // reload restores a solved multi-stage as correct. In-session reveal
            // distinctness is preserved via stepViewMemory, not this path.
            revealedStages: Array.from({ length: count }, () => false),
          },
        };
      }
      const interaction = interactionSolution(problem, format);
      return {
        feedbackState: 'correct',
        selectedChoice: interaction ?? (isNumericEntryFormat(format) ? problem.acceptedAnswer ?? '' : problem.answer ?? null),
        questionView: initialQuestionView,
      };
    }
  }
  return { feedbackState: 'idle', selectedChoice: null, questionView: initialQuestionView };
}

export interface UseLessonStateOptions {
  /**
   * When provided (e.g. from a `?step=` deep link), open the player at this
   * step on load instead of the stored resume point. Clamped so a learner can
   * never jump past the furthest step they have unlocked within the lesson.
   */
  requestedStepIndex?: number;
}

export function useLessonState(lesson: Lesson | null, userId?: string, options?: UseLessonStateOptions) {
  const requestedStepIndex = options?.requestedStepIndex;
  const [progress, setProgress] = useState(() => initializeProgress('pending-lesson'));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [questionView, setQuestionView] = useState<QuestionView>(initialQuestionView);
  const [variantIndices, setVariantIndices] = useState<Record<string, number>>({});
  // Per-step snapshot of the transient question UI (feedback, a revealed answer,
  // revealed-hint progress, multi-stage progress), keyed by stepId, kept for the
  // life of the mounted lesson. Navigating away and back restores exactly what
  // the learner last saw — including a revealed answer or partially revealed
  // hints — rather than rebuilding a lossy view from persisted attempts alone.
  const stepViewMemory = useRef<Record<string, StepViewSnapshot>>({});

  const rawCurrentStep = lesson ? lesson.steps[currentStepIndex] : null;

  const effectiveStep = useMemo<LessonStep | null>(() => {
    if (!rawCurrentStep || Object.keys(variantIndices).length === 0) return rawCurrentStep;
    return applyVariant(rawCurrentStep, variantIndices);
  }, [rawCurrentStep, variantIndices]);

  const resetQuestionView = useCallback(() => {
    setQuestionView(initialQuestionView);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!lesson) return;

    const progressPromise = userId
      ? loadLessonProgress(userId, lesson.lessonId)
      : Promise.resolve(loadProgress(lesson.lessonId));

    progressPromise
      .then((loaded) => {
        if (cancelled) return;
        const versionMismatch = loaded && loaded.contentVersion !== lesson.contentVersion;
        const nextProgress = !loaded || versionMismatch ? initializeProgress(lesson.lessonId, lesson.contentVersion) : loaded;
        const maxIndex = lesson.steps.length - 1;
        const furthest = Math.min(nextProgress.lastStepIndex, maxIndex);
        // A deep link can request an explicit step, but never past what the
        // learner has unlocked (the furthest reached step, or the whole lesson
        // once it is complete and freely reviewable).
        const ceiling = nextProgress.completed ? maxIndex : furthest;
        const openIndex =
          requestedStepIndex !== undefined
            ? Math.min(Math.max(requestedStepIndex, 0), Math.max(ceiling, 0))
            : furthest;
        setProgress({ ...nextProgress, lastStepIndex: furthest });
        setCurrentStepIndex(openIndex);
        // A fresh mount has no in-session view memory, so restore the opened
        // step's feedback from persisted attempts. This is what makes a revealed
        // or already-answered question reappear (with its answer) when the
        // learner returns to the lesson, instead of resetting to a blank prompt.
        stepViewMemory.current = {};
        const openStep = lesson.steps[openIndex];
        const restored = openStep
          ? computeRestoredView(openStep, nextProgress.stepAttempts)
          : { feedbackState: 'idle' as FeedbackState, selectedChoice: null, questionView: initialQuestionView };
        setFeedbackState(restored.feedbackState);
        setSelectedChoice(restored.selectedChoice);
        setQuestionView(restored.questionView);
      })
      .catch((error) => {
        console.warn('Failed to load lesson progress from Firestore, keeping local progress.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [lesson, userId, requestedStepIndex, resetQuestionView]);

  // Keep the active step within the bounds of the loaded lesson (e.g. if the
  // content shrank between versions). Resume/forward/review navigation own the
  // step index otherwise, so this must not force it back to the stored point.
  useEffect(() => {
    if (!lesson) {
      setCurrentStepIndex(0);
      return;
    }
    setCurrentStepIndex((index) => Math.min(index, lesson.steps.length - 1));
  }, [lesson]);

  // Continuously snapshot the active step's transient UI so it can be restored
  // verbatim on return. Capturing every change (not just answers) means revealed
  // answers and revealed-hint progress survive back/forward navigation.
  useEffect(() => {
    const stepId = rawCurrentStep?.stepId;
    if (!stepId) return;
    stepViewMemory.current[stepId] = { feedbackState, selectedChoice, questionView };
  }, [rawCurrentStep, feedbackState, selectedChoice, questionView]);

  const updateProgress = useCallback(
    (nextProgress: typeof progress) => {
      setProgress(nextProgress);
      if (userId) {
        saveLessonProgress(userId, nextProgress).catch((error) => {
          console.warn('Failed to save lesson progress to Firestore, saved locally instead.', error);
        });
        if (nextProgress.completed) {
          saveMasterySummary(userId, nextProgress);
          updateUserStreak(userId);
        }
      } else {
        saveLessonProgress('', nextProgress);
      }
    },
    [userId]
  );

  /** Record an attempt against a question step and persist progress. */
  const recordAttempt = useCallback(
    (
      stepId: string,
      {
        correctFirstAttempt,
        lastResult,
        completed,
      }: { correctFirstAttempt: boolean; lastResult: StepProgress['lastResult']; completed: boolean }
    ) => {
      if (!lesson) return;
      const priorAttempt = progress.stepAttempts[stepId];
      const newAttempts: Record<string, StepProgress> = {
        ...progress.stepAttempts,
        [stepId]: {
          attempts: priorAttempt ? priorAttempt.attempts + 1 : 1,
          correctFirstAttempt,
          lastResult,
        },
      };
      // The resume point only ever moves forward, so re-answering an earlier
      // step while reviewing never rewinds the furthest step reached.
      const resumeIndex = Math.max(currentStepIndex, progress.lastStepIndex);
      const newProgress = calculateLessonProgress(
        lesson,
        newAttempts,
        resumeIndex,
        completed,
        progress.masteryStatus
      );
      updateProgress(newProgress);
    },
    [lesson, progress.stepAttempts, progress.masteryStatus, progress.lastStepIndex, currentStepIndex, updateProgress]
  );

  const submitMultiStage = useCallback(
    (step: ProblemStep, answer: string) => {
      if (!lesson) return;
      const stages = step.stages ?? [];
      const stageIndex = questionView.activeStageIndex;
      const stage = stages[stageIndex];
      if (!stage) return;

      const correct = isStageCorrect(stage, answer);
      setSelectedChoice(answer);
      setFeedbackState(correct ? 'correct' : 'incorrect');

      const priorAttempt = progress.stepAttempts[step.stepId];
      const priorFirstTry = priorAttempt ? priorAttempt.correctFirstAttempt : true;

      if (!correct) {
        // Hints are revealed on demand only (see revealHint), never auto-shown
        // on a wrong attempt.
        recordAttempt(step.stepId, {
          correctFirstAttempt: false,
          lastResult: 'incorrect',
          completed: false,
        });
        return;
      }

      const isLastStage = stageIndex === stages.length - 1;
      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      recordAttempt(step.stepId, {
        correctFirstAttempt: priorFirstTry,
        lastResult: isLastStage ? 'correct' : priorAttempt?.lastResult ?? 'unanswered',
        completed: isLastStage && isFinalStep,
      });

      setQuestionView((view) => {
        const resolvedStages = [...view.resolvedStages];
        resolvedStages[stageIndex] = true;
        // A correctly-answered stage is resolved but NOT revealed; carry forward
        // any earlier stages' reveal flags untouched.
        return {
          revealedHints: 0,
          activeStageIndex: isLastStage ? stageIndex : stageIndex + 1,
          resolvedStages,
          revealedStages: [...view.revealedStages],
        };
      });

      if (!isLastStage) {
        // Reset feedback so the next stage starts clean; the resolved stage stays
        // marked correct via questionView.resolvedStages.
        setFeedbackState('idle');
        setSelectedChoice(null);
      }
    },
    [lesson, questionView.activeStageIndex, progress.stepAttempts, currentStepIndex, recordAttempt]
  );

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!lesson || !effectiveStep || effectiveStep.type !== 'problem') return;
      const step = effectiveStep as ProblemStep;
      const format = problemFormat(step);

      if (format === 'multi-stage') {
        submitMultiStage(step, answer);
        return;
      }

      const correct =
        format === 'sort'
          ? isSortCorrect(step.sortSolution ?? {}, answer)
          : format === 'order'
            ? isOrderCorrect(step.orderSolution ?? [], answer)
            : isNumericEntryFormat(format)
              ? numericAnswersMatch(answer, step.acceptedAnswer ?? '', step.tolerance)
              : answer === step.answer;

      setSelectedChoice(answer);
      setFeedbackState(correct ? 'correct' : 'incorrect');

      // Hints are revealed on demand only (see revealHint); a wrong attempt no
      // longer auto-reveals the next hint.

      const priorAttempt = progress.stepAttempts[step.stepId];
      const firstAttemptCorrect = priorAttempt ? priorAttempt.correctFirstAttempt : correct;
      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      recordAttempt(step.stepId, {
        correctFirstAttempt: firstAttemptCorrect,
        lastResult: correct ? 'correct' : 'incorrect',
        completed: correct && isFinalStep,
      });
    },
    [effectiveStep, currentStepIndex, lesson, progress.stepAttempts, recordAttempt, submitMultiStage]
  );

  /** Reveal the next progressive hint for the active free-response context. */
  const revealHint = useCallback(() => {
    if (!effectiveStep || effectiveStep.type !== 'problem') return;
    const step = effectiveStep as ProblemStep;
    const format = problemFormat(step);
    let total = 0;
    if (format === 'multi-stage') {
      total = step.stages?.[questionView.activeStageIndex]?.hints?.length ?? 0;
    } else if (isNumericEntryFormat(format) || format === 'sort' || format === 'order') {
      total = step.hints?.length ?? 0;
    }
    if (total === 0) return;
    setQuestionView((view) => ({
      ...view,
      revealedHints: Math.min(view.revealedHints + 1, total),
    }));
  }, [effectiveStep, questionView.activeStageIndex]);

  /**
   * Reveal the accepted answer for the active free-response context. Revealing
   * is treated like a wrong attempt for mastery: it never awards first-try
   * credit, but it does unlock the step/stage so the learner can continue.
   */
  const revealAnswer = useCallback(() => {
    if (!lesson || !effectiveStep || effectiveStep.type !== 'problem') return;
    const step = effectiveStep as ProblemStep;
    const format = problemFormat(step);

    if (format === 'multi-stage') {
      const stages = step.stages ?? [];
      const stageIndex = questionView.activeStageIndex;
      const stage = stages[stageIndex];
      if (!stage || stage.format !== 'free-response') return;

      const isLastStage = stageIndex === stages.length - 1;
      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      const priorAttempt = progress.stepAttempts[step.stepId];

      setSelectedChoice(stage.acceptedAnswer ?? '');
      setFeedbackState('revealed');
      recordAttempt(step.stepId, {
        correctFirstAttempt: false,
        lastResult: isLastStage ? 'correct' : priorAttempt?.lastResult ?? 'unanswered',
        completed: isLastStage && isFinalStep,
      });

      setQuestionView((view) => {
        const resolvedStages = [...view.resolvedStages];
        resolvedStages[stageIndex] = true;
        // Mark this stage as revealed so it renders with the distinct "Answer
        // revealed" treatment instead of the green correct ✓ badge/feedback.
        const revealedStages = [...view.revealedStages];
        revealedStages[stageIndex] = true;
        return {
          revealedHints: 0,
          activeStageIndex: isLastStage ? stageIndex : stageIndex + 1,
          resolvedStages,
          revealedStages,
        };
      });

      if (!isLastStage) {
        setFeedbackState('idle');
        setSelectedChoice(null);
      }
      return;
    }

    const interaction = interactionSolution(step, format);
    if (interaction !== null) {
      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      setSelectedChoice(interaction);
      setFeedbackState('revealed');
      recordAttempt(step.stepId, {
        correctFirstAttempt: false,
        lastResult: 'correct',
        completed: isFinalStep,
      });
      return;
    }

    if (isNumericEntryFormat(format)) {
      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      setSelectedChoice(step.acceptedAnswer ?? '');
      setFeedbackState('revealed');
      recordAttempt(step.stepId, {
        correctFirstAttempt: false,
        lastResult: 'correct',
        completed: isFinalStep,
      });
    }
  }, [lesson, effectiveStep, questionView.activeStageIndex, progress.stepAttempts, currentStepIndex, recordAttempt]);

  const restoreFeedbackForStep = useCallback(
    (stepIndex: number) => {
      if (!lesson) return;
      const rawStep = lesson.steps[stepIndex];

      // Prefer the in-session snapshot so a revealed answer, revealed hints, or a
      // partially completed multi-stage question return exactly as left.
      const remembered = stepViewMemory.current[rawStep.stepId];
      if (remembered) {
        setFeedbackState(remembered.feedbackState);
        setSelectedChoice(remembered.selectedChoice);
        setQuestionView(remembered.questionView);
        return;
      }

      // No snapshot yet (e.g. first visit this session): rebuild from persisted
      // attempts so a previously solved/revealed question still shows its answer.
      const effectiveStepForRestore =
        rawStep.type === 'problem' ? (applyVariant(rawStep, variantIndices) as ProblemStep) : rawStep;
      const restored = computeRestoredView(effectiveStepForRestore, progress.stepAttempts);
      setFeedbackState(restored.feedbackState);
      setSelectedChoice(restored.selectedChoice);
      setQuestionView(restored.questionView);
    },
    [lesson, progress.stepAttempts, variantIndices]
  );

  const advanceStep = useCallback(() => {
    if (!lesson) return;
    if (currentStepIndex >= lesson.steps.length - 1) return;

    // Review mode: a finished lesson, or any step the learner has already
    // passed (it sits behind the furthest step reached). In review the primary
    // Next/Continue button advances freely without re-answering.
    const reviewing = progress.completed || currentStepIndex < progress.lastStepIndex;
    if (reviewing) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      restoreFeedbackForStep(nextIndex);
      return;
    }

    // First-time forward play still requires the question to be answered before
    // advancing. A question counts as answered once it is solved correctly OR the
    // learner revealed the accepted answer — both unlock Continue, so 'revealed'
    // must advance exactly like 'correct' (otherwise Continue is a dead no-op
    // after a reveal).
    if (rawCurrentStep?.type === 'problem' && feedbackState !== 'correct' && feedbackState !== 'revealed') {
      return;
    }

    const nextIndex = currentStepIndex + 1;
    const completed = currentStepIndex === lesson.steps.length - 1;
    const resumeIndex = Math.max(nextIndex, progress.lastStepIndex);
    const nextProgress = calculateLessonProgress(
      lesson,
      progress.stepAttempts,
      resumeIndex,
      completed,
      progress.masteryStatus
    );
    updateProgress(nextProgress);
    setCurrentStepIndex(nextIndex);
    setFeedbackState('idle');
    setSelectedChoice(null);
    resetQuestionView();
  }, [rawCurrentStep, currentStepIndex, feedbackState, lesson, progress, updateProgress, resetQuestionView, restoreFeedbackForStep]);

  const restartLesson = useCallback(() => {
    if (!lesson) return;
    const freshProgress = initializeProgress(lesson.lessonId, lesson.contentVersion);
    updateProgress(freshProgress);
    setCurrentStepIndex(0);
    setFeedbackState('idle');
    setSelectedChoice(null);
    resetQuestionView();
    // Drop the per-step view memory so a replay does not resurface a revealed
    // answer or solved state from the previous run-through.
    stepViewMemory.current = {};

    const newVariantIndices: Record<string, number> = {};
    for (const step of lesson.steps) {
      if (step.type === 'problem' && (step as ProblemStep).variants?.length) {
        const variants = (step as ProblemStep).variants!;
        newVariantIndices[step.stepId] = Math.floor(Math.random() * variants.length);
      }
    }
    setVariantIndices(newVariantIndices);
  }, [lesson, updateProgress, resetQuestionView]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex <= 0 || !lesson) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    restoreFeedbackForStep(prevIndex);
  }, [currentStepIndex, lesson, restoreFeedbackForStep]);

  const goToNextStep = useCallback(() => {
    if (!lesson || currentStepIndex >= lesson.steps.length - 1) return;

    const nextIndex = currentStepIndex + 1;
    const canReviewForward = progress.completed || nextIndex <= progress.lastStepIndex;

    if (!canReviewForward) {
      advanceStep();
      return;
    }

    setCurrentStepIndex(nextIndex);
    restoreFeedbackForStep(nextIndex);
  }, [advanceStep, currentStepIndex, lesson, progress.completed, progress.lastStepIndex, restoreFeedbackForStep]);

  const canGoToNextStep = Boolean(
    lesson && currentStepIndex < lesson.steps.length - 1 && (progress.completed || currentStepIndex + 1 <= progress.lastStepIndex)
  );

  const runSimulation = useCallback((result: string) => {
    setFeedbackState(result === 'expected' ? 'correct' : 'idle');
  }, []);

  const state = useMemo(
    () => ({
      currentStepIndex,
      currentStep: effectiveStep,
      feedbackState,
      selectedChoice,
      questionView,
      progress,
    }),
    [effectiveStep, currentStepIndex, feedbackState, questionView, progress, selectedChoice]
  );

  return {
    state,
    submitAnswer,
    revealHint,
    revealAnswer,
    advanceStep,
    goToPreviousStep,
    goToNextStep,
    canGoToNextStep,
    restartLesson,
    setSelectedChoice,
    setFeedbackState,
    runSimulation,
  };
}
