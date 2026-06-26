import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Snackbar, Stack, Typography } from '@mui/material';
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
import { CONCEPT_LABELS } from '../services/ai/conceptSchemas';
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
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const {
    state,
    submitAnswer,
    revealHint,
    revealAnswer,
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
    if (!lesson || progressLessonId !== lesson.lessonId) return;
    if (completionBaseline.current.lessonId !== lesson.lessonId) {
      completionBaseline.current = { lessonId: lesson.lessonId, completed };
      return;
    }
    if (!completionBaseline.current.completed && completed) {
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
      detail: 'You finished the lesson but scored below 80% first-try. Redo it to reach mastery.',
      color: 'warning',
    },
    mastered: {
      label: 'Mastered',
      detail: 'Lesson complete with at least 80% first-try accuracy.',
      color: 'success',
    },
  };
  const mastery = masteryCopy[state.progress.masteryStatus] ?? masteryCopy['not-started'];

  const hasNextStep = state.currentStepIndex < lesson.steps.length - 1;
  // Review mode: a finished lesson, or revisiting a step already passed. In
  // review the in-card Next/Continue should advance freely without re-answering.
  const reviewMode = state.progress.completed || state.currentStepIndex < state.progress.lastStepIndex;

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
                {state.progress.masteryStatus === 'mastered' ? 'You\'ve mastered this lesson!' : 'You\'ve completed this lesson!'}
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
          onRevealHint={revealHint}
          onRevealAnswer={revealAnswer}
        />
      </motion.div>
      {state.progress.completed && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" color="success.main">
            Lesson complete! Great work.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
            {nextLesson && (
              <Button component={RouterLink} to={`/lesson/${nextLesson.lessonId}`} variant="contained">
                Continue to next lesson
              </Button>
            )}
            {practiceConceptId && (
              <Button component={RouterLink} to={practiceLink} variant={nextLesson ? 'outlined' : 'contained'} color="secondary">
                Practice this concept
              </Button>
            )}
            <Button component={RouterLink} to="/course" variant="outlined">
              Return home
            </Button>
            <Button variant="outlined" onClick={restartLesson}>
              Try again
            </Button>
          </Stack>
        </Box>
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
