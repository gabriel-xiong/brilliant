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
  parseConceptIds,
  normalizePracticeConceptSelection,
  buildPracticeSessionSlots,
  orderPracticeConceptsForSession,
  dueReviewConcepts as getDueReviewConcepts,
  startLevelForMode,
  weakestConcept,
  conceptPracticeSignal,
  type ConceptPracticeSignal,
  type DifficultyMode,
  type PracticeConfig,
} from '../services/practiceService';
import { getEffectiveStatus } from '../services/lessonProgression';
import { getPracticeReadinessSummary } from '../services/masteryLabels';
import {
  isPracticeUnlockedForConcept,
  lessonIdForConcept,
  unlockedConcepts,
  type StatusGetter,
} from '../services/practiceAccess';
import { aiGenerateProblem, aiRemediation, isAIEnabled } from '../services/ai/aiService';
import GeneratedProblemCard from '../components/practice/GeneratedProblemCard';
import { AIAssistPanel } from '../components/lesson/AIAssistPanel';

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
    const selectedConcepts = parseConceptIds(parsed.selectedConcepts);
    return {
      questionCount,
      difficultyMode,
      ...(selectedConcepts.length > 0 ? { selectedConcepts } : {}),
    };
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
type ConceptNumberMap = Partial<Record<ConceptId, number>>;
type ConceptSessionStats = Partial<Record<ConceptId, { answered: number; correct: number }>>;
type ConceptSignalMap = Record<ConceptId, ConceptPracticeSignal>;

function formatPercent(value: number | null): string {
  return value == null ? 'New' : `${Math.round(value * 100)}%`;
}

function conceptTrail(concepts: ConceptId[]): string {
  if (concepts.length === 0) return 'No topics attempted';
  if (concepts.length === 1) return 'One topic at a time';
  return concepts.map((id) => CONCEPT_LABELS[id]).join(' -> ');
}

function recommendationCopy(id: ConceptId, signal: ConceptPracticeSignal): string {
  if (signal.dueForReview) return `${CONCEPT_LABELS[id]}: ${signal.dueReason.toLowerCase()}`;
  if (signal.answered === 0) return `${CONCEPT_LABELS[id]}: ready for first practice`;
  if (signal.status === 'needs-practice') return `${CONCEPT_LABELS[id]}: needs a few more correct reviews`;
  return `${CONCEPT_LABELS[id]}: keep it fresh`;
}

function masteryMovementCopy(concepts: ConceptId[], startLevels: ConceptNumberMap, maxLevels: ConceptNumberMap): string {
  const moved = concepts.filter((id) => (maxLevels[id] ?? MIN_LEVEL) > (startLevels[id] ?? MIN_LEVEL));
  if (moved.length === 0) return 'Steady signal';
  if (moved.length === 1) return `${CONCEPT_LABELS[moved[0]]} moved up`;
  return `${moved.length} topics moved up`;
}

function PracticeInner({ summary, getStatus }: { summary: UserSummary | null; getStatus: StatusGetter }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const aiOn = useMemo(() => isAIEnabled(), []);

  const isUnlocked = (id: ConceptId) => isPracticeUnlockedForConcept(id, getStatus);

  // Default to the weakest concept the learner has actually unlocked; fall back
  // to the first unlocked concept. A query param is honored only if unlocked so
  // a stale/locked deep link can never open a gated drill.
  const requestedConcept = parseConceptId(searchParams.get('concept'));
  const requestedConceptsParam = searchParams.get('concepts');
  const requestedConcepts = useMemo(() => parseConceptIds(requestedConceptsParam), [requestedConceptsParam]);
  const reviewMode = searchParams.get('mode') === 'review';
  const weakest = weakestConcept(summary);
  const unlocked = useMemo(() => unlockedConcepts(getStatus), [getStatus]);
  const initialConcept =
    requestedConcept && isUnlocked(requestedConcept)
      ? requestedConcept
      : isUnlocked(weakest)
        ? weakest
        : unlocked[0];

  const saved = useMemo(() => loadSavedConfig(), []);
  const initialSelection = useMemo(
    () => {
      const savedConcepts = saved.selectedConcepts ?? [];
      const requestedSelection =
        requestedConcepts.length > 0
          ? requestedConcepts
          : requestedConcept && unlocked.includes(requestedConcept)
            ? [requestedConcept, ...savedConcepts.filter((id) => id !== requestedConcept)]
          : savedConcepts.length > 0
            ? savedConcepts
            : [initialConcept];
      return normalizePracticeConceptSelection(requestedSelection, unlocked, initialConcept);
    },
    [initialConcept, requestedConcept, requestedConcepts, saved.selectedConcepts, unlocked],
  );
  const firstConcept = initialSelection[0] ?? initialConcept;

  const [selectedConcepts, setSelectedConcepts] = useState<ConceptId[]>(initialSelection);
  const [activeConcepts, setActiveConcepts] = useState<ConceptId[]>(initialSelection);
  const [conceptSequence, setConceptSequence] = useState<ConceptId[]>(initialSelection);
  const [conceptIndex, setConceptIndex] = useState(0);
  const [concept, setConcept] = useState<ConceptId>(firstConcept);
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
  const activeConfig: PracticeConfig = { questionCount: countChoice, difficultyMode, selectedConcepts };
  const signalNow = useMemo(() => new Date(), [summary]);
  const practiceSignals = useMemo(
    () =>
      ALL_CONCEPTS.reduce<ConceptSignalMap>((signals, id) => {
        const lessonId = lessonIdForConcept(id);
        signals[id] = conceptPracticeSignal(id, summary, signalNow, lessonId ? getStatus(lessonId) : undefined);
        return signals;
      }, {} as ConceptSignalMap),
    [getStatus, signalNow, summary],
  );

  const [level, setLevel] = useState<number>(() =>
    startLevelForMode(saved.difficultyMode, firstConcept, summary),
  );
  const [seed, setSeed] = useState(1);
  const [streaksByConcept, setStreaksByConcept] = useState<ConceptNumberMap>({});
  const [levelsByConcept, setLevelsByConcept] = useState<ConceptNumberMap>(() => ({
    [firstConcept]: startLevelForMode(saved.difficultyMode, firstConcept, summary),
  }));
  const [statsByConcept, setStatsByConcept] = useState<ConceptSessionStats>({});
  const [dueReviewConcepts, setDueReviewConcepts] = useState<ConceptId[]>([]);
  const [dueReviewStats, setDueReviewStats] = useState({ answered: 0, correct: 0 });
  const [startLevelsByConcept, setStartLevelsByConcept] = useState<ConceptNumberMap>(() => ({
    [firstConcept]: startLevelForMode(saved.difficultyMode, firstConcept, summary),
  }));
  const [maxLevelsByConcept, setMaxLevelsByConcept] = useState<ConceptNumberMap>(() => ({
    [firstConcept]: startLevelForMode(saved.difficultyMode, firstConcept, summary),
  }));
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [maxLevelSeen, setMaxLevelSeen] = useState(level);

  const [problem, setProblem] = useState<GeneratedProblem>(() =>
    generateProblem(firstConcept, level, 1),
  );
  const [polishing, setPolishing] = useState(false);

  const prefetchRef = useRef<Map<string, GeneratedProblem>>(new Map());
  const answeredRef = useRef(false);
  const lastResultRef = useRef<{ conceptId: ConceptId; correct: boolean; streak: number } | null>(null);
  const answeredCountRef = useRef(0);

  // Warm the NEXT problem (predicting a correct answer, the common case) so
  // advancing is instant. Mispredictions still fall back to instant deterministic.
  const prefetchNext = useCallback(
    (fromConcept: ConceptId, fromLevel: number, fromSeed: number, fromStreak: number) => {
      if (!aiOn || activeConcepts.length === 0) return;
      const fromIndex = Math.max(0, activeConcepts.indexOf(fromConcept));
      const nextConcept = activeConcepts[(fromIndex + 1) % activeConcepts.length] ?? fromConcept;
      const predictedLevel =
        nextConcept === fromConcept
          ? nextLevelForMode(difficultyMode, fromLevel, true, fromStreak + 1)
          : levelsByConcept[nextConcept] ?? startLevelForMode(difficultyMode, nextConcept, summary);
      const nextSeed = fromSeed + 1;
      const key = prefetchKey(nextConcept, predictedLevel, nextSeed);
      if (prefetchRef.current.has(key)) return;
      aiGenerateProblem({ conceptId: nextConcept, level: predictedLevel, seed: nextSeed })
        .then(({ problem: p }) => {
          prefetchRef.current.set(key, p);
        })
        .catch(() => {
          /* prefetch is best-effort */
        });
    },
    [activeConcepts, aiOn, difficultyMode, levelsByConcept, summary],
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
      prefetchNext(concept, level, seed, streaksByConcept[concept] ?? 0);
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
        prefetchNext(concept, level, seed, streaksByConcept[concept] ?? 0);
      })
      .catch(() => {
        if (!cancelled) setPolishing(false);
      });

    return () => {
      cancelled = true;
    };
    // Per-concept streak is read at run time for prefetch prediction only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, level, seed, aiOn, phase, prefetchNext]);

  const selectConcept = (next: ConceptId) => {
    const nextSelection = selectedConcepts.includes(next)
      ? selectedConcepts.length > 1
        ? selectedConcepts.filter((id) => id !== next)
        : selectedConcepts
      : [...selectedConcepts, next];
    setSelectedConcepts(nextSelection);
    const params = new URLSearchParams(searchParams);
    if (reviewMode || params.has('concepts')) {
      params.set('mode', 'review');
      params.set('concepts', nextSelection.join(','));
      params.delete('concept');
    } else {
      params.set('concept', nextSelection[0] ?? next);
    }
    setSearchParams(params, { replace: true });
  };

  const buildStartLevels = (concepts: ConceptId[]): ConceptNumberMap =>
    concepts.reduce<ConceptNumberMap>((levels, id) => {
      levels[id] = startLevelForMode(difficultyMode, id, summary);
      return levels;
    }, {});

  const startSession = () => {
    const sessionConcepts = normalizePracticeConceptSelection(selectedConcepts, unlocked, initialConcept);
    const orderedConcepts = orderPracticeConceptsForSession(sessionConcepts, summary, signalNow);
    const activeSessionConcepts = orderedConcepts.length > 0 ? orderedConcepts : sessionConcepts;
    const sessionSlots =
      countChoice === 'unlimited'
        ? []
        : buildPracticeSessionSlots(activeSessionConcepts, summary, 1, activeConfig, signalNow);
    const plannedSequence = sessionSlots.map((slot) => slot.conceptId);
    const sessionSequence = plannedSequence.length > 0 ? plannedSequence : activeSessionConcepts;
    const startConcept = sessionSequence[0] ?? initialConcept;
    const startLevels = buildStartLevels(activeSessionConcepts);
    const startLevel = startLevels[startConcept] ?? startLevelForMode(difficultyMode, startConcept, summary);
    const dueAtStart = getDueReviewConcepts(activeSessionConcepts, summary, signalNow);
    saveConfig({ ...activeConfig, selectedConcepts: sessionConcepts });
    prefetchRef.current.clear();
    answeredRef.current = false;
    lastResultRef.current = null;
    answeredCountRef.current = 0;
    setActiveConcepts(activeSessionConcepts);
    setConceptSequence(sessionSequence);
    setConceptIndex(0);
    setConcept(startConcept);
    setDueReviewConcepts(dueAtStart);
    setDueReviewStats({ answered: 0, correct: 0 });
    setLevelsByConcept(startLevels);
    setStartLevelsByConcept(startLevels);
    setMaxLevelsByConcept(startLevels);
    setLevel(startLevel);
    setMaxLevelSeen(startLevel);
    setSeed(1);
    setStreaksByConcept({});
    setStatsByConcept({});
    setStats({ answered: 0, correct: 0 });
    setProblem(generateProblem(startConcept, startLevel, 1));
    setPhase('active');
  };

  const handleFirstResult = (correct: boolean) => {
    answeredRef.current = true;
    const currentStreak = streaksByConcept[concept] ?? 0;
    const nextStreak = correct ? currentStreak + 1 : 0;
    lastResultRef.current = { conceptId: concept, correct, streak: nextStreak };
    answeredCountRef.current += 1;
    setStats((prev) => ({ answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0) }));
    if (dueReviewConcepts.includes(concept)) {
      setDueReviewStats((prev) => ({ answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0) }));
    }
    setStatsByConcept((prev) => {
      const current = prev[concept] ?? { answered: 0, correct: 0 };
      return {
        ...prev,
        [concept]: {
          answered: current.answered + 1,
          correct: current.correct + (correct ? 1 : 0),
        },
      };
    });
    setStreaksByConcept((prev) => ({ ...prev, [concept]: nextStreak }));
  };

  // Persist the session's per-concept performance so the dashboard and adaptive
  // seeding reflect real practice (best-effort; no-op for guests).
  const finishSession = () => {
    if (user?.uid && stats.answered > 0) {
      Object.entries(statsByConcept).forEach(([conceptId, conceptStats]) => {
        if (!conceptStats || conceptStats.answered <= 0) return;
        void recordPracticeResult(user.uid, conceptId, {
          answered: conceptStats.answered,
          correct: conceptStats.correct,
          levelReached: maxLevelsByConcept[conceptId as ConceptId] ?? levelsByConcept[conceptId as ConceptId] ?? maxLevelSeen,
        });
      });
    }
    setPhase('summary');
  };

  const handleNext = () => {
    if (countChoice !== 'unlimited' && answeredCountRef.current >= countChoice) {
      finishSession();
      return;
    }
    const updatedLevels = { ...levelsByConcept };
    const updatedMaxLevels = { ...maxLevelsByConcept };
    const last = lastResultRef.current;
    if (last) {
      const currentLevel = updatedLevels[last.conceptId] ?? level;
      const nextLevel = nextLevelForMode(difficultyMode, currentLevel, last.correct, last.streak);
      updatedLevels[last.conceptId] = nextLevel;
      updatedMaxLevels[last.conceptId] = Math.max(updatedMaxLevels[last.conceptId] ?? currentLevel, nextLevel);
      setLevelsByConcept(updatedLevels);
      setMaxLevelsByConcept(updatedMaxLevels);
      setMaxLevelSeen((m) => Math.max(m, nextLevel));
    }
    const sequence = conceptSequence.length > 0 ? conceptSequence : activeConcepts;
    const nextIndex = (conceptIndex + 1) % Math.max(sequence.length, 1);
    const nextConcept = sequence[nextIndex] ?? concept;
    setConceptIndex(nextIndex);
    setConcept(nextConcept);
    setLevel(updatedLevels[nextConcept] ?? startLevelForMode(difficultyMode, nextConcept, summary));
    setSeed((prev) => prev + 1);
  };

  const endSession = () => finishSession();
  const newSession = () => setPhase('config');

  // ---- Config (setup) phase ------------------------------------------------
  if (phase === 'config') {
    const selectedTopicCopy =
      reviewMode
        ? `${selectedConcepts.length} recommended topic${selectedConcepts.length === 1 ? '' : 's'} selected. Adjust anything before starting.`
        : selectedConcepts.length > 1
        ? `Mixed practice will rotate through ${selectedConcepts.length} topics.`
        : 'Pick one topic, or add more unlocked topics for mixed practice.';
    const questionCountLabel = countChoice === 'unlimited' ? 'Unlimited' : `${countChoice} questions`;
    const difficultySummary =
      diffChoice === 'adaptive' ? 'Adaptive level' : `${BAND_LABEL[levelToBand(customLevel)]} - Level ${customLevel}`;
    const selectedSignals = selectedConcepts.map((id) => ({ id, signal: practiceSignals[id] }));
    const dueReviewCount = selectedSignals.filter(({ signal }) => signal.dueForReview).length;
    const readinessSummary = getPracticeReadinessSummary(summary, selectedConcepts);
    const orderedPreview = orderPracticeConceptsForSession(selectedConcepts, summary, signalNow);
    const masteryCounts = selectedSignals.reduce(
      (counts, { signal }) => ({
        needsPractice: counts.needsPractice + (signal.status === 'needs-practice' ? 1 : 0),
        proficient: counts.proficient + (signal.status === 'proficient' ? 1 : 0),
        mastered: counts.mastered + (signal.status === 'mastered' ? 1 : 0),
      }),
      { needsPractice: 0, proficient: 0, mastered: 0 },
    );
    const reviewCopy =
      reviewMode
        ? dueReviewCount > 0
          ? `${dueReviewCount} selected topic${dueReviewCount === 1 ? '' : 's'} are due for review now.`
          : `${selectedConcepts.length} recommended topic${selectedConcepts.length === 1 ? '' : 's'} selected for a focused review.`
        : dueReviewCount > 0
        ? `${dueReviewCount} selected topic${dueReviewCount === 1 ? '' : 's'} will come back for review.`
        : 'No selected topics are due right now.';
    const recommendationSummary = selectedSignals
      .slice()
      .sort((a, b) => Number(b.signal.dueForReview) - Number(a.signal.dueForReview))
      .slice(0, 2)
      .map(({ id, signal }) => recommendationCopy(id, signal))
      .join('; ');
    const mixCopy =
      reviewMode
        ? `Recommended because ${recommendationSummary}.`
        : selectedConcepts.length > 1
        ? `Interleaves in this order: ${conceptTrail(orderedPreview)}.`
        : 'Add another unlocked topic to make practice mixed.';

    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 3.5 } }}>
        <SessionHeader
          aiOn={aiOn}
          title={reviewMode ? 'Review weak spots' : undefined}
          subtitle={
            reviewMode
              ? 'A focused practice plan built from due reviews, recent misses, and topics that need more signal.'
              : undefined
          }
        />

        <Card
          sx={{
            overflow: 'hidden',
            border: '1px solid rgba(31,36,48,0.08)',
            boxShadow: '0 20px 60px rgba(31,36,48,0.08)',
          }}
        >
          <CardContent
            sx={{
              p: { xs: 2.25, md: 3 },
              background:
                'linear-gradient(135deg, rgba(67,97,238,0.08), rgba(255,255,255,0) 34%), #fff',
            }}
          >
            <Stack spacing={2.5}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1.5}
              >
                <Box>
                  <Chip
                    label={reviewMode ? 'Targeted review' : 'Practice setup'}
                    size="small"
                    color="primary"
                    sx={{ fontWeight: 800, mb: 1 }}
                  />
                  <Typography variant="h5" component="h2" sx={{ fontWeight: 850, letterSpacing: '-0.02em' }}>
                    {reviewMode ? 'Review what needs attention' : 'Build a focused drill'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 620 }}>
                    {reviewMode
                      ? 'Start with the suggested topics, then keep the session short or go longer.'
                      : 'Choose the topics, length, and challenge level before the first problem appears.'}
                  </Typography>
                </Box>
                <Chip
                  label={`${selectedConcepts.length} selected`}
                  variant="outlined"
                  sx={{
                    fontWeight: 800,
                    borderColor: 'rgba(67,97,238,0.28)',
                    backgroundColor: 'rgba(67,97,238,0.06)',
                  }}
                />
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' },
                  gap: 2,
                  alignItems: 'stretch',
                }}
              >
                <Stack spacing={2}>
                  <Box
                    sx={{
                      p: { xs: 2, md: 2.25 },
                      borderRadius: 4,
                      border: '1px solid rgba(31,36,48,0.08)',
                      backgroundColor: 'rgba(255,255,255,0.86)',
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1}
                      sx={{ mb: 1.25 }}
                    >
                      <Box>
                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                          Topics
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {selectedTopicCopy}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${unlocked.length}/${ALL_CONCEPTS.length} unlocked`}
                        sx={{ fontWeight: 800, backgroundColor: 'rgba(31,36,48,0.05)' }}
                      />
                    </Stack>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {ALL_CONCEPTS.map((id) => {
                        const unlockedChip = isUnlocked(id);
                        const selected = selectedConcepts.includes(id);
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
                            color={selected ? 'primary' : 'default'}
                            variant={selected ? 'filled' : 'outlined'}
                            aria-pressed={selected}
                            sx={{
                              height: 36,
                              borderRadius: 999,
                              fontWeight: 800,
                              opacity: unlockedChip ? 1 : 0.56,
                              '&.MuiChip-filledPrimary': {
                                boxShadow: '0 8px 22px rgba(67,97,238,0.22)',
                              },
                              '&.MuiChip-outlined': {
                                backgroundColor: '#fff',
                                borderColor: 'rgba(31,36,48,0.13)',
                              },
                            }}
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

                    <Box
                      sx={{
                        mt: 2,
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                        gap: 1,
                      }}
                    >
                      {selectedSignals.map(({ id, signal }) => (
                        <Box
                          key={id}
                          sx={{
                            p: 1.25,
                            borderRadius: 3,
                            border: '1px solid rgba(31,36,48,0.08)',
                            backgroundColor: signal.dueForReview ? 'rgba(255,167,38,0.10)' : 'rgba(31,36,48,0.03)',
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 850 }}>
                              {CONCEPT_LABELS[id]}
                            </Typography>
                            <Chip
                              size="small"
                              label={signal.label}
                              color={signal.status === 'mastered' ? 'success' : signal.status === 'proficient' ? 'primary' : 'default'}
                              variant={signal.status === 'needs-practice' ? 'outlined' : 'filled'}
                              sx={{ height: 22, fontWeight: 800 }}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {signal.dueForReview ? signal.dueReason : `${formatPercent(signal.accuracy)} accuracy`}
                            {signal.bestLevel ? ` · best level ${signal.bestLevel}` : ''}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        border: '1px solid rgba(31,36,48,0.08)',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                        Questions
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                        Stop after a goal or keep going.
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        aria-label="How many questions"
                        value={countChoice}
                        onChange={(_e, v) => v != null && setCountChoice(v)}
                        sx={{
                          flexWrap: 'wrap',
                          gap: 1,
                          '& .MuiToggleButtonGroup-grouped': {
                            border: '1px solid rgba(31,36,48,0.12)',
                            borderRadius: '14px !important',
                            mx: 0,
                          },
                        }}
                      >
                        {PRACTICE_COUNT_PRESETS.map((n) => (
                          <ToggleButton key={n} value={n} sx={{ fontWeight: 800, px: 1.75 }}>
                            {n}
                          </ToggleButton>
                        ))}
                        <ToggleButton value="unlimited" sx={{ fontWeight: 800, px: 1.75 }}>
                          Unlimited
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        border: '1px solid rgba(31,36,48,0.08)',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                        Difficulty
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                        Let practice adapt or pin a level.
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        aria-label="Practice difficulty"
                        value={diffChoice}
                        onChange={(_e, v) => v != null && setDiffChoice(v)}
                        sx={{
                          gap: 1,
                          flexWrap: 'wrap',
                          '& .MuiToggleButtonGroup-grouped': {
                            border: '1px solid rgba(31,36,48,0.12)',
                            borderRadius: '14px !important',
                            mx: 0,
                          },
                        }}
                      >
                        <ToggleButton value="adaptive" sx={{ fontWeight: 800, px: 1.75 }}>
                          Adaptive
                        </ToggleButton>
                        <ToggleButton value="custom" sx={{ fontWeight: 800, px: 1.75 }}>
                          Fixed level
                        </ToggleButton>
                      </ToggleButtonGroup>

                      {diffChoice === 'adaptive' ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                          Starts from your mastery and adjusts as you answer.
                        </Typography>
                      ) : (
                        <Box sx={{ px: 0.5, mt: 1.5 }}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                              Level {customLevel}
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={BAND_LABEL[levelToBand(customLevel)]}
                              sx={{ fontWeight: 800, height: 22 }}
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
                  </Box>
                </Stack>

                <Box
                  sx={{
                    p: 2.25,
                    borderRadius: 4,
                    border: '1px solid rgba(67,97,238,0.18)',
                    background:
                      'linear-gradient(180deg, rgba(67,97,238,0.10), rgba(67,97,238,0.03)), #fff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                      Your session
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 850, mt: 0.25 }}>
                      {reviewMode
                        ? 'Review weak spots'
                        : selectedConcepts.length > 1
                          ? 'Mixed practice'
                          : CONCEPT_LABELS[selectedConcepts[0]]}
                    </Typography>
                  </Box>

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Topics
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {selectedConcepts.length}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Length
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {questionCountLabel}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Level
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, textAlign: 'right' }}>
                        {difficultySummary}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Review due
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {dueReviewCount}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Ready
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, textAlign: 'right' }}>
                        {masteryCounts.mastered} mastered · {masteryCounts.proficient} proficient
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Readiness
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, textAlign: 'right' }}>
                        {readinessSummary.label}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Divider />

                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      border: '1px solid rgba(31,36,48,0.08)',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850 }}>
                      Practice plan
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 750 }}>
                      {reviewCopy}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {mixCopy} Retrieval prompts ask what to try before calculating.
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {selectedConcepts.map((id) => (
                      <Chip key={id} size="small" label={CONCEPT_LABELS[id]} sx={{ fontWeight: 700 }} />
                    ))}
                  </Box>

                  <Box sx={{ flexGrow: 1 }} />

                  <Button
                    onClick={startSession}
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={selectedConcepts.length === 0}
                    sx={{ py: 1.15, borderRadius: 3, fontWeight: 850 }}
                  >
                    {reviewMode
                      ? `Start review (${selectedConcepts.length} topic${selectedConcepts.length === 1 ? '' : 's'})`
                      : selectedConcepts.length > 1
                      ? `Start mixed practice (${selectedConcepts.length} topics)`
                      : 'Start practice'}
                  </Button>
                  <Stack direction="row" spacing={1} justifyContent="center">
                    <Button component={RouterLink} to="/course" variant="text" size="small">
                      Course
                    </Button>
                    <Button component={RouterLink} to="/exam" variant="text" size="small">
                      Final exam
                    </Button>
                  </Stack>
                </Box>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  // ---- Summary phase -------------------------------------------------------
  if (phase === 'summary') {
    const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
    const practicedConcepts = activeConcepts.filter((id) => (statsByConcept[id]?.answered ?? 0) > 0);
    const practicedLabels = practicedConcepts.map((id) => CONCEPT_LABELS[id]);
    const dueReviewAccuracy =
      dueReviewStats.answered > 0 ? Math.round((dueReviewStats.correct / dueReviewStats.answered) * 100) : null;
    const movementCopy = masteryMovementCopy(practicedConcepts, startLevelsByConcept, maxLevelsByConcept);
    const firstTryLabel = stats.answered > 0 ? `${accuracy}%` : 'No answers yet';
    const highestLevel = Math.max(
      maxLevelSeen,
      ...practicedConcepts.map((id) => maxLevelsByConcept[id] ?? levelsByConcept[id] ?? MIN_LEVEL),
    );
    const remediationConcept =
      practicedConcepts
        .filter((id) => {
          const conceptStats = statsByConcept[id];
          return conceptStats && conceptStats.correct < conceptStats.answered;
        })
        .sort((a, b) => {
          const missedA = (statsByConcept[a]?.answered ?? 0) - (statsByConcept[a]?.correct ?? 0);
          const missedB = (statsByConcept[b]?.answered ?? 0) - (statsByConcept[b]?.correct ?? 0);
          return missedB - missedA;
        })[0] ?? null;
    const remediationStats = remediationConcept ? statsByConcept[remediationConcept] : null;
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
              You practiced{' '}
              <strong>
                {practicedLabels.length > 1
                  ? `${practicedLabels.length} topics: ${practicedLabels.join(', ')}`
                  : practicedLabels[0] ?? CONCEPT_LABELS[concept]}
              </strong>{' '}
              and reached the <strong>{BAND_LABEL[levelToBand(highestLevel)]}</strong> level (level {highestLevel}).
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.25,
                mb: 2.5,
              }}
            >
              <SummaryMetric label="Concept mix" value={practicedConcepts.length} detail={conceptTrail(practicedConcepts)} />
              <SummaryMetric
                label="Due review"
                value={`${dueReviewStats.answered}/${stats.answered}`}
                detail={
                  dueReviewStats.answered > 0
                    ? `${dueReviewAccuracy}% correct on review items`
                    : `${dueReviewConcepts.length} due topic${dueReviewConcepts.length === 1 ? '' : 's'} at start`
                }
              />
              <SummaryMetric label="Retrieval accuracy" value={firstTryLabel} detail="First try before feedback" />
              <SummaryMetric label="Mastery signal" value={movementCopy} detail="Based on level movement this session" />
            </Box>
            {practicedConcepts.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
                {practicedConcepts.map((id) => {
                  const conceptStats = statsByConcept[id];
                  const conceptAccuracy =
                    conceptStats && conceptStats.answered > 0
                      ? Math.round((conceptStats.correct / conceptStats.answered) * 100)
                      : 0;
                  return (
                    <Chip
                      key={id}
                      size="small"
                      label={`${CONCEPT_LABELS[id]} · ${conceptStats?.answered ?? 0} q · ${conceptAccuracy}%`}
                      sx={{ fontWeight: 750 }}
                    />
                  );
                })}
              </Box>
            )}
            {remediationConcept && remediationStats && (
              <PracticeRemediationCard
                concept={remediationConcept}
                recentMistakes={[
                  `${remediationStats.answered - remediationStats.correct} missed out of ${remediationStats.answered} ${CONCEPT_LABELS[remediationConcept]} questions`,
                  `Highest ${CONCEPT_LABELS[remediationConcept]} level reached: ${
                    maxLevelsByConcept[remediationConcept] ?? levelsByConcept[remediationConcept] ?? highestLevel
                  }`,
                ]}
              />
            )}
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
  const currentStreak = streaksByConcept[concept] ?? 0;
  const currentSignal = practiceSignals[concept];
  const topicLabel = activeConcepts.length > 1 ? `Mixed practice · ${activeConcepts.length} topics` : CONCEPT_LABELS[concept];
  const unlimited = countChoice === 'unlimited';
  const total = unlimited ? 0 : countChoice;
  const isFinalQuestion = !unlimited && stats.answered >= total;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <SessionHeader
        aiOn={aiOn}
        title={reviewMode ? 'Review weak spots' : undefined}
        subtitle={reviewMode ? 'Work through the recommended topics and watch what improves.' : undefined}
        right={
          <Button onClick={newSession} variant="text" size="small" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            End &amp; restart
          </Button>
        }
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Chip size="small" color="primary" variant="outlined" label={topicLabel} sx={{ fontWeight: 700 }} />
        {dueReviewConcepts.includes(concept) && (
          <Chip size="small" color="warning" label="Review due" sx={{ fontWeight: 800 }} />
        )}
        {currentSignal && (
          <Chip size="small" variant="outlined" label={currentSignal.label} sx={{ fontWeight: 700 }} />
        )}
        <Chip size="small" variant="outlined" label={`${BAND_LABEL[band]} · Level ${level}`} sx={{ fontWeight: 700 }} />
        {diffChoice === 'custom' && (
          <Chip size="small" variant="outlined" label="Fixed difficulty" sx={{ fontWeight: 700 }} />
        )}
        {currentStreak >= 2 && (
          <Chip size="small" color="warning" label={`${currentStreak} in a row`} sx={{ fontWeight: 700 }} />
        )}
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
        hideConceptLabel={activeConcepts.length > 1}
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

function SummaryMetric({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 3,
        border: '1px solid rgba(31,36,48,0.08)',
        backgroundColor: 'rgba(31,36,48,0.03)',
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 850, mt: 0.25 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Box>
  );
}

function PracticeRemediationCard({
  concept,
  recentMistakes,
}: {
  concept: ConceptId;
  recentMistakes: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(`Quick review: ${CONCEPT_LABELS[concept]}`);
  const [review, setReview] = useState('');
  const [usedAI, setUsedAI] = useState(false);
  const mistakesKey = recentMistakes.join('\n');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    aiRemediation({ conceptId: concept, recentMistakes: mistakesKey.split('\n').filter(Boolean) })
      .then((result) => {
        if (cancelled) return;
        setTitle(result.title);
        setReview(result.review);
        setUsedAI(result.usedAI);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [concept, mistakesKey]);

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
        {title}
      </Typography>
      <AIAssistPanel loading={loading} text={review} aiTag={usedAI} />
    </Box>
  );
}

/** Shared page header for the practice surface. */
function SessionHeader({
  aiOn,
  right,
  title = 'Adaptive practice',
  subtitle,
}: {
  aiOn: boolean;
  right?: ReactNode;
  title?: string;
  subtitle?: string;
}) {
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
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
          {subtitle ?? (
            <>
              Fresh problems tuned to your level.{' '}
              {aiOn ? 'AI explains anything you miss.' : 'Worked solutions are always one tap away.'}
            </>
          )}
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
