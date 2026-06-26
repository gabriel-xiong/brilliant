import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CONCEPT_LABELS } from '../../services/ai/conceptSchemas';
import type { GeneratedProblem } from '../../services/ai/types';
import { numericAnswersMatch } from '../../services/answerCheck';
import { aiExplainWrongAnswer, aiWorkedSolution, isAIEnabled } from '../../services/ai/aiService';
import { BAND_COLOR, BAND_LABEL, bandToLevel, levelToBand } from '../../services/practiceService';
import { AIAssistPanel } from '../lesson/AIAssistPanel';

export interface GeneratedProblemCardProps {
  problem: GeneratedProblem;
  /** 1-based index shown in the header (e.g. "Question 3"). Omit to hide. */
  index?: number;
  /**
   * Called once the learner submits their first attempt. `correct` reflects
   * that first attempt only, so callers can drive adaptive difficulty and
   * accuracy off a clean signal. `answer` is the learner's submitted text (for
   * surfaces like the exam review that replay what was entered).
   */
  onFirstResult?: (correct: boolean, answer: string) => void;
  /** Hide the worked-solution / wrong-answer AI affordances (used by the exam). */
  hideExplanations?: boolean;
  /** Label for the primary advance button shown after answering. */
  nextLabel?: string;
  /** Called when the learner clicks the advance button. Omit to hide it. */
  onNext?: () => void;
}

type Phase = 'idle' | 'correct' | 'incorrect';

/**
 * Renders one deterministically-generated problem and grades it against the
 * solver's exact answer using the same tolerant numeric matcher the lessons
 * use. Wrong answers can be explained by the AI (grounded in the solver's
 * ground-truth answer); a worked solution is available on demand. Works fully
 * with AI disabled — the panels then show the deterministic fallback prose.
 */
export function GeneratedProblemCard({
  problem,
  index,
  onFirstResult,
  hideExplanations = false,
  nextLabel = 'Next problem',
  onNext,
}: GeneratedProblemCardProps) {
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [reportedFirst, setReportedFirst] = useState(false);

  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | undefined>();
  const [explainAI, setExplainAI] = useState(false);

  const [solutionLoading, setSolutionLoading] = useState(false);
  const [solutionText, setSolutionText] = useState<string | undefined>();
  const [solutionAI, setSolutionAI] = useState(false);

  const aiOn = useMemo(() => isAIEnabled(), []);

  // Reset all per-problem state whenever the problem changes (new id).
  useEffect(() => {
    setDraft('');
    setPhase('idle');
    setReportedFirst(false);
    setExplainLoading(false);
    setExplainText(undefined);
    setExplainAI(false);
    setSolutionLoading(false);
    setSolutionText(undefined);
    setSolutionAI(false);
  }, [problem.id]);

  const conceptLabel = CONCEPT_LABELS[problem.conceptId] ?? problem.conceptId;
  const answered = phase === 'correct' || phase === 'incorrect';
  // Prefer the open-ended numeric level; fall back to the legacy band for old
  // problems. The answer key is deterministic regardless of `source`.
  const level = problem.level ?? bandToLevel(problem.difficulty);
  const band = levelToBand(level);
  const isAIScenario = problem.source === 'ai';

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || phase === 'correct') return;
    const correct = numericAnswersMatch(trimmed, problem.acceptedAnswer, problem.tolerance);
    setPhase(correct ? 'correct' : 'incorrect');
    if (!reportedFirst) {
      setReportedFirst(true);
      onFirstResult?.(correct, trimmed);
    }
  };

  const handleExplain = async () => {
    if (explainLoading) return;
    setExplainLoading(true);
    try {
      const result = await aiExplainWrongAnswer({
        conceptId: problem.conceptId,
        prompt: problem.prompt,
        learnerAnswer: draft.trim(),
        correctAnswer: problem.acceptedAnswer,
        params: problem.params,
      });
      setExplainText(result.explanation);
      setExplainAI(result.usedAI);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleWorkedSolution = async () => {
    if (solutionLoading) return;
    setSolutionLoading(true);
    try {
      const result = await aiWorkedSolution({
        conceptId: problem.conceptId,
        prompt: problem.prompt,
        solution: problem.solution,
      });
      setSolutionText(result.steps.map((step) => `• ${step}`).join('\n'));
      setSolutionAI(result.usedAI);
    } finally {
      setSolutionLoading(false);
    }
  };

  return (
    <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          {typeof index === 'number' && (
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Question {index}
            </Typography>
          )}
          <Chip size="small" label={conceptLabel} variant="outlined" sx={{ fontWeight: 700 }} />
          <Chip
            size="small"
            label={`${BAND_LABEL[band]} · Lv ${level}`}
            color={BAND_COLOR[band]}
            sx={{ fontWeight: 700 }}
          />
          {isAIScenario && aiOn && (
            <Chip
              size="small"
              label="AI scenario"
              sx={{
                fontWeight: 800,
                letterSpacing: 0.3,
                bgcolor: 'rgba(195,95,44,0.14)',
                color: 'secondary.main',
              }}
            />
          )}
        </Stack>

        <Typography variant="body1" component="p" sx={{ mb: 2, lineHeight: 1.5, fontSize: { xs: '1.05rem', md: '1.14rem' } }}>
          {problem.prompt}
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
          <TextField
            label="Your answer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim() && phase !== 'correct') {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={problem.placeholder ?? 'e.g. 1/3 or 0.33'}
            disabled={phase === 'correct'}
            size="small"
            autoComplete="off"
            InputProps={
              problem.unit
                ? {
                    startAdornment: (
                      <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                        {problem.unit}
                      </Typography>
                    ),
                  }
                : undefined
            }
            sx={{ minWidth: { xs: '100%', sm: 220 } }}
          />
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!draft.trim() || phase === 'correct'}
            sx={{ height: 40 }}
          >
            Check answer
          </Button>
        </Stack>

        {answered && (
          <Box
            role="status"
            aria-live="polite"
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 2,
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
              border: '1px solid',
              borderColor: phase === 'correct' ? 'success.main' : 'warning.main',
              bgcolor: phase === 'correct' ? 'rgba(46,125,50,0.10)' : 'rgba(237,108,2,0.10)',
            }}
          >
            <Box component="span" aria-hidden sx={{ fontWeight: 900, color: phase === 'correct' ? 'success.dark' : 'text.secondary' }}>
              {phase === 'correct' ? '✓' : '✗'}
            </Box>
            <Typography variant="body2" className="numeric" sx={{ lineHeight: 1.45 }}>
              <Box component="span" sx={{ fontWeight: 800, mr: 0.5 }}>
                {phase === 'correct' ? 'Correct.' : 'Not quite.'}
              </Box>
              {phase === 'correct'
                ? `The answer is ${problem.acceptedAnswer}.`
                : 'Check your working, or get a hint below.'}
            </Typography>
          </Box>
        )}

        {!hideExplanations && answered && (
          <>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
              {phase === 'incorrect' && (
                <Button variant="outlined" size="small" onClick={handleExplain} disabled={explainLoading}>
                  Explain my answer
                </Button>
              )}
              <Button variant="text" size="small" onClick={handleWorkedSolution} disabled={solutionLoading}>
                Show worked solution
              </Button>
            </Stack>

            {(explainLoading || explainText) && (
              <AIAssistPanel
                title="Why this was off"
                loading={explainLoading}
                text={explainText}
                aiTag={explainAI && aiOn}
              />
            )}
            {(solutionLoading || solutionText) && (
              <AIAssistPanel
                title="Worked solution"
                loading={solutionLoading}
                text={solutionText}
                aiTag={solutionAI && aiOn}
              />
            )}
          </>
        )}

        {onNext && answered && (
          <Button variant="contained" size="large" onClick={onNext} sx={{ mt: 2 }}>
            {nextLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default GeneratedProblemCard;
