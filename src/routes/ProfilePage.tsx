import { useEffect, useState } from 'react';
import { Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadUserSummary, UserSummary } from '../services/progressService';

export default function ProfilePage() {
  const { user, signOutUser } = useAuth();
  const [summary, setSummary] = useState<UserSummary | null>(null);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }

    loadUserSummary(user.uid).then(setSummary);
  }, [user]);

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Profile
        </Typography>
        <Button component={RouterLink} to="/" variant="text" size="small">
          Home
        </Button>
      </Stack>
      <Card>
        <CardContent>
          {user ? (
            <Stack spacing={2}>
              <Typography variant="body1">{user.displayName || user.email}</Typography>
              <Typography variant="body2">Current streak: {summary?.currentStreak ?? 0} day(s)</Typography>
              <Typography variant="body2">Longest streak: {summary?.longestStreak ?? 0} day(s)</Typography>
              <Typography variant="body2">
                Mastered lessons: {Object.values(summary?.masterySummary ?? {}).filter((entry) => entry.status === 'mastered').length}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component={RouterLink} to="/" variant="contained">
                  Return home
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
