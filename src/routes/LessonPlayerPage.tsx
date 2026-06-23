import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { fetchLesson, FetchLessonResult } from '../services/lessonService';
import { useLessonState } from '../hooks/useLessonState';
import { LessonStepRenderer } from '../components/lesson/LessonStepRenderer';
import { ProgressPill } from '../components/lesson/ProgressPill';
import { useAuth } from '../contexts/AuthContext';

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const { user } = useAuth();
  const { state, submitAnswer, advanceStep, goToPreviousStep, restartLesson } = useLessonState(lesson, user?.uid);

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

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
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

  const progressPercent = state.progress.completed
    ? 100
    : Math.round((state.currentStepIndex / Math.max(lesson.steps.length - 1, 1)) * 100);
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

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ letterSpacing: '-0.04em' }}>
          {lesson.title}
        </Typography>
        <Button component={RouterLink} to="/" variant="text" size="small" sx={{ mt: 1, flexShrink: 0 }}>
          Home
        </Button>
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
      />
      {state.progress.completed && (
        <Card variant="outlined" sx={{ mb: 2, borderColor: 'success.main', bgcolor: 'rgba(46,125,50,0.05)' }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, py: '12px !important' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="success.dark">
                {state.progress.masteryStatus === 'mastered' ? 'You\'ve mastered this lesson!' : 'You\'ve completed this lesson!'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Redo it now to practice with fresh questions and different numbers.
              </Typography>
            </Box>
            <Button variant="contained" color="success" onClick={restartLesson}>
              Redo Lesson
            </Button>
          </CardContent>
        </Card>
      )}
      {state.currentStepIndex > 0 && (
        <Box sx={{ mb: 1 }}>
          <Button size="small" variant="text" onClick={goToPreviousStep} sx={{ color: 'text.secondary', pl: 0 }}>
            ← Back
          </Button>
        </Box>
      )}
      <LessonStepRenderer
        step={state.currentStep ?? lesson.steps[state.currentStepIndex] ?? lesson.steps[0]}
        feedbackState={state.feedbackState}
        selectedChoice={state.selectedChoice}
        lessonComplete={state.progress.completed}
        onSubmitAnswer={submitAnswer}
        onAdvance={advanceStep}
      />
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
            gap: 2,
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Lesson progress
            </Typography>
            <Typography variant="h2" component="p" className="numeric" sx={{ lineHeight: 1, fontWeight: 800 }}>
              {progressPercent}%
            </Typography>
          </Box>
          <Box>
            <Chip label={mastery.label} color={mastery.color} sx={{ mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {mastery.detail}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              First-try accuracy:{' '}
              {accuracyPercent === null ? 'answer a question to start tracking' : `${accuracyPercent}% (${firstTryCorrect}/${answeredProblems.length})`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Mastery threshold: complete the lesson with 80% or higher first-try accuracy.
            </Typography>
          </Box>
        </CardContent>
      </Card>
      {state.progress.completed && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" color="success.main">
            Lesson complete! Great work.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
            <Button component={RouterLink} to="/course" variant="contained">
              Return home
            </Button>
            <Button variant="outlined" onClick={restartLesson}>
              Try again
            </Button>
          </Stack>
        </Box>
      )}
    </Container>
  );
}
