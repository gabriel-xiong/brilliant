import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserSummary } from '../hooks/useUserSummary';
import StreakDisplay from '../components/StreakDisplay';
import { ALL_CONCEPTS, CONCEPT_LABELS } from '../services/ai/conceptSchemas';
import {
  isPracticeUnlockedForConcept,
  lessonIdForConcept,
  unlockedConcepts,
  type StatusGetter,
} from '../services/practiceAccess';
import { getEffectiveStatus } from '../services/lessonProgression';
import { getMasteryLabel } from '../services/masteryLabels';
import {
  BAND_COLOR,
  BAND_LABEL,
  levelToBand,
  recommendedReviewConcepts,
  type ReviewConceptRecommendation,
} from '../services/practiceService';
import type { UserSummary } from '../services/progressService';

export default function ProfilePage() {
  const { user, signOutUser } = useAuth();
  const { summary, loading } = useUserSummary();

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Your progress
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to="/practice" variant="outlined" size="small">
            Practice
          </Button>
          <Button component={RouterLink} to="/course" variant="text" size="small">
            Course map
          </Button>
        </Stack>
      </Stack>

      {!user ? (
        <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="body1">
                Sign in to see your streak, per-concept mastery, and saved progress.
              </Typography>
              <Button component={RouterLink} to="/signin" variant="contained" sx={{ alignSelf: 'flex-start' }}>
                Sign in
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <SignedInDashboard user={user} summary={summary} loading={loading} onSignOut={signOutUser} />
      )}
    </Container>
  );
}

function SignedInDashboard({
  user,
  summary,
  loading,
  onSignOut,
}: {
  user: { uid: string; displayName?: string | null; email?: string | null };
  summary: UserSummary | null;
  loading: boolean;
  onSignOut: () => void;
}) {
  const getStatus: StatusGetter = (lessonId) => getEffectiveStatus(lessonId, summary, user.uid);
  const unlocked = unlockedConcepts(getStatus);
  const masteredCount = Object.values(summary?.masterySummary ?? {}).filter(
    (entry) => entry.status === 'mastered',
  ).length;

  // Roll the per-concept practice stats up into headline numbers so the learner
  // sees their overall practice effort and accuracy at a glance.
  const practiceEntries = Object.values(summary?.practiceStats ?? {});
  const totalAnswered = practiceEntries.reduce((sum, entry) => sum + (entry.answered ?? 0), 0);
  const totalCorrect = practiceEntries.reduce((sum, entry) => sum + (entry.correct ?? 0), 0);
  const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;
  const conceptsPracticed = practiceEntries.filter((entry) => (entry.answered ?? 0) > 0).length;

  const signalNow = useMemo(() => new Date(), [summary]);
  const reviewSuggestions = useMemo(
    () =>
      recommendedReviewConcepts(
        unlocked,
        summary,
        signalNow,
        (conceptId) => {
          const lessonId = lessonIdForConcept(conceptId);
          return lessonId ? getStatus(lessonId) : undefined;
        },
        3,
      ),
    [getStatus, signalNow, summary, unlocked],
  );
  const reviewConcepts = reviewSuggestions.map((suggestion) => suggestion.conceptId);
  const reviewHref =
    reviewConcepts.length > 0 ? `/practice?mode=review&concepts=${reviewConcepts.join(',')}` : '/practice';
  const dueSuggestionCount = reviewSuggestions.filter((suggestion) => suggestion.dueForReview).length;

  return (
    <Stack spacing={2.5}>
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {user.displayName || user.email}
              </Typography>
              <StreakDisplay
                currentStreak={summary?.currentStreak ?? 0}
                longestStreak={summary?.longestStreak}
                loading={loading}
                variant="inline"
              />
            </Box>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.5, rowGap: 1.5 }}>
              <Stat label="Day streak" value={summary?.currentStreak ?? 0} />
              <Stat label="Best streak" value={summary?.longestStreak ?? 0} />
              <Stat label="Lessons mastered" value={masteredCount} />
              <Stat label="Problems solved" value={totalAnswered} />
              {overallAccuracy !== null && <Stat label="Practice accuracy" value={`${overallAccuracy}%`} />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
              Concept mastery
            </Typography>
            {conceptsPracticed > 0 && (
              <Typography variant="caption" color="text.secondary">
                {conceptsPracticed} of {ALL_CONCEPTS.length} concepts practiced
              </Typography>
            )}
          </Box>
          {reviewSuggestions.length > 0 && (
            <Button
              component={RouterLink}
              to={reviewHref}
              variant="contained"
              size="small"
            >
              Review weak spots
            </Button>
          )}
        </Stack>

        {reviewSuggestions.length > 0 && (
          <Card
            variant="outlined"
            sx={{
              mb: 1.5,
              border: '1px solid rgba(67,97,238,0.18)',
              background: 'linear-gradient(135deg, rgba(67,97,238,0.08), rgba(255,255,255,0) 55%), #fff',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1.5}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                      Suggested review
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        dueSuggestionCount > 0
                          ? `${dueSuggestionCount} due now`
                          : `${reviewSuggestions.length} topic${reviewSuggestions.length === 1 ? '' : 's'} picked`
                      }
                      color={dueSuggestionCount > 0 ? 'warning' : 'primary'}
                      variant={dueSuggestionCount > 0 ? 'filled' : 'outlined'}
                      sx={{ height: 22, fontWeight: 800 }}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    Start with topics that are due, recently missed, or need first practice.
                  </Typography>
                </Box>
                <Button component={RouterLink} to={reviewHref} variant="contained" size="small" sx={{ flexShrink: 0 }}>
                  Start review
                </Button>
              </Stack>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
                {reviewSuggestions.map((suggestion) => (
                  <Chip
                    key={suggestion.conceptId}
                    size="small"
                    label={`${CONCEPT_LABELS[suggestion.conceptId]} · ${shortReviewReason(suggestion)}`}
                    color={suggestion.dueForReview ? 'warning' : 'default'}
                    variant={suggestion.dueForReview ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 750 }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        <Stack spacing={1.25}>
          {ALL_CONCEPTS.map((conceptId) => {
            const lessonId = lessonIdForConcept(conceptId);
            const status = lessonId ? getStatus(lessonId) : 'not-started';
            const unlockedConcept = isPracticeUnlockedForConcept(conceptId, getStatus);
            const stat = summary?.practiceStats?.[conceptId];
            const accuracy = stat && stat.answered > 0 ? Math.round((stat.correct / stat.answered) * 100) : null;
            const bestBand = stat && stat.bestLevel > 0 ? levelToBand(stat.bestLevel) : null;
            const suggestion = reviewSuggestions.find((entry) => entry.conceptId === conceptId) ?? null;

            return (
              <ConceptRow
                key={conceptId}
                label={CONCEPT_LABELS[conceptId]}
                status={status}
                unlocked={unlockedConcept}
                answered={stat?.answered ?? 0}
                accuracy={accuracy}
                bestBand={bestBand}
                bestLevel={stat?.bestLevel ?? 0}
                suggestion={suggestion}
                practiceTo={`/practice?concept=${conceptId}`}
              />
            );
          })}
        </Stack>
      </Box>

      <Divider />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component={RouterLink} to="/course" variant="contained">
          Back to course map
        </Button>
        <Button variant="outlined" onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );
}

function shortReviewReason(suggestion: ReviewConceptRecommendation): string {
  switch (suggestion.reason) {
    case 'recent-misses':
      return 'recent misses';
    case 'due':
      return 'due review';
    case 'low-accuracy':
      return 'low accuracy';
    case 'needs-evidence':
      return 'more signal needed';
    case 'new':
      return 'first practice';
    case 'keep-fresh':
      return 'keep fresh';
  }
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 64 }}>
      <Typography variant="h5" className="numeric" sx={{ fontWeight: 800, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}

function ConceptRow({
  label,
  status,
  unlocked,
  answered,
  accuracy,
  bestBand,
  bestLevel,
  suggestion,
  practiceTo,
}: {
  label: string;
  status: string | null | undefined;
  unlocked: boolean;
  answered: number;
  accuracy: number | null;
  bestBand: ReturnType<typeof levelToBand> | null;
  bestLevel: number;
  suggestion: ReviewConceptRecommendation | null;
  practiceTo: string;
}) {
  const statusColor =
    status === 'mastered' || status === 'proficient'
      ? 'success'
      : status === 'completed'
        ? 'warning'
        : !status || status === 'not-started'
          ? 'default'
          : 'primary';

  return (
    <Card variant="outlined" sx={{ border: '1px solid rgba(31,36,48,0.08)', boxShadow: 'none' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.25}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {label}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={getMasteryLabel(status ?? undefined)}
                color={statusColor}
                variant={!status || status === 'not-started' ? 'outlined' : 'filled'}
                sx={{ fontWeight: 700, height: 22 }}
              />
              {bestBand && (
                <Chip
                  size="small"
                  variant="outlined"
                  color={BAND_COLOR[bestBand]}
                  label={`Best: ${BAND_LABEL[bestBand]} · Lv ${bestLevel}`}
                  sx={{ fontWeight: 700, height: 22 }}
                />
              )}
              {suggestion?.dueForReview && (
                <Chip size="small" color="warning" label="Review due" sx={{ fontWeight: 800, height: 22 }} />
              )}
            </Stack>
          </Box>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0 }}>
            <Box sx={{ minWidth: 110 }}>
              {answered > 0 ? (
                <>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Accuracy
                    </Typography>
                    <Typography variant="caption" className="numeric" sx={{ fontWeight: 800 }}>
                      {accuracy}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={accuracy ?? 0}
                    sx={{ height: 6, borderRadius: 999 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {answered} answered
                  </Typography>
                </>
              ) : (
                <Box>
                  <Typography variant="caption" color={suggestion ? 'primary' : 'text.secondary'} sx={{ fontWeight: 700 }}>
                    {suggestion ? shortReviewReason(suggestion) : 'No practice yet'}
                  </Typography>
                  {suggestion && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      Suggested review
                    </Typography>
                  )}
                </Box>
              )}
            </Box>

            {unlocked ? (
              <Button component={RouterLink} to={practiceTo} variant="outlined" size="small" sx={{ flexShrink: 0 }}>
                Practice
              </Button>
            ) : (
              <Tooltip title="Complete the lesson that teaches this to unlock practice" arrow>
                <span>
                  <Button variant="outlined" size="small" disabled sx={{ flexShrink: 0 }}>
                    Locked
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
