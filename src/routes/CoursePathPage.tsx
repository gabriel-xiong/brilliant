import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import { fetchAllLessons, FetchAllLessonsResult } from '../services/lessonService';
import { Lesson } from '../models/lesson';
import { useAuth } from '../contexts/AuthContext';
import { loadUserSummary, UserSummary } from '../services/progressService';
import { computeLessonStates, getEffectiveStatus } from '../services/lessonProgression';
import CourseMap from '../components/course/CourseMap';

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 14, height: 14, borderRadius: '50%', background: color, border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Stack>
  );
}

function TrophyIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h10v3a5 5 0 0 1-10 0V4z"
        fill="#ffd86b"
        stroke="#7a4a00"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10" stroke="#7a4a00" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M10 11.5h4M12 11.5V15M9 19.5h6M10.5 15h3l.7 4.5h-4.4L10.5 15z" stroke="#7a4a00" strokeWidth="1.4" fill="#fff3d6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function CompletionBanner({ allMastered }: { allMastered: boolean }) {
  const reduceMotion = useReducedMotion();
  const headline = allMastered ? 'Probability, mastered!' : 'Course complete!';
  const subtext = allMastered
    ? 'Outstanding work — you finished every lesson in Introduction to Probability at the mastery threshold. You can predict, count, and reason about uncertain events with confidence.'
    : 'Congratulations on finishing Introduction to Probability! You worked all the way through the path and built a real intuition for chance.';

  return (
    <Box
      component={motion.section}
      aria-labelledby="course-complete-heading"
      initial={reduceMotion ? false : { opacity: 0, y: -14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        mb: 2,
        p: { xs: 2.5, sm: 3 },
        borderRadius: 4,
        color: '#3a2a08',
        background: 'linear-gradient(135deg, #fff3d6 0%, #ffe3b0 38%, #d9f0e4 100%)',
        border: '1px solid rgba(245,166,35,0.45)',
        boxShadow: '0 18px 45px rgba(245,166,35,0.22), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Box
        aria-hidden
        component={motion.div}
        animate={reduceMotion ? undefined : { opacity: [0.5, 0.85, 0.5], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        sx={{
          position: 'absolute',
          top: -60,
          right: -40,
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,216,107,0.55) 0%, rgba(255,216,107,0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 2, sm: 2.5 }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ position: 'relative' }}
      >
        <Stack direction="row" spacing={1.75} alignItems="center">
          <Box
            sx={{
              flexShrink: 0,
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(160deg, #ffd86b 0%, #f5a623 100%)',
              boxShadow: '0 8px 18px rgba(245,166,35,0.4), inset 0 2px 4px rgba(255,255,255,0.5)',
              border: '3px solid rgba(255,255,255,0.85)',
            }}
          >
            <TrophyIcon />
          </Box>
          <Box>
            <Chip
              label={allMastered ? 'All lessons mastered' : 'All lessons complete'}
              size="small"
              color="success"
              sx={{ fontWeight: 700, mb: 0.75 }}
            />
            <Typography id="course-complete-heading" component="h2" variant="h5" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
              {headline}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 560, color: 'rgba(58,42,8,0.82)' }}>
              {subtext}
            </Typography>
          </Box>
        </Stack>
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ flexShrink: 0, flexWrap: 'wrap', gap: 1 }}
        >
          <Button component={RouterLink} to="/" variant="contained" color="warning" sx={{ fontWeight: 700 }}>
            Back to Home
          </Button>
          <Button component={RouterLink} to="/profile" variant="outlined" color="inherit" sx={{ fontWeight: 700, borderColor: 'rgba(58,42,8,0.35)' }}>
            View Profile
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function CoursePathPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
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

  const states = useMemo(
    () => computeLessonStates(lessons, (lessonId) => getEffectiveStatus(lessonId, userSummary, user?.uid)),
    [lessons, userSummary, user?.uid]
  );

  const masteredCount = states.filter((state) => state.status === 'mastered').length;
  const completedCount = states.filter((state) => state.completed).length;
  const currentState = states.find((state) => state.isCurrent);
  const allCompleted = states.length > 0 && completedCount === states.length;
  const allMastered = states.length > 0 && masteredCount === states.length;

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 3 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Introduction to Probability
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Build an intuition for chance and learn to predict, count, and reason about uncertain events.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to="/" variant="text" size="small">
            Home
          </Button>
          <Button component={RouterLink} to="/profile" variant="outlined" size="small">
            Profile
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Chip
          label={`${masteredCount} mastered`}
          color={masteredCount > 0 ? 'success' : 'default'}
          size="small"
          sx={{ fontWeight: 700 }}
        />
        <Chip label={`${completedCount} of ${states.length} lessons cleared`} size="small" variant="outlined" />
        {currentState && (
          <Typography variant="body2" color="text.secondary">
            Up next: <strong>{currentState.lesson.title}</strong>
          </Typography>
        )}
      </Stack>

      {allCompleted && <CompletionBanner allMastered={allMastered} />}

      <CourseMap states={states} />

      <Stack
        direction="row"
        spacing={2.5}
        justifyContent="center"
        sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1.5 }}
      >
        <LegendDot color="linear-gradient(160deg, #18867e 0%, #0f6f68 100%)" label="Ready to play" />
        <LegendDot color="linear-gradient(160deg, #43c59e 0%, #1f9d74 100%)" label="Completed" />
        <LegendDot color="linear-gradient(160deg, #ffd86b 0%, #f5a623 100%)" label="Mastered" />
        <LegendDot color="linear-gradient(160deg, #cdd3dc 0%, #aab2bf 100%)" label="Locked" />
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
        Mastery threshold: complete a lesson with 80%+ first-try accuracy. Completing a lesson unlocks the next one along the path.
      </Typography>
    </Container>
  );
}
