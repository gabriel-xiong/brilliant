import { Container, Typography, Card, CardContent } from '@mui/material';

export default function ProfilePage() {
  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Profile
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Your progress, streaks, and mastery will appear here once you sign in.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
