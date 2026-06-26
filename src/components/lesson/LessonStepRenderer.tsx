import { Box, Button, Card, CardContent, Chip, CircularProgress, FormControlLabel, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EmbeddedDemo, LessonStep, ProblemChoice, ProblemStep, QuestionStage } from '../../models/lesson';
import type { QuestionView } from '../../hooks/useLessonState';
import { parseOrderAnswer, parseSortAnswer, serializeOrderAnswer, serializeSortAnswer } from '../../services/answerCheck';
import { OrderInteraction, SortInteraction, scrambleOrderIds } from './SortOrderInteraction';
import { ArcadeRingsLab } from './ArcadeRingsLab';
import { BayesFrequencyLab, BayesScreeningSliderLab } from './BayesFrequencyLab';
import { conceptsForLessonId } from '../../services/ai/conceptSchemas';
import type { ConceptId } from '../../services/ai/types';
import { aiExplainConceptAnother, aiExplainWrongAnswer, isAIEnabled, type WrongAnswerKind } from '../../services/ai/aiService';
import { AIAssistPanel } from './AIAssistPanel';
import { CoinFlipSimulator } from './CoinFlipSimulator';
import { DiceRollSimulator } from './DiceRollSimulator';
import {
  AreaModelLab,
  BayesTableLab,
  CompoundEventsLab,
  DiceDistributionLab,
  DoubleCountTallyLab,
  DrawDependenceLab,
  ExpectedValueLab,
  MutuallyExclusiveLab,
  OutcomeCountLab,
  OverlapSliderLab,
  ProbabilitySliderLab,
  VennFigure,
  WeatherConditionalLab,
} from './LearningLabs';

const defaultQuestionView: QuestionView = {
  revealedHints: 0,
  unsuccessfulAttempts: 0,
  strongestHintUsed: false,
  activeStageIndex: 0,
  resolvedStages: [],
  revealedStages: [],
  stageUnsuccessfulAttempts: [],
  stageStrongestHintUsed: [],
};

/**
 * Initial draft for a step's answer input. For `order` problems we seed a STABLE
 * scrambled arrangement so the interaction never opens already solved; the
 * scramble is deterministically derived from the step id, so it survives
 * re-renders, restore, reveal, and reload without reshuffling mid-attempt. All
 * other formats start blank — or, for an already-answered step, at the restored
 * selectedChoice.
 */
function initialDraftForStep(step: LessonStep, selectedChoice: string | null): string {
  if (selectedChoice != null) return selectedChoice;
  if (step.type === 'problem') {
    const problem = step as ProblemStep;
    if (problem.format === 'order' && problem.orderItems && problem.orderItems.length > 0) {
      return serializeOrderAnswer(
        scrambleOrderIds(
          problem.orderItems.map((item) => item.id),
          problem.orderSolution ?? [],
          problem.stepId,
        ),
      );
    }
  }
  return '';
}

function labelForItem(items: { id: string; label: string }[], itemId: string): string {
  return items.find((item) => item.id === itemId)?.label ?? itemId;
}

function labelForBucket(buckets: { id: string; label: string }[], bucketId: string): string {
  return buckets.find((bucket) => bucket.id === bucketId)?.label ?? bucketId;
}

function describeSortAnswer(
  raw: string,
  items: { id: string; label: string }[],
  buckets: { id: string; label: string }[],
): string {
  const assignment = parseSortAnswer(raw);
  const placed = Object.entries(assignment);
  if (placed.length === 0) return 'No items placed.';

  return placed
    .map(([itemId, bucketId]) => `${labelForItem(items, itemId)} -> ${labelForBucket(buckets, bucketId)}`)
    .join('; ');
}

function describeOrderAnswer(raw: string, items: { id: string; label: string }[]): string {
  const order = parseOrderAnswer(raw);
  if (order.length === 0) return 'No ordering submitted.';
  return order.map((itemId, index) => `${index + 1}. ${labelForItem(items, itemId)}`).join('; ');
}

/**
 * In-lesson "Explain my answer" affordance. Shown only when AI is enabled so
 * the MVP lesson flow is unchanged with AI off. The explanation is grounded in
 * the deterministic solver answer (`correctAnswer`) and tuned to what the
 * learner actually entered — the model is told never to contradict the answer.
 */
function WrongAnswerAssist({
  conceptId,
  prompt,
  learnerAnswer,
  correctAnswer,
  answerKind,
  choices,
  selectedChoiceContext,
  correctChoiceContext,
  incorrectFeedback,
  explanation,
  context,
  givenFacts,
  hints: authoredHints,
  solverHint,
  onStrongestHintUsed,
}: {
  conceptId: ConceptId;
  prompt: string;
  learnerAnswer: string;
  correctAnswer: string;
  answerKind: WrongAnswerKind;
  choices?: ProblemChoice[];
  selectedChoiceContext?: ProblemChoice;
  correctChoiceContext?: ProblemChoice;
  incorrectFeedback?: string;
  explanation?: string;
  context?: string;
  givenFacts?: string[];
  hints?: string[];
  solverHint?: string;
  onStrongestHintUsed?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [hints, setHints] = useState<HintEntry[]>([]);
  const [hintLevel, setHintLevel] = useState<0 | HintDepth>(0);
  const [hintExhausted, setHintExhausted] = useState(false);
  const answerSignature = `${conceptId}\n${prompt}\n${context ?? ''}\n${answerKind}\n${learnerAnswer}\n${correctAnswer}`;
  const latestAnswerSignature = useRef(answerSignature);

  useEffect(() => {
    latestAnswerSignature.current = answerSignature;
    setLoading(false);
    setHints([]);
    setHintLevel(0);
    setHintExhausted(false);
  }, [answerSignature]);

  // Only an additive AI affordance: hidden entirely when AI is off so it never
  // just parrots the lesson's own hints. The model-backed explanation is tuned
  // to the learner's actual answer; the deterministic path is not worth showing.
  if (!isAIEnabled()) return null;

  const run = async (nextHintLevel: HintDepth) => {
    if (loading) return;
    const requestedAnswerSignature = answerSignature;
    setLoading(true);
    try {
      const result = await aiExplainWrongAnswer({
        conceptId,
        prompt,
        learnerAnswer,
        correctAnswer,
        params: {},
        answerKind,
        answerMode: 'nudge',
        hintDepth: nextHintLevel,
        choices,
        selectedChoice: selectedChoiceContext,
        correctChoice: correctChoiceContext,
        incorrectFeedback,
        explanation,
        context,
        givenFacts,
        hints: authoredHints,
        previousHints: hints.map((hint) => hint.text),
        solverHint,
      });
      // Nudge mode is answer-aware but answer-free, so the deterministic fallback
      // is safe to show when the model is unavailable.
      if (latestAnswerSignature.current === requestedAnswerSignature) {
        if (isDuplicateHint(result.explanation, hints)) {
          setHintExhausted(true);
          return;
        }
        const maxHintDepth = result.maxHintDepth ?? 3;
        const noMoreHints = result.hasMoreHints === false || nextHintLevel >= maxHintDepth || nextHintLevel >= 3;
        setHints((priorHints) => [
          ...priorHints.filter((hint) => hint.level !== nextHintLevel),
          { level: nextHintLevel, text: result.explanation, usedAI: result.usedAI },
        ]);
        setHintLevel(nextHintLevel);
        setHintExhausted(noMoreHints);
        if (noMoreHints) {
          onStrongestHintUsed?.();
        }
      }
    } finally {
      if (latestAnswerSignature.current === requestedAnswerSignature) {
        setLoading(false);
      }
    }
  };

  return (
    <Box>
      {hints.length === 0 && !loading && (
        <Button variant="outlined" size="small" onClick={() => run(1)}>
          Get a hint on your answer
        </Button>
      )}
      {hints.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {hints
            .slice()
            .sort((a, b) => a.level - b.level)
            .map((hint) => (
              <AIAssistPanel key={hint.level} title={`Hint ${hint.level}`} text={hint.text} aiTag={hint.usedAI} />
            ))}
        </Box>
      )}
      {loading && <AIAssistPanel title={`Hint ${Math.min(hintLevel + 1, 3)}`} loading />}
      {hints.length > 0 && !hintExhausted && hintLevel < 3 && (
        <Button
          variant="outlined"
          color="secondary"
          size="medium"
          onClick={() => run((hintLevel + 1) as HintDepth)}
          disabled={loading}
          sx={{ mt: 1, fontWeight: 800, px: 2 }}
        >
          Give me a stronger hint
        </Button>
      )}
    </Box>
  );
}

/**
 * In-lesson "Explain this another way" affordance for concept steps. Gated on
 * AI being enabled. Offers an alternate framing of the concept on demand.
 */
function ConceptAnotherAssist({ conceptId }: { conceptId: ConceptId }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | undefined>();
  const [usedAI, setUsedAI] = useState(false);

  // Additive only: hidden when AI is off (the offline fallback just restates the
  // concept's built-in intuition, which adds nothing over the lesson text).
  if (!isAIEnabled()) return null;

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await aiExplainConceptAnother({ conceptId });
      setText(result.explanation);
      setUsedAI(result.usedAI);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        mb: 2,
        mt: -1,
        pt: 1.25,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={0.75}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
          Want a different angle on this idea?
        </Typography>
        <Button
          variant="text"
          color="primary"
          size="small"
          onClick={run}
          disabled={loading}
          aria-expanded={Boolean(text || loading)}
          sx={{
            minHeight: 32,
            px: 1,
            fontWeight: 800,
            alignSelf: { xs: 'flex-start', sm: 'center' },
          }}
        >
          {text ? 'Try another wording' : 'Explain this another way'}
        </Button>
      </Stack>
      {(loading || text) && (
        <Box
          role="note"
          aria-live="polite"
          sx={{
            mt: 1,
            pl: 1.5,
            py: 1,
            borderLeft: '3px solid',
            borderColor: 'primary.light',
            bgcolor: 'rgba(15,111,104,0.035)',
            borderRadius: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: loading ? 0 : 0.35 }}>
            <Typography variant="caption" sx={{ fontWeight: 850, color: 'primary.dark', letterSpacing: 0.1 }}>
              Another way to see it
            </Typography>
            {usedAI && (
              <Chip
                label="AI"
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  bgcolor: 'rgba(195,95,44,0.14)',
                  color: 'secondary.main',
                }}
              />
            )}
          </Stack>
          {loading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={14} thickness={6} sx={{ color: 'primary.main' }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Thinking…
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ lineHeight: 1.5, color: 'text.secondary' }}>
              {text}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Resolve the primary concept a lesson teaches, for grounding AI affordances. */
function useLessonConcept(): ConceptId {
  const { lessonId } = useParams<{ lessonId: string }>();
  return conceptsForLessonId(lessonId ?? '')[0] ?? 'single-event';
}

// Minimal markdown-bold support for authored prompt text: turns **bold** into a
// <strong> run while leaving the rest of the string verbatim. Lesson content
// wraps the key clause of a question in ** so the ask stands out; this is the
// only markdown we honor in prompts (no italics/links) to keep it predictable.
const MARKDOWN_BOLD_PATTERN = /(\*\*[^*]+\*\*)/g;
function renderMarkdownBold(text: string) {
  return text.split(MARKDOWN_BOLD_PATTERN).map((part, index) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (match) {
      return <strong key={index}>{match[1]}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

interface LessonStepRendererProps {
  step: LessonStep;
  feedbackState: FeedbackUiState;
  selectedChoice: string | null;
  questionView?: QuestionView;
  lessonComplete?: boolean;
  /** True when revisiting an already-passed/finished step; advancing is free. */
  reviewMode?: boolean;
  /** Whether there is a later step to advance to. */
  hasNextStep?: boolean;
  onSubmitAnswer: (choice: string) => void;
  onAdvance: () => void;
  /** Reveal the accepted answer for the active free-response context. */
  onRevealAnswer?: () => void;
  /** Mark that the strongest wrong-answer hint was used for this answer context. */
  onStrongestHintUsed?: () => void;
}

function Fraction({ numerator, denominator }: { numerator: string; denominator: string }) {
  return (
    <Box
      component="span"
      className="numeric"
      sx={{
        display: 'inline-grid',
        gridTemplateRows: 'auto auto',
        alignItems: 'center',
        justifyItems: 'center',
        mx: 0.5,
        verticalAlign: 'middle',
        lineHeight: 1.05,
        fontWeight: 800,
      }}
    >
      <Box component="span" sx={{ px: 0.45, pb: 0.2, borderBottom: '2px solid currentColor' }}>
        {numerator}
      </Box>
      <Box component="span" sx={{ px: 0.45, pt: 0.2 }}>
        {denominator}
      </Box>
    </Box>
  );
}

// Split on either a probability fraction like "P(rain and cloudy) / P(cloudy)"
// or a plain digit fraction like "24/100". The probability alternative is listed
// first so it is preferred when both could apply.
// Formula token used by the coin-probability concept line. The surrounding
// prose is authored in lesson.ts; we split on this token so the authored
// prefix/suffix render verbatim with only the formula styled.
const COIN_PROBABILITY_FORMULA = 'P(heads) = 1/2 = 50%';
const INLINE_MATH_PATTERN = /(P\([^()]*\)\s*\/\s*P\([^()]*\)|\d+\s*\/\s*\d+)/g;
const PROB_FRACTION_PATTERN = /^(P\([^()]*\))\s*\/\s*(P\([^()]*\))$/;
const DIGIT_FRACTION_PATTERN = /^(\d+)\s*\/\s*(\d+)$/;

/** Render a line of text, turning inline fractions (e.g. "2/6" or "P(A and B) / P(B)") into stacked fractions. */
function renderInlineMath(text: string) {
  return text.split(INLINE_MATH_PATTERN).map((part, index) => {
    const probMatch = PROB_FRACTION_PATTERN.exec(part);
    if (probMatch) {
      return <Fraction key={index} numerator={probMatch[1]} denominator={probMatch[2]} />;
    }
    const digitMatch = DIGIT_FRACTION_PATTERN.exec(part);
    if (digitMatch) {
      return <Fraction key={index} numerator={digitMatch[1]} denominator={digitMatch[2]} />;
    }
    return <span key={index}>{part}</span>;
  });
}

// Generic, non-revealing placeholders for the free-response input. The
// per-question authored placeholder can echo the accepted answer, so we always
// show one of these neutral format examples instead. The accepted answer is
// only inspected to pick the right format hint — it is never rendered.
const FRACTION_ANSWER_PLACEHOLDER = 'e.g. 1/3, 0.33, or 33%';
const INTEGER_ANSWER_PLACEHOLDER = 'Enter a whole number';
type HintDepth = 1 | 2 | 3;
type HintEntry = { level: HintDepth; text: string; usedAI: boolean };

function normalizeHintText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hintWords(text: string): string[] {
  return normalizeHintText(text).split(' ').filter((word) => word.length > 2);
}

function hintOverlapRatio(nextText: string, priorText: string): number {
  const nextWords = hintWords(nextText);
  if (nextWords.length === 0) return 1;
  const priorWords = new Set(hintWords(priorText));
  const overlap = nextWords.filter((word) => priorWords.has(word)).length;
  return overlap / nextWords.length;
}

function isDuplicateHint(nextText: string, priorHints: HintEntry[]): boolean {
  const next = normalizeHintText(nextText);
  if (!next) return true;
  return priorHints.some((hint) => {
    const prior = normalizeHintText(hint.text);
    return next === prior || next.startsWith(prior) || prior.startsWith(next) || hintOverlapRatio(nextText, hint.text) >= 0.72;
  });
}

/**
 * Pick a generic placeholder for the answer input based on the SHAPE of the
 * accepted answer, never its value. Fractional/probability-style answers (a
 * fraction "a/b", a decimal, a percent, or anything that is not a plain whole
 * number) get the fraction example; plain counts get the whole-number hint.
 * Defaults to the fractional example for undefined/empty answers, since these
 * probability questions are overwhelmingly fractional.
 */
function answerPlaceholder(acceptedAnswer?: string): string {
  const trimmed = acceptedAnswer?.trim();
  if (!trimmed) return FRACTION_ANSWER_PLACEHOLDER;
  // A plain whole number (optionally signed) is the only "integer" case.
  if (/^[+-]?\d+$/.test(trimmed)) return INTEGER_ANSWER_PLACEHOLDER;
  return FRACTION_ANSWER_PLACEHOLDER;
}

function compactText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function problemAssistContext(problem: ProblemStep): string {
  return [
    problem.title ? `Step title: ${problem.title}` : '',
    problem.description ? `Step description: ${compactText(problem.description)}` : '',
    problem.explore?.body ? `Setup shown before question: ${compactText(problem.explore.body)}` : '',
    problem.question ? `Parent question: ${compactText(problem.question)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function priorStageContext(stages: QuestionStage[], activeIndex: number): string {
  return stages
    .slice(0, activeIndex)
    .map((stage, index) =>
      [
        `Prior part ${index + 1}: ${compactText(stage.prompt)}`,
        stage.acceptedAnswer ? `Accepted prior answer: ${stage.acceptedAnswer}` : '',
        stage.answer ? `Accepted prior choice: ${stage.answer}` : '',
        stage.explanation ? `Prior explanation: ${compactText(stage.explanation)}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('\n');
}

function stageAssistContext(problem: ProblemStep, stage: QuestionStage, stageIndex: number): string {
  return [
    problemAssistContext(problem),
    priorStageContext(problem.stages ?? [], stageIndex),
    stage.demo?.target ? `Current demo target: ${stage.demo.target}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function ConceptBody({ body }: { body: string }) {
  const lines = body.split('\n');

  return (
    <Box sx={{ mb: 3, width: '100%', fontSize: { xs: '1.05rem', md: '1.18rem' } }}>
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <Box key={`space-${index}`} sx={{ height: 22 }} />;
        }

        if (line === 'P(event) = successful outcomes / total possible outcomes') {
          return (
            <Typography key={line} variant="body1" component="div" sx={{ lineHeight: 1.6, fontSize: 'inherit' }}>
              <Box component="span" className="numeric" sx={{ fontWeight: 800 }}>
                P(event)
              </Box>{' '}
              =
              <Fraction numerator="successful outcomes" denominator="total possible outcomes" />
            </Typography>
          );
        }

        if (line.includes(COIN_PROBABILITY_FORMULA)) {
          // Split the authored line on the formula token so any prose before or
          // after it renders verbatim. The authored line already carries the
          // separating space/period (e.g. "... → " before and ". For every ..."
          // after), so we render the pieces as-is to avoid doubled or missing
          // spacing.
          const formulaStart = line.indexOf(COIN_PROBABILITY_FORMULA);
          const prefix = line.slice(0, formulaStart);
          const suffix = line.slice(formulaStart + COIN_PROBABILITY_FORMULA.length);
          return (
            <Typography key={line} variant="body1" component="div" sx={{ lineHeight: 1.6, fontSize: 'inherit' }}>
              {prefix}
              <Box component="span" className="numeric" sx={{ fontWeight: 800 }}>
                P(heads)
              </Box>{' '}
              =
              <Fraction numerator="1" denominator="2" />= 50%
              {suffix}
            </Typography>
          );
        }

        if (line === 'P(A | B) = P(A and B) / P(B)') {
          return (
            <Typography key={line} variant="body1" component="div" sx={{ lineHeight: 1.6, fontSize: 'inherit' }}>
              <Box component="span" className="numeric" sx={{ fontWeight: 800 }}>
                P(A | B)
              </Box>{' '}
              =
              <Fraction numerator="P(A and B)" denominator="P(B)" />
            </Typography>
          );
        }

        return (
          <Typography key={`${line}-${index}`} variant="body1" component="div" sx={{ lineHeight: 1.6, fontSize: 'inherit' }}>
            {renderInlineMath(line)}
          </Typography>
        );
      })}
    </Box>
  );
}

/**
 * Render an embedded interactive demo, reused by simulation steps and inline in
 * concept/question steps. Memoized so transient lesson state changes (revealing
 * a hint/answer, submitting, feedback updates) do NOT re-render the heavy
 * interactive simulators underneath — the demo only re-renders when its `demo`
 * prop actually changes. This keeps the reveal action snappy.
 */
const EmbeddedDemoView = memo(function EmbeddedDemoView({ demo }: { demo: EmbeddedDemo }) {
  switch (demo.demoType) {
        case 'coin-flip':
      return <CoinFlipSimulator rolls={demo.rolls ?? 10} target={demo.target} simplified={demo.variant === 'simple'} />;
        case 'dice-roll':
      return <DiceRollSimulator rolls={demo.rolls ?? 6} target={demo.target} />;
        case 'outcome-count':
      return <OutcomeCountLab target={demo.target} />;
        case 'dice-distribution':
      return <DiceDistributionLab target={demo.target} />;
        case 'compound-events':
      return <CompoundEventsLab target={demo.target} />;
    case 'and-multiply':
      return <AreaModelLab target={demo.target} />;
        case 'weather-conditional':
          return <WeatherConditionalLab target={demo.target} />;
    case 'draw-dependence':
      return <DrawDependenceLab target={demo.target} />;
        case 'mutually-exclusive':
      return <MutuallyExclusiveLab target={demo.target} hideTrials={demo.hideTrials} />;
    case 'double-count-tally':
      return <DoubleCountTallyLab />;
    case 'probability-slider':
      return <ProbabilitySliderLab />;
    case 'overlap-slider':
      return <OverlapSliderLab />;
    case 'expected-value-spinner':
      return <ExpectedValueLab target={demo.target} />;
    case 'arcade-rings':
      return <ArcadeRingsLab target={demo.target} />;
    case 'bayes-frequency':
      return <BayesTableLab target={demo.target} />;
    case 'bayes-frequency-lab':
      return <BayesFrequencyLab />;
    case 'bayes-screening-slider':
      return <BayesScreeningSliderLab />;
    default:
      return null;
  }
});

/**
 * Render the controlled slider lab for a `slider`-format problem, wiring the
 * slider's live value into the lesson player's draft so the slider setting is
 * the submitted answer. Switches on the bound demo's type so new slider
 * scenarios only need a new demoType + lab, not new plumbing.
 */
function ControlledSliderLab({
  demoType,
  value,
  onValueChange,
  min,
  max,
  step,
  disabled,
}: {
  demoType: EmbeddedDemo['demoType'];
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
}) {
  const props = { value, onValueChange, min, max, step, disabled };
  switch (demoType) {
    case 'overlap-slider':
      return <OverlapSliderLab {...props} />;
    case 'bayes-screening-slider':
      return <BayesScreeningSliderLab {...props} />;
    case 'probability-slider':
    default:
      return <ProbabilitySliderLab {...props} />;
  }
}

/**
 * Short orienting blurb shown above a question's demo/controls. It is styled as
 * secondary context (not as the question prompt) so the learner knows what the
 * slide is for before they interact.
 */
function StepDescription({ text }: { text: string }) {
    return (
    <Typography
      variant="body1"
      component="p"
      color="text.secondary"
      sx={{ mb: 2, lineHeight: 1.55, fontSize: { xs: '1rem', md: '1.08rem' } }}
    >
      {text}
          </Typography>
  );
}

type FeedbackUiState = 'idle' | 'correct' | 'incorrect' | 'revealed';

/**
 * Inline feedback banner that pairs a glyph + words with color (never color
 * alone). Lives on its own block row with clear spacing and wrapping so the
 * revealed answer / explanation can never overlap the input, placeholder, or
 * the choices above it.
 */
function AnswerFeedback({
  state,
  correctText,
  incorrectText,
  revealedAnswer,
}: {
  state: FeedbackUiState;
  correctText: string;
  incorrectText: string;
  revealedAnswer?: string;
}) {
  if (state === 'idle') return null;
  const isCorrect = state === 'correct';
  const isRevealed = state === 'revealed';
  const palette = isCorrect
    ? { border: 'success.main', bg: 'rgba(46,125,50,0.10)', text: 'success.dark', glyph: '✓' }
    : isRevealed
      ? { border: 'info.main', bg: 'rgba(2,136,209,0.10)', text: 'info.dark', glyph: '➜' }
      : { border: 'warning.main', bg: 'rgba(237,108,2,0.10)', text: 'text.secondary', glyph: '✗' };
  return (
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
        borderColor: palette.border,
        bgcolor: palette.bg,
        overflowWrap: 'anywhere',
      }}
    >
      <Box component="span" aria-hidden sx={{ fontWeight: 900, color: palette.text }}>
        {palette.glyph}
      </Box>
      <Typography variant="body2" className="numeric" sx={{ lineHeight: 1.45, color: palette.text, overflowWrap: 'anywhere' }}>
        <Box component="span" sx={{ fontWeight: 800, mr: 0.5 }}>
          {isCorrect ? 'Correct.' : isRevealed ? 'Answer revealed.' : 'Not quite.'}
        </Box>
        {isRevealed && revealedAnswer ? (
          <>
            The accepted answer is{' '}
            <Box component="span" sx={{ fontWeight: 800 }}>
              {revealedAnswer}
            </Box>
            . {correctText}
          </>
        ) : isCorrect ? (
          correctText
        ) : (
          incorrectText
        )}
          </Typography>
    </Box>
  );
}

interface RevealControlsProps {
  onRevealAnswer: () => void;
  unsuccessfulAttempts: number;
  strongestHintUsed: boolean;
}

/** Escape hatch for learners who are stuck after trying the adaptive nudge. */
function RevealControls({ onRevealAnswer, unsuccessfulAttempts, strongestHintUsed }: RevealControlsProps) {
  if (unsuccessfulAttempts < 2 && !strongestHintUsed) {
    return null;
  }

  return (
    <Button variant="text" size="small" color="warning" onClick={onRevealAnswer} sx={{ fontWeight: 750 }}>
      Reveal answer
    </Button>
  );
}

function FeedbackActionRow({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.25}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{ mt: 1.25 }}
      flexWrap="wrap"
      useFlexGap
    >
      {children}
    </Stack>
  );
}

/** Progressively revealed hints; announced to assistive tech as they appear. */
function HintList({ hints, revealed }: { hints?: string[]; revealed: number }) {
  if (!hints || hints.length === 0 || revealed <= 0) return null;
  const shown = hints.slice(0, revealed);
  return (
    <Box role="region" aria-label="Hints" aria-live="polite" sx={{ mt: 1.5, display: 'grid', gap: 0.75 }}>
      {shown.map((hint, index) => (
        <Box
          key={index}
            sx={{
            p: 1.25,
            borderRadius: 2,
              bgcolor: 'rgba(15,111,104,0.08)',
            display: 'flex',
            gap: 1,
            alignItems: 'flex-start',
          }}
        >
          <Box component="span" sx={{ fontWeight: 800, color: 'primary.main', whiteSpace: 'nowrap' }}>
            Hint {index + 1}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
            {hint}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

interface FreeResponseFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  unit?: string;
  disabled?: boolean;
  inputId: string;
}

function FreeResponseField({ value, onChange, onSubmit, placeholder, unit, disabled, inputId }: FreeResponseFieldProps) {
  const trimmed = value.trim();
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'flex-start' }} sx={{ mt: 1.5 }}>
      <TextField
        id={inputId}
        label="Your answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed && !disabled) {
            event.preventDefault();
            onSubmit(value);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        size="small"
        autoComplete="off"
        InputProps={unit ? { endAdornment: <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>{unit}</Typography> } : undefined}
        sx={{ minWidth: { xs: '100%', sm: 220 } }}
      />
      <Button variant="contained" onClick={() => onSubmit(value)} disabled={!trimmed || disabled} sx={{ height: 40 }}>
        Check answer
          </Button>
    </Stack>
  );
}

interface ChoiceListProps {
  choices: ProblemChoice[];
  draft: string;
  onDraftChange: (value: string) => void;
  selectedChoice: string | null;
  feedbackState: FeedbackUiState;
  explanation?: string;
  incorrectFeedback?: string;
  onSubmit: (value: string) => void;
}

function ChoiceList({ choices, draft, onDraftChange, selectedChoice, feedbackState, explanation, incorrectFeedback, onSubmit }: ChoiceListProps) {
  return (
    <>
      <RadioGroup value={draft} onChange={(event) => onDraftChange(event.target.value)} sx={{ gap: 1.25 }}>
        {choices.map((choice) => {
          const isSelected = draft === choice.value;
            const showFeedback = selectedChoice === choice.value && feedbackState !== 'idle';
            const isCorrect = feedbackState === 'correct' && showFeedback;
            const isRevealed = feedbackState === 'revealed' && showFeedback;
            const isIncorrect = feedbackState === 'incorrect' && showFeedback;

            return (
              <Box
                key={choice.value}
                sx={{
                  px: 2,
                  py: 1.25,
                  border: '1px solid',
                  borderColor: isCorrect
                    ? 'success.main'
                    : isRevealed
                      ? 'info.main'
                      : isIncorrect
                        ? 'warning.main'
                        : isSelected
                          ? 'primary.main'
                          : 'divider',
                  borderRadius: 3,
                  bgcolor: isCorrect
                    ? 'rgba(46,125,50,0.10)'
                    : isRevealed
                      ? 'rgba(2,136,209,0.10)'
                      : isIncorrect
                        ? 'rgba(237,108,2,0.10)'
                        : isSelected
                          ? 'rgba(15,111,104,0.08)'
                          : 'background.paper',
                }}
              >
                <FormControlLabel
                  value={choice.value}
                  disabled={feedbackState === 'correct' || feedbackState === 'revealed'}
                  control={<Radio />}
                  label={<span className="numeric">{choice.label}</span>}
                  sx={{ m: 0, width: '100%' }}
                />
                {showFeedback && (
                  <Typography
                    variant="body2"
                    className="numeric"
                    color={isCorrect ? 'success.dark' : isRevealed ? 'info.dark' : 'text.secondary'}
                  sx={{ display: 'block', pl: 4, pr: 1, pt: 0.5, pb: 0.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}
                  >
                  <Box component="span" aria-hidden sx={{ fontWeight: 900, mr: 0.5 }}>
                    {isCorrect ? '✓' : isRevealed ? '➜' : '✗'}
                  </Box>
                    {isCorrect
                      ? `Correct. ${explanation ?? ''}`
                      : isRevealed
                        ? `Answer revealed. ${explanation ?? ''}`
                        : incorrectFeedback ?? 'Not quite. Recall that probability = successful outcomes / total possible outcomes.'}
                  </Typography>
                )}
              </Box>
            );
          })}
        </RadioGroup>
        {feedbackState !== 'correct' && (
        <Button variant="contained" sx={{ mt: 2 }} disabled={!draft} onClick={() => onSubmit(draft)}>
            Check answer
          </Button>
        )}
    </>
  );
}

interface StageBlockProps {
  stage: QuestionStage;
  index: number;
  isActive: boolean;
  resolved: boolean;
  /** True when this stage was resolved by revealing its answer (not a correct attempt). */
  revealed: boolean;
  feedbackState: FeedbackUiState;
  revealedHints: number;
  unsuccessfulAttempts: number;
  strongestHintUsed: boolean;
  draft: string;
  selectedChoice: string | null;
  /** Concept this lesson teaches, for grounding the AI "explain my answer" affordance. */
  conceptId: ConceptId;
  /** The parent question text, used as context for the AI explanation. */
  questionPrompt: string;
  /** Full surrounding lesson context for AI hints. */
  questionContext?: string;
  onDraftChange: (value: string) => void;
  onSubmitAnswer: (value: string) => void;
  onRevealAnswer: () => void;
  onStrongestHintUsed?: () => void;
}

function StageBlock({ stage, index, isActive, resolved, revealed, feedbackState, revealedHints, unsuccessfulAttempts, strongestHintUsed, draft, selectedChoice, conceptId, questionPrompt, questionContext, onDraftChange, onSubmitAnswer, onRevealAnswer, onStrongestHintUsed }: StageBlockProps) {
  const stageChoices = stage.choices ?? [];
  const stageLearnerLabel = stageChoices.find((choice) => choice.value === selectedChoice)?.label ?? selectedChoice ?? '';
  const stageCorrectLabel = stageChoices.find((choice) => choice.value === stage.answer)?.label ?? stage.answer ?? '';
  const stagePrompt = questionPrompt ? `${questionPrompt} ${stage.prompt}` : stage.prompt;
  const solvedAndLocked = resolved && !isActive;
  const answered = feedbackState === 'correct' || feedbackState === 'revealed';
  // A revealed stage is "resolved" but must read as revealed, never correct: its
  // badge, border, and locked feedback all switch to the distinct info/blue
  // treatment used by AnswerFeedback's revealed state.
  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: resolved ? (revealed ? 'info.main' : 'success.main') : isActive ? 'primary.main' : 'divider',
        bgcolor: solvedAndLocked ? (revealed ? 'rgba(2,136,209,0.05)' : 'rgba(46,125,50,0.05)') : 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          size="small"
          label={resolved ? (revealed ? `Part ${index + 1} revealed` : `Part ${index + 1} ✓`) : `Part ${index + 1}`}
          color={resolved ? (revealed ? 'info' : 'success') : 'primary'}
          sx={{ fontWeight: 800 }}
        />
      </Stack>
      <Typography variant="body1" component="p" sx={{ mb: 1, lineHeight: 1.5, fontWeight: solvedAndLocked ? 600 : 500, fontSize: { xs: '1.02rem', md: '1.1rem' } }}>
        {renderMarkdownBold(stage.prompt)}
      </Typography>

      {solvedAndLocked ? (
        revealed ? (
          <Typography variant="body2" color="info.dark" className="numeric" sx={{ lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            <Box component="span" aria-hidden sx={{ fontWeight: 900, mr: 0.5 }}>➜</Box>
            <Box component="span" sx={{ fontWeight: 800, mr: 0.5 }}>Answer revealed.</Box>
            The accepted answer is{' '}
            <Box component="span" sx={{ fontWeight: 800 }}>{stage.format === 'free-response' ? stage.acceptedAnswer : stageCorrectLabel}</Box>
            . {stage.explanation}
          </Typography>
        ) : (
          <Typography variant="body2" color="success.dark" className="numeric" sx={{ lineHeight: 1.45 }}>
            <Box component="span" aria-hidden sx={{ fontWeight: 900, mr: 0.5 }}>✓</Box>
            {stage.explanation}
          </Typography>
        )
      ) : (
        <>
          {stage.demo && (
            <Box sx={{ mb: 1 }}>
              <EmbeddedDemoView demo={stage.demo} />
            </Box>
          )}
          {stage.format === 'free-response' ? (
            <>
              <FreeResponseField
                inputId={`stage-${stage.stageId}`}
                value={draft}
                onChange={onDraftChange}
                onSubmit={onSubmitAnswer}
                placeholder={answerPlaceholder(stage.acceptedAnswer)}
                unit={stage.unit}
                disabled={answered}
              />
              <HintList hints={stage.hints} revealed={revealedHints} />
              <AnswerFeedback
                state={feedbackState}
                correctText={stage.explanation}
                incorrectText={stage.incorrectFeedback ?? 'Not quite. Use a hint and try again.'}
                revealedAnswer={stage.acceptedAnswer}
              />
              {feedbackState === 'incorrect' && (
                <FeedbackActionRow>
                  <WrongAnswerAssist
                    conceptId={conceptId}
                    prompt={stagePrompt}
                    learnerAnswer={selectedChoice ?? ''}
                    correctAnswer={stage.acceptedAnswer ?? ''}
                    answerKind="numeric"
                    context={questionContext}
                    hints={stage.hints}
                    solverHint={stage.hints?.[stage.hints.length - 1]}
                    onStrongestHintUsed={onStrongestHintUsed}
                  />
                  {!answered && (
                    <RevealControls
                      onRevealAnswer={onRevealAnswer}
                      unsuccessfulAttempts={unsuccessfulAttempts}
                      strongestHintUsed={strongestHintUsed}
                    />
                  )}
                </FeedbackActionRow>
              )}
            </>
          ) : (
            <>
              <ChoiceList
                choices={stageChoices}
                draft={draft}
                onDraftChange={onDraftChange}
                selectedChoice={selectedChoice}
                feedbackState={feedbackState}
                explanation={stage.explanation}
                incorrectFeedback={stage.incorrectFeedback}
                onSubmit={onSubmitAnswer}
              />
              {feedbackState === 'incorrect' && (
                <FeedbackActionRow>
                  <WrongAnswerAssist
                    conceptId={conceptId}
                    prompt={stagePrompt}
                    learnerAnswer={stageLearnerLabel}
                    correctAnswer={stageCorrectLabel}
                    answerKind="choice"
                    choices={stageChoices}
                    selectedChoiceContext={stageChoices.find((choice) => choice.value === selectedChoice)}
                    correctChoiceContext={stageChoices.find((choice) => choice.value === stage.answer)}
                    incorrectFeedback={stage.incorrectFeedback}
                    explanation={stage.explanation}
                    context={questionContext}
                    hints={stage.hints}
                    onStrongestHintUsed={onStrongestHintUsed}
                  />
                  {!answered && (
                    <RevealControls
                      onRevealAnswer={onRevealAnswer}
                      unsuccessfulAttempts={unsuccessfulAttempts}
                      strongestHintUsed={strongestHintUsed}
                    />
                  )}
                </FeedbackActionRow>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}

export function LessonStepRenderer({
  step,
  feedbackState,
  selectedChoice,
  questionView = defaultQuestionView,
  lessonComplete = false,
  reviewMode = false,
  hasNextStep = true,
  onSubmitAnswer,
  onAdvance,
  onRevealAnswer = () => {},
  onStrongestHintUsed,
}: LessonStepRendererProps) {
  const activeStageIndex = questionView.activeStageIndex;
  const prefersReducedMotion = useReducedMotion();
  const lessonConcept = useLessonConcept();
  const [draft, setDraft] = useState(() => initialDraftForStep(step, selectedChoice));
  // Explore-phase gate: a problem step can open with concept content + its demo
  // and hide the question until the learner clicks Continue. Tracked locally so
  // it does not touch persisted progress; reset whenever the step changes.
  const [exploreRevealed, setExploreRevealed] = useState(false);
  // A free-response question is "answered" once it is correct OR the answer was
  // revealed; both unlock advancing and lock the input.
  const answered = feedbackState === 'correct' || feedbackState === 'revealed';
  // During review the learner can move on without re-answering; otherwise a
  // question only unlocks its advance button once answered. Concept and
  // simulation steps always advance (handled at their call sites).
  const showQuestionAdvance = reviewMode ? hasNextStep : answered && !lessonComplete;
  const showInfoAdvance = reviewMode ? hasNextStep : true;

  useEffect(() => {
    setDraft(initialDraftForStep(step, selectedChoice));
  }, [selectedChoice, step.stepId, activeStageIndex]);

  useEffect(() => {
    setExploreRevealed(false);
  }, [step.stepId]);

  if (step.type === 'concept') {
    const conceptDemoBlock = step.demo ? (
      <Box sx={{ mb: 3 }}>
        <EmbeddedDemoView demo={step.demo} />
      </Box>
    ) : null;
    return (
      <Card
        sx={{
          border: '1px solid rgba(31,36,48,0.08)',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {step.title}
          </Typography>
          {step.demoFirst && conceptDemoBlock}
          <ConceptBody body={step.body} />
          {step.figure === 'venn-or' && (
            <Box sx={{ mb: 3, maxWidth: 360 }}>
              <VennFigure />
            </Box>
          )}
          {!step.demoFirst && conceptDemoBlock}
          {step.bodyAfterDemo && <ConceptBody body={step.bodyAfterDemo} />}
          <ConceptAnotherAssist conceptId={lessonConcept} />
          {showInfoAdvance && (
            <Button variant="contained" onClick={onAdvance}>
              Next
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step.type === 'simulation') {
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="h4" gutterBottom>
            {step.title}
          </Typography>
          {/* Guidance that used to live in a separate "What to look for" box is now
              merged into the description above the demo to cut clutter. */}
          <Typography variant="body1" component="p" sx={{ mb: 1.25, lineHeight: 1.55, fontSize: { xs: '1.05rem', md: '1.15rem' } }}>
            {step.prompt}
          </Typography>
          {step.reflectionPrompt && (
            <Typography variant="body1" component="p" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.55, fontSize: { xs: '1rem', md: '1.08rem' } }}>
              {step.reflectionPrompt}
            </Typography>
          )}
          <EmbeddedDemoView demo={{ demoType: step.simulationType, target: step.config.target, rolls: step.config.rolls }} />
          {showInfoAdvance && (
            <Button variant="contained" onClick={onAdvance} sx={{ mt: 2.5 }}>
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Question step (problem). Route by format.
  const problem = step as ProblemStep;
  const format = problem.format ?? 'multiple-choice';

  if (format === 'multi-stage') {
    const stages = problem.stages ?? [];
    const allResolved = stages.length > 0 && stages.every((_, index) => questionView.resolvedStages[index]);
    // When the step has an explore phase, the question stays hidden behind a
    // Continue button until the learner is done experimenting. It is shown
    // immediately when there is no explore phase, during review (already
    // passed), once the learner has begun answering, or after the local
    // Continue has been clicked.
    const hasExplore = Boolean(problem.explore);
    const startedAnswering = activeStageIndex > 0 || questionView.resolvedStages.some(Boolean);
    const questionRevealed = !hasExplore || reviewMode || exploreRevealed || startedAnswering;
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {problem.title}
          </Typography>
          {problem.description && <StepDescription text={problem.description} />}
          {/* Explore-phase concept content and the shared demo. By default the
              lead-in text reads first, then the demo. When `demoFirst` is set the
              demo renders ABOVE the text so the step opens with the interactive
              experiment instead of a wall of prose (mirrors the single-stage
              concept step's demoFirst behavior). */}
          {(() => {
            const exploreBody = problem.explore?.body ? <ConceptBody body={problem.explore.body} /> : null;
            const sharedDemo = problem.demo ? (
              <Box sx={{ mb: 2.5 }}>
                <EmbeddedDemoView demo={problem.demo} />
              </Box>
            ) : null;
            return problem.demoFirst ? (
              <>
                {sharedDemo}
                {exploreBody}
              </>
            ) : (
              <>
                {exploreBody}
                {sharedDemo}
              </>
            );
          })()}
          {hasExplore && !questionRevealed ? (
            <Button variant="contained" size="large" onClick={() => setExploreRevealed(true)}>
              {problem.explore?.continueLabel ?? 'Continue'}
            </Button>
          ) : (
            <motion.div
              initial={prefersReducedMotion || !hasExplore ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {problem.question && (
                <Typography variant="body1" component="p" sx={{ mb: 2.5, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
                  {renderMarkdownBold(problem.question)}
                </Typography>
              )}
              <Stack spacing={2.5}>
                {stages.map((stage, index) => {
                  if (index > activeStageIndex) return null;
                  const isActive = index === activeStageIndex;
                  return (
                    <motion.div
                      key={stage.stageId}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <StageBlock
                        stage={stage}
                        index={index}
                        isActive={isActive}
                        resolved={Boolean(questionView.resolvedStages[index])}
                        revealed={Boolean(questionView.revealedStages?.[index])}
                        feedbackState={
                          isActive ? feedbackState : questionView.revealedStages?.[index] ? 'revealed' : 'correct'
                        }
                        revealedHints={isActive ? questionView.revealedHints : 0}
                        unsuccessfulAttempts={isActive ? questionView.stageUnsuccessfulAttempts?.[index] ?? 0 : 0}
                        strongestHintUsed={isActive ? questionView.stageStrongestHintUsed?.[index] ?? false : false}
                        draft={draft}
                        selectedChoice={selectedChoice}
                        conceptId={lessonConcept}
                        questionPrompt={problem.question ?? ''}
                        questionContext={stageAssistContext(problem, stage, index)}
                        onDraftChange={setDraft}
                        onSubmitAnswer={onSubmitAnswer}
                        onRevealAnswer={onRevealAnswer}
                        onStrongestHintUsed={onStrongestHintUsed}
                      />
                    </motion.div>
                  );
                })}
              </Stack>
              {(reviewMode ? hasNextStep : allResolved && !lessonComplete) && (
                <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2.5 }}>
                  Continue
                </Button>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (format === 'free-response') {
    const demoBlock = problem.demo ? (
      <Box sx={{ mb: problem.demoFirst ? 2.5 : 1 }}>
        <EmbeddedDemoView demo={problem.demo} />
      </Box>
    ) : null;
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {problem.title}
          </Typography>
          {problem.description && <StepDescription text={problem.description} />}
          {problem.demoFirst && demoBlock}
          <Typography variant="body1" component="p" sx={{ mb: 2, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
            {renderMarkdownBold(problem.question)}
          </Typography>
          {!problem.demoFirst && demoBlock}
          <FreeResponseField
            inputId={`fr-${problem.stepId}`}
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmitAnswer}
            placeholder={answerPlaceholder(problem.acceptedAnswer)}
            unit={problem.unit}
            disabled={answered}
          />
          <HintList hints={problem.hints} revealed={questionView.revealedHints} />
          <AnswerFeedback
            state={feedbackState}
            correctText={problem.explanation ?? ''}
            incorrectText={problem.incorrectFeedback ?? 'Not quite. Use a hint and try again.'}
            revealedAnswer={problem.acceptedAnswer}
          />
          {feedbackState === 'incorrect' && (
            <FeedbackActionRow>
              <WrongAnswerAssist
                conceptId={lessonConcept}
                prompt={problem.question}
                learnerAnswer={selectedChoice ?? ''}
                correctAnswer={problem.acceptedAnswer ?? ''}
                answerKind="numeric"
                context={problemAssistContext(problem)}
                hints={problem.hints}
                solverHint={problem.hints?.[problem.hints.length - 1]}
                onStrongestHintUsed={onStrongestHintUsed}
              />
              {!answered && (
                <RevealControls
                  onRevealAnswer={onRevealAnswer}
                  unsuccessfulAttempts={questionView.unsuccessfulAttempts}
                  strongestHintUsed={questionView.strongestHintUsed}
                />
              )}
            </FeedbackActionRow>
          )}
          {showQuestionAdvance && (
            <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (format === 'slider') {
    const sliderMin = problem.sliderMin ?? 0;
    const sliderMax = problem.sliderMax ?? 6;
    const sliderStep = problem.sliderStep ?? 1;
    // The draft holds the slider's current value as a string; an untouched
    // slider rests at its minimum. Submitting sends that value through the same
    // numeric grader as free-response answers.
    const sliderValue = draft === '' ? sliderMin : Number(draft);
    const demoType = problem.demo?.demoType ?? 'probability-slider';
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {problem.title}
          </Typography>
          {problem.description && <StepDescription text={problem.description} />}
          <Typography variant="body1" component="p" sx={{ mb: 2, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
            {renderMarkdownBold(problem.question)}
          </Typography>
          <Box sx={{ mb: 1 }}>
            <ControlledSliderLab
              demoType={demoType}
              value={sliderValue}
              onValueChange={(next) => setDraft(String(next))}
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              disabled={answered}
            />
          </Box>
          <Stack direction="row" sx={{ mt: 1.5 }}>
            <Button variant="contained" onClick={() => onSubmitAnswer(String(sliderValue))} disabled={answered}>
              Check answer
            </Button>
          </Stack>
          <HintList hints={problem.hints} revealed={questionView.revealedHints} />
          <AnswerFeedback
            state={feedbackState}
            correctText={problem.explanation ?? ''}
            incorrectText={problem.incorrectFeedback ?? 'Not quite. Use a hint and try again.'}
            revealedAnswer={problem.acceptedAnswer}
          />
          {feedbackState === 'incorrect' && (
            <FeedbackActionRow>
              <WrongAnswerAssist
                conceptId={lessonConcept}
                prompt={problem.question}
                learnerAnswer={selectedChoice ?? ''}
                correctAnswer={problem.acceptedAnswer ?? ''}
                answerKind="numeric"
                context={problemAssistContext(problem)}
                hints={problem.hints}
                solverHint={problem.hints?.[problem.hints.length - 1]}
                onStrongestHintUsed={onStrongestHintUsed}
              />
              {!answered && (
                <RevealControls
                  onRevealAnswer={onRevealAnswer}
                  unsuccessfulAttempts={questionView.unsuccessfulAttempts}
                  strongestHintUsed={questionView.strongestHintUsed}
                />
              )}
            </FeedbackActionRow>
          )}
          {showQuestionAdvance && (
            <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (format === 'sort') {
    const items = problem.sortItems ?? [];
    const buckets = problem.sortBuckets ?? [];
    const placedCount = Object.keys(parseSortAnswer(draft)).length;
    const allPlaced = items.length > 0 && placedCount === items.length;
    const submittedSortAnswer = selectedChoice ?? draft;
    const correctSortAnswer = serializeSortAnswer(problem.sortSolution ?? {});
    const demoBlock = problem.demo ? (
      <Box sx={{ mb: 2.5 }}>
        <EmbeddedDemoView demo={problem.demo} />
      </Box>
    ) : null;
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {problem.title}
          </Typography>
          {problem.description && <StepDescription text={problem.description} />}
          {problem.demoFirst && demoBlock}
          <Typography variant="body1" component="p" sx={{ mb: 2, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
            {renderMarkdownBold(problem.question)}
          </Typography>
          {!problem.demoFirst && demoBlock}
          <SortInteraction
            items={items}
            buckets={buckets}
            value={draft}
            onChange={setDraft}
            disabled={answered}
            feedback={feedbackState === 'correct' ? 'correct' : feedbackState === 'incorrect' ? 'incorrect' : null}
          />
          <Stack direction="row" sx={{ mt: 2 }}>
            <Button variant="contained" onClick={() => onSubmitAnswer(draft)} disabled={!allPlaced || answered}>
              Check answer
            </Button>
          </Stack>
          <HintList hints={problem.hints} revealed={questionView.revealedHints} />
          <AnswerFeedback
            state={feedbackState}
            correctText={problem.explanation ?? ''}
            incorrectText={problem.incorrectFeedback ?? 'Not quite. Re-check where each item belongs.'}
          />
          {feedbackState === 'incorrect' && (
            <FeedbackActionRow>
              <WrongAnswerAssist
                conceptId={lessonConcept}
                prompt={problem.question}
                learnerAnswer={describeSortAnswer(submittedSortAnswer, items, buckets)}
                correctAnswer={describeSortAnswer(correctSortAnswer, items, buckets)}
                answerKind="sort"
                context={problemAssistContext(problem)}
                hints={problem.hints}
                onStrongestHintUsed={onStrongestHintUsed}
              />
              {!answered && (
                <RevealControls
                  onRevealAnswer={onRevealAnswer}
                  unsuccessfulAttempts={questionView.unsuccessfulAttempts}
                  strongestHintUsed={questionView.strongestHintUsed}
                />
              )}
            </FeedbackActionRow>
          )}
          {showQuestionAdvance && (
            <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (format === 'order') {
    const items = problem.orderItems ?? [];
    // The learner's current arrangement (held in the draft) is the answer. The
    // draft is seeded with a stable scramble (see initialDraftForStep), so it
    // never opens solved; the authored order is only a defensive fallback.
    const effectiveOrder = draft || serializeOrderAnswer(items.map((item) => item.id));
    const submittedOrderAnswer = selectedChoice ?? effectiveOrder;
    const correctOrderAnswer = serializeOrderAnswer(problem.orderSolution ?? []);
    const demoBlock = problem.demo ? (
      <Box sx={{ mb: 2.5 }}>
        <EmbeddedDemoView demo={problem.demo} />
      </Box>
    ) : null;
    return (
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {problem.title}
          </Typography>
          {problem.description && <StepDescription text={problem.description} />}
          {problem.demoFirst && demoBlock}
          <Typography variant="body1" component="p" sx={{ mb: 2, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
            {renderMarkdownBold(problem.question)}
          </Typography>
          {!problem.demoFirst && demoBlock}
          <OrderInteraction
            items={items}
            value={draft}
            onChange={setDraft}
            startLabel={problem.orderStartLabel}
            endLabel={problem.orderEndLabel}
            disabled={answered}
            feedback={feedbackState === 'correct' ? 'correct' : feedbackState === 'incorrect' ? 'incorrect' : null}
          />
          <Stack direction="row" sx={{ mt: 2 }}>
            <Button variant="contained" onClick={() => onSubmitAnswer(effectiveOrder)} disabled={answered}>
              Check answer
            </Button>
          </Stack>
          <HintList hints={problem.hints} revealed={questionView.revealedHints} />
          <AnswerFeedback
            state={feedbackState}
            correctText={problem.explanation ?? ''}
            incorrectText={problem.incorrectFeedback ?? 'Not quite. Re-check the order.'}
          />
          {feedbackState === 'incorrect' && (
            <FeedbackActionRow>
              <WrongAnswerAssist
                conceptId={lessonConcept}
                prompt={problem.question}
                learnerAnswer={describeOrderAnswer(submittedOrderAnswer, items)}
                correctAnswer={describeOrderAnswer(correctOrderAnswer, items)}
                answerKind="order"
                context={problemAssistContext(problem)}
                hints={problem.hints}
                onStrongestHintUsed={onStrongestHintUsed}
              />
              {!answered && (
                <RevealControls
                  onRevealAnswer={onRevealAnswer}
                  unsuccessfulAttempts={questionView.unsuccessfulAttempts}
                  strongestHintUsed={questionView.strongestHintUsed}
                />
              )}
            </FeedbackActionRow>
          )}
          {showQuestionAdvance && (
            <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Multiple-choice (default).
  const mcChoices = problem.choices ?? [];
  const mcLearnerLabel = mcChoices.find((choice) => choice.value === selectedChoice)?.label ?? selectedChoice ?? '';
  const mcCorrectLabel = mcChoices.find((choice) => choice.value === problem.answer)?.label ?? problem.answer ?? '';
  const mcDemoBlock = problem.demo ? (
    <Box sx={{ mb: problem.demoFirst ? 2.5 : 2 }}>
      <EmbeddedDemoView demo={problem.demo} />
    </Box>
  ) : null;
  return (
    <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        <Typography variant="h4" gutterBottom>
          {problem.title}
        </Typography>
        {problem.description && <StepDescription text={problem.description} />}
        {problem.demoFirst && mcDemoBlock}
        <Typography variant="body1" component="p" sx={{ mb: 2.5, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
          {renderMarkdownBold(problem.question)}
        </Typography>
        {!problem.demoFirst && mcDemoBlock}
        <ChoiceList
          choices={mcChoices}
          draft={draft}
          onDraftChange={setDraft}
          selectedChoice={selectedChoice}
          feedbackState={feedbackState}
          explanation={problem.explanation}
          incorrectFeedback={problem.incorrectFeedback}
          onSubmit={onSubmitAnswer}
        />
        {feedbackState === 'incorrect' && (
          <FeedbackActionRow>
            <WrongAnswerAssist
              conceptId={lessonConcept}
              prompt={problem.question}
              learnerAnswer={mcLearnerLabel}
              correctAnswer={mcCorrectLabel}
              answerKind="choice"
              choices={mcChoices}
              selectedChoiceContext={mcChoices.find((choice) => choice.value === selectedChoice)}
              correctChoiceContext={mcChoices.find((choice) => choice.value === problem.answer)}
              incorrectFeedback={problem.incorrectFeedback}
              explanation={problem.explanation}
              context={problemAssistContext(problem)}
              hints={problem.hints}
              onStrongestHintUsed={onStrongestHintUsed}
            />
            {!answered && (
              <RevealControls
                onRevealAnswer={onRevealAnswer}
                unsuccessfulAttempts={questionView.unsuccessfulAttempts}
                strongestHintUsed={questionView.strongestHintUsed}
              />
            )}
          </FeedbackActionRow>
        )}
        {showQuestionAdvance && (
          <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
            Continue
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
