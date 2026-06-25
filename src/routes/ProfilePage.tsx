import { Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserSummary } from '../hooks/useUserSummary';
import StreakDisplay from '../components/StreakDisplay';

export default function ProfilePage() {
  const { user, signOutUser } = useAuth();
  const { summary, loading: summaryLoading } = useUserSummary();

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Profile
        </Typography>
        <Button component={RouterLink} to="/course" variant="text" size="small">
          Course map
        </Button>
      </Stack>
      <Card>
        <CardContent>
          {user ? (
            <Stack spacing={2}>
              <Typography variant="body1">{user.displayName || user.email}</Typography>
              <StreakDisplay
                currentStreak={summary?.currentStreak ?? 0}
                longestStreak={summary?.longestStreak}
                loading={summaryLoading}
                variant="inline"
              />
              <Typography variant="body2">Longest streak: {summary?.longestStreak ?? 0} day(s)</Typography>
              <Typography variant="body2">
                Mastered lessons: {Object.values(summary?.masterySummary ?? {}).filter((entry) => entry.status === 'mastered').length}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component={RouterLink} to="/course" variant="contained">
                  Back to course map
                </Button>
                <Button variant="outlined" onClick={signOutUser}>
                  Sign out
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body1">
                Sign in to see your streak, mastery, and saved progress.
              </Typography>
              <Button component={RouterLink} to="/signin" variant="contained">
                Sign in
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
