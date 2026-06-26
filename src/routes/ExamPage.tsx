import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useUserSummary } from '../hooks/useUserSummary';
import { useAuth } from '../contexts/AuthContext';
import { recordPracticeResult, type UserSummary } from '../services/progressService';
import { CONCEPT_LABELS, generateProblem } from '../services/ai/conceptSchemas';
import type { ConceptId, GeneratedProblem } from '../services/ai/types';
import {
  BAND_LABEL,
  DEFAULT_EXAM_CONFIG,
  EXAM_COUNT_PRESETS,
  MAX_LEVEL,
  MIN_LEVEL,
  bandToLevel,
  buildExamSlots,
  levelToBand,
  type ExamConfig,
} from '../services/practiceService';
import { getEffectiveStatus } from '../services/lessonProgression';
import { completedLessonCount, isExamUnlocked, totalLessonCount } from '../services/practiceAccess';
import GeneratedProblemCard from '../components/practice/GeneratedProblemCard';

interface ExamResult {
  problem: GeneratedProblem;
  answer: string;
  correct: boolean;
}

/**
 * The configurable final exam. The learner picks how many questions and at what
 * difficulty, then sits a finite, graded paper (no hints/explanations) and gets
 * a per-concept breakdown plus a full answer review at the end. Every answer is
 * graded against the exact solver value. Unlocks only once every lesson on the
 * path is complete.
 */
export default function ExamPage() {
  const { summary, loading } = useUserSummary();
  const { user } = useAuth();

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  const getStatus = (lessonId: string) => getEffectiveStatus(lessonId, summary, user?.uid);
  if (!isExamUnlocked(getStatus)) {
    return <ExamLocked completed={completedLessonCount(getStatus)} total={totalLessonCount()} />;
  }

  return <ExamInner summary={summary} />;
}

/**
 * The exam stays locked until every lesson on the course path is complete. We
 * show the gate (rather than hiding the route) with explicit progress so the
 * learner knows exactly what stands between them and the final.
 */
function ExamLocked({ completed, total }: { completed: number; total: number }) {
  const remaining = Math.max(total - completed, 0);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Typography sx={{ fontSize: 48, lineHeight: 1, mb: 1 }} aria-hidden>
            🔒
          </Typography>
          <Chip label="Final exam locked" color="default" sx={{ fontWeight: 800, mb: 1.5 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Finish the course to unlock the final
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
            The final exam covers every concept at once. Complete all lessons on the path first — you have{' '}
            {remaining === 0 ? 'finished them all' : `${remaining} lesson${remaining === 1 ? '' : 's'} to go`}.
          </Typography>

          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
              Lessons completed
            </Typography>
            <Typography variant="body2" className="numeric" sx={{ fontWeight: 700 }}>
              {completed} / {total}
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 999, mb: 3 }} />

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button component={RouterLink} to="/course" variant="contained">
              Back to the course
            </Button>
            <Button component={RouterLink} to="/practice" variant="outlined">
              Practice what you know
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

function ExamInner({ summary }: { summary: UserSummary | null }) {
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [baseSeed, setBaseSeed] = useState(1);

  if (!config) {
    return (
      <ExamSetup
        onStart={(cfg) => {
          setBaseSeed(1 + Math.floor(Math.random() * 9000));
          setConfig(cfg);
        }}
      />
    );
  }

  return (
    <ExamRunner
      summary={summary}
      config={config}
      baseSeed={baseSeed}
      onReconfigure={() => setConfig(null)}
    />
  );
}

/** Pre-exam setup: choose the number of questions and the difficulty. */
function ExamSetup({ onStart }: { onStart: (config: ExamConfig) => void }) {
  const [countChoice, setCountChoice] = useState<number>(DEFAULT_EXAM_CONFIG.questionCount);
  const [diffChoice, setDiffChoice] = useState<'adaptive' | 'custom'>('adaptive');
  const [customLevel, setCustomLevel] = useState(6);

  const start = () =>
    onStart({
      questionCount: countChoice,
      difficultyMode: diffChoice === 'adaptive' ? 'adaptive' : customLevel,
    });

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Final exam
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
            Set up your paper, then sit it straight through — no hints until you finish, then a full breakdown.
          </Typography>
        </Box>
        <Button component={RouterLink} to="/course" variant="text" size="small">
          Exit
        </Button>
      </Stack>

      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            Number of questions
          </Typography>
          <Box sx={{ mt: 0.5, mb: 2 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              aria-label="Number of exam questions"
              value={countChoice}
              onChange={(_e, v) => v != null && setCountChoice(v)}
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              {EXAM_COUNT_PRESETS.map((n) => (
                <ToggleButton key={n} value={n} sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                  {n}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              The 7-question paper covers each concept once; longer papers cycle back through the concepts.
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            Difficulty
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              aria-label="Exam difficulty"
              value={diffChoice}
              onChange={(_e, v) => v != null && setDiffChoice(v)}
              sx={{ gap: 1 }}
            >
              <ToggleButton value="adaptive" sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                Based on my mastery
              </ToggleButton>
              <ToggleButton value="custom" sx={{ fontWeight: 700, px: 2, borderRadius: 2 }}>
                Fixed level
              </ToggleButton>
            </ToggleButtonGroup>

            {diffChoice === 'adaptive' ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Each question is pitched to how well you've mastered the lesson that teaches it.
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
                  aria-label="Exam difficulty level"
                />
                <Typography variant="caption" color="text.secondary">
                  Every question on the paper stays at this level.
                </Typography>
              </Box>
            )}
          </Box>

          <Button onClick={start} variant="contained" size="large" sx={{ mt: 3 }}>
            Start exam
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}

/** Numeric level a generated problem was pitched at (numeric level or legacy band). */
function problemLevel(problem: GeneratedProblem): number {
  return problem.level ?? bandToLevel(problem.difficulty);
}

function ExamRunner({
  summary,
  config,
  baseSeed,
  onReconfigure,
}: {
  summary: UserSummary | null;
  config: ExamConfig;
  baseSeed: number;
  onReconfigure: () => void;
}) {
  const { user } = useAuth();
  // Pin the paper for this (summary, baseSeed, config) so a re-render never
  // reshuffles the questions mid-exam.
  const slots = useMemo(() => buildExamSlots(summary, baseSeed, config), [summary, baseSeed, config]);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [finished, setFinished] = useState(false);

  const total = slots.length;
  const current = slots[index];
  const problem = useMemo(
    () => generateProblem(current.conceptId, current.difficulty, current.seed),
    [current],
  );

  const handleFirstResult = (correct: boolean, answer: string) => {
    setResults((prev) => [...prev, { problem, answer, correct }]);
  };

  const handleNext = () => {
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex((prev) => prev + 1);
    }
  };

  // Once finished, fold the exam's per-concept performance into the learner's
  // practice stats (best-effort; no-op for guests).
  useEffect(() => {
    if (!finished || !user?.uid || results.length === 0) return;
    const byConcept = new Map<ConceptId, { answered: number; correct: number; level: number }>();
    for (const r of results) {
      const c = r.problem.conceptId;
      const agg = byConcept.get(c) ?? { answered: 0, correct: 0, level: 0 };
      agg.answered += 1;
      agg.correct += r.correct ? 1 : 0;
      agg.level = Math.max(agg.level, problemLevel(r.problem));
      byConcept.set(c, agg);
    }
    for (const [conceptId, agg] of byConcept) {
      void recordPracticeResult(user.uid, conceptId, {
        answered: agg.answered,
        correct: agg.correct,
        levelReached: agg.level,
      });
    }
    // Record exactly once on the finish transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = pct >= 80;
    const missed = results.filter((r) => !r.correct);

    return (
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
        <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Chip
              label={passed ? 'Passed' : 'Keep practicing'}
              color={passed ? 'success' : 'warning'}
              sx={{ fontWeight: 800, mb: 1.5 }}
            />
            <Typography variant="h4" component="h1" gutterBottom>
              You scored {correctCount}/{total} ({pct}%)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
              {passed
                ? 'Strong work — you can reason across every probability concept in the course.'
                : 'Good effort. Review the questions below and drill the concepts you missed.'}
            </Typography>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Review your answers
            </Typography>
            <Stack spacing={1} sx={{ mt: 1, mb: 3 }}>
              {results.map((result, i) => (
                <Accordion
                  key={`${result.problem.id}-${i}`}
                  disableGutters
                  square={false}
                  sx={{
                    border: '1px solid rgba(31,36,48,0.08)',
                    borderRadius: 2,
                    '&:before': { display: 'none' },
                    bgcolor: result.correct ? 'rgba(46,125,50,0.05)' : 'rgba(237,108,2,0.06)',
                  }}
                >
                  <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ width: '100%', pr: 1, flexWrap: 'wrap', gap: 0.5 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box
                          component="span"
                          aria-hidden
                          sx={{ fontWeight: 900, color: result.correct ? 'success.dark' : 'warning.dark' }}
                        >
                          {result.correct ? '✓' : '✗'}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Q{i + 1}. {CONCEPT_LABELS[result.problem.conceptId]}
                        </Typography>
                      </Stack>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={result.correct ? 'Correct' : 'Missed'}
                        color={result.correct ? 'success' : 'warning'}
                        sx={{ fontWeight: 700, height: 22 }}
                      />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.5 }}>
                      {result.problem.prompt}
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                          Your answer
                        </Typography>
                        <Typography
                          variant="body2"
                          className="numeric"
                          sx={{ fontWeight: 700, color: result.correct ? 'success.dark' : 'warning.dark' }}
                        >
                          {result.answer || '—'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                          Correct answer
                        </Typography>
                        <Typography variant="body2" className="numeric" sx={{ fontWeight: 700 }}>
                          {result.problem.unit ?? ''}
                          {result.problem.acceptedAnswer}
                        </Typography>
                      </Box>
                    </Stack>
                    <Divider sx={{ mb: 1 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                      Worked solution
                    </Typography>
                    <Stack component="ol" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
                      {result.problem.solution.steps.map((step, si) => (
                        <Typography key={si} component="li" variant="body2" sx={{ lineHeight: 1.5 }}>
                          <Box component="span" sx={{ fontWeight: 700 }}>
                            {step.label}:
                          </Box>{' '}
                          <Box component="span" className="numeric">
                            {step.value}
                          </Box>
                        </Typography>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {missed.length > 0 && (
                <Button
                  component={RouterLink}
                  to={`/practice?concept=${missed[0].problem.conceptId}`}
                  variant="contained"
                >
                  Practice {CONCEPT_LABELS[missed[0].problem.conceptId]}
                </Button>
              )}
              <Button onClick={onReconfigure} variant="outlined">
                New exam
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

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Final exam
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
            No hints until you finish — then you will get a full breakdown.
          </Typography>
        </Box>
        <Button onClick={onReconfigure} variant="text" size="small">
          Exit
        </Button>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
            Question {index + 1} of {total}
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={(index / total) * 100} sx={{ height: 8, borderRadius: 999 }} />
      </Box>

      <GeneratedProblemCard
        key={problem.id}
        problem={problem}
        index={index + 1}
        hideExplanations
        onFirstResult={handleFirstResult}
        onNext={handleNext}
        nextLabel={index + 1 >= total ? 'Finish exam' : 'Next question'}
      />
    </Container>
  );
}
