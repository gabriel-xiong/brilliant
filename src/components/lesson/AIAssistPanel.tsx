import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Minimal **bold** support so AI/fallback prose can emphasize a clause the same
 * way authored lesson text does. This is the only markdown we honor here.
 */
const BOLD_PATTERN = /(\*\*[^*]+\*\*)/g;
function renderBold(text: string) {
  return text.split(BOLD_PATTERN).map((part, index) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (match) return <strong key={index}>{match[1]}</strong>;
    return <span key={index}>{part}</span>;
  });
}

export interface AIAssistPanelProps {
  /** Optional heading shown above the body. */
  title?: string;
  /** When true, show the "Thinking…" loading state instead of text. */
  loading?: boolean;
  /** Prose to render. Supports `**bold**`. Newlines become separate lines. */
  text?: string;
  /** Show the small "AI" tag (only when the prose actually came from the model). */
  aiTag?: boolean;
}

/**
 * A small, theme-consistent surface for AI (or deterministic fallback) prose.
 * Used by the in-lesson "Explain my answer" and "Explain another way"
 * affordances. It never renders error states — callers pass the deterministic
 * fallback text when the model is off/unavailable, so this is purely
 * presentational.
 */
export function AIAssistPanel({ title, loading = false, text, aiTag = false }: AIAssistPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  if (!loading && !text) return null;

  const lines = (text ?? '').split('\n');

  return (
    <Box
      component={motion.div}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      role="note"
      aria-live="polite"
      sx={{
        mt: 1.5,
        p: { xs: 1.5, md: 1.75 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'rgba(15,111,104,0.28)',
        bgcolor: 'rgba(15,111,104,0.06)',
        overflowWrap: 'anywhere',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: title || aiTag ? 0.75 : 0 }}>
        {title && (
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            {title}
          </Typography>
        )}
        {aiTag && (
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
          <CircularProgress size={15} thickness={6} sx={{ color: 'primary.main' }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Thinking…
          </Typography>
        </Stack>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {lines.map((line, index) =>
            line.trim() ? (
              <Typography
                key={index}
                variant="body2"
                sx={{ lineHeight: 1.5, color: 'text.primary', overflowWrap: 'anywhere' }}
              >
                {renderBold(line)}
              </Typography>
            ) : (
              <Box key={index} sx={{ height: 6 }} />
            ),
          )}
        </Box>
      )}
    </Box>
  );
}

export default AIAssistPanel;
