import { Box, Button, Card, CardContent, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useEffect, useRef, useState } from 'react';

/**
 * Arcade ball-toss Expected Value lab.
 *
 * A target of three concentric rings. Each ring is an outcome with a point value
 * and a landing probability: the big outer ring is easy to hit (high chance, low
 * points) while the small bullseye is hard (low chance, high points). The value ×
 * probability structure is shown for every ring, and the theoretical
 *   EV = Σ(points × probability)
 * is displayed up front so the experiment is legible before the learner acts.
 *
 * The headline interaction is BATCH simulation: launch many balls at once and
 * watch the running average points-per-ball converge toward the EV as the count
 * grows. Balls are simulated numerically (so 100s are cheap) and animated in
 * small ticks; only a bounded sample of landing dots is rendered.
 */

interface LabProps {
  target?: string;
}

interface Ring {
  id: 'outer' | 'middle' | 'inner';
  label: string;
  points: number;
  prob: number;
  rInner: number;
  rOuter: number;
  fill: string;
  stroke: string;
}

const TARGET_R = 110;

// Probabilities sum to 1 and EV = 1×0.6 + 4×0.3 + 12×0.1 = 3.0 — chosen to match
// Lesson 6's "average payoff 3 points" so the demo converges to the same value
// the lesson computes.
const RINGS: Ring[] = [
  { id: 'outer', label: 'Outer ring', points: 1, prob: 0.6, rInner: 70, rOuter: TARGET_R, fill: 'rgba(15,111,104,0.20)', stroke: '#0f6f68' },
  { id: 'middle', label: 'Middle ring', points: 4, prob: 0.3, rInner: 35, rOuter: 70, fill: 'rgba(195,95,44,0.22)', stroke: '#c35f2c' },
  { id: 'inner', label: 'Bullseye', points: 12, prob: 0.1, rInner: 0, rOuter: 35, fill: 'rgba(111,63,196,0.26)', stroke: '#6f3fc4' },
];

const EV = RINGS.reduce((sum, ring) => sum + ring.points * ring.prob, 0);
const DISPLAY_CAP = 140;
const BATCH_OPTIONS = [10, 50, 100];

type Counts = Record<Ring['id'], number>;
const emptyCounts: Counts = { outer: 0, middle: 0, inner: 0 };

interface Dot {
  x: number;
  y: number;
  color: string;
}

function sampleRing(): Ring {
  const r = Math.random();
  let acc = 0;
  for (const ring of RINGS) {
    acc += ring.prob;
    if (r < acc) return ring;
  }
  return RINGS[RINGS.length - 1];
}

// Uniform-area random point inside a ring's annulus, for natural-looking scatter.
function randomDot(ring: Ring): Dot {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(ring.rInner ** 2 + Math.random() * (ring.rOuter ** 2 - ring.rInner ** 2));
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, color: ring.stroke };
}

export function ArcadeRingsLab(_props: LabProps) {
  const [balls, setBalls] = useState(0);
  const [points, setPoints] = useState(0);
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [dots, setDots] = useState<Dot[]>([]);
  const [rolling, setRolling] = useState(false);
  const [batch, setBatch] = useState(100);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRolling(false);
    setBalls(0);
    setPoints(0);
    setCounts(emptyCounts);
    setDots([]);
  };

  const roll = (count: number) => {
    if (rolling || count <= 0) return;
    setRolling(true);
    let remaining = count;
    const ticks = Math.min(28, count);
    const perTick = Math.max(1, Math.ceil(count / ticks));

    const step = () => {
      const take = Math.min(perTick, remaining);
      let addPoints = 0;
      const addCounts: Counts = { outer: 0, middle: 0, inner: 0 };
      const newDots: Dot[] = [];
      for (let i = 0; i < take; i++) {
        const ring = sampleRing();
        addPoints += ring.points;
        addCounts[ring.id] += 1;
        newDots.push(randomDot(ring));
      }
      setBalls((value) => value + take);
      setPoints((value) => value + addPoints);
      setCounts((value) => ({
        outer: value.outer + addCounts.outer,
        middle: value.middle + addCounts.middle,
        inner: value.inner + addCounts.inner,
      }));
      setDots((value) => [...value, ...newDots].slice(-DISPLAY_CAP));
      remaining -= take;
      if (remaining > 0) {
        timer.current = setTimeout(step, 32);
      } else {
        setRolling(false);
        timer.current = null;
      }
    };

    step();
  };

  const average = balls > 0 ? points / balls : 0;
  const formattedAverage = balls > 0 ? average.toFixed(2) : '— ';

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Arcade toss — aim for the rings
          </Typography>
          <Chip
            label={
              <span>
                Expected value{' '}
                <Box component="span" className="numeric" sx={{ fontWeight: 900 }}>
                  {EV.toFixed(2)}
                </Box>{' '}
                pts/ball
              </span>
            }
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 240px) 1fr' },
            gap: 2,
            alignItems: 'center',
          }}
        >
          {/* Target */}
          <Box sx={{ justifySelf: 'center', width: '100%', maxWidth: 240 }}>
            <Box
              component="svg"
              viewBox="-120 -120 240 240"
              sx={{ width: '100%', height: 'auto', display: 'block' }}
              role="img"
              aria-label="Concentric arcade target: outer ring 1 point at 60%, middle ring 4 points at 30%, bullseye 12 points at 10%."
            >
              {RINGS.map((ring) => (
                <circle
                  key={ring.id}
                  cx={0}
                  cy={0}
                  r={ring.rOuter}
                  fill={ring.fill}
                  stroke={ring.stroke}
                  strokeWidth={1.5}
                />
              ))}
              {/* Ring labels */}
              {RINGS.map((ring) => {
                const labelY = -(ring.rInner + (ring.rOuter - ring.rInner) / 2);
                return (
                  <text
                    key={`label-${ring.id}`}
                    x={0}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={ring.id === 'inner' ? 11 : 12}
                    fontWeight={800}
                    fill={ring.stroke}
                  >
                    {ring.points} pt{ring.points === 1 ? '' : 's'} × {Math.round(ring.prob * 100)}%
                  </text>
                );
              })}
              {/* Landing dots */}
              {dots.map((dot, index) => (
                <circle key={index} cx={dot.x} cy={dot.y} r={2.6} fill={dot.color} fillOpacity={0.85} />
              ))}
            </Box>
          </Box>

          {/* Stats + per-ring breakdown */}
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 1.5 }}>
              <StatBox label="Balls" value={balls > 0 ? String(balls) : '— '} tone="primary" />
              <StatBox label="Total points" value={balls > 0 ? String(points) : '— '} tone="secondary" />
              <StatBox label="Avg / ball" value={formattedAverage} tone="success" detail={`EV ${EV.toFixed(2)}`} />
            </Box>

            <Stack spacing={0.75}>
              {RINGS.map((ring) => {
                const count = counts[ring.id];
                const observedShare = balls > 0 ? Math.round((count / balls) * 100) : null;
                return (
                  <Box
                    key={ring.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1,
                      py: 0.5,
                      borderRadius: 2,
                      bgcolor: ring.fill,
                    }}
                  >
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: ring.stroke, flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 78 }}>
                      {ring.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      <Box component="span" className="numeric">{ring.points}</Box> pt ×{' '}
                      <Box component="span" className="numeric">{Math.round(ring.prob * 100)}%</Box> ={' '}
                      <Box component="span" className="numeric" sx={{ fontWeight: 700 }}>
                        {(ring.points * ring.prob).toFixed(1)}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="numeric" sx={{ minWidth: 64, textAlign: 'right' }}>
                      {observedShare === null ? '— ' : `${count} (${observedShare}%)`}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        </Box>

        {/* Controls */}
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={batch}
            onChange={(_event, next: number | null) => next && setBatch(next)}
            disabled={rolling}
          >
            {BATCH_OPTIONS.map((option) => (
              <ToggleButton key={option} value={option} sx={{ fontWeight: 700 }}>
                {option}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button variant="contained" onClick={() => roll(batch)} disabled={rolling}>
            {rolling ? 'Tossing…' : `Toss ${batch} balls`}
          </Button>
          <Button variant="text" onClick={reset} disabled={rolling && balls === 0}>
            Reset
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%' }}>
            Toss more balls and watch the average per ball settle toward the expected value.
          </Typography>
        </Stack>

        <Box aria-live="polite" role="status" sx={visuallyHidden}>
          {balls > 0
            ? `${balls} balls tossed, ${points} points total, averaging ${formattedAverage} points per ball versus an expected value of ${EV.toFixed(2)}.`
            : ''}
        </Box>
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: 'primary' | 'secondary' | 'success';
}) {
  const bgByTone = {
    primary: 'rgba(15,111,104,0.13)',
    secondary: 'rgba(195,95,44,0.13)',
    success: 'rgba(46,125,50,0.12)',
  } as const;
  return (
    <Box sx={{ p: 1.25, borderRadius: 3, bgcolor: bgByTone[tone], textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="h6" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary" className="numeric">
          {detail}
        </Typography>
      )}
    </Box>
  );
}
