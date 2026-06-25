import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FrequencyChart } from './FrequencyChart';

interface DiceRollSimulatorProps {
  rolls: number;
  target?: string;
}

interface WheelHand {
  id: number;
  value: number;
  angle: number;
  length: number;
  // Per-hand sweep timing so a batch of markers settles out of sync instead of
  // snapping in eerie unison. Cosmetic only — does not affect the outcome.
  spinMs: number;
  spinDelayMs: number;
}

const runSizes = [6, 120, 600];
const faceAngles: Record<number, number> = {
  1: 30,
  2: 90,
  3: 150,
  4: 210,
  5: 270,
  6: 330,
};

const previewHands: WheelHand[] = [1, 2, 3, 4, 5, 6].map((value, index) => ({
  id: -value,
  value,
  angle: faceAngles[value],
  length: 34 + index * 3,
  spinMs: 520,
  spinDelayMs: 0,
}));

export function DiceRollSimulator(_props: DiceRollSimulatorProps) {
  const [results, setResults] = useState<number[]>([]);
  // Default to the leftmost dropdown option (Face 1) and the leftmost spin
  // preset (6) regardless of the lesson-provided target.
  const [targetFace, setTargetFace] = useState(1);
  const [hands, setHands] = useState<WheelHand[]>(previewHands);
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunSize, setActiveRunSize] = useState<number | null>(null);
  const [customRunSize, setCustomRunSize] = useState('6');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const counts = useMemo(() => {
    return results.reduce((acc, result) => {
      acc[result] = (acc[result] ?? 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }, [results]);

  const targetCount = counts[targetFace] ?? 0;
  const experimentalProbability = results.length > 0 ? targetCount / results.length : 0;
  const observedPercent = Math.round(experimentalProbability * 1000) / 10;
  const expectedPercent = Math.round((1 / 6) * 1000) / 10;
  const gapPoints = Math.round(Math.abs(experimentalProbability - 1 / 6) * 1000) / 10;

  const addSpinChunk = (chunkSize: number) => {
    const nextHands = Array.from({ length: chunkSize }, () => {
      const value = Math.floor(Math.random() * 6) + 1;
      // Each face owns a 60° sector centered on faceAngles[value]. Drop the
      // marker at a uniformly random angle spanning the full sector (with a
      // tiny inset to avoid landing on sector seams) instead of the old fixed
      // center ± a small jitter. This keeps the marker faithful to the actual
      // outcome (correct face/sector) while scattering markers across the whole
      // wheel instead of clustering them at six fixed offsets.
      const sectorCenter = faceAngles[value];
      const angle = sectorCenter - 28 + Math.random() * 56;
      return {
        id: handIdRef.current++,
        value,
        angle,
        length: 38 + Math.floor(Math.random() * 48),
        spinMs: 380 + Math.floor(Math.random() * 420), // 380–800ms
        spinDelayMs: Math.floor(Math.random() * 180), // 0–180ms
      };
    }) satisfies WheelHand[];

    setResults((current) => [...current, ...nextHands.map((hand) => hand.value)]);
    setHands((current) => [...nextHands, ...current.filter((hand) => hand.id >= 0)].slice(0, 90));
  };

  const runSpins = (totalSpins: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    setIsRunning(true);
    setActiveRunSize(totalSpins);

    let completed = 0;
    const chunkSize = totalSpins >= 600 ? 10 : totalSpins >= 120 ? 5 : 1;
    const intervalMs = totalSpins >= 600 ? 16 : totalSpins >= 120 ? 28 : 90;

    intervalRef.current = setInterval(() => {
      const remaining = totalSpins - completed;
      const nextChunkSize = Math.min(chunkSize, remaining);
      addSpinChunk(nextChunkSize);
      completed += nextChunkSize;

      if (completed >= totalSpins) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setActiveRunSize(null);
      }
    }, intervalMs);
  };

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setResults([]);
    setHands(previewHands);
    setIsRunning(false);
    setActiveRunSize(null);
  };

  const parsedCustomRunSize = Number(customRunSize);
  const validCustomRunSize = Number.isInteger(parsedCustomRunSize) && parsedCustomRunSize > 0 && parsedCustomRunSize <= 1000;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(320px, 0.9fr) 1.1fr' },
            gap: 3,
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Box
            aria-label="Six-face wheel with spin hands"
            sx={{
              width: { xs: 280, sm: 340 },
              height: { xs: 280, sm: 340 },
              mx: 'auto',
              position: 'relative',
              borderRadius: '50%',
              background:
                'conic-gradient(#ffe1a8 0deg 60deg, #f9b887 60deg 120deg, #bfe4dc 120deg 180deg, #9dccd3 180deg 240deg, #d7c0f2 240deg 300deg, #f4d8e6 300deg 360deg)',
              border: '10px solid #fffdf7',
              boxShadow: '0 20px 60px rgba(31,36,48,0.18)',
              overflow: 'hidden',
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <Box
                key={face}
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `rotate(${faceAngles[face]}deg) translateY(-118px) rotate(-${faceAngles[face]}deg)`,
                  width: 42,
                  height: 42,
                  ml: '-21px',
                  mt: '-21px',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 900,
                  bgcolor: face === targetFace ? 'primary.main' : 'rgba(255,253,247,0.72)',
                  color: face === targetFace ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {face}
              </Box>
            ))}
            {hands.map((hand) => {
              const restOpacity = hand.value === targetFace ? 0.95 : 0.55;
              // Unique keyframe name per hand: each sweep starts from this hand's
              // own angle, so a shared name would let one definition clobber the
              // rest. The id keeps it distinct (negatives are preview markers).
              const sweepKey = `handSweep_${hand.id < 0 ? `p${-hand.id}` : hand.id}`;
              return (
                <Box
                  key={hand.id}
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 3,
                    height: `${hand.length}%`,
                    transformOrigin: '50% 0%',
                    transform: `rotate(${hand.angle}deg) translateY(-2px)`,
                    bgcolor: hand.value === targetFace ? 'primary.dark' : 'rgba(31,36,48,0.38)',
                    borderRadius: 999,
                    opacity: hand.id < 0 ? 0.32 : restOpacity,
                    willChange: 'transform',
                    animation:
                      hand.id < 0
                        ? 'none'
                        : `${sweepKey} ${hand.spinMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${hand.spinDelayMs}ms both`,
                    [`@keyframes ${sweepKey}`]: {
                      '0%': { transform: `rotate(${hand.angle - 190}deg) translateY(-2px)`, opacity: 0 },
                      '100%': { transform: `rotate(${hand.angle}deg) translateY(-2px)`, opacity: restOpacity },
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      animation: 'none',
                    },
                  }}
                />
              );
            })}
            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 34,
                height: 34,
                ml: '-17px',
                mt: '-17px',
                borderRadius: '50%',
                bgcolor: '#1f2430',
                border: '5px solid #fffdf7',
              }}
            />
          </Box>

          <Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.5 }}>
              <TextField
                select
                size="small"
                label="Target face"
                value={targetFace}
                onChange={(event) => setTargetFace(Number(event.target.value))}
                disabled={isRunning}
                sx={{ minWidth: 150 }}
              >
                {[1, 2, 3, 4, 5, 6].map((face) => (
                  <MenuItem key={face} value={face}>
                    Face {face}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 2 }}>
              <TextField
                size="small"
                label="Number of spins"
                type="number"
                value={customRunSize}
                onChange={(event) => setCustomRunSize(event.target.value)}
                disabled={isRunning}
                error={customRunSize.length > 0 && !validCustomRunSize}
                helperText={customRunSize.length > 0 && !validCustomRunSize ? '1–1000' : ''}
                inputProps={{ min: 1, max: 1000, step: 1 }}
                sx={{
                  width: 150,
                  '& .MuiFormHelperText-root': { position: 'absolute', top: '100%', m: 0.25 },
                }}
              />
              {runSizes.map((size) => (
                <Button
                  key={size}
                  variant={customRunSize === String(size) ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setCustomRunSize(String(size))}
                  disabled={isRunning}
                  sx={{
                    minWidth: 52,
                    height: 38,
                    px: 1.5,
                    fontSize: '0.95rem',
                    boxShadow: customRunSize === String(size) ? 1 : 'none',
                  }}
                >
                  {size}
                </Button>
              ))}
              <Button
                variant="contained"
                onClick={() => runSpins(parsedCustomRunSize)}
                disabled={isRunning || !validCustomRunSize}
                sx={{ height: 38, px: 3, minWidth: 80 }}
              >
                Spin
              </Button>
              <Button variant="text" onClick={reset} disabled={results.length === 0 && !isRunning} sx={{ minWidth: 64 }}>
                Reset
              </Button>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(195,95,44,0.13)' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Expected
                </Typography>
                <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
                  {expectedPercent}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  One face out of six should win in the long run.
                </Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(15,111,104,0.13)' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Observed so far
                </Typography>
                <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
                  {results.length ? `${observedPercent}%` : '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Face {targetFace} has landed {targetCount} time{targetCount === 1 ? '' : 's'}.
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip label={`${results.length} spins`} sx={{ height: 34 }} />
              <Chip
                label={results.length ? `Difference: ${gapPoints}%` : 'Difference: —'}
                color={results.length > 0 && gapPoints <= 3 ? 'success' : 'default'}
                sx={{ fontSize: '0.98rem', fontWeight: 800, height: 40, px: 0.5 }}
              />
              {isRunning && <Chip label={`running ${activeRunSize}...`} color="secondary" sx={{ height: 34 }} />}
            </Stack>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 1, maxWidth: '64ch' }}>
              {results.length === 0
                ? 'Try 12 first, then increase the number of spins.'
                : 'If observed is not exactly 16.7%, that is normal — randomness is noisy.'}
            </Typography>
          </Box>
        </Box>

        {results.length > 0 && (
          <FrequencyChart
            values={Array.from({ length: 6 }, (_, index) => ({
              label: String(index + 1),
              count: counts[index + 1] ?? 0,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
