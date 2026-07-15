import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LoadingScreen } from '../components/common/StateScreens';
import { useAuth } from '../contexts/AuthContext';
import { useServerStore } from '../api/server';

export default function AppIndex() {
  const router = useRouter();
  const { loading, user, authEnabled, requiresSetup } = useAuth();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const serverLoading = useServerStore((state) => state.loading);

  useEffect(() => {
    if (serverLoading || loading) return;

    if (!serverUrl) {
      router.replace('/server');
      return;
    }

    if (requiresSetup) {
      router.replace('/setup');
      return;
    }

    if (authEnabled && !user) {
      router.replace('/login');
      return;
    }

    router.replace('/(tabs)');
  }, [authEnabled, loading, requiresSetup, router, serverLoading, serverUrl, user]);

  return <LoadingScreen message="Preparing Bambuddy…" />;
}
