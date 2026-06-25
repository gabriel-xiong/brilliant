import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loadUserSummary, UserSummary } from '../services/progressService';

interface UseUserSummaryResult {
  summary: UserSummary | null;
  loading: boolean;
}

/**
 * Shared accessor for the signed-in learner's profile summary (streak + mastery).
 * This is the single source of truth that both the home surface and the profile
 * read from, so streak data never forks between the two views. Returns a null
 * summary for guests (no signed-in user) and while the first load is in flight.
 */
export function useUserSummary(): UseUserSummaryResult {
  const { user } = useAuth();
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(user));

  useEffect(() => {
    let active = true;

    if (!user) {
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadUserSummary(user.uid)
      .then((result) => {
        if (active) setSummary(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return { summary, loading };
}
