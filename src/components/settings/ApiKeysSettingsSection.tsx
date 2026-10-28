import { useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SectionCard, PrimaryButton } from '@/components/common/AppUI';
import type { SettingsScreenController } from './useSettingsScreenController';

import { useAuth } from '@/contexts/AuthContext';
import { ApiExplorerSettings } from './ApiExplorerSettings';
import { ScopedApiKeysManager } from './ScopedApiKeysManager';

export function ApiKeysSettingsSection(_props: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { authEnabled, hasPermission } = useAuth();
  const navigation = useNavigation<NavigationProp<{ CameraIntegrations: undefined }>>();

  return (
    <>
      <ScopedApiKeysManager />
      <SectionCard title={t('camera.integrations', { defaultValue: 'Camera integrations' })}>
        <PrimaryButton label={t('camera.manageIntegrations', { defaultValue: 'Camera tokens and OBS overlays' })} disabled={!hasPermission('camera:view')} onPress={() => navigation.navigate('CameraIntegrations')} />
      </SectionCard>
      {!authEnabled || hasPermission('api_keys:read') ? <ApiExplorerSettings /> : null}
    </>
  );
}
