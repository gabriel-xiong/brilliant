import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  LinearProgress,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useUserSummary } from '../hooks/useUserSummary';
import { useAuth } from '../contexts/AuthContext';
import { recordPracticeResult, type UserSummary } from '../services/progressService';
import { ALL_CONCEPTS, CONCEPT_LABELS, generateProblem } from '../services/ai/conceptSchemas';
import type { ConceptId, GeneratedProblem } from '../services/ai/types';
import {
  BAND_LABEL,
  DEFAULT_PRACTICE_CONFIG,
  MAX_LEVEL,
  MIN_LEVEL,
  PRACTICE_COUNT_PRESETS,
  levelToBand,
  nextLevelForMode,
  parseConceptId,
  startLevelForMode,
  weakestConcept,
  type DifficultyMode,
  type PracticeConfig,
} from '../services/practiceService';
import { getEffectiveStatus } from '../services/lessonProgression';
import {
  isPracticeUnlockedForConcept,
  unlockedConcepts,
  type StatusGetter,
} from '../services/practiceAccess';
import { aiGenerateProblem, isAIEnabled } from '../services/ai/aiService';
import GeneratedProblemCard from '../components/practice/GeneratedProblemCard';

/**
 * Adaptive practice surface. The learner configures a session (how many
 * questions and at what difficulty — including an unlimited mode), then the page
 * serves generated problems whose difficulty either adapts to their answers or
 * holds a pinned level. Every answer is graded against the solver's exact value,
 * so practice can never go wrong even with AI off.
 */
export default function PracticePage() {
  const { summary, loading } = useUserSummary();
  const { user } = useAuth();

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  const getStatus: StatusGetter = (lessonId) => getEffectiveStatus(lessonId, summary, user?.uid);
  const unlocked = unlockedConcepts(getStatus);

  // Practice is gated per concept: nothing to drill until at least one lesson is
  // complete. Show the gate (not a blank page) so the progression is obvious.
  if (unlocked.length === 0) {
    return <PracticeLocked />;
  }

  return <PracticeInner summary={summary} getStatus={getStatus} />;
}

function PracticeLocked() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Typography sx={{ fontSize: 48, lineHeight: 1, mb: 1 }} aria-hidden>
            🔒
          </Typography>
          <Chip label="Practice locked" color="default" sx={{ fontWeight: 800, mb: 1.5 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Finish a lesson to start practicing
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Practice unlocks one concept at a time. Complete your first lesson on the path and its problem set
            opens up here — tuned to exactly what you just learned.
          </Typography>
          <Button component={RouterLink} to="/course" variant="contained">
            Go to the course
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}

/** In-memory prefetch cache: key -> already-resolved problem (instant reuse). */
function prefetchKey(conceptId: ConceptId, level: number, seed: number): string {
  return `${conceptId}|${level}|${seed}`;
}

const PRACTICE_CONFIG_KEY = 'practice.config.v1';

/** Load the learner's last-used session config from localStorage (best-effort). */
function loadSavedConfig(): PracticeConfig {
  try {
    const raw = localStorage.getItem(PRACTICE_CONFIG_KEY);
    if (!raw) return DEFAULT_PRACTICE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<PracticeConfig>;
    const questionCount =
      parsed.questionCount === 'unlimited' ||
      (typeof parsed.questionCount === 'number' && parsed.questionCount > 0)
        ? parsed.questionCount
        : DEFAULT_PRACTICE_CONFIG.questionCount;
    const difficultyMode: DifficultyMode =
      parsed.difficultyMode === 'adaptive' || typeof parsed.difficultyMode === 'number'
        ? parsed.difficultyMode
        : 'adaptive';
    return { questionCount, difficultyMode };
  } catch {
    return DEFAULT_PRACTICE_CONFIG;
  }
}

function saveConfig(config: PracticeConfig) {
  try {
    localStorage.setItem(PRACTICE_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* persistence is best-effort */
  }
}

type Phase = 'config' | 'active' | 'summary';

function PracticeInner({ summary, getStatus }: { summary: UserSummary | null; getStatus: StatusGetter }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const aiOn = useMemo(() => isAIEnabled(), []);

  const isUnlocked = (id: ConceptId) => isPracticeUnlockedForConcept(id, getStatus);

  // Default to the weakest concept the learner has actually unlocked; fall back
  // to the first unlocked concept. A query param is honored only if unlocked so
  // a stale/locked deep link can never open a gated drill.
  const requestedConcept = parseConceptId(searchParams.get('concept'));
  const weakest = weakestConcept(summary);
  const unlocked = useMemo(() => unlockedConcepts(getStatus), [getStatus]);
  const initialConcept =
    requestedConcept && isUnlocked(requestedConcept)
      ? requestedConcept
      : isUnlocked(weakest)
        ? weakest
        : unlocked[0];

  const saved = useMemo(() => loadSavedConfig(), []);

  const [concept, setConcept] = useState<ConceptId>(initialConcept);
  const [phase, setPhase] = useState<Phase>('config');

  // Session config draft (edited in the setup card, committed on Start).
  const [countChoice, setCountChoice] = useState<number | 'unlimited'>(saved.questionCount);
  const [diffChoice, setDiffChoice] = useState<'adaptive' | 'custom'>(
    saved.difficultyMode === 'adaptive' ? 'adaptive' : 'custom',
  );
  const [customLevel, setCustomLevel] = useState<number>(
    typeof saved.difficultyMode === 'number' ? saved.difficultyMode : 5,
  );

  const difficultyMode: DifficultyMode = diffChoice === 'adaptive' ? 'adaptive' : customLevel;
  const activeConfig: PracticeConfig = { questionCount: countChoice, difficultyMode };

  const [level, setLevel] = useState<number>(() =>
    startLevelForMode(saved.difficultyMode, initialConcept, summary),
  );
  const [seed, setSeed] = useState(1);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [maxLevelSeen, setMaxLevelSeen] = useState(level);

  const [problem, setProblem] = useState<GeneratedProblem>(() =>
    generateProblem(initialConcept, level, 1),
  );
  const [polishing, setPolishing] = useState(false);

  const prefetchRef = useRef<Map<string, GeneratedProblem>>(new Map());
  const answeredRef = useRef(false);
  const lastCorrectRef = useRef(false);
  const answeredCountRef = useRef(0);

  // Warm the NEXT problem (predicting a correct answer, the common case) so
  // advancing is instant. Mispredictions still fall back to instant deterministic.
  const prefetchNext = useCallback(
    (fromLevel: number, fromSeed: number, fromStreak: number) => {
      if (!aiOn) return;
      const predictedLevel = nextLevelForMode(difficultyMode, fromLevel, true, fromStreak + 1);
      const nextSeed = fromSeed + 1;
      const key = prefetchKey(concept, predictedLevel, nextSeed);
      if (prefetchRef.current.has(key)) return;
      aiGenerateProblem({ conceptId: concept, level: predictedLevel, seed: nextSeed })
        .then(({ problem: p }) => {
          prefetchRef.current.set(key, p);
        })
        .catch(() => {
          /* prefetch is best-effort */
        });
    },
    [aiOn, concept, difficultyMode],
  );

  // Resolve the current problem whenever (concept, level, seed) changes — but
  // only while a session is actually running.
  useEffect(() => {
    if (phase !== 'active') return;
    answeredRef.current = false;
    let cancelled = false;

    const key = prefetchKey(concept, level, seed);
    const prefetched = prefetchRef.current.get(key);
    if (prefetched) {
      prefetchRef.current.delete(key);
      setProblem(prefetched);
      setPolishing(false);
      prefetchNext(level, seed, streak);
      return;
    }

    setProblem(generateProblem(concept, level, seed));

    if (!aiOn) {
      setPolishing(false);
      return;
    }

    setPolishing(true);
    aiGenerateProblem({ conceptId: concept, level, seed })
      .then(({ problem: p }) => {
        if (cancelled) return;
        setPolishing(false);
        if (p.source === 'ai' && !answeredRef.current) setProblem(p);
        prefetchNext(level, seed, streak);
      })
      .catch(() => {
        if (!cancelled) setPolishing(false);
      });

    return () => {
      cancelled = true;
    };
    // `streak` is read at run time for prefetch prediction only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, level, seed, aiOn, phase, prefetchNext]);

  const selectConcept = (next: ConceptId) => {
    setConcept(next);
    const params = new URLSearchParams(searchParams);
    params.set('concept', next);
    setSearchParams(params, { replace: true });
  };

  const startSession = () => {
    saveConfig(activeConfig);
    const startLevel = startLevelForMode(difficultyMode, concept, summary);
    prefetchRef.current.clear();
    answeredRef.current = false;
    answeredCountRef.current = 0;
    lastCorrectRef.current = false;
    setLevel(startLevel);
    setMaxLevelSeen(startLevel);
    setSeed(1);
    setStreak(0);
    setStats({ answered: 0, correct: 0 });
    setProblem(generateProblem(concept, startLevel, 1));
    setPhase('active');
  };

  const handleFirstResult = (correct: boolean) => {
    answeredRef.current = true;
    lastCorrectRef.current = correct;
    answeredCountRef.current += 1;
    setStats((prev) => ({ answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0) }));
    setStreak((prev) => (correct ? prev + 1 : 0));
  };

  // Persist the session's per-concept performance so the dashboard and adaptive
  // seeding reflect real practice (best-effort; no-op for guests).
  const finishSession = () => {
    if (user?.uid && stats.answered > 0) {
      void recordPracticeResult(user.uid, concept, {
        answered: stats.answered,
        correct: stats.correct,
        levelReached: maxLevelSeen,
      });
    }
    setPhase('summary');
  };

  const handleNext = () => {
    if (countChoice !== 'unlimited' && answeredCountRef.current >= countChoice) {
      finishSession();
      return;
    }
    setLevel((current) => {
      const nl = nextLevelForMode(difficultyMode, current, lastCorrectRef.current, streak);
      setMaxLevelSeen((m) => Math.max(m, nl));
      return nl;
    });
    setSeed((prev) => prev + 1);
  };

  const endSession = () => finishSession();
  const newSession = () => setPhase('config');

  // ---- Config (setup) phase ------------------------------------------------
  if (phase === 'config') {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 2.5, md: 3.5 } }}>
        <SessionHeader aiOn={aiOn} />

        <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Choose a topic
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5, mb: 1 }}>
              {ALL_CONCEPTS.map((id) => {
                const unlockedChip = isUnlocked(id);
                const chip = (
                  <Chip
                    key={id}
                    label={CONCEPT_LABELS[id]}
                    icon={
                      unlockedChip ? undefined : (
                        <span aria-hidden style={{ fontSize: 13, paddingLeft: 6 }}>
                          🔒
                        </span>
                      )
                    }
                    onClick={unlockedChip ? () => selectConcept(id) : undefined}
                    disabled={!unlockedChip}
                    color={id === concept ? 'primary' : 'default'}
                    variant={id === concept ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 700, opacity: unlockedChip ? 1 : 0.6 }}
                  />
                );
                return unlockedChip ? (
                  chip
                ) : (
                  <Tooltip key={id} title="Complete the lesson that teaches this to unlock practice" arrow>
                    <span>{chip}</span>
                  </Tooltip>
                );
              })}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Topics unlock as you complete the lessons that teach them.
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              How many questions?
            </Typography>
            <Box sx={{ mt: 0.5, mb: 2 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                aria-label="How many questions"
                value={countChoice}
                onChange={(_e, v) => v != null && setCountChoice(v)}
                sx={{ flexWrap: 'wrap', gap: 1 }}
              >
                {PRACTICE_COUNT_PRESETS.map((n) => (
                  <ToggleButton key={n} value={n} sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                    {n}
                  </ToggleButton>
                ))}
                <ToggleButton value="unlimited" sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                  Unlimited
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Difficulty
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                aria-label="Practice difficulty"
                value={diffChoice}
                onChange={(_e, v) => v != null && setDiffChoice(v)}
                sx={{ gap: 1 }}
              >
                <ToggleButton value="adaptive" sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                  Adaptive
                </ToggleButton>
                <ToggleButton value="custom" sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                  Fixed level
                </ToggleButton>
              </ToggleButtonGroup>

              {diffChoice === 'adaptive' ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Starts from your mastery and adjusts as you answer — streaks push it up, misses ease it back.
                </Typography>
              ) : (
                <Box sx={{ px: 1, mt: 1.5, maxWidth: 420 }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      Level {customLevel}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={BAND_LABEL[levelToBand(customLevel)]}
                      sx={{ fontWeight: 700, height: 20 }}
                    />
                  </Stack>
                  <Slider
                    value={customLevel}
                    onChange={(_e, v) => setCustomLevel(v as number)}
                    min={MIN_LEVEL}
                    max={MAX_LEVEL}
                    step={1}
                    marks
                    valueLabelDisplay="auto"
                    aria-label="Practice difficulty level"
                    getAriaValueText={(v) => `Level ${v}`}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Every question stays at this level.
                  </Typography>
                </Box>
              )}
            </Box>

            <Button onClick={startSession} variant="contained" size="large" sx={{ mt: 3 }}>
              Start practice
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  // ---- Summary phase -------------------------------------------------------
  if (phase === 'summary') {
    const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
    return (
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
        <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Chip
              label={accuracy >= 80 ? 'Great session' : 'Session complete'}
              color={accuracy >= 80 ? 'success' : 'primary'}
              sx={{ fontWeight: 800, mb: 1.5 }}
            />
            <Typography variant="h4" component="h1" gutterBottom>
              {stats.correct}/{stats.answered} correct ({accuracy}%)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
              You practiced <strong>{CONCEPT_LABELS[concept]}</strong> and reached the{' '}
              <strong>{BAND_LABEL[levelToBand(maxLevelSeen)]}</strong> level (level {maxLevelSeen}).
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={startSession} variant="contained">
                Practice again
              </Button>
              <Button onClick={newSession} variant="outlined">
                New session
              </Button>
              <Button component={RouterLink} to="/course" variant="text">
                Back to course
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  // ---- Active phase --------------------------------------------------------
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : null;
  const band = levelToBand(level);
  const unlimited = countChoice === 'unlimited';
  const total = unlimited ? 0 : countChoice;
  const isFinalQuestion = !unlimited && stats.answered >= total;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <SessionHeader
        aiOn={aiOn}
        right={
          <Button onClick={newSession} variant="text" size="small" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            End &amp; restart
          </Button>
        }
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Chip size="small" color="primary" variant="outlined" label={CONCEPT_LABELS[concept]} sx={{ fontWeight: 700 }} />
        <Chip size="small" variant="outlined" label={`${BAND_LABEL[band]} · Level ${level}`} sx={{ fontWeight: 700 }} />
        {diffChoice === 'custom' && (
          <Chip size="small" variant="outlined" label="Fixed difficulty" sx={{ fontWeight: 700 }} />
        )}
        {streak >= 2 && <Chip size="small" color="warning" label={`${streak} in a row`} sx={{ fontWeight: 700 }} />}
        {polishing && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <CircularProgress size={13} thickness={6} />
            <Typography variant="caption" color="text.secondary">
              Tailoring a fresh scenario…
            </Typography>
          </Stack>
        )}
      </Stack>

      <Box sx={{ mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
            {unlimited
              ? `Question ${stats.answered + 1} · Unlimited`
              : `Question ${Math.min(stats.answered + 1, total)} of ${total}`}
          </Typography>
          {accuracy !== null && (
            <Typography variant="body2" color="text.secondary">
              {stats.correct}/{stats.answered} correct ({accuracy}%)
            </Typography>
          )}
        </Stack>
        {unlimited ? (
          <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 999, opacity: 0.25 }} />
        ) : (
          <LinearProgress
            variant="determinate"
            value={Math.min((stats.answered / total) * 100, 100)}
            sx={{ height: 6, borderRadius: 999 }}
          />
        )}
      </Box>

      <GeneratedProblemCard
        key={problem.id}
        problem={problem}
        onFirstResult={handleFirstResult}
        onNext={handleNext}
        nextLabel={isFinalQuestion ? 'See results' : 'Next problem'}
      />

      {unlimited && (
        <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
          <Button onClick={endSession} variant="text" color="inherit">
            End session &amp; see summary
          </Button>
        </Stack>
      )}
    </Container>
  );
}

/** Shared page header for the practice surface. */
function SessionHeader({ aiOn, right }: { aiOn: boolean; right?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'start', sm: 'center' }}
      spacing={2}
      sx={{ mb: 2 }}
    >
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          Adaptive practice
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
          Fresh problems tuned to your level.{' '}
          {aiOn ? 'AI explains anything you miss.' : 'Worked solutions are always one tap away.'}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, flexWrap: 'nowrap' }}>
        {right}
        <Button
          component={RouterLink}
          to="/course"
          variant="text"
          size="small"
          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Course
        </Button>
        <Button
          component={RouterLink}
          to="/exam"
          variant="outlined"
          size="small"
          sx={{ whiteSpace: 'nowrap', flexShrink: 0, borderRadius: 2 }}
        >
          Final exam
        </Button>
      </Stack>
    </Stack>
  );
}
