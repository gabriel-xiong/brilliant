import { Box, Button, Card, CardContent, Chip, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dice3D, PIP_LAYOUTS, type FaceStyle } from './Dice3D';
import { Coin3D, type CoinFace } from './Coin3D';

interface LabProps {
  target?: string;
  /**
   * When true, a lab that can simulate trials hides its roll/reset controls and
   * any observed-frequency tally, showing only the static probability
   * visualization. The lesson renderer forwards only `target`, so a demo also
   * opts in by setting `target: 'static'`.
   */
  hideTrials?: boolean;
}

const dieSides = [1, 2, 3, 4, 5, 6];

const legendStyleVisual: Record<FaceStyle, { bg: string; border: string; color: string; tag: string }> = {
  a: { bg: 'rgba(15,111,104,0.16)', border: '#0f6f68', color: 'text.primary', tag: 'A' },
  b: { bg: 'rgba(195,95,44,0.16)', border: '#c35f2c', color: 'text.primary', tag: 'B' },
  both: { bg: 'rgba(111,63,196,0.18)', border: '#6f3fc4', color: 'text.primary', tag: 'A+B' },
};

/**
 * Compact 1–6 strip mirroring the die's highlighted faces so the full set of
 * successful faces stays readable even though the 3D die only shows ~3 at once.
 * Conveys state with a text tag (not color alone).
 */
function FaceLegend({
  litFaces = [],
  faceStyles,
  latest,
}: {
  litFaces?: number[];
  faceStyles?: Record<number, FaceStyle>;
  latest?: number;
}) {
  return (
    <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" useFlexGap aria-hidden>
      {dieSides.map((side) => {
        const style = faceStyles?.[side];
        const visual = style ? legendStyleVisual[style] : null;
        const lit = style ? true : litFaces.includes(side);
        const isLatest = latest != null && latest === side;
        return (
          <Box
            key={side}
            sx={{
              width: 40,
              borderRadius: 1.5,
              py: 0.5,
              display: 'grid',
              placeItems: 'center',
              lineHeight: 1,
              bgcolor: visual ? visual.bg : lit ? 'primary.main' : '#fffaf0',
              color: visual ? visual.color : lit ? 'primary.contrastText' : 'text.primary',
              border: '2px solid',
              borderColor: isLatest ? 'secondary.main' : visual ? visual.border : lit ? 'primary.dark' : 'divider',
              boxShadow: isLatest ? 3 : lit ? 1 : 0,
              transition: 'background-color 160ms ease, box-shadow 160ms ease',
            }}
          >
            <Box component="span" className="numeric" sx={{ fontWeight: 900, fontSize: '1.05rem' }}>
              {side}
            </Box>
            <Box component="span" sx={{ fontSize: '0.58rem', fontWeight: 800, minHeight: 12, color: visual ? visual.border : lit ? 'primary.contrastText' : 'text.secondary' }}>
              {visual ? visual.tag : lit ? 'win' : ''}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

// Up to this many dice render as full interactive-style 3D cubes (each with its
// own randomized tumble). Above it we switch to a lighter flat-pip die so big
// rolls can show a representative crowd without mounting hundreds of 3D nodes.
const FULL_3D_CAP = 24;
// Hard ceiling on simultaneously rendered dice (3D + lightweight combined). Big
// enough that "Roll 60" shows ~60 dice and large rolls (up toward 600) still
// render a dense crowd.
const DISPLAY_CAP = 600;

/**
 * Deterministic per-die tumble parameters derived from the die's index. Stable
 * across re-renders (so a die does not re-randomize every frame) yet spread out
 * enough that a group tumbles out of sync. Purely cosmetic — never touches the
 * rolled value.
 */
function tumbleFor(index: number) {
  const hash = (index * 2654435761) >>> 0;
  const r1 = (hash & 0xff) / 255;
  const r2 = ((hash >> 8) & 0xff) / 255;
  const r3 = ((hash >> 16) & 0xff) / 255;
  return {
    durationMs: 600 + Math.round(r1 * 420), // 600–1020ms
    delayMs: Math.round(r2 * 260), // 0–260ms
    seed: 1 + Math.floor(r3 * 6), // 1–6
  };
}

const MINI_DIE_PX = 30;

/**
 * Lightweight flat die: a single rounded square with flat pips and a one-shot
 * "drop in" tumble (2D transform + opacity, GPU-composited). No 3D context, no
 * infinite animation — cheap enough to render hundreds at once for big rolls.
 */
function MiniDie({ face, index }: { face: number; index: number }) {
  const { durationMs, delayMs, seed } = tumbleFor(index);
  const dir = seed % 2 === 0 ? 1 : -1;
  const startRot = dir * (120 + seed * 28);
  const keyName = `miniDieDrop${seed}`;
  const pips = PIP_LAYOUTS[face] ?? PIP_LAYOUTS[1];
  return (
    <Box
      aria-hidden
      sx={{
        width: MINI_DIE_PX,
        height: MINI_DIE_PX,
        borderRadius: 1.2,
        bgcolor: '#fffaf0',
        border: '1.5px solid rgba(31,36,48,0.2)',
        boxShadow: 'inset 0 0 6px rgba(0,0,0,0.08)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        p: '3.5px',
        boxSizing: 'border-box',
        willChange: 'transform',
        animation: `${keyName} ${durationMs}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delayMs}ms 1 both`,
        [`@keyframes ${keyName}`]: {
          '0%': { transform: `scale(0.3) rotate(${startRot}deg)`, opacity: 0 },
          '60%': { opacity: 1 },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      {pips.map((filled, i) => (
        <Box key={i} sx={{ display: 'grid', placeItems: 'center' }}>
          {filled && (
            <Box
              sx={{
                width: Math.round(MINI_DIE_PX * 0.18),
                height: Math.round(MINI_DIE_PX * 0.18),
                borderRadius: '50%',
                bgcolor: '#1f2430',
              }}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}

/**
 * A compact tray of little dice that tumble while a batch is running and settle
 * onto their rolled faces when it stops. Small batches render full 3D cubes —
 * each with its own randomized tumble so they desync. Larger batches switch to
 * the lightweight {@link MiniDie} so the tray can show a representative crowd
 * (up to {@link DISPLAY_CAP}) without tanking the framerate. Anything beyond the
 * shown dice is summarized with a "+N more" chip.
 */
function RollTray({ count, faces, rolling, hidden }: { count: number; faces: number[]; rolling: boolean; hidden: number }) {
  const dice = Array.from({ length: count }, (_, i) => ({
    i,
    face: faces[faces.length - count + i] ?? faces[i] ?? 1,
  }));
  const useLight = count > FULL_3D_CAP;

  return (
    <Box sx={{ borderRadius: 3, border: '1px dashed', borderColor: 'divider', p: 1.25, bgcolor: 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: count > 0 ? 1 : 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
          {rolling ? 'Dice rolling' : count > 0 ? 'Rolled dice' : 'Dice tray'}
        </Typography>
        {hidden > 0 && <Chip label={`+${hidden} more`} size="small" variant="outlined" />}
      </Stack>
      {count === 0 ? (
        <Typography variant="caption" color="text.secondary">
          Press a Roll button to tumble the dice.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: useLight ? 0.5 : 0.75, justifyContent: 'center' }}>
          {dice.map(({ i, face }) =>
            useLight ? (
              <MiniDie key={i} face={face} index={i} />
            ) : (
              <Dice3D
                key={i}
                size={46}
                initialFace={face}
                rolling={rolling}
                interactive={false}
                showHint={false}
                label={`Rolled die ${i + 1}`}
                {...(() => {
                  const t = tumbleFor(i);
                  return { rollDurationMs: t.durationMs, rollDelayMs: t.delayMs, rollSeed: t.seed };
                })()}
              />
            ),
          )}
        </Box>
      )}
    </Box>
  );
}

function StatCard({ label, value, detail, tone = 'primary' }: { label: string; value: string; detail: string; tone?: 'primary' | 'secondary' | 'success' }) {
  const bgByTone = {
    primary: 'rgba(15,111,104,0.13)',
    secondary: 'rgba(195,95,44,0.13)',
    success: 'rgba(46,125,50,0.12)',
  };

  return (
    <Box sx={{ p: 2, borderRadius: 4, bgcolor: bgByTone[tone] }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
        {label}
      </Typography>
      <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {detail}
      </Typography>
    </Box>
  );
}

function Frac({ top, bottom, color }: { top: number | string; bottom: number | string; color?: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        verticalAlign: 'middle',
        mx: 0.4,
        lineHeight: 1,
        color: color ?? 'inherit',
      }}
    >
      <Box component="span" className="numeric" sx={{ fontWeight: 800, fontSize: '0.92em', px: 0.4 }}>
        {top}
      </Box>
      <Box component="span" sx={{ width: '100%', borderTop: '2px solid currentColor', my: '1px' }} />
      <Box component="span" className="numeric" sx={{ fontWeight: 800, fontSize: '0.92em', px: 0.4 }}>
        {bottom}
      </Box>
    </Box>
  );
}

/**
 * Standalone, presentational Venn figure for concept slides. Not tied to any
 * interactive lab. Shows two overlapping events A and B with the intersection
 * highlighted and labeled as the "counted twice" region.
 */
export function VennFigure({ aLabel = 'A', bLabel = 'B' }: { aLabel?: string; bLabel?: string }) {
  const teal = '#0f6f68';
  const orange = '#c35f2c';
  const description = `Venn diagram of events ${aLabel} and ${bLabel}. The middle region belongs to both events, so those outcomes are counted twice when you add P(${aLabel}) and P(${bLabel}).`;
  return (
    <Box
      sx={{
        mt: 1.5,
        p: { xs: 1.5, md: 2 },
        borderRadius: 4,
        bgcolor: 'action.hover',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Box component="svg" viewBox="0 0 280 180" role="img" aria-label={description} sx={{ width: '100%', maxWidth: 300, height: 'auto' }}>
        <title>Overlap counted twice</title>
        <defs>
          <clipPath id="venn-or-clip-b">
            <circle cx="170" cy="88" r="66" />
          </clipPath>
        </defs>
        <circle cx="110" cy="88" r="66" fill="rgba(15,111,104,0.28)" stroke={teal} strokeWidth="2.5" />
        <circle cx="170" cy="88" r="66" fill="rgba(195,95,44,0.28)" stroke={orange} strokeWidth="2.5" />
        <circle cx="110" cy="88" r="66" fill="rgba(111,63,196,0.45)" stroke="none" clipPath="url(#venn-or-clip-b)" />
        <text x="66" y="84" textAnchor="middle" fontWeight="800" fontSize="20" fill={teal}>
          {aLabel}
        </text>
        <text x="214" y="84" textAnchor="middle" fontWeight="800" fontSize="20" fill={orange}>
          {bLabel}
        </text>
        <text x="140" y="84" textAnchor="middle" fontWeight="800" fontSize="13" fill="#3b2a66">
          both
        </text>
        <text x="140" y="100" textAnchor="middle" fontWeight="800" fontSize="13" fill="#3b2a66">
          counted ×2
        </text>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: '46ch' }}>
        Outcomes in the purple overlap belong to both A and B, so they are added twice — subtract them once.
      </Typography>
    </Box>
  );
}

type OutcomeEvent = {
  key: string;
  label: string;
  /** Die sides that satisfy the event. */
  sides: number[];
  /**
   * For "not E" complement events, the base event E this is the opposite of.
   * Used to frame the event as the opposite of a base event (its highlighted
   * sides are exactly the ones E leaves out).
   */
  opposite?: string;
};

// Base events (Lesson 2 step 1): a side wins when it matches the event.
const baseOutcomeEvents: OutcomeEvent[] = [
  { key: 'six', label: '6 only', sides: [6] },
  { key: 'high', label: '5 or 6', sides: [5, 6] },
  { key: 'even', label: 'Even sides', sides: [2, 4, 6] },
  { key: 'low', label: '4 or less', sides: [1, 2, 3, 4] },
];

// Complement events (Lesson 2 step 2): each "not E" highlights the sides its
// base event E leaves out, teaching that events have opposites.
const complementOutcomeEvents: OutcomeEvent[] = [
  { key: 'not-6', label: 'not 6', sides: [1, 2, 3, 4, 5], opposite: '6' },
  { key: 'not-5-6', label: 'not 5 or 6', sides: [1, 2, 3, 4], opposite: '5 or 6' },
  { key: 'not-even', label: 'not even', sides: [1, 3, 5], opposite: 'even' },
];

const outcomeEventSets: Record<string, OutcomeEvent[]> = {
  base: baseOutcomeEvents,
  complement: complementOutcomeEvents,
};

// Map every event key to the set it belongs to, so a lesson can pick which set
// of options the lab shows just by pointing the demo's `target` at one of that
// set's events (e.g. target "not-6" selects the complement set).
const outcomeEventSetByKey: Record<string, string> = Object.entries(outcomeEventSets).reduce(
  (map, [setName, events]) => {
    events.forEach((event) => {
      map[event.key] = setName;
    });
    return map;
  },
  {} as Record<string, string>,
);

export function OutcomeCountLab({ target }: LabProps) {
  // The demo's target selects which event set to show (its first event picks
  // the set). Regardless of the exact target, always open on the leftmost
  // option of the chosen set.
  const setName = (target && outcomeEventSetByKey[target]) ?? 'base';
  const events = outcomeEventSets[setName] ?? baseOutcomeEvents;
  const isComplement = setName === 'complement';

  const [eventKey, setEventKey] = useState(events[0].key);
  const activeEvent = events.find((entry) => entry.key === eventKey) ?? events[0];

  const totalSides = dieSides.length;
  const winnerFaces = activeEvent.sides;
  const percent = Math.round((winnerFaces.length / totalSides) * 1000) / 10;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          {isComplement ? 'Every event has an opposite' : 'What are we counting?'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          {isComplement
            ? 'Each option is a "not" event — the opposite of a base event. The highlighted sides are exactly the ones the base event leaves out.'
            : 'Pick one event for the same fair die. Highlighted sides are successful; every side shown is possible.'}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {events.map((entry) => (
            <Button key={entry.key} variant={eventKey === entry.key ? 'contained' : 'outlined'} onClick={() => setEventKey(entry.key)}>
              {entry.label}
            </Button>
          ))}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 4,
              bgcolor: 'action.hover',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
            }}
          >
            <Box sx={{ width: '100%', maxWidth: 260, display: 'flex', justifyContent: 'center' }}>
              <Dice3D
                litFaces={winnerFaces}
                initialFace={winnerFaces[0] ?? 1}
                responsive
                size={240}
                minSize={140}
                label={`Fair die, event ${activeEvent.label}`}
              />
            </Box>
            <FaceLegend litFaces={winnerFaces} />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'center' }}>
            <StatCard
              label="Successful"
              value={String(winnerFaces.length)}
              detail={isComplement && activeEvent.opposite ? `Sides that are NOT "${activeEvent.opposite}".` : 'Outcomes that count as wins.'}
            />
            <StatCard label="Total possible" value={String(totalSides)} detail="All outcomes in this setup." tone="secondary" />
            <Chip label={`Probability: ${winnerFaces.length}/${totalSides} = ${percent}%`} color="success" sx={{ height: 42, fontWeight: 900, fontSize: '1rem' }} />
            {isComplement && activeEvent.opposite && (
              <Typography variant="body2" color="text.secondary">
                "{activeEvent.label}" is the opposite of "{activeEvent.opposite}", so P({activeEvent.label}) = 1 − P({activeEvent.opposite}).
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * Shared props for the slider-driven labs. When `value`/`onValueChange` are
 * provided the lab is CONTROLLED — the lesson player owns the slider value so
 * the same setting is what gets submitted as the answer (slider-as-input). When
 * omitted the lab manages its own state and works as a standalone explorable
 * demo. `disabled` locks the slider once the question is answered/revealed.
 */
export interface SliderLabProps {
  value?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/** Round to the nearest integer and clamp into [min, max]; NaN falls back to min. */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

/** Visually-hidden style for screen-reader-only live status text. */
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * Lesson 2 slider lab. The learner drags a slider to set how many of a fair
 * die's six faces "win"; those faces light up live and the probability is shown
 * as a (reduced) fraction and percent. Used as the answer input for the
 * "as likely as not" problem — the slider setting IS the submitted answer.
 */
export function ProbabilitySliderLab({ value, onValueChange, min = 0, max = 6, step = 1, disabled = false }: SliderLabProps) {
  const [internal, setInternal] = useState(min);
  const controlled = value !== undefined;
  const k = clampInt(controlled ? (value as number) : internal, min, max);
  const total = 6;

  const handleChange = (next: number) => {
    const clamped = clampInt(next, min, max);
    if (!controlled) setInternal(clamped);
    onValueChange?.(clamped);
  };

  const winnerFaces = dieSides.slice(0, k); // faces 1..k light up as k grows
  const divisor = k === 0 ? 1 : gcd(k, total);
  const reducedNum = k / divisor;
  const reducedDen = total / divisor;
  const percent = Math.round((k / total) * 1000) / 10;
  const verdict = k * 2 === total ? 'As likely as not (50/50)' : k * 2 < total ? 'Less likely than not' : 'More likely than not';
  const verdictTone: 'success' | 'secondary' = k * 2 === total ? 'success' : 'secondary';

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          How likely is the event?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Drag the slider to set how many of the six faces win. Winning faces light up and the probability updates as you move it.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 4,
              bgcolor: 'action.hover',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
            }}
          >
            <Box sx={{ width: '100%', maxWidth: 260, display: 'flex', justifyContent: 'center' }}>
              <Dice3D
                litFaces={winnerFaces}
                initialFace={winnerFaces[0] ?? 1}
                responsive
                size={240}
                minSize={140}
                label={`Fair die with ${k} winning ${k === 1 ? 'face' : 'faces'}`}
              />
            </Box>
            <FaceLegend litFaces={winnerFaces} />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'center' }}>
            <StatCard label="Winning faces" value={String(k)} detail="Outcomes that count as a win." />
            <StatCard label="Total faces" value={String(total)} detail="Every outcome on the die." tone="secondary" />
            <Chip
              label={`Probability: ${k}/${total}${reducedDen !== total ? ` = ${reducedNum}/${reducedDen}` : ''} = ${percent}%`}
              color="success"
              sx={{ height: 42, fontWeight: 900, fontSize: '1rem' }}
            />
            <Chip label={verdict} color={verdictTone} variant="outlined" sx={{ height: 36, fontWeight: 800 }} />
          </Box>
        </Box>

        <Box sx={{ mt: 3, px: { xs: 1, md: 2 } }}>
          <Typography id="probability-slider-label" variant="body2" sx={{ fontWeight: 800, mb: 1 }}>
            Winning faces: <Box component="span" className="numeric">{k}</Box>
          </Typography>
          <Slider
            value={k}
            min={min}
            max={max}
            step={step}
            marks
            disabled={disabled}
            valueLabelDisplay="auto"
            onChange={(_, next) => handleChange(Array.isArray(next) ? next[0] : next)}
            aria-labelledby="probability-slider-label"
            aria-label="Number of winning die faces"
            getAriaValueText={(v) => `${v} of ${total} faces winning, probability ${Math.round((v / total) * 100)} percent`}
          />
        </Box>
        <Box aria-live="polite" sx={visuallyHidden}>
          {k} of {total} faces winning, probability {percent} percent.
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * Lesson 5 slider lab. Two events on a fair die each cover 3 of the 6 sides;
 * the learner drags a slider to set how many sides they SHARE (the overlap).
 * A live Venn diagram and the inclusion–exclusion result P(A or B) =
 * P(A) + P(B) − P(A and B) update as the overlap changes. Used as the answer
 * input for the "tune the overlap" problem — the overlap setting IS the answer.
 */
export function OverlapSliderLab({ value, onValueChange, min = 0, max = 3, step = 1, disabled = false }: SliderLabProps) {
  const [internal, setInternal] = useState(min);
  const controlled = value !== undefined;
  const overlap = clampInt(controlled ? (value as number) : internal, min, max);
  const sizeA = 3;
  const sizeB = 3;
  const total = 6;

  const handleChange = (next: number) => {
    const clamped = clampInt(next, min, max);
    if (!controlled) setInternal(clamped);
    onValueChange?.(clamped);
  };

  const aOnly = sizeA - overlap;
  const bOnly = sizeB - overlap;
  const union = aOnly + overlap + bOnly; // = sizeA + sizeB − overlap
  const divisor = gcd(union, total);
  const reducedNum = union / divisor;
  const reducedDen = total / divisor;
  const percent = Math.round((union / total) * 1000) / 10;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          How much do the events overlap?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Events A and B each cover 3 sides. Drag the slider to set how many sides they share — the overlap is double-counted when you add, so the union shrinks as it grows.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ p: { xs: 1.5, md: 2.5 }, borderRadius: 4, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box component="svg" viewBox="0 0 320 200" sx={{ width: '100%', maxWidth: 320 }} role="img" aria-label={`Event A only ${aOnly} sides, shared ${overlap} sides, event B only ${bOnly} sides`}>
              <circle cx="120" cy="105" r="80" fill="#0f6f68" fillOpacity="0.22" stroke="#0f6f68" strokeWidth="2.5" />
              <circle cx="200" cy="105" r="80" fill="#c35f2c" fillOpacity="0.22" stroke="#c35f2c" strokeWidth="2.5" />
              <text x="70" y="34" textAnchor="middle" fontWeight="800" fontSize="16" fill="#0f6f68">A</text>
              <text x="250" y="34" textAnchor="middle" fontWeight="800" fontSize="16" fill="#c35f2c">B</text>
              <text x="74" y="100" textAnchor="middle" fontWeight="900" fontSize="30" fill="#1f2430">{aOnly}</text>
              <text x="74" y="124" textAnchor="middle" fontSize="11" fill="#5b6472">A only</text>
              <text x="160" y="100" textAnchor="middle" fontWeight="900" fontSize="30" fill="#3b2a66">{overlap}</text>
              <text x="160" y="124" textAnchor="middle" fontSize="11" fill="#3b2a66">shared</text>
              <text x="246" y="100" textAnchor="middle" fontWeight="900" fontSize="30" fill="#1f2430">{bOnly}</text>
              <text x="246" y="124" textAnchor="middle" fontSize="11" fill="#5b6472">B only</text>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'center' }}>
            <StatCard label="Shared sides" value={String(overlap)} detail="Sides counted by both A and B." tone="secondary" />
            <StatCard label="Distinct sides in A or B" value={String(union)} detail="The true union, with overlap counted once." />
            <Chip
              label={`P(A or B): ${union}/${total}${reducedDen !== total ? ` = ${reducedNum}/${reducedDen}` : ''} = ${percent}%`}
              color="success"
              sx={{ height: 42, fontWeight: 900, fontSize: '1rem' }}
            />
            <Typography variant="body2" color="text.secondary">
              P(A or B) = {sizeA}/{total} + {sizeB}/{total} − {overlap}/{total} = {union}/{total}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 3, px: { xs: 1, md: 2 } }}>
          <Typography id="overlap-slider-label" variant="body2" sx={{ fontWeight: 800, mb: 1 }}>
            Shared sides: <Box component="span" className="numeric">{overlap}</Box>
          </Typography>
          <Slider
            value={overlap}
            min={min}
            max={max}
            step={step}
            marks
            disabled={disabled}
            valueLabelDisplay="auto"
            onChange={(_, next) => handleChange(Array.isArray(next) ? next[0] : next)}
            aria-labelledby="overlap-slider-label"
            aria-label="Number of shared sides between the two events"
            getAriaValueText={(v) => `${v} shared sides, union ${sizeA + sizeB - v} of ${total}`}
          />
        </Box>
        <Box aria-live="polite" sx={visuallyHidden}>
          {overlap} shared sides, P(A or B) is {union} out of {total}, {percent} percent.
        </Box>
      </CardContent>
    </Card>
  );
}

function matchesDiceEvent(value: number, event: string) {
  if (event === 'six') return value === 6;
  if (event === 'high') return value >= 5;
  if (event === 'even') return value % 2 === 0;
  return value <= 4;
}

const distributionEvents: { key: string; label: string }[] = [
  { key: 'six', label: '6 only' },
  { key: 'high', label: '5 or 6' },
  { key: 'even', label: 'Even numbers' },
  { key: 'low', label: '4 or less' },
];

const emptyEventCounts = (): Record<string, number> => ({ six: 0, high: 0, even: 0, low: 0 });

export function DiceDistributionLab(_props: LabProps) {
  const [trials, setTrials] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>(emptyEventCounts);
  const [latestRoll, setLatestRoll] = useState(1);
  const [recentRolls, setRecentRolls] = useState<number[]>([]);
  const [runSize, setRunSize] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTrials(0);
    setCounts(emptyEventCounts());
    setLatestRoll(1);
    setRecentRolls([]);
    setRunSize(0);
    setIsRunning(false);
  };

  const runTrials = (count: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    setRunSize(count);

    let completed = 0;
    const chunkSize = count >= 300 ? 8 : count >= 60 ? 4 : 1;
    const intervalMs = count >= 300 ? 16 : count >= 60 ? 28 : 80;

    intervalRef.current = setInterval(() => {
      const nextChunk = Math.min(chunkSize, count - completed);
      const nextCounts = emptyEventCounts();
      const chunkRolls: number[] = [];
      let lastRoll = latestRoll;

      for (let i = 0; i < nextChunk; i += 1) {
        const value = Math.floor(Math.random() * 6) + 1;
        distributionEvents.forEach(({ key }) => {
          if (matchesDiceEvent(value, key)) nextCounts[key] += 1;
        });
        chunkRolls.push(value);
        lastRoll = value;
      }

      setCounts((current) => ({
        six: current.six + nextCounts.six,
        high: current.high + nextCounts.high,
        even: current.even + nextCounts.even,
        low: current.low + nextCounts.low,
      }));
      setTrials((current) => current + nextChunk);
      setLatestRoll(lastRoll);
      setRecentRolls((current) => [...current, ...chunkRolls].slice(-DISPLAY_CAP));
      completed += nextChunk;

      if (completed >= count) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
      }
    }, intervalMs);
  };

  const latestMatches = distributionEvents.filter(({ key }) => matchesDiceEvent(latestRoll, key));
  // Number of dice tumbling in the tray: the whole batch when it fits under the
  // display cap, otherwise capped. Falls back to the rolls already recorded once
  // a run finishes.
  const trayCount = isRunning ? Math.min(runSize, DISPLAY_CAP) : Math.min(recentRolls.length, DISPLAY_CAP);
  const hiddenRolls = Math.max(0, (isRunning ? runSize : trials) - trayCount);

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Compare the events
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Roll a fair die many times. Each roll updates all four events at once, so their observed rates settle toward the true probabilities.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 4, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                {isRunning ? 'Rolling…' : 'Latest roll'}
              </Typography>
              <Typography variant="caption" color="text.secondary" className="numeric" sx={{ fontWeight: 800 }}>
                Showing face {latestRoll}
              </Typography>
            </Stack>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ width: '100%', maxWidth: 220, display: 'flex', justifyContent: 'center' }}>
                <Dice3D
                  litFaces={[latestRoll]}
                  initialFace={latestRoll}
                  rolling={isRunning}
                  responsive
                  size={200}
                  minSize={120}
                  label="Latest roll"
                />
              </Box>
              <FaceLegend litFaces={[latestRoll]} latest={latestRoll} />
            </Box>

            <RollTray count={trayCount} faces={recentRolls} rolling={isRunning} hidden={hiddenRolls} />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 700 }}>
                Counts toward:
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {latestMatches.length > 0 ? (
                  latestMatches.map(({ key, label }) => <Chip key={key} label={label} size="small" color="primary" />)
                ) : (
                  <Chip label="no event" size="small" />
                )}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 'auto' }}>
              {[12, 60, 300].map((count) => (
                <Button key={count} variant="contained" onClick={() => runTrials(count)} disabled={isRunning}>
                  Roll {count}
                </Button>
              ))}
              <Button variant="text" onClick={reset} disabled={trials === 0 && !isRunning}>
                Reset
              </Button>
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'center' }}>
            {distributionEvents.map(({ key, label }) => {
              const expectedSides = dieSides.filter((side) => matchesDiceEvent(side, key)).length;
              const expectedPercent = Math.round((expectedSides / 6) * 1000) / 10;
              const observedPercent = trials > 0 ? Math.round((counts[key] / trials) * 1000) / 10 : null;
              return (
                <Box key={key}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="numeric">
                      observed {observedPercent === null ? '—' : `${observedPercent}%`} · expected {expectedPercent}%
                    </Typography>
                  </Stack>
                  <Box sx={{ position: 'relative', height: 16, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: `${observedPercent ?? 0}%`,
                        height: '100%',
                        borderRadius: 999,
                        bgcolor: 'primary.main',
                        transition: 'width 180ms ease',
                      }}
                    />
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${expectedPercent}%`,
                        width: 3,
                        bgcolor: 'secondary.main',
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              <Chip label={`${trials} rolls`} />
              <Chip label="Bar = observed" color="primary" size="small" />
              <Chip label="Line = expected" color="secondary" size="small" />
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

type CoinMode = 'H' | 'T' | 'either';

type CompoundPreset = { key: string; label: string; coin: CoinMode; faces: number[]; connector: 'and' | 'or' };

// Quick-pick presets shown alongside the custom builder. The leftmost is the
// default selection, consistent with the other labs.
const compoundPresets: CompoundPreset[] = [
  { key: 'H6', label: 'Heads and 6', coin: 'H', faces: [6], connector: 'and' },
  { key: 'H-even', label: 'Heads and even', coin: 'H', faces: [2, 4, 6], connector: 'and' },
  { key: 'heads-or-6', label: 'Heads or 6', coin: 'H', faces: [6], connector: 'or' },
];

export function CompoundEventsLab(_props: LabProps) {
  // Open on the leftmost preset, then let the learner build any
  // coin-condition + die-faces + and/or event on top of it.
  const initialPreset = compoundPresets[0];
  const [coinMode, setCoinMode] = useState<CoinMode>(initialPreset.coin);
  const [dieFaces, setDieFaces] = useState<Set<number>>(() => new Set(initialPreset.faces));
  const [connector, setConnector] = useState<'and' | 'or'>(initialPreset.connector);
  const [trialCount, setTrialCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [pairCounts, setPairCounts] = useState<Record<string, number>>({});
  const [latestPair, setLatestPair] = useState('H1');
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairs = ['H', 'T'].flatMap((coin) => dieSides.map((side) => `${coin}${side}`));

  // The built event = (coin condition) connector (die-face condition).
  const coinSides: ('H' | 'T')[] = coinMode === 'either' ? ['H', 'T'] : [coinMode];
  const coinSet = new Set<'H' | 'T'>(coinSides);
  const isWinner = (pair: string) => {
    const coin = pair[0] as 'H' | 'T';
    const side = Number(pair.slice(1));
    const coinOk = coinSet.has(coin);
    const dieOk = dieFaces.has(side);
    return connector === 'and' ? coinOk && dieOk : coinOk || dieOk;
  };
  const winners = pairs.filter(isWinner);
  const expectedPercent = Math.round((winners.length / pairs.length) * 1000) / 10;
  const observedPercent = trialCount > 0 ? Math.round((hitCount / trialCount) * 1000) / 10 : null;
  const maxPairCount = Math.max(1, ...Object.values(pairCounts));
  const latestHit = isWinner(latestPair);

  // Teal highlights for the satisfying coin/die sides: the coin shows the
  // selected coin condition and the die shows the selected faces.
  const coinHighlight: CoinFace[] = coinSides.map((coin) => (coin === 'H' ? 'Heads' : 'Tails'));
  const dieHighlight = [...dieFaces].sort((a, b) => a - b);

  // At rest show the highlighted satisfying sides; after a trial show the face
  // that actually landed so the learner can read the result against them.
  const coinDisplayFace: CoinFace = trialCount > 0 ? (latestPair[0] === 'H' ? 'Heads' : 'Tails') : coinHighlight[0] ?? 'Heads';
  const dieDisplayFace = trialCount > 0 ? Number(latestPair.slice(1)) : dieHighlight[0] ?? 1;

  // Terse, live summary of the built event.
  const coinText = coinMode === 'either' ? 'either coin' : coinMode === 'H' ? 'Heads' : 'Tails';
  const dieText = dieFaces.size === 0 ? 'no face' : dieFaces.size === 6 ? 'any face' : dieHighlight.join(', ');
  const eventText = `${coinText} ${connector} ${dieText}`;

  const activePreset = compoundPresets.find(
    (preset) =>
      preset.coin === coinMode &&
      preset.connector === connector &&
      preset.faces.length === dieFaces.size &&
      preset.faces.every((face) => dieFaces.has(face)),
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const resetTrials = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTrialCount(0);
    setHitCount(0);
    setPairCounts({});
    setLatestPair('H1');
    setIsRunning(false);
  };

  const applyPreset = (preset: CompoundPreset) => {
    setCoinMode(preset.coin);
    setDieFaces(new Set(preset.faces));
    setConnector(preset.connector);
    resetTrials();
  };

  const changeCoin = (mode: CoinMode) => {
    setCoinMode(mode);
    resetTrials();
  };

  const toggleFace = (face: number) => {
    setDieFaces((prev) => {
      const next = new Set(prev);
      if (next.has(face)) next.delete(face);
      else next.add(face);
      return next;
    });
    resetTrials();
  };

  const changeConnector = (next: 'and' | 'or') => {
    if (!next) return;
    setConnector(next);
    resetTrials();
  };

  const runTrials = (totalTrials: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);

    let completed = 0;
    const chunkSize = totalTrials >= 120 ? 4 : totalTrials >= 24 ? 2 : 1;
    const intervalMs = totalTrials >= 120 ? 24 : totalTrials >= 24 ? 42 : 120;

    intervalRef.current = setInterval(() => {
      const nextChunk = Math.min(chunkSize, totalTrials - completed);
      const nextCounts: Record<string, number> = {};
      let nextHits = 0;
      let lastPair = latestPair;

      for (let i = 0; i < nextChunk; i += 1) {
        const coin = Math.random() < 0.5 ? 'H' : 'T';
        const side = Math.floor(Math.random() * 6) + 1;
        const pair = `${coin}${side}`;
        nextCounts[pair] = (nextCounts[pair] ?? 0) + 1;
        if (isWinner(pair)) nextHits += 1;
        lastPair = pair;
      }

      setPairCounts((current) => {
        const merged = { ...current };
        Object.entries(nextCounts).forEach(([pair, count]) => {
          merged[pair] = (merged[pair] ?? 0) + count;
        });
        return merged;
      });
      setTrialCount((current) => current + nextChunk);
      setHitCount((current) => current + nextHits);
      setLatestPair(lastPair);
      completed += nextChunk;

      if (completed >= totalTrials) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
      }
    }, intervalMs);
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Flip and roll together
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Build a compound event — a coin condition and die faces joined by "and" or "or." The matching pairs and the expected hit rate update live.
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5, alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', mr: 0.5 }}>
            Quick pick:
          </Typography>
          {compoundPresets.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              clickable
              onClick={() => applyPreset(preset)}
              color={activePreset?.key === preset.key ? 'primary' : 'default'}
              variant={activePreset?.key === preset.key ? 'filled' : 'outlined'}
              disabled={isRunning}
            />
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gap: 0.75, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 64 }}>
              Coin
            </Typography>
            {(['H', 'T', 'either'] as CoinMode[]).map((mode) => (
              <Button
                key={mode}
                size="small"
                onClick={() => changeCoin(mode)}
                disabled={isRunning}
                aria-pressed={coinMode === mode}
                variant={coinMode === mode ? 'contained' : 'outlined'}
              >
                {mode === 'H' ? 'Heads' : mode === 'T' ? 'Tails' : 'Either'}
              </Button>
            ))}
            <ToggleButtonGroup
              value={connector}
              exclusive
              onChange={(_event, next) => changeConnector(next as 'and' | 'or')}
              size="small"
              disabled={isRunning}
              aria-label="Connector joining the coin and die conditions"
              sx={{
                bgcolor: 'background.paper',
                '& .MuiToggleButton-root': { px: 2, py: 0.4, fontWeight: 800, textTransform: 'lowercase', borderColor: 'divider' },
                '& .Mui-selected': { color: 'primary.contrastText', bgcolor: 'primary.main' },
                '& .Mui-selected:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <ToggleButton value="and" aria-label="coin and die — both conditions must hold">
                and
              </ToggleButton>
              <ToggleButton value="or" aria-label="coin or die — either condition holds">
                or
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 64 }}>
              Die faces
            </Typography>
            {dieSides.map((face) => {
              const selected = dieFaces.has(face);
              return (
                <Button
                  key={face}
                  size="small"
                  onClick={() => toggleFace(face)}
                  disabled={isRunning}
                  aria-pressed={selected}
                  aria-label={`Die face ${face} ${selected ? 'selected' : 'not selected'}`}
                  variant={selected ? 'contained' : 'outlined'}
                  sx={{ minWidth: 44, px: 0, fontWeight: 800 }}
                >
                  {selected ? `✓${face}` : face}
                </Button>
              );
            })}
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, gap: 2 }}>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 4,
                bgcolor: trialCount === 0 ? 'action.hover' : latestHit ? 'rgba(46,125,50,0.12)' : 'rgba(195,95,44,0.10)',
                border: '1px solid',
                borderColor: trialCount > 0 && latestHit ? 'success.main' : 'divider',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: { xs: 2, md: 3 } }}>
                <Stack alignItems="center" spacing={0.5}>
                  <Coin3D
                    face={coinDisplayFace}
                    litFaces={coinHighlight}
                    spinning={isRunning}
                    size={128}
                    label="Coin result"
                  />
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                    Coin
                  </Typography>
                </Stack>
                <Box component="span" aria-hidden sx={{ fontWeight: 900, fontSize: '1.4rem', color: 'text.secondary' }}>
                  +
                </Box>
                <Stack alignItems="center" spacing={0.5} sx={{ width: { xs: 132, sm: 150 } }}>
                  <Dice3D
                    litFaces={dieHighlight}
                    initialFace={dieDisplayFace}
                    rolling={isRunning}
                    responsive
                    size={150}
                    minSize={108}
                    label="Die result"
                  />
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                    Die
                  </Typography>
                </Stack>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  {trialCount > 0 ? `Latest pair: ${latestPair}` : `Event: ${eventText}`}
                </Typography>
                <Typography variant="body2" color={trialCount > 0 && latestHit ? 'success.dark' : 'text.secondary'}>
                  {trialCount === 0
                    ? 'Teal sides win. Run a trial to flip and roll together.'
                    : latestHit
                      ? 'Hit: this pair satisfies the event.'
                      : 'Miss: this pair does not satisfy the event.'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(42px, 1fr))', gap: 1, p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
              {pairs.map((pair) => {
                const winner = isWinner(pair);
                const count = pairCounts[pair] ?? 0;
                const intensity = count / maxPairCount;
                const isLatest = pair === latestPair && trialCount > 0;
                return (
                  <Box
                    key={pair}
                    sx={{
                      minHeight: 74,
                      py: 1,
                      borderRadius: 2.5,
                      textAlign: 'center',
                      fontWeight: 900,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: winner ? `rgba(15,111,104,${0.28 + intensity * 0.72})` : `rgba(255,250,240,${0.85 + intensity * 0.15})`,
                      color: winner && intensity > 0.45 ? 'primary.contrastText' : 'text.primary',
                      border: '2px solid',
                      borderColor: isLatest ? 'secondary.main' : winner ? 'primary.main' : 'divider',
                      boxShadow: isLatest ? 4 : winner ? 1 : 0,
                      transform: isLatest ? 'translateY(-2px)' : 'translateY(0)',
                      transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 180ms ease',
                    }}
                  >
                    <span>{pair}</span>
                    <Typography variant="caption" className="numeric" sx={{ fontWeight: 800, opacity: count ? 0.85 : 0.35 }}>
                      {count}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <StatCard label="Event hits" value={String(hitCount)} detail={`${trialCount} trial${trialCount === 1 ? '' : 's'} run so far.`} />
            <StatCard label="Expected hit rate" value={`${expectedPercent}%`} detail={`${winners.length} matching pair${winners.length === 1 ? '' : 's'} out of 12.`} tone="secondary" />
            <StatCard label="Observed hit rate" value={observedPercent === null ? '-' : `${observedPercent}%`} detail="What happened in your trials." tone="success" />
            <StatCard label="All pairs" value="12" detail="2 coin results times 6 die sides." tone="secondary" />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {[1, 12, 120].map((count) => (
                <Button key={count} variant="contained" onClick={() => runTrials(count)} disabled={isRunning}>
                  Run {count}
                </Button>
              ))}
              <Button variant="text" onClick={resetTrials} disabled={trialCount === 0 && !isRunning}>
                Reset
              </Button>
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

type ConditionalRow = {
  id: number;
  condition: boolean;
  event: boolean;
};

type ConditionalFilter = 'all' | 'condition' | 'not-condition';

function percentLabel(numerator: number, denominator: number) {
  if (denominator === 0) return '-';
  const value = Math.round((numerator / denominator) * 1000) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function ConditionalProbabilityLab({
  rows,
  initialFilter,
  filterLabels,
  title,
  description,
  conditionName,
  inverseConditionName,
  eventName,
  conditionDetail,
  inverseDetail,
  allDetail,
  eventIcon,
  conditionIcon,
  cellStyles,
  legend,
}: {
  rows: ConditionalRow[];
  initialFilter: ConditionalFilter;
  filterLabels: Record<ConditionalFilter, string>;
  title: string;
  description: string;
  conditionName: string;
  inverseConditionName: string;
  eventName: string;
  conditionDetail: string;
  inverseDetail: string;
  allDetail: string;
  eventIcon: string;
  conditionIcon: string;
  cellStyles?: Record<'event' | 'condition' | 'neither', { emoji: string; bg: string; border: string; label: string }>;
  legend?: { emoji: string; label: string }[];
}) {
  const [filter, setFilter] = useState<ConditionalFilter>(initialFilter);
  const filteredRows = rows.filter((row) => {
    if (filter === 'condition') return row.condition;
    if (filter === 'not-condition') return !row.condition;
    return true;
  });
  const eventRows = filteredRows.filter((row) => row.event);
  const allEventRows = rows.filter((row) => row.event);
  const conditionRows = rows.filter((row) => row.condition);
  const conditionAndEventRows = rows.filter((row) => row.condition && row.event);
  const denominatorLabel =
    filter === 'condition'
      ? conditionName
      : filter === 'not-condition'
        ? inverseConditionName
        : 'all cases';
  const questionLabel =
    filter === 'condition'
      ? `P(${eventName} | ${conditionName})`
      : filter === 'not-condition'
        ? `P(${eventName} | ${inverseConditionName})`
        : `P(${eventName})`;
  const detail =
    filter === 'condition'
      ? conditionDetail
      : filter === 'not-condition'
        ? inverseDetail
        : allDetail;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem', maxWidth: '88ch' }}>
          {description}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {(Object.keys(filterLabels) as ConditionalFilter[]).map((value) => (
            <Button key={value} variant={filter === value ? 'contained' : 'outlined'} onClick={() => setFilter(value)}>
              {filterLabels[value]}
            </Button>
          ))}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.08fr 0.92fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(18px, 1fr))', gap: 0.75 }}>
              {rows.map((row) => {
                const included = filteredRows.some((filtered) => filtered.id === row.id);
                const isCondition = row.condition;
                const isEvent = row.event;
                const category = isEvent ? 'event' : isCondition ? 'condition' : 'neither';
                const style = cellStyles?.[category];
                return (
                  <Box
                    key={row.id}
                    title={style ? style.label : `${isCondition ? conditionName : inverseConditionName}${isEvent ? ` + ${eventName}` : ''}`}
                    aria-label={style ? style.label : undefined}
                    sx={{
                      aspectRatio: '1',
                      minHeight: 30,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: { xs: '1.05rem', md: '1.3rem' },
                      lineHeight: 1,
                      overflow: 'hidden',
                      fontWeight: 900,
                      color: style ? 'text.primary' : isEvent ? 'primary.contrastText' : 'text.primary',
                      bgcolor: style ? style.bg : isEvent ? 'primary.main' : isCondition ? 'rgba(15,111,104,0.16)' : 'background.paper',
                      border: '1px solid',
                      borderColor: style ? style.border : isCondition ? 'rgba(15,111,104,0.28)' : 'divider',
                      opacity: included ? 1 : 0.22,
                      transform: included ? 'scale(1)' : 'scale(0.86)',
                      transition: 'opacity 180ms ease, transform 180ms ease, background-color 180ms ease',
                    }}
                  >
                    {style ? style.emoji : isEvent ? eventIcon : isCondition ? conditionIcon : ''}
                  </Box>
                );
              })}
            </Box>
            {legend && (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                {legend.map((item) => (
                  <Stack key={item.label} direction="row" spacing={0.5} alignItems="center">
                    <Box component="span" aria-hidden sx={{ fontSize: '1.5rem', lineHeight: 1 }}>
                      {item.emoji}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      {item.label}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <StatCard label="Question" value={questionLabel} detail={detail} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <StatCard label="Denominator" value={String(filteredRows.length)} detail={`Only ${denominatorLabel}.`} tone="secondary" />
              <StatCard label="Numerator" value={String(eventRows.length)} detail={`${eventName} inside that group.`} tone="success" />
            </Box>
            <Chip
              label={`${eventRows.length}/${filteredRows.length} = ${percentLabel(eventRows.length, filteredRows.length)}`}
              color="success"
              sx={{ height: 44, fontWeight: 900, fontSize: '1.05rem' }}
            />
            <Typography variant="body2" color="text.secondary">
              Overall: {allEventRows.length}/{rows.length} = {percentLabel(allEventRows.length, rows.length)}. Given {conditionName}:{' '}
              {conditionAndEventRows.length}/{conditionRows.length} = {percentLabel(conditionAndEventRows.length, conditionRows.length)}.
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// Day-count variants for the weather conditional lab. `base` matches the
// intro conditioning step (100 days, 40 cloudy, 24 rainy); `formula` matches
// the "Use the conditional formula" step (100 days, 50 cloudy, 20 rainy →
// P(rain | cloudy) = 20/50 = 40%). It only ever rains on cloudy days, so the
// clear days are always rain-free.
type WeatherConfig = { cloudyRain: number; cloudyDry: number; clearDry: number; description: string };

const weatherConfigs: Record<string, WeatherConfig> = {
  base: {
    cloudyRain: 24,
    cloudyDry: 16,
    clearDry: 60,
    description: '100 days: 40 cloudy (24 of them rainy) and 60 clear, and it only rains when cloudy. Filter to a group, then read P(rain) off the kept days.',
  },
  formula: {
    cloudyRain: 20,
    cloudyDry: 30,
    clearDry: 50,
    description: '100 days: 50 cloudy (20 of them rainy) and 50 clear, and it only rains when cloudy. Filter to a group, then read P(rain) off the kept days.',
  },
};

export function WeatherConditionalLab({ target }: LabProps) {
  const config = weatherConfigs[target ?? 'base'] ?? weatherConfigs.base;
  const rows = useMemo<ConditionalRow[]>(() => {
    const cloudyRain = Array.from({ length: config.cloudyRain }, (_, index) => ({ id: index, condition: true, event: true }));
    const cloudyDry = Array.from({ length: config.cloudyDry }, (_, index) => ({ id: config.cloudyRain + index, condition: true, event: false }));
    const clearDry = Array.from({ length: config.clearDry }, (_, index) => ({ id: config.cloudyRain + config.cloudyDry + index, condition: false, event: false }));
    return [...cloudyRain, ...cloudyDry, ...clearDry];
  }, [config.cloudyRain, config.cloudyDry, config.clearDry]);

  return (
    <ConditionalProbabilityLab
      rows={rows}
      initialFilter="all"
      filterLabels={{
        all: 'All days',
        condition: 'Given cloudy',
        'not-condition': 'Given not cloudy',
      }}
      title="Which days are we allowed to count?"
      description={config.description}
      conditionName="cloudy"
      inverseConditionName="not cloudy"
      eventName="rain"
      conditionDetail="Chance of rain after we know the day is cloudy."
      inverseDetail="Chance of rain after we know the day is not cloudy."
      allDetail="Chance of rain before any weather clue."
      eventIcon="R"
      conditionIcon="C"
      cellStyles={{
        event: { emoji: '🌧️', bg: 'rgba(33,113,181,0.18)', border: 'rgba(33,113,181,0.5)', label: 'Rainy day (always cloudy)' },
        condition: { emoji: '☁️', bg: 'rgba(100,116,139,0.18)', border: 'rgba(100,116,139,0.45)', label: 'Cloudy, no rain' },
        neither: { emoji: '☀️', bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.5)', label: 'Clear day' },
      }}
      legend={[
        { emoji: '🌧️', label: 'Rain (always cloudy)' },
        { emoji: '☁️', label: 'Cloudy, no rain' },
        { emoji: '☀️', label: 'Clear' },
      ]}
    />
  );
}

type ExclusiveScenario = {
  label: string;
  aLabel: string;
  bLabel: string;
  a: number[];
  b: number[];
};

const exclusiveScenarios: Record<string, ExclusiveScenario> = {
  'odd-even': {
    label: 'Odd vs even',
    aLabel: 'Odd',
    bLabel: 'Even',
    a: [1, 3, 5],
    b: [2, 4, 6],
  },
  'even-high': {
    label: 'Even vs greater than 4',
    aLabel: 'Even',
    bLabel: 'Greater than 4',
    a: [2, 4, 6],
    b: [5, 6],
  },
  'low-high': {
    label: 'Less than 4 vs greater than 4',
    aLabel: 'Less than 4',
    bLabel: 'Greater than 4',
    a: [1, 2, 3],
    b: [5, 6],
  },
  'prime-odd': {
    label: 'Prime vs odd',
    aLabel: 'Prime',
    bLabel: 'Odd',
    a: [2, 3, 5],
    b: [1, 3, 5],
  },
};

export function MutuallyExclusiveLab({ target, hideTrials }: LabProps) {
  // Some lesson steps use this lab only to illustrate how the probability is
  // built from the sides, not to track observed frequencies. Those hide the
  // roll/reset controls and the observed tally via the `hideTrials` prop
  // (independent of `target`, which still picks the event preset). The legacy
  // `target: 'static'` opt-in is kept as a fallback.
  const noTrials = hideTrials ?? target === 'static';
  // Default to the leftmost scenario ("Odd vs even") so the demo opens on its
  // first selectable option regardless of the lesson-provided target.
  const [scenarioKey, setScenarioKey] = useState('odd-even');
  const [latestRoll, setLatestRoll] = useState(1);
  const [rolls, setRolls] = useState(0);
  const [counts, setCounts] = useState({ aOnly: 0, bOnly: 0, both: 0, neither: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scenario = exclusiveScenarios[scenarioKey] ?? exclusiveScenarios['odd-even'];
  const overlap = scenario.a.filter((side) => scenario.b.includes(side));
  const union = Array.from(new Set([...scenario.a, ...scenario.b])).sort((left, right) => left - right);
  const simpleAdd = scenario.a.length + scenario.b.length;
  const unionPercent = Math.round((union.length / 6) * 1000) / 10;
  const isExclusive = overlap.length === 0;
  const totalHitCount = counts.aOnly + counts.bOnly + counts.both;
  const observedPercent = rolls > 0 ? Math.round((totalHitCount / rolls) * 1000) / 10 : null;
  const faceStyleMap = dieSides.reduce<Record<number, FaceStyle>>((map, side) => {
    const inA = scenario.a.includes(side);
    const inB = scenario.b.includes(side);
    if (inA && inB) map[side] = 'both';
    else if (inA) map[side] = 'a';
    else if (inB) map[side] = 'b';
    return map;
  }, {});

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRolls(0);
    setCounts({ aOnly: 0, bOnly: 0, both: 0, neither: 0 });
    setLatestRoll(1);
    setIsRunning(false);
  };

  const changeScenario = (nextScenario: string) => {
    setScenarioKey(nextScenario);
    reset();
  };

  const run = (count: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);

    let completed = 0;
    const chunkSize = count >= 120 ? 4 : count >= 30 ? 2 : 1;
    const intervalMs = count >= 120 ? 24 : 55;

    intervalRef.current = setInterval(() => {
      const nextChunk = Math.min(chunkSize, count - completed);
      const nextCounts = { aOnly: 0, bOnly: 0, both: 0, neither: 0 };
      let lastRoll = latestRoll;

      for (let i = 0; i < nextChunk; i += 1) {
        const side = Math.floor(Math.random() * 6) + 1;
        const inA = scenario.a.includes(side);
        const inB = scenario.b.includes(side);
        if (inA && inB) nextCounts.both += 1;
        else if (inA) nextCounts.aOnly += 1;
        else if (inB) nextCounts.bOnly += 1;
        else nextCounts.neither += 1;
        lastRoll = side;
      }

      setCounts((current) => ({
        aOnly: current.aOnly + nextCounts.aOnly,
        bOnly: current.bOnly + nextCounts.bOnly,
        both: current.both + nextCounts.both,
        neither: current.neither + nextCounts.neither,
      }));
      setRolls((current) => current + nextChunk);
      setLatestRoll(lastRoll);
      completed += nextChunk;

      if (completed >= count) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
      }
    }, intervalMs);
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Where do the events overlap?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Pick two events for one die roll. Purple sides fit both — those are the ones double-counted when you add.
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {Object.entries(exclusiveScenarios).map(([key, nextScenario]) => (
            <Button key={key} variant={scenarioKey === key ? 'contained' : 'outlined'} onClick={() => changeScenario(key)} disabled={isRunning}>
              {nextScenario.label}
            </Button>
          ))}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.08fr 0.92fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 4, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: '100%', maxWidth: 240, display: 'flex', justifyContent: 'center' }}>
                <Dice3D
                  faceStyles={faceStyleMap}
                  initialFace={!noTrials && rolls > 0 ? latestRoll : union[0] ?? 1}
                  rolling={!noTrials && isRunning}
                  responsive
                  size={220}
                  minSize={132}
                  label={`Die comparing ${scenario.aLabel} and ${scenario.bLabel}`}
                />
              </Box>
              <FaceLegend faceStyles={faceStyleMap} latest={!noTrials && rolls > 0 ? latestRoll : undefined} />
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap justifyContent="center">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: 'rgba(15,111,104,0.5)', border: '2px solid #0f6f68' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>A: {scenario.aLabel}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: 'rgba(195,95,44,0.5)', border: '2px solid #c35f2c' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>B: {scenario.bLabel}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: '#6f3fc4', border: '2px solid #52299b' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>Both events</Typography>
                </Stack>
              </Stack>
            </Box>

            {!noTrials && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {[1, 30, 120].map((count) => (
                  <Button key={count} variant="contained" onClick={() => run(count)} disabled={isRunning}>
                    Roll {count}
                  </Button>
                ))}
                <Button variant="text" onClick={reset} disabled={rolls === 0 && !isRunning}>
                  Reset
                </Button>
              </Stack>
            )}
          </Box>

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <StatCard label="Event A" value={`${scenario.a.length}/6`} detail={scenario.aLabel} />
            <StatCard label="Event B" value={`${scenario.b.length}/6`} detail={scenario.bLabel} tone="secondary" />
            <StatCard
              label="Overlap"
              value={`${overlap.length}/6`}
              detail={isExclusive ? 'No side fits both events.' : `Shared side${overlap.length === 1 ? '' : 's'}: ${overlap.join(', ')}.`}
              tone="success"
            />
            <Chip
              label={`P(A or B): ${union.length}/6 = ${unionPercent}%`}
              color="success"
              sx={{ minHeight: 44, height: 'auto', py: 0.75, fontWeight: 900, fontSize: '1rem', '& .MuiChip-label': { whiteSpace: 'normal' } }}
            />
            <Typography variant="body2" color="text.secondary">
              Adding separately gives {simpleAdd}/6. {isExclusive ? 'That works because nothing overlaps.' : `Subtract the ${overlap.length}/6 overlap to get ${union.length}/6.`}
            </Typography>
            {!noTrials && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`${rolls} rolls`} />
                <Chip label={`Observed A or B: ${observedPercent === null ? '-' : `${observedPercent}%`}`} color="primary" />
                <Chip label={`Both: ${counts.both}`} color={isExclusive ? 'default' : 'secondary'} />
              </Stack>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

type TallyGuest = { id: number; face: string; inA: boolean; inB: boolean };

// A small, fixed universe so a one-by-one tally stays short and legible.
// Event A = wears a hat; Event B = holds a balloon. Exactly two guests do both,
// so they are the ones the naive sum P(A) + P(B) counts twice.
const tallyGuests: TallyGuest[] = [
  { id: 0, face: '🦊', inA: true, inB: false },
  { id: 1, face: '🐰', inA: true, inB: false },
  { id: 2, face: '🐻', inA: true, inB: true },
  { id: 3, face: '🐼', inA: true, inB: true },
  { id: 4, face: '🐨', inA: false, inB: true },
  { id: 5, face: '🐯', inA: false, inB: true },
  { id: 6, face: '🦁', inA: false, inB: false },
  { id: 7, face: '🐸', inA: false, inB: false },
  { id: 8, face: '🐵', inA: false, inB: false },
  { id: 9, face: '🐶', inA: false, inB: false },
];

const HAT_EMOJI = '🎩';
const BALLOON_EMOJI = '🎈';

type TallyPhase = 'idle' | 'countingA' | 'aDone' | 'countingB' | 'bDone' | 'subtracting' | 'subtracted';

export function DoubleCountTallyLab() {
  const teal = '#0f6f68';
  const orange = '#c35f2c';
  const purple = '#6f3fc4';

  const aIds = useMemo(() => tallyGuests.filter((g) => g.inA).map((g) => g.id), []);
  const bIds = useMemo(() => tallyGuests.filter((g) => g.inB).map((g) => g.id), []);
  const aCount = aIds.length;
  const bCount = bIds.length;
  const overlapCount = useMemo(() => tallyGuests.filter((g) => g.inA && g.inB).length, []);
  const unionCount = aCount + bCount - overlapCount;
  const naiveCount = aCount + bCount;
  const size = tallyGuests.length;

  const [phase, setPhase] = useState<TallyPhase>('idle');
  const [aCounted, setACounted] = useState<number[]>([]);
  const [bCounted, setBCounted] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const reset = () => {
    stop();
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setPhase('idle');
    setACounted([]);
    setBCounted([]);
    setTotal(0);
    setFlashId(null);
  };

  const countA = () => {
    stop();
    setPhase('countingA');
    let i = 0;
    intervalRef.current = setInterval(() => {
      const id = aIds[i];
      setACounted((prev) => [...prev, id]);
      setTotal((t) => t + 1);
      i += 1;
      if (i >= aIds.length) {
        stop();
        setPhase('aDone');
      }
    }, 480);
  };

  const countB = () => {
    stop();
    setPhase('countingB');
    let i = 0;
    intervalRef.current = setInterval(() => {
      const id = bIds[i];
      setBCounted((prev) => [...prev, id]);
      setTotal((t) => t + 1);
      if (aIds.includes(id)) {
        setFlashId(id);
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => {
          setFlashId((curr) => (curr === id ? null : curr));
        }, 420);
      }
      i += 1;
      if (i >= bIds.length) {
        stop();
        setPhase('bDone');
      }
    }, 640);
  };

  const subtract = () => {
    stop();
    setPhase('subtracting');
    let removed = 0;
    intervalRef.current = setInterval(() => {
      setTotal((t) => t - 1);
      removed += 1;
      if (removed >= overlapCount) {
        stop();
        setPhase('subtracted');
      }
    }, 480);
  };

  const isAnimating = phase === 'countingA' || phase === 'countingB' || phase === 'subtracting';

  const totalLabel =
    phase === 'idle'
      ? 'Tap "Count A" to start the tally.'
      : phase === 'countingA' || phase === 'aDone'
        ? `Counting Event A (${HAT_EMOJI} hats).`
        : phase === 'countingB'
          ? `Counting Event B (${BALLOON_EMOJI} balloons) — watch for repeats.`
          : phase === 'bDone'
            ? `Naive total |A| + |B| = ${naiveCount}, but ${overlapCount} guests were counted twice.`
            : phase === 'subtracting'
              ? 'Removing the double-counted guests…'
              : `True count of "A or B" = ${unionCount}.`;

  const totalTone = phase === 'bDone' ? orange : phase === 'subtracted' ? teal : 'text.primary';

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Tally A, then B — and catch the double-count
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem', maxWidth: '88ch' }}>
          Ten guests: Event A "wears a hat" ({HAT_EMOJI}), Event B "holds a balloon" ({BALLOON_EMOJI}). Count A, then B — guests with both
          get counted twice, which is exactly what P(A) + P(B) overcounts.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.25fr 0.75fr' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: { xs: 1, md: 1.25 } }}>
              {tallyGuests.map((guest) => {
                const countedA = aCounted.includes(guest.id);
                const countedB = bCounted.includes(guest.id);
                const isOverlap = guest.inA && guest.inB;
                const doubleCounted = countedA && countedB;
                const flashing = flashId === guest.id;
                const removed = phase === 'subtracted' && isOverlap;
                const traits =
                  [guest.inA ? 'wears a hat' : null, guest.inB ? 'holds a balloon' : null].filter(Boolean).join(' and ') ||
                  'no hat or balloon';
                const status = removed
                  ? 'duplicate removed'
                  : doubleCounted
                    ? 'counted in A and again in B'
                    : countedA
                      ? 'counted in A'
                      : countedB
                        ? 'counted in B'
                        : 'not counted yet';
                return (
                  <Box
                    key={guest.id}
                    aria-label={`Guest ${guest.id + 1}: ${traits}; ${status}.`}
                    sx={{
                      position: 'relative',
                      borderRadius: 2,
                      p: { xs: 0.75, md: 1 },
                      display: 'grid',
                      placeItems: 'center',
                      gap: 0.25,
                      bgcolor: 'background.paper',
                      border: '2px solid',
                      borderColor: flashing || doubleCounted ? purple : countedA ? teal : countedB ? orange : 'divider',
                      boxShadow: flashing ? '0 0 0 3px rgba(111,63,196,0.35)' : 'none',
                      opacity: removed ? 0.5 : 1,
                      transform: flashing ? 'scale(1.06)' : 'scale(1)',
                      transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 200ms ease, border-color 160ms ease',
                    }}
                  >
                    <Box component="span" aria-hidden sx={{ fontSize: { xs: '1.5rem', md: '1.8rem' }, lineHeight: 1 }}>
                      {guest.face}
                    </Box>
                    <Box component="span" aria-hidden sx={{ fontSize: '0.95rem', lineHeight: 1, minHeight: 16 }}>
                      {guest.inA ? HAT_EMOJI : ''}
                      {guest.inB ? BALLOON_EMOJI : ''}
                    </Box>
                    <Stack direction="row" spacing={0.25} sx={{ minHeight: 18 }}>
                      {countedA && (
                        <Box component="span" sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#fff', bgcolor: teal, borderRadius: 999, px: 0.5, lineHeight: 1.5 }}>
                          A✓
                        </Box>
                      )}
                      {countedB && (
                        <Box component="span" sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#fff', bgcolor: orange, borderRadius: 999, px: 0.5, lineHeight: 1.5 }}>
                          B✓
                        </Box>
                      )}
                    </Stack>
                    {flashing && (
                      <Box component="span" aria-hidden sx={{ position: 'absolute', top: -10, right: -6, fontSize: '0.62rem', fontWeight: 900, color: '#fff', bgcolor: purple, borderRadius: 999, px: 0.5, py: 0.1, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                        +1 again!
                      </Box>
                    )}
                    {doubleCounted && !flashing && !removed && (
                      <Box component="span" aria-hidden sx={{ position: 'absolute', top: -8, right: -6, fontSize: '0.6rem', fontWeight: 900, color: '#fff', bgcolor: purple, borderRadius: 999, px: 0.5, lineHeight: 1.4 }}>
                        ×2
                      </Box>
                    )}
                    {removed && (
                      <Box component="span" aria-hidden sx={{ position: 'absolute', top: -8, right: -6, fontSize: '0.6rem', fontWeight: 900, color: '#fff', bgcolor: 'text.secondary', borderRadius: 999, px: 0.5, lineHeight: 1.4 }}>
                        −1
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box component="span" aria-hidden sx={{ fontSize: '1.1rem' }}>{HAT_EMOJI}</Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Event A: wears a hat</Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box component="span" aria-hidden sx={{ fontSize: '1.1rem' }}>{BALLOON_EMOJI}</Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Event B: holds a balloon</Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box component="span" aria-hidden sx={{ fontWeight: 900, color: purple }}>×2</Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Both (counted twice)</Typography>
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(15,111,104,0.10)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Running total
              </Typography>
              <Typography className="numeric" sx={{ fontWeight: 900, fontSize: '2.4rem', lineHeight: 1, color: totalTone }}>
                {total}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {totalLabel}
              </Typography>
            </Box>

            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(15,111,104,0.10)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Inclusion–exclusion
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mt: 0.5, fontWeight: 700 }}>
                <Box component="span" sx={{ mr: 0.5 }}>P(A or B)</Box>
                <Box component="span" sx={{ mx: 0.5 }}>=</Box>
                <Frac top={aCount} bottom={size} color={teal} />
                <Box component="span" sx={{ mx: 0.5 }}>+</Box>
                <Frac top={bCount} bottom={size} color={orange} />
                <Box component="span" sx={{ mx: 0.5 }}>−</Box>
                <Frac top={overlapCount} bottom={size} color={purple} />
                <Box component="span" sx={{ mx: 0.5 }}>=</Box>
                <Frac top={unionCount} bottom={size} color={teal} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Adding P(A) + P(B) = {naiveCount}/{size} counts the {overlapCount} both-guests twice. Subtract the {overlapCount}/{size} overlap once to land on the true {unionCount}/{size}.
              </Typography>
            </Box>

            {/* One progressive control walks through count A → count B →
                subtract overlap, so the panel stays uncluttered. Reset is
                demoted to a small secondary control. */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {(() => {
                const step =
                  phase === 'idle'
                    ? { label: 'Count A (hats)', run: countA as (() => void) | null }
                    : phase === 'countingA'
                      ? { label: 'Counting hats…', run: null }
                      : phase === 'aDone'
                        ? { label: 'Count B (balloons)', run: countB }
                        : phase === 'countingB'
                          ? { label: 'Counting balloons…', run: null }
                          : phase === 'bDone' && overlapCount > 0
                            ? { label: 'Subtract the overlap', run: subtract }
                            : phase === 'subtracting'
                              ? { label: 'Removing duplicates…', run: null }
                              : null;
                return step ? (
                  <Button variant="contained" onClick={() => step.run?.()} disabled={isAnimating || !step.run} aria-label={step.label}>
                    {step.label}
                  </Button>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 800, color: teal }}>
                    True count of "A or B" = {unionCount}.
                  </Typography>
                );
              })()}
              <Button variant="text" size="small" color="inherit" onClick={reset} disabled={phase === 'idle' || isAnimating} aria-label="Reset the tally">
                Reset
              </Button>
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

type AreaPreset = {
  label: string;
  coinSides: ('H' | 'T')[];
  dieFaces: number[];
};

const areaPresets: AreaPreset[] = [
  { label: 'Heads and 6', coinSides: ['H'], dieFaces: [6] },
  { label: 'Heads and even', coinSides: ['H'], dieFaces: [2, 4, 6] },
  { label: 'Tails and over 4', coinSides: ['T'], dieFaces: [5, 6] },
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// ---------------------------------------------------------------------------
// Probability-tree geometry (SVG user units). The tree reads left → right:
// a root splits on the coin (stage 1), each coin node splits on the die
// (stage 2), giving four leaves whose path-products are counts out of 12.
// ---------------------------------------------------------------------------
const TREE_VIEW = { w: 600, h: 320 };
const TREE_ROOT = { x: 46, y: 164 };
const TREE_COIN = {
  yes: { x: 232, y: 89 }, // coin condition satisfied
  no: { x: 232, y: 239 }, // coin condition not satisfied
};
const LEAF_LEFT = 424; // x of each leaf card's left edge (edges connect here)
const LEAF_W = 158;
const LEAF_H = 50;
const TREE_LEAF_Y = [46, 132, 196, 282];

// One token-travel leg duration; two legs (root→coin, coin→leaf) per play.
const TREE_LEG_MS = 480;

type TreeLeaf = {
  key: string;
  coinHit: boolean;
  dieHit: boolean;
  num: number; // path-product numerator out of 12
  y: number;
};

export function AreaModelLab(_props: LabProps) {
  // Default to the leftmost quick-pick preset ("Heads and 6") so the demo
  // opens on its first selectable option regardless of the lesson target.
  const initial = areaPresets[0];
  const [coinSides, setCoinSides] = useState<Set<'H' | 'T'>>(() => new Set(initial.coinSides));
  const [dieFaces, setDieFaces] = useState<Set<number>>(() => new Set(initial.dieFaces));
  // Logical connector joining the coin condition and the die condition.
  // Defaults to the leftmost option ("and") per the app's convention.
  const [connector, setConnector] = useState<'and' | 'or'>('and');
  const [rolls, setRolls] = useState(0);
  const [hits, setHits] = useState(0);
  const [leafCounts, setLeafCounts] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [isRunning, setIsRunning] = useState(false);

  // Token-trace state for the animated "Play it out" single trial. The token
  // travels root → coin node → leaf, visually multiplying along the path.
  const [token, setToken] = useState<{ x: number; y: number } | null>(null);
  const [playStage, setPlayStage] = useState(0); // 0 root, 1 at coin, 2 at leaf
  const [playing, setPlaying] = useState(false);
  const [outcome, setOutcome] = useState<{
    coin: 'H' | 'T';
    die: number;
    coinHit: boolean;
    dieHit: boolean;
    leafIndex: number;
    win: boolean;
  } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const teal = '#0f6f68';
  const muted = '#9aa3ab';
  const coinCount = coinSides.size;
  const dieCount = dieFaces.size;

  // "and" wins only when both conditions hold; "or" wins when either holds.
  // The four leaf numerators always sum to 12, so each leaf P = num/12 and the
  // winning leaves sum to the same `shadedCells` the old area model computed.
  const leaves: TreeLeaf[] = [
    { key: 'yy', coinHit: true, dieHit: true, num: coinCount * dieCount, y: TREE_LEAF_Y[0] },
    { key: 'yn', coinHit: true, dieHit: false, num: coinCount * (6 - dieCount), y: TREE_LEAF_Y[1] },
    { key: 'ny', coinHit: false, dieHit: true, num: (2 - coinCount) * dieCount, y: TREE_LEAF_Y[2] },
    { key: 'nn', coinHit: false, dieHit: false, num: (2 - coinCount) * (6 - dieCount), y: TREE_LEAF_Y[3] },
  ];
  const leafWins = leaves.map((leaf) => (connector === 'and' ? leaf.coinHit && leaf.dieHit : leaf.coinHit || leaf.dieHit));
  const shadedCells =
    connector === 'and' ? coinCount * dieCount : 12 - (2 - coinCount) * (6 - dieCount);
  const isHit = (coin: 'H' | 'T', die: number) =>
    connector === 'and'
      ? coinSides.has(coin) && dieFaces.has(die)
      : coinSides.has(coin) || dieFaces.has(die);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    clearTimers();
    setRolls(0);
    setHits(0);
    setLeafCounts([0, 0, 0, 0]);
    setToken(null);
    setPlayStage(0);
    setPlaying(false);
    setOutcome(null);
    setIsRunning(false);
  };

  const toggleCoin = (side: 'H' | 'T') => {
    setCoinSides((prev) => {
      const next = new Set(prev);
      if (next.has(side)) next.delete(side);
      else next.add(side);
      return next;
    });
    reset();
  };

  const toggleFace = (face: number) => {
    setDieFaces((prev) => {
      const next = new Set(prev);
      if (next.has(face)) next.delete(face);
      else next.add(face);
      return next;
    });
    reset();
  };

  const applyPreset = (preset: AreaPreset) => {
    setCoinSides(new Set(preset.coinSides));
    setDieFaces(new Set(preset.dieFaces));
    reset();
  };

  const changeConnector = (next: 'and' | 'or') => {
    if (!next) return;
    setConnector(next);
    reset();
  };

  // Animated single trial: flip + roll, then send the token down the path the
  // outcome actually took, landing on its leaf and tallying a hit/miss.
  const playOne = () => {
    clearTimers();
    const coin: 'H' | 'T' = Math.random() < 0.5 ? 'H' : 'T';
    const die = Math.floor(Math.random() * 6) + 1;
    const coinHit = coinSides.has(coin);
    const dieHit = dieFaces.has(die);
    const leafIndex = (coinHit ? 0 : 2) + (dieHit ? 0 : 1);
    const win = connector === 'and' ? coinHit && dieHit : coinHit || dieHit;

    setPlaying(true);
    setOutcome({ coin, die, coinHit, dieHit, leafIndex, win });
    setToken(TREE_ROOT);
    setPlayStage(0);

    timersRef.current.push(
      setTimeout(() => {
        setToken(coinHit ? TREE_COIN.yes : TREE_COIN.no);
        setPlayStage(1);
      }, 60),
    );
    timersRef.current.push(
      setTimeout(() => {
        setToken({ x: LEAF_LEFT - 8, y: TREE_LEAF_Y[leafIndex] });
        setPlayStage(2);
      }, 60 + TREE_LEG_MS),
    );
    timersRef.current.push(
      setTimeout(() => {
        setRolls((current) => current + 1);
        if (win) setHits((current) => current + 1);
        setLeafCounts((current) => {
          const next: [number, number, number, number] = [...current];
          next[leafIndex] += 1;
          return next;
        });
        setPlaying(false);
      }, 60 + TREE_LEG_MS * 2 + 80),
    );
  };

  const run = (count: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearTimers();
    setToken(null);
    setOutcome(null);
    setPlaying(false);
    setIsRunning(true);
    let completed = 0;
    const chunkSize = count >= 120 ? 6 : count >= 30 ? 2 : 1;
    const intervalMs = count >= 120 ? 22 : 60;
    intervalRef.current = setInterval(() => {
      const nextChunk = Math.min(chunkSize, count - completed);
      let nextHits = 0;
      const chunkLeaf: [number, number, number, number] = [0, 0, 0, 0];
      for (let i = 0; i < nextChunk; i += 1) {
        const coin: 'H' | 'T' = Math.random() < 0.5 ? 'H' : 'T';
        const die = Math.floor(Math.random() * 6) + 1;
        const coinHit = coinSides.has(coin);
        const dieHit = dieFaces.has(die);
        chunkLeaf[(coinHit ? 0 : 2) + (dieHit ? 0 : 1)] += 1;
        if (isHit(coin, die)) nextHits += 1;
      }
      setHits((current) => current + nextHits);
      setRolls((current) => current + nextChunk);
      setLeafCounts((current) => [
        current[0] + chunkLeaf[0],
        current[1] + chunkLeaf[1],
        current[2] + chunkLeaf[2],
        current[3] + chunkLeaf[3],
      ]);
      completed += nextChunk;
      if (completed >= count) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
      }
    }, intervalMs);
  };

  const observedPercent = rolls > 0 ? Math.round((hits / rolls) * 1000) / 10 : null;
  const expectedPercent = Math.round((shadedCells / 12) * 1000) / 10;
  // Cells in both conditions (the overlap subtracted in the union formula).
  const bothCells = coinCount * dieCount;

  const reduced = shadedCells > 0 ? (() => {
    const divisor = gcd(shadedCells, 12);
    return { n: shadedCells / divisor, d: 12 / divisor };
  })() : null;
  const showReduced = reduced !== null && reduced.d !== 12;

  const activePreset = areaPresets.find(
    (preset) =>
      preset.coinSides.length === coinCount &&
      preset.coinSides.every((side) => coinSides.has(side)) &&
      preset.dieFaces.length === dieCount &&
      preset.dieFaces.every((face) => dieFaces.has(face)),
  );

  // Edge "active" = it lies on a path to at least one winning leaf. Branch
  // probabilities are shown as fractions on each edge.
  const coinYesActive = leafWins[0] || leafWins[1];
  const coinNoActive = leafWins[2] || leafWins[3];
  const treeEdges = [
    { id: 'r-cy', x1: TREE_ROOT.x, y1: TREE_ROOT.y, x2: TREE_COIN.yes.x, y2: TREE_COIN.yes.y, label: `${coinCount}/2`, active: coinYesActive, level: 0 },
    { id: 'r-cn', x1: TREE_ROOT.x, y1: TREE_ROOT.y, x2: TREE_COIN.no.x, y2: TREE_COIN.no.y, label: `${2 - coinCount}/2`, active: coinNoActive, level: 0 },
    { id: 'cy-0', x1: TREE_COIN.yes.x, y1: TREE_COIN.yes.y, x2: LEAF_LEFT, y2: leaves[0].y, label: `${dieCount}/6`, active: leafWins[0], level: 1 },
    { id: 'cy-1', x1: TREE_COIN.yes.x, y1: TREE_COIN.yes.y, x2: LEAF_LEFT, y2: leaves[1].y, label: `${6 - dieCount}/6`, active: leafWins[1], level: 1 },
    { id: 'cn-2', x1: TREE_COIN.no.x, y1: TREE_COIN.no.y, x2: LEAF_LEFT, y2: leaves[2].y, label: `${dieCount}/6`, active: leafWins[2], level: 1 },
    { id: 'cn-3', x1: TREE_COIN.no.x, y1: TREE_COIN.no.y, x2: LEAF_LEFT, y2: leaves[3].y, label: `${6 - dieCount}/6`, active: leafWins[3], level: 1 },
  ];

  // Accumulated path-product label that rides along with the token during a
  // trace, so the multiply step is visible as it happens.
  const tokenLabel = (() => {
    if (!outcome) return '';
    const coinNum = outcome.coinHit ? coinCount : 2 - coinCount;
    const dieNum = outcome.dieHit ? dieCount : 6 - dieCount;
    if (playStage >= 2) return `${coinNum}/2 × ${dieNum}/6 = ${leaves[outcome.leafIndex].num}/12`;
    if (playStage === 1) return `${coinNum}/2`;
    return '';
  })();

  const eventName = connector === 'and' ? 'coin ✓ and die ✓' : 'coin ✓ or die ✓';
  const treeAria = `Probability tree. The coin splits into a ${coinCount}/2 and a ${2 - coinCount}/2 branch; each then splits into a ${dieCount}/6 and a ${6 - dieCount}/6 die branch. The event "${eventName}" wins on ${shadedCells} of 12 equally likely paths.`;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          {connector === 'and' ? 'Multiply along the branches' : 'Add up the winning branches'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem', maxWidth: '88ch' }}>
          {connector === 'and'
            ? 'A two-step tree: the coin branches first, then the die. Multiply the chances along a path to get that outcome — the highlighted path is the "and" event.'
            : 'A two-step tree: the coin branches first, then the die. With "or", every path where the coin OR the die succeeds wins — add those leaf probabilities.'}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5, alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', mr: 0.5 }}>
            Quick pick:
          </Typography>
          {areaPresets.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              clickable
              onClick={() => applyPreset(preset)}
              color={activePreset?.label === preset.label ? 'primary' : 'default'}
              variant={activePreset?.label === preset.label ? 'filled' : 'outlined'}
              disabled={isRunning || playing}
            />
          ))}
        </Stack>

        <Box sx={{ display: 'grid', gap: 0.75, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 76 }}>
              Coin sides
            </Typography>
            {(['H', 'T'] as const).map((side) => {
              const selected = coinSides.has(side);
              const name = side === 'H' ? 'Heads' : 'Tails';
              return (
                <Button
                  key={side}
                  size="small"
                  onClick={() => toggleCoin(side)}
                  disabled={isRunning || playing}
                  aria-pressed={selected}
                  aria-label={`${name} ${selected ? 'selected' : 'not selected'}`}
                  variant={selected ? 'contained' : 'outlined'}
                  startIcon={<Box component="span" aria-hidden sx={{ fontWeight: 900 }}>{selected ? '✓' : '+'}</Box>}
                >
                  {name}
                </Button>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ minWidth: 76, display: { xs: 'none', sm: 'block' } }} aria-hidden />
            <ToggleButtonGroup
              value={connector}
              exclusive
              onChange={(_event, next) => changeConnector(next as 'and' | 'or')}
              size="small"
              disabled={isRunning || playing}
              aria-label="Connector joining the coin and die conditions"
              sx={{
                bgcolor: 'background.paper',
                '& .MuiToggleButton-root': {
                  px: 2,
                  py: 0.4,
                  fontWeight: 800,
                  textTransform: 'lowercase',
                  borderColor: 'divider',
                },
                '& .Mui-selected': { color: 'primary.contrastText', bgcolor: 'primary.main' },
                '& .Mui-selected:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <ToggleButton value="and" aria-label="coin and die — both conditions must hold">
                and
              </ToggleButton>
              <ToggleButton value="or" aria-label="coin or die — either condition holds">
                or
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              {connector === 'and' ? 'both must hold' : 'either can hold'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 76 }}>
              Die faces
            </Typography>
            {dieSides.map((face) => {
              const selected = dieFaces.has(face);
              return (
                <Button
                  key={face}
                  size="small"
                  onClick={() => toggleFace(face)}
                  disabled={isRunning || playing}
                  aria-pressed={selected}
                  aria-label={`Die face ${face} ${selected ? 'selected' : 'not selected'}`}
                  variant={selected ? 'contained' : 'outlined'}
                  sx={{ minWidth: 44, px: 0, fontWeight: 800 }}
                >
                  {selected ? `✓${face}` : face}
                </Button>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 0.85fr' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, bgcolor: 'action.hover' }}>
            <Box
              key={`${[...coinSides].sort().join('')}|${[...dieFaces].sort((a, b) => a - b).join('')}|${connector}`}
              component="svg"
              viewBox={`0 0 ${TREE_VIEW.w} ${TREE_VIEW.h}`}
              role="img"
              aria-label={treeAria}
              sx={{
                width: '100%',
                height: 'auto',
                display: 'block',
                fontFamily: 'inherit',
                '@keyframes treeBranchDraw': { from: { strokeDashoffset: 1 }, to: { strokeDashoffset: 0 } },
                '@keyframes treeNodePop': { from: { opacity: 0, transform: 'scale(0.55)' }, to: { opacity: 1, transform: 'scale(1)' } },
                '& .tree-branch': { strokeDasharray: 1, strokeDashoffset: 1, animation: 'treeBranchDraw 460ms ease forwards' },
                '& .tree-branch.lvl1': { animationDelay: '320ms' },
                '& .tree-label': { opacity: 0, animation: 'treeNodePop 320ms ease forwards' },
                '& .tree-label.lvl0': { animationDelay: '180ms' },
                '& .tree-label.lvl1': { animationDelay: '520ms' },
                '& .tree-leaf': { transformBox: 'fill-box', transformOrigin: 'center', opacity: 0, animation: 'treeNodePop 360ms ease forwards', animationDelay: '600ms' },
                '@media (prefers-reduced-motion: reduce)': {
                  '& .tree-branch': { animation: 'none', strokeDashoffset: 0 },
                  '& .tree-label': { animation: 'none', opacity: 1 },
                  '& .tree-leaf': { animation: 'none', opacity: 1 },
                },
              }}
            >
              <title>{treeAria}</title>
              {/* Stage headers */}
              <text x={TREE_COIN.yes.x} y={18} textAnchor="middle" fontSize="13" fontWeight={800} fill={muted}>
                1 · Flip the coin
              </text>
              <text x={LEAF_LEFT - 40} y={18} textAnchor="middle" fontSize="13" fontWeight={800} fill={muted}>
                2 · Roll the die
              </text>

              {/* Edges */}
              {treeEdges.map((edge) => (
                <line
                  key={edge.id}
                  className={`tree-branch lvl${edge.level}`}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  pathLength={1}
                  stroke={edge.active ? teal : muted}
                  strokeOpacity={edge.active ? 0.95 : 0.5}
                  strokeWidth={edge.active ? 3.5 : 2}
                  strokeLinecap="round"
                />
              ))}

              {/* Edge probability labels */}
              {treeEdges.map((edge) => {
                const mx = (edge.x1 + edge.x2) / 2;
                const my = (edge.y1 + edge.y2) / 2 - 5;
                return (
                  <text
                    key={`${edge.id}-label`}
                    className={`tree-label lvl${edge.level}`}
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    fontSize="13.5"
                    fontWeight={800}
                    fill={edge.active ? teal : muted}
                    style={{ paintOrder: 'stroke', stroke: '#fffaf0', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                  >
                    {edge.label}
                  </text>
                );
              })}

              {/* Root node */}
              <circle cx={TREE_ROOT.x} cy={TREE_ROOT.y} r={9} fill={teal} />
              <text x={TREE_ROOT.x} y={TREE_ROOT.y + 26} textAnchor="middle" fontSize="11.5" fontWeight={800} fill={muted}>
                start
              </text>

              {/* Coin nodes */}
              {([
                { node: TREE_COIN.yes, active: coinYesActive, label: 'coin ✓' },
                { node: TREE_COIN.no, active: coinNoActive, label: 'coin ✗' },
              ]).map((c) => (
                <g key={c.label}>
                  <circle cx={c.node.x} cy={c.node.y} r={7} fill={c.active ? teal : muted} />
                  <text x={c.node.x - 12} y={c.node.y + 4} textAnchor="end" fontSize="12" fontWeight={800} fill={c.active ? teal : muted}>
                    {c.label}
                  </text>
                </g>
              ))}

              {/* Leaf cards */}
              {leaves.map((leaf, index) => {
                const win = leafWins[index];
                const isLast = outcome?.leafIndex === index && playStage >= 2;
                return (
                  <g key={leaf.key} className="tree-leaf">
                    <rect
                      x={LEAF_LEFT}
                      y={leaf.y - LEAF_H / 2}
                      width={LEAF_W}
                      height={LEAF_H}
                      rx={10}
                      fill={win ? 'rgba(15,111,104,0.16)' : '#fffaf0'}
                      stroke={isLast ? '#c35f2c' : win ? teal : 'rgba(31,36,48,0.18)'}
                      strokeWidth={isLast ? 3 : win ? 2.5 : 1.5}
                    />
                    <text x={LEAF_LEFT + 14} y={leaf.y - 5} fontSize="13" fontWeight={800} fill={win ? teal : muted}>
                      {leaf.coinHit ? 'coin ✓' : 'coin ✗'} · {leaf.dieHit ? 'die ✓' : 'die ✗'}
                    </text>
                    <text x={LEAF_LEFT + 14} y={leaf.y + 15} fontSize="15" fontWeight={900} fill={win ? teal : '#1f2430'}>
                      <tspan style={{ fill: win ? teal : '#1f2430' }}>{leaf.num}/12</tspan>
                      <tspan dx="8" fontSize="11" fontWeight={800} style={{ fill: win ? teal : muted }}>
                        {win ? 'in event' : 'out'}
                      </tspan>
                    </text>
                  </g>
                );
              })}

              {/* Traveling token (single-trial trace) */}
              {token && (
                <g
                  style={{
                    transform: `translate(${token.x}px, ${token.y}px)`,
                    transition: playStage === 0 ? 'none' : `transform ${TREE_LEG_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                  }}
                >
                  <circle r={11} fill="#c35f2c" stroke="#fffaf0" strokeWidth={3} />
                  {tokenLabel && (
                    <text
                      x={0}
                      y={-18}
                      textAnchor="middle"
                      fontSize="12.5"
                      fontWeight={900}
                      fill="#c35f2c"
                      style={{ paintOrder: 'stroke', stroke: '#fffaf0', strokeWidth: 4, strokeLinejoin: 'round' }}
                    >
                      {tokenLabel}
                    </text>
                  )}
                </g>
              )}
            </Box>

            {/* Live trace status — reads the running coin → die outcome aloud. */}
            <Typography
              variant="body2"
              sx={{ mt: 1, textAlign: 'center', fontWeight: 700, minHeight: 24, color: outcome?.win ? 'success.dark' : 'text.secondary' }}
              aria-live="polite"
            >
              {outcome
                ? playStage < 2
                  ? `Flipped ${outcome.coin === 'H' ? 'Heads' : 'Tails'}…`
                  : `${outcome.coin === 'H' ? 'Heads' : 'Tails'} then ${outcome.die} — ${outcome.win ? 'a hit for the event!' : 'not in the event.'}`
                : 'Play it out to send a trial down the tree, or run a batch.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(15,111,104,0.10)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                {connector === 'and' ? 'Multiply the chances' : 'Add, then remove the overlap'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mt: 0.5, fontWeight: 700 }}>
                {connector === 'and' ? (
                  <>
                    <Box component="span" sx={{ mr: 0.5 }}>P(coin)</Box>
                    <Frac top={coinCount} bottom={2} />
                    <Box component="span" sx={{ mx: 0.5 }}>×</Box>
                    <Box component="span" sx={{ mr: 0.5 }}>P(die)</Box>
                    <Frac top={dieCount} bottom={6} />
                  </>
                ) : (
                  <>
                    <Box component="span" sx={{ mr: 0.5 }}>P(coin)</Box>
                    <Frac top={coinCount} bottom={2} />
                    <Box component="span" sx={{ mx: 0.5 }}>+</Box>
                    <Box component="span" sx={{ mr: 0.5 }}>P(die)</Box>
                    <Frac top={dieCount} bottom={6} />
                    <Box component="span" sx={{ mx: 0.5 }}>−</Box>
                    <Frac top={bothCells} bottom={12} color="#6f3fc4" />
                  </>
                )}
                <Box component="span" sx={{ mx: 0.5 }}>=</Box>
                <Frac top={shadedCells} bottom={12} color={teal} />
                {showReduced && reduced && (
                  <>
                    <Box component="span" sx={{ mx: 0.5 }}>=</Box>
                    <Frac top={reduced.n} bottom={reduced.d} color={teal} />
                  </>
                )}
              </Box>
              {shadedCells === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {connector === 'and'
                    ? 'Select at least one coin side and one die face to build an event.'
                    : 'Select at least one coin side or die face to build an event.'}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={playOne} disabled={isRunning || playing}>
                Play it out
              </Button>
              {[20, 200].map((count) => (
                <Button key={count} variant="outlined" onClick={() => run(count)} disabled={isRunning || playing}>
                  Run {count}
                </Button>
              ))}
              <Button variant="text" onClick={reset} disabled={rolls === 0 && !isRunning && !playing}>
                Reset
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`${rolls} trials`} />
              <Chip label={`Observed: ${observedPercent === null ? '-' : `${observedPercent}%`}`} color="primary" />
              <Chip label={`Expected: ${expectedPercent}%`} color="success" />
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

type MarbleColor = 'teal' | 'orange';

export function DrawDependenceLab(_props: LabProps) {
  const initial = { teal: 3, orange: 2 };
  // Default to the leftmost mode ("Keep the marble") regardless of target.
  const [mode, setMode] = useState<'without' | 'with'>('without');
  const [remaining, setRemaining] = useState({ ...initial });
  const [drawn, setDrawn] = useState<MarbleColor[]>([]);

  const tealColor = '#0f6f68';
  const orangeColor = '#c35f2c';
  const total = remaining.teal + remaining.orange;

  const reset = () => {
    setRemaining({ ...initial });
    setDrawn([]);
  };

  const changeMode = (next: 'without' | 'with') => {
    setMode(next);
    reset();
  };

  const draw = () => {
    if (total === 0) return;
    const pickTeal = Math.random() < remaining.teal / total;
    const color: MarbleColor = pickTeal ? 'teal' : 'orange';
    setDrawn((current) => [...current, color]);
    if (mode === 'without') {
      setRemaining((current) => ({
        teal: current.teal - (color === 'teal' ? 1 : 0),
        orange: current.orange - (color === 'orange' ? 1 : 0),
      }));
    }
  };

  const marbleNodes = [
    ...Array.from({ length: remaining.teal }, (_, i) => ({ color: 'teal' as MarbleColor, id: `t${i}` })),
    ...Array.from({ length: remaining.orange }, (_, i) => ({ color: 'orange' as MarbleColor, id: `o${i}` })),
  ];

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Does the next draw depend on the last?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem', maxWidth: '88ch' }}>
          A bag of 3 teal and 2 orange (5 total). Draw one at a time — keep each marble or put it back — and watch the chance of teal on the next draw.
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Button variant={mode === 'without' ? 'contained' : 'outlined'} onClick={() => changeMode('without')}>
            Keep the marble (without replacing)
          </Button>
          <Button variant={mode === 'with' ? 'contained' : 'outlined'} onClick={() => changeMode('with')}>
            Put it back (with replacing)
          </Button>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 0.8fr' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
              In the bag ({total})
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1, minHeight: 44 }}>
              {marbleNodes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  The bag is empty. Reset to draw again.
                </Typography>
              ) : (
                marbleNodes.map((marble) => (
                  <Box
                    key={marble.id}
                    aria-label={marble.color === 'teal' ? 'teal marble' : 'orange marble'}
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      bgcolor: marble.color === 'teal' ? tealColor : orangeColor,
                      boxShadow: 'inset -3px -3px 6px rgba(0,0,0,0.25)',
                    }}
                  />
                ))
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9, display: 'block', mt: 2 }}>
              Draw order
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1, minHeight: 30 }}>
              {drawn.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No draws yet.
                </Typography>
              ) : (
                drawn.map((color, index) => (
                  <Box
                    key={index}
                    aria-label={color === 'teal' ? 'drew teal' : 'drew orange'}
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: color === 'teal' ? tealColor : orangeColor,
                      opacity: 0.85,
                    }}
                  />
                ))
              )}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={draw} disabled={total === 0}>
                Draw one
              </Button>
              <Button variant="text" onClick={reset} disabled={drawn.length === 0}>
                Reset
              </Button>
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(15,111,104,0.10)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                Chance the next draw is teal
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, fontWeight: 700 }}>
                {total === 0 ? (
                  <Box component="span">—</Box>
                ) : (
                  <>
                    <Frac top={remaining.teal} bottom={total} color={tealColor} />
                    <Box component="span" sx={{ mx: 0.75 }}>=</Box>
                    <Box component="span" className="numeric">{percentLabel(remaining.teal, total)}</Box>
                  </>
                )}
              </Box>
            </Box>
            <StatCard label="Teal left" value={String(remaining.teal)} detail={`of ${total} marbles`} />
            <StatCard label="Orange left" value={String(remaining.orange)} detail={`of ${total} marbles`} tone="secondary" />
            <Typography variant="body2" color="text.secondary">
              {mode === 'without'
                ? 'Without replacing, each draw removes a marble, so the next probability changes. The draws are dependent.'
                : 'With replacing, the bag resets every time, so the probability stays 3/5. The draws are independent.'}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Expected-value spinner (Lesson 6). Equal-size wedges each carry a numeric
// payoff. Spinning many times makes the OBSERVED running average drift toward
// the computed E[X] = mean of the payoffs (each wedge equally likely), mirroring
// the observed/expected convergence of the dice-distribution lab.
// ---------------------------------------------------------------------------
type SpinnerGame = { key: string; label: string; payoffs: number[] };

const spinnerGames: Record<string, SpinnerGame> = {
  // Prize spinner: payoffs 0,2,4,6 → E[X] = 12/4 = 3 points.
  prize: { key: 'prize', label: 'Prize spinner', payoffs: [0, 2, 4, 6] },
  // Even-odds spinner: payoffs 3,1,-1,-3 → E[X] = 0 (a fair game on its own).
  fair: { key: 'fair', label: 'Even-odds spinner', payoffs: [3, 1, -1, -3] },
};

const wedgePalette = [
  'rgba(15,111,104,0.9)',
  'rgba(195,95,44,0.9)',
  'rgba(111,63,196,0.85)',
  'rgba(33,113,181,0.85)',
];

/** Point on a circle, measuring degrees clockwise from the top (12 o'clock). */
function polarPoint(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG path for a pie wedge from `startDeg` to `endDeg` (clockwise from top). */
function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarPoint(cx, cy, r, startDeg);
  const e = polarPoint(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

export function ExpectedValueLab({ target }: LabProps) {
  const [gameKey, setGameKey] = useState(target && spinnerGames[target] ? target : 'prize');
  const game = spinnerGames[gameKey] ?? spinnerGames.prize;
  const payoffs = game.payoffs;
  const n = payoffs.length;
  const slice = 360 / n;
  const expected = payoffs.reduce((sum, value) => sum + value, 0) / n;
  const minPayoff = Math.min(...payoffs);
  const maxPayoff = Math.max(...payoffs);
  const span = maxPayoff - minPayoff || 1;

  const [trials, setTrials] = useState(0);
  const [sum, setSum] = useState(0);
  const [latest, setLatest] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTrials(0);
    setSum(0);
    setLatest(null);
    setRotation(0);
    setIsRunning(false);
  };

  const changeGame = (_event: unknown, next: string | null) => {
    if (!next || next === gameKey) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setGameKey(next);
    setTrials(0);
    setSum(0);
    setLatest(null);
    setRotation(0);
    setIsRunning(false);
  };

  const spinOnce = () => {
    if (isRunning) return;
    const idx = Math.floor(Math.random() * n);
    const centerDeg = idx * slice + slice / 2;
    // Rotate the wheel clockwise so the landed wedge's center sits under the
    // fixed pointer at the top, plus a few full turns for a satisfying spin.
    setRotation((current) => (Math.floor(current / 360) + 5) * 360 - centerDeg);
    setLatest(idx);
    setTrials((current) => current + 1);
    setSum((current) => current + payoffs[idx]);
  };

  const runBatch = (count: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    let completed = 0;
    const chunk = count >= 100 ? 5 : 1;
    const intervalMs = count >= 100 ? 18 : 60;
    intervalRef.current = setInterval(() => {
      const nextChunk = Math.min(chunk, count - completed);
      let addSum = 0;
      let lastIdx = latest ?? 0;
      for (let i = 0; i < nextChunk; i += 1) {
        const idx = Math.floor(Math.random() * n);
        addSum += payoffs[idx];
        lastIdx = idx;
      }
      setSum((current) => current + addSum);
      setTrials((current) => current + nextChunk);
      setLatest(lastIdx);
      setRotation((current) => current + 150);
      completed += nextChunk;
      if (completed >= count) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
      }
    }, intervalMs);
  };

  const observedAvg = trials > 0 ? sum / trials : null;
  const expectedPos = ((expected - minPayoff) / span) * 100;
  const observedPos = observedAvg === null ? null : ((observedAvg - minPayoff) / span) * 100;
  const cx = 120;
  const cy = 120;
  const r = 104;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          Average payoff per spin
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Each equal wedge pays the points printed on it. Spin many times and the observed average payoff settles toward the expected value E[X].
        </Typography>

        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup color="primary" exclusive size="small" value={gameKey} onChange={changeGame} aria-label="Choose a spinner">
            {Object.values(spinnerGames).map((entry) => (
              <ToggleButton key={entry.key} value={entry.key} sx={{ fontWeight: 700 }}>
                {entry.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 4, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ position: 'relative', width: '100%', maxWidth: 248, mx: 'auto' }}>
              <Box
                component="svg"
                viewBox="0 0 240 240"
                role="img"
                aria-label={`Spinner with payoffs ${payoffs.join(', ')}`}
                sx={{
                  width: '100%',
                  display: 'block',
                  transform: `rotate(${rotation}deg)`,
                  transition: isRunning ? 'transform 0.12s linear' : 'transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {payoffs.map((value, idx) => {
                  const start = idx * slice;
                  const end = (idx + 1) * slice;
                  const mid = polarPoint(cx, cy, r * 0.62, start + slice / 2);
                  const isLatest = latest === idx;
                  return (
                    <g key={idx}>
                      <path
                        d={wedgePath(cx, cy, r, start, end)}
                        fill={wedgePalette[idx % wedgePalette.length]}
                        stroke={isLatest ? '#1f2430' : '#fffaf0'}
                        strokeWidth={isLatest ? 4 : 2}
                      />
                      <text x={mid.x} y={mid.y + 6} textAnchor="middle" fontWeight="900" fontSize="22" fill="#fffaf0">
                        {value > 0 ? `+${value}` : value}
                      </text>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={16} fill="#fffaf0" stroke="#1f2430" strokeWidth={2} />
              </Box>
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: -2,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '12px solid transparent',
                  borderRight: '12px solid transparent',
                  borderTop: '22px solid #1f2430',
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
                }}
              />
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
              <Button variant="contained" onClick={spinOnce} disabled={isRunning}>
                Spin
              </Button>
              <Button variant="contained" onClick={() => runBatch(20)} disabled={isRunning}>
                Run 20
              </Button>
              <Button variant="contained" onClick={() => runBatch(100)} disabled={isRunning}>
                Run 100
              </Button>
              <Button variant="text" onClick={reset} disabled={trials === 0 && !isRunning}>
                Reset
              </Button>
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'center' }}>
            <StatCard label="Expected value E[X]" value={`${expected % 1 === 0 ? expected : expected.toFixed(2)}`} detail="Average payoff per spin, computed." tone="secondary" />
            <StatCard
              label="Observed average"
              value={observedAvg === null ? '—' : observedAvg.toFixed(2)}
              detail={trials > 0 ? `Across ${trials} ${trials === 1 ? 'spin' : 'spins'}.` : 'Spin to start collecting.'}
              tone="success"
            />
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Observed drifting toward E[X]
                </Typography>
                <Typography variant="caption" color="text.secondary" className="numeric">
                  {minPayoff} … {maxPayoff}
                </Typography>
              </Stack>
              <Box sx={{ position: 'relative', height: 18, borderRadius: 999, bgcolor: 'action.hover', overflow: 'visible' }}>
                <Box sx={{ position: 'absolute', top: -3, bottom: -3, left: `${expectedPos}%`, width: 3, bgcolor: 'secondary.main', borderRadius: 1 }} />
                {observedPos !== null && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: `${observedPos}%`,
                      width: 14,
                      height: 14,
                      transform: 'translate(-50%, -50%)',
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      border: '2px solid #fffaf0',
                      transition: 'left 200ms ease',
                    }}
                  />
                )}
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <Chip label="Dot = observed" color="primary" size="small" />
                <Chip label="Line = expected" color="secondary" size="small" />
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary">
              E[X] = ({payoffs.map((value) => (value < 0 ? `(${value})` : value)).join(' + ')}) ÷ {n} = {expected % 1 === 0 ? expected : expected.toFixed(2)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bayes natural-frequency table (Lesson 7). A fixed population of 1,000 is split
// by who truly has a condition (base rate) and by how each tests (sensitivity +
// false-positive rate). The 2×2 table and the posterior P(condition | positive)
// = true positives / all positives update live as the learner moves the
// controls — counts of real bodies, not abstract percentages.
// ---------------------------------------------------------------------------
const BAYES_POPULATION = 1000;

export function BayesTableLab(_props: LabProps) {
  const [prevPct, setPrevPct] = useState(10);
  const [sensPct, setSensPct] = useState(90);
  const [fprPct, setFprPct] = useState(20);

  const diseased = Math.round((BAYES_POPULATION * prevPct) / 100);
  const healthy = BAYES_POPULATION - diseased;
  const tp = Math.round((diseased * sensPct) / 100);
  const fn = diseased - tp;
  const fp = Math.round((healthy * fprPct) / 100);
  const tn = healthy - fp;
  const totalPos = tp + fp;
  const posterior = totalPos > 0 ? tp / totalPos : 0;
  const posteriorPct = Math.round(posterior * 1000) / 10;
  const tpShare = totalPos > 0 ? (tp / totalPos) * 100 : 0;

  const cellSx = (bg: string, border: string) => ({
    p: 1.25,
    borderRadius: 2,
    bgcolor: bg,
    border: '1.5px solid',
    borderColor: border,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0.25,
  });

  const sliderRow = (
    label: string,
    value: number,
    setValue: (next: number) => void,
    min: number,
    max: number,
    step: number,
    detail: string,
  ) => (
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
        onChange={(_, next) => setValue(Array.isArray(next) ? next[0] : next)}
        aria-label={label}
        getAriaValueText={(v) => `${label} ${v} percent`}
      />
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Box>
  );

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          {BAYES_POPULATION.toLocaleString()} people, split by truth and by test
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '1rem' }}>
          Of {BAYES_POPULATION.toLocaleString()} people, {diseased} truly have the condition and {healthy} do not. The table counts how each group tests, so the posterior is just true positives out of everyone who tests positive.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.25fr 0.75fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1fr', gap: 0.75 }}>
              <Box />
              <Typography variant="caption" sx={{ fontWeight: 800, textAlign: 'center', alignSelf: 'end' }}>
                Tests positive
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, textAlign: 'center', alignSelf: 'end' }}>
                Tests negative
              </Typography>

              <Typography variant="caption" sx={{ fontWeight: 800, alignSelf: 'center' }}>
                Has condition
              </Typography>
              <Box sx={cellSx('rgba(46,125,50,0.16)', 'rgba(46,125,50,0.55)')}>
                <Typography variant="caption" color="text.secondary">True positives</Typography>
                <Typography variant="h6" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>{tp}</Typography>
              </Box>
              <Box sx={cellSx('rgba(120,120,120,0.12)', 'rgba(120,120,120,0.4)')}>
                <Typography variant="caption" color="text.secondary">False negatives</Typography>
                <Typography variant="h6" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>{fn}</Typography>
              </Box>

              <Typography variant="caption" sx={{ fontWeight: 800, alignSelf: 'center' }}>
                No condition
              </Typography>
              <Box sx={cellSx('rgba(237,108,2,0.16)', 'rgba(237,108,2,0.55)')}>
                <Typography variant="caption" color="text.secondary">False positives</Typography>
                <Typography variant="h6" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>{fp}</Typography>
              </Box>
              <Box sx={cellSx('rgba(33,113,181,0.12)', 'rgba(33,113,181,0.4)')}>
                <Typography variant="caption" color="text.secondary">True negatives</Typography>
                <Typography variant="h6" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>{tn}</Typography>
              </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                Of {totalPos} positive tests, the green share truly has the condition:
              </Typography>
              <Box sx={{ display: 'flex', height: 22, borderRadius: 999, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: `${tpShare}%`, bgcolor: 'rgba(46,125,50,0.85)', transition: 'width 200ms ease' }} />
                <Box sx={{ width: `${100 - tpShare}%`, bgcolor: 'rgba(237,108,2,0.85)', transition: 'width 200ms ease' }} />
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                <Chip label={`${tp} true positives`} size="small" sx={{ bgcolor: 'rgba(46,125,50,0.16)', fontWeight: 700 }} />
                <Chip label={`${fp} false positives`} size="small" sx={{ bgcolor: 'rgba(237,108,2,0.16)', fontWeight: 700 }} />
              </Stack>
            </Box>
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
            </Box>
            {sliderRow('Base rate', prevPct, setPrevPct, 1, 50, 1, 'Share of the population with the condition.')}
            {sliderRow('Test sensitivity', sensPct, setSensPct, 50, 100, 5, 'True-positive rate among those who have it.')}
            {sliderRow('False-positive rate', fprPct, setFprPct, 0, 50, 5, 'Healthy people the test flags by mistake.')}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
