import { translateNative, useNativeLocale } from '@/i18n';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type { SmartPlug, SmartPlugStatus } from '@/types/api';
import { describePlugConnection, settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { SmartPlugEditor } from './SmartPlugEditor';
import { BulkPlugPower, PlugPowerControl, plugPowerState, QuickSmartPlugPanel } from './SmartPlugPowerControls';
import { useAuth } from '@/contexts/AuthContext';

export function SmartPlugsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const smartPlugs = controller.queries.smartPlugsQuery.data ?? [];
  const { hasPermission } = useAuth();
  const [editor, setEditor] = useState<SmartPlug | 'new' | null>(null);

  return (
    <>
      <SectionCard title={translateNative('native.5d7721ec0453e1bd')} subtitle={translateNative('native.eab71014b0db74c9')}>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.7d1f4eafa90d2764')}</Text>
        <PrimaryButton
          label={controller.state.editingPlug ? translateNative('native.ee79a473c09f0193') : translateNative('native.5f6128ede25edfd8')}
          variant="secondary"
          onPress={() => setEditor('new')}
          disabled={!hasPermission('smart_plugs:create')}
        />
        <BulkPlugPower plugs={smartPlugs} canControl={controller.permissions.canControlSmartPlugs} />
        <QuickSmartPlugPanel />
      </SectionCard>
      {smartPlugs.length > 0 ? (
        smartPlugs.map(plug => (
          <SmartPlugCardMobile
            key={plug.id}
            plug={plug}
            canControl={controller.permissions.canControlSmartPlugs}
            canEdit={hasPermission('smart_plugs:update')}
            canDelete={controller.permissions.canDeleteSmartPlugs}
            onEdit={() => setEditor(plug)}
            onDelete={() => controller.actions.setPlugDeleteTarget(plug)}
          />
        ))
      ) : (
        <EmptyState icon="⏻" title={translateNative('native.17da078585e179ac')} message={translateNative('native.c50898528cc1dc2c')} />
      )}
      {editor ? <SmartPlugEditor plug={editor === 'new' ? undefined : editor} existingPlugs={smartPlugs} canControl={controller.permissions.canControlSmartPlugs} onClose={() => setEditor(null)} /> : null}
    </>
  );
}

function SmartPlugCardMobile({
  plug,
  canControl,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  plug: SmartPlug;
  canControl: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const statusQuery = useQuery<SmartPlugStatus>({
    queryKey: ['smartPlugStatus', plug.id],
    queryFn: () => api.getSmartPlugStatus(plug.id),
    refetchInterval: 15000,
  });

  const currentState = plugPowerState(statusQuery.data, plug.last_state);
  const isOn = currentState === 'ON';
  const reachable = statusQuery.data?.reachable ?? false;
  const powerValue = statusQuery.data?.energy?.power;

  return (
    <SectionCard
      title={plug.name}
      subtitle={describePlugConnection(plug)}
      right={<StatusBadge label={reachable ? translateNative('native.901d5a89d9f5cad2') : translateNative('native.c4b60eea6e399455')} color={reachable ? colors.success : colors.error} />}
    >
      <View style={settingsStyles.plugSummaryRow}>
        <StatusBadge label={currentState || translateNative('native.649d2a9c05f2b32c')} color={isOn ? colors.accent : colors.textTertiary} />
        {powerValue != null ? <StatusBadge label={translateNative('native.170a1ba723f191c5', { value0: String(Math.round(powerValue)) })} color={colors.accent} /> : null}
        <StatusBadge label={plug.plug_type} color={colors.textTertiary} />
      </View>
      <PlugPowerControl plug={plug} canControl={canControl} />
      <View style={settingsStyles.actions}>
        <PrimaryButton
          label={statusQuery.isFetching ? translateNative('native.36b1241a43893d02') : translateNative('native.c281bbb20123f577')}
          variant="secondary"
          onPress={async () => {
            const result = await statusQuery.refetch();
            if (result.data?.reachable) {
              showToast(translateNative('native.de14f048ee7530b7', { value0: String(plug.name) }), 'success');
              return;
            }
            showToast(translateNative('native.e730acab1882c891', { value0: String(plug.name) }), 'error');
          }}
          disabled={statusQuery.isFetching}
          loading={statusQuery.isFetching}
        />
        <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={onEdit} disabled={!canEdit} />
        <PrimaryButton label={translateNative('common.delete')} variant="danger" onPress={onDelete} disabled={!canDelete} />
      </View>
    </SectionCard>
  );
}
