import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { fetchAllLessons, FetchAllLessonsResult } from '../services/lessonService';
import { useAuth } from '../contexts/AuthContext';
import { loadProgress, loadUserSummary, UserSummary } from '../services/progressService';
import { getMasteryLabel } from '../services/masteryLabels';

export default function CoursePathPage() {
  const [lessons, setLessons] = useState<any[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    fetchAllLessons()
      .then((result: FetchAllLessonsResult) => {
        setLessons(result.lessons);
      })
      .catch((error) => {
        console.warn('CoursePathPage failed to load lessons:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setUserSummary(null);
      return;
    }

    loadUserSummary(user.uid).then(setUserSummary);
  }, [user]);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'start', sm: 'center' }} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Course Path
          </Typography>
          <Typography variant="body1">
            Track your mastery and pick the next lesson to continue learning.
          </Typography>
        </Box>
        <Button component={RouterLink} to="/profile" variant="outlined" size="small">
          Profile
        </Button>
      </Stack>
      <Stack spacing={2}>
        {lessons.map((lesson) => (
          <Card key={lesson.lessonId} variant="outlined">
            <CardContent>
              {(() => {
                const status =
                  userSummary?.masterySummary?.[lesson.lessonId]?.status ??
                  loadProgress(lesson.lessonId, user?.uid)?.masteryStatus ??
                  'not-started';
                const statusValue = String(status);

                return (
                  <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">{lesson.title}</Typography>
                <Chip
                  label={getMasteryLabel(status)}
                  color={statusValue === 'mastered' ? 'success' : statusValue === 'not-started' ? 'default' : statusValue === 'completed' || statusValue === 'practice-ready' ? 'warning' : 'primary'}
                  size="small"
                />
              </Stack>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {lesson.summary}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Goal: complete the lesson, then master it with 80%+ first-try accuracy.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Mastery threshold: 80%+ first-try accuracy after completing the lesson.
              </Typography>
              <Button component={RouterLink} to={`/lesson/${lesson.lessonId}`} variant="contained">
                {(statusValue === 'mastered' || statusValue === 'completed')
                  ? 'Redo Lesson'
                  : (statusValue === 'in-progress' || statusValue === 'almost-done')
                  ? 'Continue'
                  : 'Start Lesson'}
              </Button>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
