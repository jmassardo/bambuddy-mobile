import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { ApiRecord } from '@/utils/data';

export function useSettingsDraft() {
  const { authEnabled, hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ApiRecord>({});

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data as ApiRecord);
    }
  }, [settingsQuery.data]);

  const canUpdateSettings = !authEnabled || hasPermission('settings:update');

  const saveSettingsMutation = useMutation({
    mutationFn: () => api.updateSettings(draft),
    onSuccess: async data => {
      setDraft(data as ApiRecord);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save settings.', 'error'),
  });

  return {
    canUpdateSettings,
    draft,
    saveSettingsMutation,
    setDraft,
    settingsQuery,
  };
}
