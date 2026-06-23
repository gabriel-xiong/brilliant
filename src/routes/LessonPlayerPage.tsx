import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box, CircularProgress, Button, Alert } from '@mui/material';
import { fetchLesson, FetchLessonResult } from '../services/lessonService';
import { useLessonState } from '../hooks/useLessonState';
import { LessonStepRenderer } from '../components/lesson/LessonStepRenderer';
import { useAuth } from '../contexts/AuthContext';

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const { user } = useAuth();
  const { state, submitAnswer, advanceStep } = useLessonState(lesson, user?.uid);

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

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {lesson.title}
      </Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>
        {lesson.summary}
      </Typography>
      {fallbackMessage && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {fallbackMessage}
        </Alert>
      )}
      <Box sx={{ mb: 3 }}>
        <Typography>Step {state.currentStepIndex + 1} of {lesson.steps.length}</Typography>
      </Box>
      <LessonStepRenderer
        step={state.currentStep ?? lesson.steps[state.currentStepIndex] ?? lesson.steps[0]}
        feedbackState={state.feedbackState}
        selectedChoice={state.selectedChoice}
        onSubmitAnswer={submitAnswer}
        onAdvance={advanceStep}
      />
      <Box sx={{ mt: 3 }}>
        <Typography variant="body2">Progress score: {state.progress.score}</Typography>
        <Typography variant="body2">Last updated: {new Date(state.progress.updatedAt).toLocaleString()}</Typography>
      </Box>
      {state.progress.completed && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" color="success.main">
            Lesson complete! Great work.
          </Typography>
          <Button variant="contained" sx={{ mt: 1 }} onClick={() => window.location.reload()}>
            Restart lesson
          </Button>
        </Box>
      )}
    </Container>
  );
}
