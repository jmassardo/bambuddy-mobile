import { Alert } from 'react-native';
import { createTranslator, type Translate } from '@/i18n';
import type {
  GitHubBackupConfigCreate,
  GitRestoreCategory,
  GitRestorePreview,
} from '@/types/api';

export function confirmBackupAction(
  title: string,
  message: string,
  action: () => void,
  t: Translate = createTranslator('en'),
) {
  Alert.alert(title, message, [
    { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
    {
      text: t('common.confirm', { defaultValue: 'Confirm' }),
      style: 'destructive',
      onPress: action,
    },
  ]);
}

export function remoteConfigPayload(
  form: GitHubBackupConfigCreate,
  schedule: string,
): Partial<GitHubBackupConfigCreate> {
  return {
    ...form,
    repository_url: form.repository_url.trim(),
    branch: form.branch?.trim() || 'main',
    ...(form.access_token.trim()
      ? { access_token: form.access_token.trim() }
      : { access_token: undefined }),
    schedule_enabled: schedule !== 'manual',
    schedule_type:
      schedule === 'manual'
        ? 'daily'
        : (schedule as 'hourly' | 'daily' | 'weekly'),
  };
}

export function resolvedRestore(
  preview: GitRestorePreview | undefined,
  selected: GitRestoreCategory[],
  t: Translate = createTranslator('en'),
) {
  if (!preview?.success || !/^[0-9a-f]{40}$/i.test(preview.ref)) {
    throw new Error(
      t('backup.git.immutableRequired', {
        defaultValue: 'Preview an immutable backup commit before restoring.',
      }),
    );
  }
  const categories = [...new Set(selected)];
  if (
    !categories.length ||
    categories.some(
      category =>
        !preview.categories.some(
          item => item.category === category && item.available,
        ),
    )
  ) {
    throw new Error(
      t('backup.git.categoryRequired', {
        defaultValue: 'Choose at least one available category.',
      }),
    );
  }
  return { ref: preview.ref, categories };
}

export function requireBackupSuccess<
  T extends { success: boolean; message: string },
>(result: T): T {
  if (!result.success) throw new Error(result.message || 'Operation failed.');
  return result;
}
