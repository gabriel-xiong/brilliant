import { useEffect, useState } from 'react';
import { Container, Typography, Button, Card, CardContent, Stack, CircularProgress, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { fetchAllLessons, FetchAllLessonsResult } from '../services/lessonService';

export default function CoursePathPage() {
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAllLessons()
      .then((result: FetchAllLessonsResult) => {
        setLessons(result.lessons);
        if (result.fallbackUsed && result.reason) {
          setFallbackMessage(result.reason);
        }
      })
      .catch((error) => {
        console.warn('CoursePathPage failed to load lessons:', error);
        setFallbackMessage('Unable to load lessons from Firestore; using local course path.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Course Path
      </Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>
        Track your mastery and pick the next lesson to continue learning.
      </Typography>
      {fallbackMessage && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {fallbackMessage}
        </Alert>
      )}
      <Stack spacing={2}>
        {lessons.map((lesson) => (
          <Card key={lesson.lessonId}>
            <CardContent>
              <Typography variant="h6">{lesson.title}</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {lesson.summary}
              </Typography>
              <Button component={RouterLink} to={`/lesson/${lesson.lessonId}`} variant="contained">
                Start Lesson
              </Button>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
