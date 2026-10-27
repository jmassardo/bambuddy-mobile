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
  const smartPlugs = controller.queries.smartPlugsQuery.data ?? [];
  const { hasPermission } = useAuth();
  const [editor, setEditor] = useState<SmartPlug | 'new' | null>(null);

  return (
    <>
      <SectionCard title="Smart plugs" subtitle="Add, edit, test, and control power devices.">
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Manage Tasmota, Home Assistant, MQTT, and REST-based plugs from mobile.</Text>
        <PrimaryButton
          label={controller.state.editingPlug ? 'Editing plug…' : 'Add smart plug'}
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
        <EmptyState icon="⏻" title="No smart plugs" message="Create a plug to monitor online status and power state here." />
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
      right={<StatusBadge label={reachable ? 'online' : 'offline'} color={reachable ? colors.success : colors.error} />}
    >
      <View style={settingsStyles.plugSummaryRow}>
        <StatusBadge label={currentState || 'unknown'} color={isOn ? colors.accent : colors.textTertiary} />
        {powerValue != null ? <StatusBadge label={`${Math.round(powerValue)} W`} color={colors.accent} /> : null}
        <StatusBadge label={plug.plug_type} color={colors.textTertiary} />
      </View>
      <PlugPowerControl plug={plug} canControl={canControl} />
      <View style={settingsStyles.actions}>
        <PrimaryButton
          label={statusQuery.isFetching ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={async () => {
            const result = await statusQuery.refetch();
            if (result.data?.reachable) {
              showToast(`${plug.name} is reachable.`, 'success');
              return;
            }
            showToast(`${plug.name} is offline.`, 'error');
          }}
          disabled={statusQuery.isFetching}
          loading={statusQuery.isFetching}
        />
        <PrimaryButton label="Edit" variant="secondary" onPress={onEdit} disabled={!canEdit} />
        <PrimaryButton label="Delete" variant="danger" onPress={onDelete} disabled={!canDelete} />
      </View>
    </SectionCard>
  );
}
