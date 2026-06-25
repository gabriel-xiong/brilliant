import { useCallback, useState } from 'react';
import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { allLessons } from '../models/lesson';
import { useAuth } from '../contexts/AuthContext';
import { useUserSummary } from '../hooks/useUserSummary';
import StreakDisplay from '../components/StreakDisplay';
import { fetchAllLessons } from '../services/lessonService';
import { loadLessonProgress, loadProgress, loadUserSummary } from '../services/progressService';
import { computeLessonStates, getEffectiveStatus, resolveContinueDestination } from '../services/lessonProgression';

const sortedLessons = [...allLessons].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
const totalMinutes = sortedLessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes ?? 0), 0);

// "Hands-on labs" = the distinct interactive demos a learner actually uses across
// the course. Interactive demos live on concept/problem steps (and multi-stage
// sub-stages) as a `demo` field, or as a standalone simulation step's
// `simulationType`. We count distinct demo types so reusing the same lab across
// several steps (e.g. the coin flip) is counted once, matching the label's intent.
const labTypes = new Set<string>();
for (const lesson of sortedLessons) {
  for (const step of lesson.steps) {
    if (step.type === 'simulation') {
      labTypes.add(step.simulationType);
      continue;
    }
    if (step.demo) {
      labTypes.add(step.demo.demoType);
    }
    if (step.type === 'problem') {
      for (const stage of step.stages ?? []) {
        if (stage.demo) {
          labTypes.add(stage.demo.demoType);
        }
      }
    }
  }
}
const labCount = labTypes.size;

function HeroIllustration() {
  const tokens = [
    { cx: 18, cy: 70, fill: '#f5a623' },
    { cx: 42, cy: 52, fill: '#1f9d74' },
    { cx: 66, cy: 64, fill: '#0f6f68' },
    { cx: 88, cy: 40, fill: '#cdd3dc' },
  ];
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: { xs: 200, md: 280 },
        borderRadius: 4,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #fff3d6 0%, #ffe9c2 22%, #d9f0e4 60%, #bfe6d2 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <Box component="svg" viewBox="0 0 100 100" preserveAspectRatio="none" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <circle cx="86" cy="14" r="7" fill="#ffd277" opacity="0.85" />
        <circle cx="86" cy="14" r="11" fill="#ffd277" opacity="0.25" />
        <path d="M0 70 Q 25 56 50 66 T 100 60 V100 H0 Z" fill="#a6dcc1" opacity="0.7" />
        <path d="M0 80 Q 30 66 60 76 T 100 74 V100 H0 Z" fill="#7fcaa6" opacity="0.8" />
        <path d="M0 90 Q 35 80 70 88 T 100 86 V100 H0 Z" fill="#5cb98f" opacity="0.9" />
        <path
          d="M18 70 Q 30 48 42 52 T 66 64 T 88 40"
          fill="none"
          stroke="#f5a623"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.85"
        />
        {tokens.map((token, index) => (
          <g key={index}>
            <circle cx={token.cx} cy={token.cy} r="6.4" fill="#ffffff" opacity="0.9" />
            <circle cx={token.cx} cy={token.cy} r="5" fill={token.fill} />
          </g>
        ))}
      </Box>
    </Box>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { summary, loading: summaryLoading } = useUserSummary();
  const navigate = useNavigate();
  const [resolving, setResolving] = useState(false);

  // Compute the right place to drop the learner: resume an in-progress lesson at
  // its furthest step, start the next unlocked lesson, or begin lesson 1. Falls
  // back to the course map if anything fails to load.
  const handleContinue = useCallback(async () => {
    if (resolving) return;
    setResolving(true);
    try {
      const { lessons } = await fetchAllLessons();
      const summary = user ? await loadUserSummary(user.uid) : null;
      const states = computeLessonStates(lessons, (id) => getEffectiveStatus(id, summary, user?.uid));

      // A first-time learner has not started ANY lesson (every node is still
      // 'not-started'). Send them to the course map to choose where to begin
      // instead of dropping them straight into lesson 1. Returning learners with
      // any progress keep the resume-into-lesson behavior below.
      const isFirstTimeLearner = states.every((state) => state.status === 'not-started');
      if (isFirstTimeLearner) {
        navigate('/course');
        return;
      }

      // Pre-resolve the authoritative furthest step for the lesson we may resume
      // (Firestore for signed-in learners, the in-memory session store for guests).
      const lastStepByLesson: Record<string, number> = {};
      const current = states.find((state) => state.isCurrent);
      if (current && current.status !== 'not-started') {
        const progress = user
          ? await loadLessonProgress(user.uid, current.lesson.lessonId)
          : loadProgress(current.lesson.lessonId);
        lastStepByLesson[current.lesson.lessonId] = Math.max(0, progress?.lastStepIndex ?? 0);
      }

      const dest = resolveContinueDestination(
        states,
        (id) => lastStepByLesson[id] ?? loadProgress(id, user?.uid)?.lastStepIndex ?? 0
      );
      navigate(dest ? `/lesson/${dest.lessonId}?step=${dest.stepIndex}` : '/course');
    } catch (error) {
      console.warn('Failed to resolve the continue destination, opening the course map.', error);
      navigate('/course');
    } finally {
      setResolving(false);
    }
  }, [navigate, resolving, user]);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
      <Stack
        direction="row"
        justifyContent={user ? 'space-between' : 'flex-end'}
        alignItems="center"
        spacing={1.5}
        sx={{ mb: { xs: 2, md: 3 }, flexWrap: 'wrap', gap: 1.5 }}
      >
        {user && (
          <StreakDisplay
            currentStreak={summary?.currentStreak ?? 0}
            longestStreak={summary?.longestStreak}
            loading={summaryLoading}
            variant="banner"
          />
        )}
        <Button component={RouterLink} to="/profile" variant="outlined" size="small">
          View Profile
        </Button>
      </Stack>
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          gap: { xs: 4, md: 6 },
          alignItems: 'center',
          mb: { xs: 6, md: 9 },
        }}
      >
        <Box>
          <Chip label="Interactive course" color="primary" size="small" sx={{ fontWeight: 700, mb: 2 }} />
          <Typography variant="h2" component="h1" sx={{ letterSpacing: '-0.03em', mb: 2 }}>
            Introduction to Probability
          </Typography>
          <Typography variant="h6" component="p" sx={{ color: 'text.secondary', fontWeight: 400, mb: 4, maxWidth: '46ch' }}>
            Build an intuition for chance and learn to predict, count, and reason about uncertain events — one hands-on
            experiment at a time.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 4 }}>
            <Button onClick={handleContinue} disabled={resolving} variant="contained" size="large" sx={{ px: 4 }}>
              {user ? 'Continue where you left off' : 'Start learning'}
            </Button>
            {user ? (
              <Button component={RouterLink} to="/profile" variant="outlined" size="large">
                View profile
              </Button>
            ) : (
              <Button component={RouterLink} to="/signin" variant="outlined" size="large">
                Sign in to save progress
              </Button>
            )}
          </Stack>
          <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', gap: 2 }}>
            {[
              { value: sortedLessons.length, label: 'Lessons' },
              { value: labCount, label: 'Hands-on labs' },
              { value: `~${totalMinutes}`, label: 'Minutes total' },
            ].map((stat) => (
              <Box key={stat.label}>
                <Typography variant="h4" className="numeric" sx={{ fontWeight: 800, lineHeight: 1 }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                  {stat.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <HeroIllustration />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h2" gutterBottom>
          What you'll learn
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Five short lessons build on each other. Finish one to unlock the next stop on the map.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2.5,
          mb: 6,
        }}
      >
        {sortedLessons.map((lesson, index) => (
          <Box
            key={lesson.lessonId}
            component={motion.div}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            sx={{
              p: 2.5,
              borderRadius: 4,
              bgcolor: 'background.paper',
              border: '1px solid rgba(15,111,104,0.12)',
              boxShadow: '0 10px 30px rgba(68,50,23,0.08)',
              display: 'flex',
              gap: 2,
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'linear-gradient(160deg, #18867e 0%, #0f6f68 100%)',
                color: '#fffaf0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}
              className="numeric"
            >
              {lesson.order ?? index + 1}
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                  {lesson.title}
                </Typography>
                <Chip label={`${lesson.estimatedMinutes} min`} size="small" variant="outlined" />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {lesson.summary}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ textAlign: 'center' }}>
        <Button component={RouterLink} to="/course" variant="contained" size="large" sx={{ px: 5 }}>
          {user ? 'Continue to the map' : 'Start learning'}
        </Button>
      </Box>
    </Container>
  );
}
