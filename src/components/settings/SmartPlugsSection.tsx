import React from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type { SmartPlug, SmartPlugStatus } from '@/types/api';
import { statusColor } from '@/utils/data';
import { describePlugConnection, settingsStyles, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function SmartPlugsSection({ controller }: { controller: SettingsScreenController }) {
  const smartPlugs = controller.queries.smartPlugsQuery.data ?? [];

  return (
    <>
      <SectionCard title="Smart plugs" subtitle="Add, edit, test, and control power devices.">
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Manage Tasmota, Home Assistant, MQTT, and REST-based plugs from mobile.</Text>
        <PrimaryButton
          label={controller.state.editingPlug ? 'Editing plug…' : 'Add smart plug'}
          variant="secondary"
          onPress={() => controller.actions.openPlugModal()}
          disabled={!controller.permissions.canManageSmartPlugs}
        />
      </SectionCard>
      {smartPlugs.length > 0 ? (
        smartPlugs.map(plug => (
          <SmartPlugCardMobile
            key={plug.id}
            plug={plug}
            canControl={controller.permissions.canControlSmartPlugs}
            canEdit={controller.permissions.canManageSmartPlugs}
            canDelete={controller.permissions.canDeleteSmartPlugs}
            onEdit={() => controller.actions.openPlugModal(plug)}
            onDelete={() => controller.actions.setPlugDeleteTarget(plug)}
          />
        ))
      ) : (
        <EmptyState icon="⏻" title="No smart plugs" message="Create a plug to monitor online status and power state here." />
      )}
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
  const queryClient = useQueryClient();

  const statusQuery = useQuery<SmartPlugStatus>({
    queryKey: ['smartPlugStatus', plug.id],
    queryFn: () => api.getSmartPlugStatus(plug.id),
    refetchInterval: 15000,
  });

  const controlMutation = useMutation({
    mutationFn: async (action: 'on' | 'off') => api.controlSmartPlug(plug.id, action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugStatus', plug.id] });
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      showToast('Smart plug updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to control smart plug.', 'error'),
  });

  const currentState = (statusQuery.data?.state ?? plug.last_state ?? 'Unknown').toUpperCase();
  const isOn = currentState === 'ON';
  const reachable = statusQuery.data?.reachable ?? false;
  const powerValue = statusQuery.data?.energy?.power;
  const monitorOnly = plug.plug_type === 'mqtt';

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
      <SwitchRow
        label="Power"
        description={monitorOnly ? 'MQTT plugs are monitor-only from mobile.' : 'Toggle the plug on or off.'}
        value={isOn}
        onValueChange={value => void controlMutation.mutateAsync(value ? 'on' : 'off')}
        disabled={monitorOnly || !canControl || controlMutation.isPending || (!reachable && currentState !== 'ON')}
      />
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
