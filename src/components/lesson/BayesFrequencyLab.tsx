import { Box, Card, CardContent, Chip, Slider, Stack, Typography } from '@mui/material';
import { useState } from 'react';

/**
 * Interactive natural-frequencies lab for Lesson 7 (Bayes / Updating Beliefs).
 *
 * `BayesFrequencyLab` renders a 1,000-person population as a 100-dot icon array
 * (waffle), each dot worth 10 people, recolored live into the four groups —
 * true positive, false negative, false positive, true negative — as the learner
 * drags the base rate, sensitivity, and false-positive-rate sliders. The dots
 * that "test positive" (true + false positives) are outlined, because they are
 * exactly the denominator of P(condition | positive), which updates in real time
 * so the learner SEES why a positive test is often not conclusive.
 *
 * `BayesScreeningSliderLab` is a focused, single-slider variant used as the
 * answer input for a slider-to-target question: with 90 true positives fixed,
 * the learner drags the number of false alarms until a positive test is a 50/50
 * coin flip. It works controlled (the slider setting is the submitted answer) or
 * standalone.
 */

const POPULATION = 1000;
const TOTAL_DOTS = 100; // each dot = 10 people
const GRID_COLS = 10;

const COLORS = {
  tp: { fill: 'rgba(46,125,50,0.9)', label: 'True positive', soft: 'rgba(46,125,50,0.16)' },
  fn: { fill: 'rgba(120,120,120,0.5)', label: 'False negative', soft: 'rgba(120,120,120,0.16)' },
  fp: { fill: 'rgba(237,108,2,0.9)', label: 'False positive', soft: 'rgba(237,108,2,0.16)' },
  tn: { fill: 'rgba(33,113,181,0.45)', label: 'True negative', soft: 'rgba(33,113,181,0.14)' },
} as const;

type Category = keyof typeof COLORS;

/** Largest-remainder rounding so category dot counts always sum to TOTAL_DOTS. */
function toDots(counts: number[]): number[] {
  const total = counts.reduce((sum, value) => sum + value, 0) || 1;
  const exact = counts.map((count) => (count / total) * TOTAL_DOTS);
  const floors = exact.map((value) => Math.floor(value));
  let used = floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (used < TOTAL_DOTS && byRemainder.length > 0) {
    floors[byRemainder[cursor % byRemainder.length].index] += 1;
    used += 1;
    cursor += 1;
  }
  return floors;
}

function SliderRow({
  label,
  value,
  setValue,
  min,
  max,
  step,
  detail,
}: {
  label: string;
  value: number;
  setValue: (next: number) => void;
  min: number;
  max: number;
  step: number;
  detail: string;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="body2" sx={{ fontWeight: 800 }}>
          {label}
        </Typography>
        <Typography variant="body2" className="numeric" sx={{ fontWeight: 800 }}>
          {value}%
        </Typography>
      </Stack>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        size="small"
        valueLabelDisplay="auto"
        onChange={(_event, next) => setValue(Array.isArray(next) ? next[0] : next)}
        aria-label={label}
        getAriaValueText={(v) => `${label} ${v} percent`}
      />
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Box>
  );
}

export function BayesFrequencyLab() {
  const [basePct, setBasePct] = useState(10);
  const [sensPct, setSensPct] = useState(90);
  const [fprPct, setFprPct] = useState(20);

  const diseased = Math.round((POPULATION * basePct) / 100);
  const healthy = POPULATION - diseased;
  const tp = Math.round((diseased * sensPct) / 100);
  const fn = diseased - tp;
  const fp = Math.round((healthy * fprPct) / 100);
  const tn = healthy - fp;
  const totalPos = tp + fp;
  const posteriorPct = totalPos > 0 ? Math.round((tp / totalPos) * 1000) / 10 : 0;
  const tpShare = totalPos > 0 ? (tp / totalPos) * 100 : 0;

  const [tpDots, fnDots, fpDots, tnDots] = toDots([tp, fn, fp, tn]);
  const dotCategories: Category[] = [
    ...Array<Category>(tpDots).fill('tp'),
    ...Array<Category>(fnDots).fill('fn'),
    ...Array<Category>(fpDots).fill('fp'),
    ...Array<Category>(tnDots).fill('tn'),
  ];

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          {POPULATION.toLocaleString()} people — who tests positive?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Each dot is 10 people. {diseased} truly have the condition; {healthy} do not. The outlined dots are everyone who tests positive — the posterior is just the green share of that outlined group.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 0.9fr' }, gap: 2.5, alignItems: 'start' }}>
          <Box>
            <Box
              role="img"
              aria-label={`Population of 1,000: ${tp} true positives, ${fn} false negatives, ${fp} false positives, ${tn} true negatives. Posterior ${posteriorPct} percent.`}
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                gap: '4px',
                maxWidth: 300,
              }}
            >
              {dotCategories.map((category, index) => {
                const positive = category === 'tp' || category === 'fp';
                return (
                  <Box
                    key={index}
                    sx={{
                      aspectRatio: '1 / 1',
                      borderRadius: '3px',
                      bgcolor: COLORS[category].fill,
                      boxShadow: positive ? 'inset 0 0 0 2px rgba(31,36,48,0.55)' : 'none',
                      transition: 'background-color 220ms ease, box-shadow 220ms ease',
                    }}
                  />
                );
              })}
            </Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
              {(['tp', 'fp', 'fn', 'tn'] as Category[]).map((category) => (
                <Stack key={category} direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: COLORS[category].fill }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {COLORS[category].label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(46,125,50,0.12)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                P(condition | positive)
              </Typography>
              <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
                {posteriorPct}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tp} true / {totalPos} positive {totalPos > 0 ? `= ${tp}/${totalPos}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', height: 16, mt: 1, borderRadius: 999, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: `${tpShare}%`, bgcolor: COLORS.tp.fill, transition: 'width 220ms ease' }} />
                <Box sx={{ width: `${100 - tpShare}%`, bgcolor: COLORS.fp.fill, transition: 'width 220ms ease' }} />
              </Box>
            </Box>
            <SliderRow label="Base rate" value={basePct} setValue={setBasePct} min={1} max={50} step={1} detail="Share of people who truly have the condition." />
            <SliderRow label="Test sensitivity" value={sensPct} setValue={setSensPct} min={50} max={100} step={5} detail="True-positive rate among those who have it." />
            <SliderRow label="False-positive rate" value={fprPct} setValue={setFprPct} min={0} max={50} step={5} detail="Healthy people the test flags by mistake." />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// --- Controlled slider-to-target variant -------------------------------------

interface ScreeningSliderProps {
  value?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const FIXED_TRUE_POSITIVES = 90;
const TARGET_FALSE_POSITIVES = 90; // posterior = 90/(90+90) = 50%

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

export function BayesScreeningSliderLab({
  value,
  onValueChange,
  min = 0,
  max = 270,
  step = 10,
  disabled = false,
}: ScreeningSliderProps) {
  const [internal, setInternal] = useState(min);
  const controlled = value !== undefined;
  const fp = clampInt(controlled ? (value as number) : internal, min, max);

  const handleChange = (next: number) => {
    const clamped = clampInt(next, min, max);
    if (!controlled) setInternal(clamped);
    onValueChange?.(clamped);
  };

  const tp = FIXED_TRUE_POSITIVES;
  const totalPos = tp + fp;
  const posteriorPct = totalPos > 0 ? Math.round((tp / totalPos) * 1000) / 10 : 0;
  const tpShare = totalPos > 0 ? (tp / totalPos) * 100 : 0;
  const atTarget = fp === TARGET_FALSE_POSITIVES;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          A positive test: how trustworthy?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          {tp} people truly have the condition and all {tp} test positive. Drag the false alarms — healthy people who still test positive — and watch the chance a positive is real.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 0.8fr' }, gap: 2, alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
              Of {totalPos} positive tests, the green share truly has the condition:
            </Typography>
            <Box sx={{ position: 'relative', mt: 0.5 }}>
              <Box sx={{ display: 'flex', height: 26, borderRadius: 999, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: `${tpShare}%`, bgcolor: COLORS.tp.fill, transition: 'width 200ms ease' }} />
                <Box sx={{ width: `${100 - tpShare}%`, bgcolor: COLORS.fp.fill, transition: 'width 200ms ease' }} />
              </Box>
              {/* 50% target marker */}
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: -4,
                  bottom: -4,
                  left: '50%',
                  width: 0,
                  borderLeft: '2px dashed',
                  borderColor: atTarget ? 'success.main' : 'text.secondary',
                }}
              />
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
              <Chip label={`${tp} true positives`} size="small" sx={{ bgcolor: COLORS.tp.soft, fontWeight: 700 }} />
              <Chip label={`${fp} false alarms`} size="small" sx={{ bgcolor: COLORS.fp.soft, fontWeight: 700 }} />
            </Stack>
          </Box>

          <Box sx={{ p: 2, borderRadius: 4, bgcolor: atTarget ? 'rgba(46,125,50,0.16)' : 'rgba(46,125,50,0.08)', transition: 'background-color 200ms ease' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
              P(condition | positive)
            </Typography>
            <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
              {posteriorPct}%
            </Typography>
            <Chip
              label={atTarget ? 'On target: 50/50 ✓' : 'Target: 50%'}
              size="small"
              color={atTarget ? 'success' : 'default'}
              variant={atTarget ? 'filled' : 'outlined'}
              sx={{ mt: 0.5, fontWeight: 700 }}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 2.5, px: { xs: 0.5, md: 1 } }}>
          <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>
            False alarms (healthy people who still test positive):{' '}
            <Box component="span" className="numeric">
              {fp}
            </Box>
          </Typography>
          <Slider
            value={fp}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            valueLabelDisplay="auto"
            onChange={(_event, next) => handleChange(Array.isArray(next) ? next[0] : next)}
            aria-label="Number of false alarms"
            getAriaValueText={(v) => `${v} false alarms, posterior ${totalPos > 0 ? Math.round((tp / (tp + v)) * 100) : 0} percent`}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
