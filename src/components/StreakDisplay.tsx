import { Box, Stack, Tooltip, Typography } from '@mui/material';

interface StreakDisplayProps {
  /** The learner's current consecutive-day streak. */
  currentStreak: number;
  /** Longest streak ever reached, shown as a subtle "best" readout when present. */
  longestStreak?: number;
  /**
   * `banner` is the prominent home-surface treatment (filled card, larger number).
   * `inline` is a lighter treatment for dense surfaces like the profile card.
   */
  variant?: 'banner' | 'inline';
  /** While the summary is loading we render a calm placeholder instead of "0". */
  loading?: boolean;
}

const STREAK_HELP =
  'Your streak counts the days in a row you practice. Do at least one lesson step each day to keep it going — miss a day and it resets to 1.';

function FlameIcon({ size, active }: { size: number; active: boolean }) {
  // Inline SVG keeps the flame crisp at any size without pulling in an icon
  // dependency. A lit flame uses the app's warm accent; a dormant one is muted.
  const outer = active ? '#f5a623' : '#c9cdd6';
  const inner = active ? '#c35f2c' : '#aab0bb';
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden
      sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M12 2c.6 3-1.8 4.2-3.2 6C7.2 9.9 6.5 11.7 6.5 13.8 6.5 17.8 9 21 12.3 21c3.3 0 5.7-2.9 5.7-6.5 0-2.1-1-3.9-2.4-5.3.2 1.3-.4 2.4-1.4 2.9.5-2.6-.4-5.4-2.2-7.1z"
        fill={outer}
      />
      <path
        d="M12.2 11c.9 1 1.4 2.1 1.4 3.3 0 1.8-1.1 3.2-2.6 3.2-1.4 0-2.4-1.1-2.4-2.6 0-1.6 1.2-2.6 1.9-3.7.3.7.9 1.1 1.7 1.1-.4-.5-.4-1 0-1.3z"
        fill={inner}
      />
    </Box>
  );
}

/**
 * Reusable streak indicator: flame + count + "day streak" with a plain-language
 * tooltip explaining how the streak is kept. Both the home surface and the
 * profile render this from the same summary data so there is one source of truth.
 */
function StreakDisplay({
  currentStreak,
  longestStreak,
  variant = 'banner',
  loading = false,
}: StreakDisplayProps) {
  const hasStreak = currentStreak > 0;
  const isBanner = variant === 'banner';
  const numberSize = isBanner ? 34 : 22;

  const headline = loading
    ? 'Loading your streak…'
    : hasStreak
      ? `${currentStreak} day streak`
      : 'Start your streak today';

  const subline = loading
    ? 'Hang tight'
    : hasStreak
      ? 'Practice today to keep it alive'
      : 'Do one lesson step to begin';

  return (
    <Tooltip title={STREAK_HELP} arrow placement={isBanner ? 'bottom' : 'top'}>
      <Stack
        direction="row"
        spacing={isBanner ? 1.5 : 1}
        alignItems="center"
        role="status"
        aria-label={
          loading
            ? 'Loading your streak'
            : hasStreak
              ? `Current streak: ${currentStreak} days`
              : 'No active streak yet'
        }
        sx={{
          px: isBanner ? 2 : 1.25,
          py: isBanner ? 1.25 : 0.75,
          borderRadius: 3,
          border: '1px solid rgba(245,166,35,0.35)',
          background: hasStreak
            ? 'linear-gradient(135deg, rgba(255,243,214,0.95) 0%, rgba(255,225,184,0.9) 100%)'
            : 'rgba(15,111,104,0.04)',
          cursor: 'default',
        }}
      >
        <FlameIcon size={isBanner ? 30 : 22} active={hasStreak && !loading} />
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="baseline">
            {hasStreak && !loading && (
              <Typography
                className="numeric"
                component="span"
                sx={{ fontWeight: 800, fontSize: numberSize, lineHeight: 1, color: 'secondary.main' }}
              >
                {currentStreak}
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontWeight: 700,
                fontSize: isBanner ? 16 : 14,
                lineHeight: 1.1,
                color: 'text.primary',
              }}
            >
              {hasStreak && !loading ? 'day streak' : headline}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {hasStreak && longestStreak && longestStreak > currentStreak && !loading ? (
              <>
                Best: <span className="numeric">{longestStreak}</span> days · {subline}
              </>
            ) : (
              subline
            )}
          </Typography>
        </Box>
      </Stack>
    </Tooltip>
  );
}

export default StreakDisplay;
