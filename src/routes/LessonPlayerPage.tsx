import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { fetchAllLessons, fetchLesson, FetchLessonResult } from '../services/lessonService';
import { Lesson } from '../models/lesson';
import { useLessonState } from '../hooks/useLessonState';
import { LessonStepRenderer } from '../components/lesson/LessonStepRenderer';
import { ProgressPill } from '../components/lesson/ProgressPill';
import { useAuth } from '../contexts/AuthContext';
import { loadUserSummary } from '../services/progressService';
import { computeLessonStates, getEffectiveStatus } from '../services/lessonProgression';
import { getNextLessonId } from '../services/courseGraph';
import { CONCEPT_LABELS, conceptsForLessonId } from '../services/ai/conceptSchemas';
import { aiLessonRecap } from '../services/ai/aiService';
import { newlyUnlockedConceptForLesson } from '../services/practiceAccess';
import { playLessonComplete } from '../services/soundService';
import SoundToggle from '../components/SoundToggle';

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [searchParams] = useSearchParams();
  const requestedStepIndex = useMemo(() => {
    const raw = searchParams.get('step');
    if (raw === null) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }, [searchParams]);
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [gate, setGate] = useState<{ checked: boolean; locked: boolean; prerequisite?: Lesson }>({
    checked: false,
    locked: false,
  });
  const [nextLesson, setNextLesson] = useState<{ lessonId: string; title: string } | null>(null);
  const [practiceUnlockOpen, setPracticeUnlockOpen] = useState(false);
  const [completionRecapDismissed, setCompletionRecapDismissed] = useState(true);
  const [completionRecapRefreshKey, setCompletionRecapRefreshKey] = useState(0);
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const {
    state,
    submitAnswer,
    revealAnswer,
    markStrongestHintUsed,
    advanceStep,
    goToPreviousStep,
    goToNextStep,
    canGoToNextStep,
    restartLesson,
  } = useLessonState(lesson, user?.uid, { requestedStepIndex });

  useEffect(() => {
    if (!lessonId) return;
    fetchLesson(lessonId)
      .then((result: FetchLessonResult) => {
        setLesson(result.lesson);
        if (result.fallbackUsed && result.reason) {
          setFallbackMessage(result.reason);
        }
      })
      .catch((error) => {
        console.warn('LessonPlayerPage failed to load lesson:', error);
        setFallbackMessage('Unable to load the lesson from Firestore; using local lesson data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [lessonId]);

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    async function resolveGate() {
      try {
        const [{ lessons }, summary] = await Promise.all([
          fetchAllLessons(),
          user ? loadUserSummary(user.uid) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const states = computeLessonStates(lessons, (id) => getEffectiveStatus(id, summary, user?.uid));
        const current = states.find((entry) => entry.lesson.lessonId === lessonId);
        setGate({
          checked: true,
          locked: current ? !current.unlocked : false,
          prerequisite: current?.prerequisite,
        });

        // Determine the NEXT SEQUENTIAL lesson by course-graph order (the lesson
        // directly after this one on the trail). This is intentionally distinct
        // from resolveContinueDestination — the end-of-lesson button always moves
        // the learner forward along the path rather than to the recommended
        // "resume" node. Only surface it when the target lesson is actually loaded.
        const nextId = lessonId ? getNextLessonId(lessonId) : null;
        const nextEntry = nextId ? lessons.find((entry) => entry.lessonId === nextId) : undefined;
        // Last lesson (or next lesson missing from the loaded set): omit the
        // button. The "Return home" → /course CTA already provides the exit.
        setNextLesson(nextEntry ? { lessonId: nextEntry.lessonId, title: nextEntry.title } : null);
      } catch (error) {
        console.warn('LessonPlayerPage failed to evaluate prerequisites:', error);
        if (!cancelled) setGate({ checked: true, locked: false });
      }
    }

    setGate({ checked: false, locked: false });
    setNextLesson(null);
    resolveGate();
    return () => {
      cancelled = true;
    };
  }, [lessonId, user?.uid]);

  // Fire the "practice unlocked" toast exactly once, on the false→true
  // completion transition within this session. A baseline is captured the first
  // time real progress for THIS lesson is observed, so opening an
  // already-completed lesson (review) never re-triggers it, and the async
  // progress load (which starts from a pending not-completed state) cannot spoof
  // a transition.
  const completed = state.progress.completed;
  const progressLessonId = state.progress.lessonId;
  const completionBaseline = useRef<{ lessonId: string | null; completed: boolean }>({
    lessonId: null,
    completed: false,
  });
  useEffect(() => {
    setCompletionRecapDismissed(true);
    setCompletionRecapRefreshKey((key) => key + 1);
  }, [lessonId]);
  useEffect(() => {
    if (!completed) setCompletionRecapDismissed(true);
  }, [completed]);
  useEffect(() => {
    if (!lesson || progressLessonId !== lesson.lessonId) return;
    if (completionBaseline.current.lessonId !== lesson.lessonId) {
      completionBaseline.current = { lessonId: lesson.lessonId, completed };
      return;
    }
    if (!completionBaseline.current.completed && completed) {
      setCompletionRecapDismissed(false);
      setCompletionRecapRefreshKey((key) => key + 1);
      setPracticeUnlockOpen(true);
      // Celebrate the completion once, on this false→true transition. The same
      // baseline guard that keeps the toast from re-firing on re-render or when
      // reopening an already-finished lesson also keeps the chime to one play.
      playLessonComplete();
    }
    completionBaseline.current.completed = completed;
  }, [lesson, progressLessonId, completed]);

  const practiceConceptId = lesson ? (newlyUnlockedConceptForLesson(lesson.lessonId) ?? undefined) : undefined;
  const practiceConceptLabel = practiceConceptId ? CONCEPT_LABELS[practiceConceptId] : undefined;
  const practiceLink = practiceConceptId ? `/practice?concept=${practiceConceptId}` : '/practice';

  if (loading || !gate.checked) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (gate.locked) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
          <CardContent>
            <Typography sx={{ fontSize: 48, lineHeight: 1, mb: 1 }} aria-hidden>
              🔒
            </Typography>
            <Typography variant="h5" gutterBottom>
              This lesson is locked
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {gate.prerequisite
                ? `Complete "${gate.prerequisite.title}" first to unlock this stop on the path.`
                : 'Finish the earlier lessons on the path to unlock this one.'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
              {gate.prerequisite && (
                <Button component={RouterLink} to={`/lesson/${gate.prerequisite.lessonId}`} variant="contained">
                  Go to {gate.prerequisite.title}
                </Button>
              )}
              <Button component={RouterLink} to="/course" variant="outlined">
                Back to the map
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!lesson) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <Typography variant="h5">Lesson not found.</Typography>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Please make sure your Firestore database is created and the lesson exists.
        </Typography>
      </Container>
    );
  }

  const problemSteps = lesson.steps.filter((step: any) => step.type === 'problem');
  const answeredProblems = problemSteps.filter((step: any) => state.progress.stepAttempts[step.stepId]?.attempts > 0);
  const firstTryCorrect = answeredProblems.filter((step: any) => state.progress.stepAttempts[step.stepId]?.correctFirstAttempt).length;
  const accuracyPercent = answeredProblems.length > 0 ? Math.round((firstTryCorrect / answeredProblems.length) * 100) : null;
  const masteryCopy: Record<string, { label: string; detail: string; color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' }> = {
    'not-started': {
      label: 'Not started',
      detail: 'Begin the lesson to build your probability intuition.',
      color: 'default',
    },
    'in-progress': {
      label: 'In progress',
      detail: 'Keep going. Mastery is checked after you finish the lesson.',
      color: 'secondary',
    },
    'almost-done': {
      label: 'Almost done',
      detail: 'You are near the end. Finish the lesson to see whether it is mastered.',
      color: 'warning',
    },
    completed: {
      label: 'Needs practice',
      detail: 'Lesson complete, below 80% first-try accuracy. Practice can help this click.',
      color: 'warning',
    },
    proficient: {
      label: 'Proficient',
      detail: 'Lesson complete with at least 80% first-try accuracy. Keep practicing to master it.',
      color: 'success',
    },
    mastered: {
      label: 'Mastered',
      detail: 'Lesson complete with at least 90% first-try accuracy.',
      color: 'success',
    },
  };
  const mastery = masteryCopy[state.progress.masteryStatus] ?? masteryCopy['not-started'];

  const hasNextStep = state.currentStepIndex < lesson.steps.length - 1;
  // Review mode: a finished lesson, or revisiting a step already passed. In
  // review the in-card Next/Continue should advance freely without re-answering.
  const reviewMode = state.progress.completed || state.currentStepIndex < state.progress.lastStepIndex;
  const completionRecapOpen = state.progress.completed && !completionRecapDismissed;
  const missedInsights = problemSteps
    .filter((step: any) => {
      const attempt = state.progress.stepAttempts[step.stepId];
      return attempt && (!attempt.correctFirstAttempt || attempt.lastResult !== 'correct');
    })
    .slice(0, 3)
    .map((step: any) => conceptualMissedInsight(step, lesson.lessonId));

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ letterSpacing: '-0.04em' }}>
          {lesson.title}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1, flexShrink: 0 }}>
          <Button component={RouterLink} to="/course" variant="text" size="small">
            Course map
          </Button>
          <SoundToggle />
        </Stack>
      </Box>
      <Typography variant="body1" component="p" sx={{ mb: 3, color: 'text.secondary', fontWeight: 400, fontSize: '1.15rem' }}>
        {lesson.summary}
      </Typography>
      {fallbackMessage && fallbackMessage.toLowerCase().includes('unable') && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {fallbackMessage}
        </Alert>
      )}
      <ProgressPill
        current={state.currentStepIndex + 1}
        total={lesson.steps.length}
        completed={state.progress.completed}
        masteryLabel={mastery.label}
        masteryColor={mastery.color}
        masteryDetail={mastery.detail}
        accuracyPercent={accuracyPercent}
        firstTryCorrect={firstTryCorrect}
        answeredCount={answeredProblems.length}
      />
      {state.progress.completed && (
        <Card variant="outlined" sx={{ mb: 2, borderColor: 'success.main', bgcolor: 'rgba(46,125,50,0.05)' }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, py: '12px !important' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="success.dark">
                {state.progress.masteryStatus === 'mastered'
                  ? 'You\'ve mastered this lesson!'
                  : state.progress.masteryStatus === 'proficient'
                    ? 'You\'re proficient in this lesson!'
                    : 'You\'ve completed this lesson!'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Review it again to reinforce the same ideas. Some checks may use different numbers to ensure full understanding.
              </Typography>
            </Box>
            <Button variant="contained" color="success" onClick={restartLesson}>
              Review Lesson
            </Button>
          </CardContent>
        </Card>
      )}
      {(state.currentStepIndex > 0 || canGoToNextStep) && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          {state.currentStepIndex > 0 && (
            <Button size="small" variant="text" onClick={goToPreviousStep} sx={{ color: 'text.secondary', pl: 0 }}>
              ← Back
            </Button>
          )}
          {canGoToNextStep && (
            <Button size="small" variant="text" onClick={goToNextStep} sx={{ color: 'text.secondary' }}>
              Forward →
            </Button>
          )}
        </Stack>
      )}
      {/* A keyed motion.div (no AnimatePresence/exit) so each step fades in while
          the previous one unmounts immediately. An exit animation here deadlocked
          against the shared-layout (`layoutId`) animations inside interactive steps
          like the sort question: AnimatePresence would wait for the old step's
          `layoutId` elements to resolve against the next step, but never finished
          exiting it — leaving the following multi-stage step stuck unmounted (a
          blank card). Unmounting the old step synchronously avoids that stall. */}
      <motion.div
        key={state.currentStepIndex}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <LessonStepRenderer
          step={state.currentStep ?? lesson.steps[state.currentStepIndex] ?? lesson.steps[0]}
          feedbackState={state.feedbackState}
          selectedChoice={state.selectedChoice}
          questionView={state.questionView}
          lessonComplete={state.progress.completed}
          reviewMode={reviewMode}
          hasNextStep={hasNextStep}
          onSubmitAnswer={submitAnswer}
          onAdvance={advanceStep}
          onRevealAnswer={revealAnswer}
          onStrongestHintUsed={markStrongestHintUsed}
        />
      </motion.div>
      {state.progress.completed && (
        <>
          <LessonCompletionDialog
            open={completionRecapOpen}
            lesson={lesson}
            masteryLabel={mastery.label}
            masteryDetail={mastery.detail}
            accuracyPercent={accuracyPercent}
            firstTryCorrect={firstTryCorrect}
            answeredCount={answeredProblems.length}
            missedInsights={missedInsights}
            refreshKey={completionRecapRefreshKey}
            onContinue={() => setCompletionRecapDismissed(true)}
          />
          <CompletionActionCard
            recapDismissed={completionRecapDismissed}
            nextLesson={nextLesson}
            practiceLink={practiceLink}
            practiceConceptLabel={practiceConceptLabel}
            hasPractice={Boolean(practiceConceptId)}
            onReviewRecap={() => {
              setCompletionRecapDismissed(false);
            }}
            onRestartLesson={restartLesson}
          />
        </>
      )}

      <Snackbar
        open={practiceUnlockOpen}
        autoHideDuration={9000}
        onClose={() => setPracticeUnlockOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setPracticeUnlockOpen(false)}
          sx={{ alignItems: 'center', boxShadow: '0 12px 30px rgba(31,157,116,0.35)' }}
          action={
            <Button
              component={RouterLink}
              to={practiceLink}
              size="small"
              color="inherit"
              sx={{ fontWeight: 800 }}
              onClick={() => setPracticeUnlockOpen(false)}
            >
              Practice now
            </Button>
          }
        >
          Nice work! Practice for {practiceConceptLabel ?? 'this concept'} is unlocked.
        </Alert>
      </Snackbar>
    </Container>
  );
}

const BOLD_PATTERN = /(\*\*[^*]+\*\*)/g;

type MissedInsight = {
  title: string;
  detail: string;
};

function renderRecapLine(text: string) {
  return text.split(BOLD_PATTERN).map((part, index) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (match) return <strong key={index}>{match[1]}</strong>;
    return <span key={index}>{part}</span>;
  });
}

function stepSignalText(step: any): string {
  return [
    step.title,
    step.description,
    step.question,
    step.incorrectFeedback,
    step.explanation,
    ...(step.stages ?? []).flatMap((stage: any) => [stage.prompt, stage.incorrectFeedback, stage.explanation]),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\*\*/g, '')
    .toLowerCase();
}

function conceptualMissedInsight(step: any, lessonId: string): MissedInsight {
  const signal = stepSignalText(step);

  if (signal.includes('given') || signal.includes('condition') || signal.includes('cloudy')) {
    return {
      title: 'Rebuild the group',
      detail: 'New information narrows the group. Rebuild the denominator from the cases that remain.',
    };
  }

  if (signal.includes('formula') || signal.includes('|')) {
    return {
      title: 'Name the denominator first',
      detail: 'Before using the formula, decide what the “given” information keeps. Then divide inside that group.',
    };
  }

  if (signal.includes('overlap') || signal.includes('double-count') || signal.includes(' or ')) {
    return {
      title: 'Watch shared outcomes',
      detail: 'If an outcome fits both labels, addition counts it twice. Subtract shared cases once.',
    };
  }

  if (signal.includes(' and ') || signal.includes('pairs') || signal.includes('both')) {
    return {
      title: 'Require both parts',
      detail: 'An AND result wins only when every condition is true. Count only pairs that satisfy both.',
    };
  }

  if (signal.includes('not ') || signal.includes('opposite') || signal.includes('complement')) {
    return {
      title: 'Count what is left out',
      detail: 'A “not” event flips the question. Start with all outcomes, remove the event, use what remains.',
    };
  }

  if (signal.includes('expected') || signal.includes('about how many') || signal.includes('long-run')) {
    return {
      title: 'Turn chance into count',
      detail: 'Find the probability first, then scale it by the number of trials.',
    };
  }

  if (lessonId === 'counting-outcomes' || signal.includes('successful outcomes') || signal.includes('favorable')) {
    return {
      title: 'Define the win first',
      detail: 'Decide exactly which outcomes count as wins. Then put that count over the total.',
    };
  }

  if (step.format === 'sort' || step.format === 'order') {
    return {
      title: 'Use the rule, not the wording',
      detail: 'Similar labels can blur together. Apply the rule to one item at a time.',
    };
  }

  if (step.format === 'slider') {
    return {
      title: 'Match the live readout',
      detail: 'Use the visual readout to match the count with the target probability.',
    };
  }

  return {
    title: 'Set up before solving',
    detail: 'State the event, count the wins, then calculate the probability.',
  };
}

function shortConceptLabel(conceptId: string): string {
  const shortLabels: Record<string, string> = {
    'single-event': 'Count wins',
    complement: 'Not events',
    'and-multiply': 'AND',
    'or-inclusion-exclusion': 'OR overlap',
    conditional: 'Given',
    'expected-value': 'Long-run average',
    bayes: 'Update beliefs',
  };
  return shortLabels[conceptId] ?? CONCEPT_LABELS[conceptId as keyof typeof CONCEPT_LABELS] ?? conceptId;
}

function recapTakeaways(recap: string) {
  return recap
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^[-•]\s*/, '')
        .replace(/\s*Your current standing:\s*[^.]+\.?/i, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => {
      const [rawTitle, ...rest] = line.split(':');
      const hasTitle = rest.length > 0 && rawTitle.length < 42;
      const detail = hasTitle ? rest.join(':').trim() : line;
      return {
        title: hasTitle ? rawTitle : 'Lesson takeaway',
        detail: detail.length > 150 ? `${detail.slice(0, 147).trim()}...` : detail,
      };
    });
}

function CompletionActionCard({
  recapDismissed,
  nextLesson,
  practiceLink,
  practiceConceptLabel,
  hasPractice,
  onReviewRecap,
  onRestartLesson,
}: {
  recapDismissed: boolean;
  nextLesson: { lessonId: string; title: string } | null;
  practiceLink: string;
  practiceConceptLabel?: string;
  hasPractice: boolean;
  onReviewRecap: () => void;
  onRestartLesson: () => void;
}) {
  const primaryAction = nextLesson
    ? { label: 'Continue to next lesson', to: `/lesson/${nextLesson.lessonId}` }
    : hasPractice
      ? { label: 'Practice this concept', to: practiceLink }
      : { label: 'Return to course', to: '/course' };

  return (
    <Box
      sx={{
        mt: { xs: 3, md: 4 },
        p: { xs: 2.25, md: 3 },
        borderRadius: 4,
        border: '1px solid rgba(46,125,50,0.16)',
        bgcolor: 'rgba(248,253,250,0.92)',
        boxShadow: '0 14px 45px rgba(20, 70, 60, 0.08)',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
        <Box sx={{ maxWidth: 600 }}>
          <Typography variant="overline" sx={{ color: 'success.dark', fontWeight: 900, letterSpacing: 1 }}>
            Lesson complete
          </Typography>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 850, letterSpacing: '-0.025em' }}>
            {recapDismissed ? 'Ready for what comes next?' : 'Start with your recap.'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 540 }}>
            {recapDismissed
              ? nextLesson
                ? `Move on to ${nextLesson.title}, or spend a little time strengthening this concept first.`
                : 'You can practice this idea, revisit the lesson, or head back to the course map.'
              : 'The recap highlights your mastery status and the ideas worth revisiting.'}
          </Typography>
        </Box>

        {recapDismissed ? (
          <Stack spacing={1.25} alignItems={{ xs: 'stretch', md: 'flex-end' }} sx={{ minWidth: { md: 290 } }}>
            <Button component={RouterLink} to={primaryAction.to} variant="contained" size="large" sx={{ fontWeight: 850 }}>
              {primaryAction.label}
            </Button>
            {nextLesson && hasPractice && (
              <Button component={RouterLink} to={practiceLink} variant="outlined" color="secondary" sx={{ fontWeight: 750 }}>
                Practice {practiceConceptLabel ? practiceConceptLabel.replace(/\s*\([^)]*\)/g, '') : 'this concept'}
              </Button>
            )}
            <Stack direction="row" spacing={1.5} justifyContent={{ xs: 'center', md: 'flex-end' }}>
              <Button component={RouterLink} to="/course" variant="text" size="small" sx={{ color: 'text.secondary', fontWeight: 750 }}>
                Course map
              </Button>
              <Button variant="text" size="small" onClick={onRestartLesson} sx={{ color: 'text.secondary', fontWeight: 750 }}>
                Try again
              </Button>
              <Button variant="text" size="small" onClick={onReviewRecap} sx={{ color: 'text.secondary', fontWeight: 750 }}>
                Recap
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Button variant="contained" color="success" size="large" onClick={onReviewRecap} sx={{ fontWeight: 850 }}>
            View recap
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function LessonCompletionDialog({
  open,
  lesson,
  masteryLabel,
  masteryDetail,
  accuracyPercent,
  firstTryCorrect,
  answeredCount,
  missedInsights,
  refreshKey,
  onContinue,
}: {
  open: boolean;
  lesson: Lesson;
  masteryLabel: string;
  masteryDetail: string;
  accuracyPercent: number | null;
  firstTryCorrect: number;
  answeredCount: number;
  missedInsights: MissedInsight[];
  refreshKey: number;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [recap, setRecap] = useState('');
  const [usedAI, setUsedAI] = useState(false);
  const conceptIds = useMemo(() => conceptsForLessonId(lesson.lessonId), [lesson.lessonId]);
  const conceptLabels = conceptIds.map((conceptId) => shortConceptLabel(conceptId)).filter(Boolean);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRecap('');
    setUsedAI(false);
    aiLessonRecap({
      lessonId: lesson.lessonId,
      conceptIds,
      masteryLabel,
    })
      .then((result) => {
        if (cancelled) return;
        setRecap(result.recap);
        setUsedAI(result.usedAI);
      })
      .catch(() => {
        if (cancelled) return;
        setRecap(
          `${lesson.title} is complete. You practiced the main idea, checked your thinking, and now have a clear next step: ${
            masteryLabel === 'Needs practice' ? 'spend a few minutes practicing it before moving on.' : 'keep building on it in the next lesson.'
          }`,
        );
        setUsedAI(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.lessonId, conceptIds, masteryLabel, refreshKey]);

  const takeaways = recapTakeaways(recap);
  const masteryTone = masteryLabel === 'Needs practice' ? 'warning' : 'success';
  const masterySummary =
    accuracyPercent === null
      ? 'Status is based on completing the lesson and first-try accuracy.'
      : `${firstTryCorrect} of ${answeredCount} checks correct on the first try (${accuracyPercent}%).`;
  const revisitCopy =
    missedInsights.length > 0
      ? 'Focus here if anything still feels fuzzy.'
      : masteryLabel !== 'Needs practice'
        ? 'No major misses recorded. Keep the count-then-divide habit.'
        : 'No specific miss was recorded, but this idea needs another pass.';

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown
      aria-labelledby="lesson-completion-title"
      aria-describedby="lesson-completion-recap"
      PaperProps={{
        sx: {
          borderRadius: { xs: 3, md: 5 },
          overflow: 'hidden',
          backgroundImage: 'linear-gradient(145deg, rgba(240,249,246,0.98) 0%, rgba(255,251,244,0.98) 58%, rgba(255,255,255,1) 100%)',
          boxShadow: '0 28px 90px rgba(18, 48, 43, 0.28)',
        },
      }}
    >
      <DialogTitle id="lesson-completion-title" sx={{ px: { xs: 2.5, sm: 4, md: 5 }, pt: { xs: 3, md: 4 }, pb: 0 }}>
        <Stack spacing={1.25} alignItems="flex-start">
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Chip
              label="Lesson complete"
              color="success"
              size="small"
              sx={{
                fontWeight: 850,
                bgcolor: 'rgba(46,125,50,0.12)',
                color: 'success.dark',
              }}
            />
            {usedAI && (
              <Chip
                label="AI recap"
                size="small"
                sx={{
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  bgcolor: 'rgba(195,95,44,0.14)',
                  color: 'secondary.main',
                }}
              />
            )}
          </Stack>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 900, letterSpacing: 1.2 }}>
            You finished
          </Typography>
          <Typography
            variant="h3"
            component="p"
            sx={{
              maxWidth: 680,
              fontWeight: 900,
              letterSpacing: '-0.045em',
              lineHeight: 1.02,
              color: 'text.primary',
            }}
          >
            {lesson.title}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2.5, sm: 4, md: 5 }, pt: { xs: 2, md: 2.5 }, pb: 0 }}>
        <Stack spacing={2}>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, lineHeight: 1.5 }}>
            What stuck, what took work, and what to do next.
          </Typography>
          <Box
            sx={{
              p: { xs: 1.75, md: 2 },
              borderRadius: 3.5,
              border: '1px solid rgba(46,125,50,0.18)',
              bgcolor: masteryTone === 'success' ? 'rgba(46,125,50,0.08)' : 'rgba(237,108,2,0.08)',
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Box>
                <Typography variant="overline" sx={{ color: masteryTone === 'success' ? 'success.dark' : 'warning.dark', fontWeight: 900, letterSpacing: 1 }}>
                  Mastery status
                </Typography>
                <Typography variant="h5" component="p" sx={{ fontWeight: 850, letterSpacing: '-0.025em' }}>
                  {masteryLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 520 }}>
                  {masteryDetail}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                <Typography variant="h4" component="p" sx={{ fontWeight: 900, color: masteryTone === 'success' ? 'success.dark' : 'warning.dark' }}>
                  {accuracyPercent ?? '--'}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>
                  first-try accuracy
                </Typography>
              </Box>
            </Stack>
            <Typography variant="body2" sx={{ mt: 1.25, color: 'text.primary', fontWeight: 700 }}>
              {masterySummary}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" aria-label="Concepts practiced">
            {conceptLabels.map((label) => (
              <Chip key={label} label={label} size="small" variant="outlined" sx={{ bgcolor: 'rgba(255,255,255,0.78)', fontWeight: 800 }} />
            ))}
          </Stack>
          <Box
            id="lesson-completion-recap"
            aria-live="polite"
            sx={{
              p: { xs: 1.75, md: 2.25 },
              borderRadius: 3,
              border: '1px solid rgba(15,111,104,0.18)',
              bgcolor: 'rgba(255,255,255,0.78)',
              boxShadow: '0 14px 45px rgba(28, 85, 75, 0.08)',
            }}
          >
            {loading ? (
              <Stack direction="row" spacing={1.25} alignItems="center">
                <CircularProgress size={18} thickness={5} sx={{ color: 'primary.main' }} />
                <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Preparing your recap...
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Typography variant="overline" sx={{ color: 'primary.dark', fontWeight: 900, letterSpacing: 1 }}>
                  Recap
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                  {takeaways.map((item, index) => (
                    <Box
                      key={`${item.title}-${index}`}
                      sx={{
                        p: 1.5,
                        borderRadius: 2.5,
                        bgcolor: index === 0 ? 'rgba(15,111,104,0.08)' : 'rgba(255,255,255,0.72)',
                        border: '1px solid rgba(15,111,104,0.12)',
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 850, color: 'primary.dark', mb: 0.5 }}>
                        {item.title}
                      </Typography>
                      <Typography variant="body2" sx={{ lineHeight: 1.45, color: 'text.primary' }}>
                        {renderRecapLine(item.detail)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ pt: 0.5 }}>
                  <Typography variant="overline" sx={{ color: missedInsights.length ? 'warning.dark' : 'success.dark', fontWeight: 900, letterSpacing: 1 }}>
                    What to revisit
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1, maxWidth: 620 }}>
                    {revisitCopy}
                  </Typography>
                  {missedInsights.length > 0 && (
                    <Stack spacing={1}>
                      {missedInsights.map((item) => (
                        <Box
                          key={item.title}
                          sx={{
                            p: 1.25,
                            borderRadius: 2.5,
                            bgcolor: 'rgba(255,247,237,0.82)',
                            border: '1px solid rgba(237,108,2,0.18)',
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 850, color: 'warning.dark' }}>
                            {item.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.45 }}>
                            {item.detail}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{
          px: { xs: 2.5, sm: 4, md: 5 },
          py: { xs: 2.25, md: 3 },
          justifyContent: 'space-between',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          Continue when you are ready.
        </Typography>
        <Button variant="contained" color="success" size="large" onClick={onContinue} sx={{ px: 3, fontWeight: 800 }}>
          Keep going
        </Button>
      </DialogActions>
    </Dialog>
  );
}
