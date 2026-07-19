import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type { SmartPlug, SmartPlugCreate, SmartPlugStatus, SmartPlugUpdate } from '@/types/api';
import {  } from '@/utils/data';
import { OptionChipsField, SimpleModal, SwitchRow, settingsStyles as styles } from './shared';

type SmartPlugType = SmartPlug['plug_type'];

type SmartPlugFormState = {
  name: string;
  plug_type: SmartPlugType;
  ip_address: string;
  username: string;
  password: string;
  ha_entity_id: string;
  mqtt_power_topic: string;
  mqtt_state_topic: string;
  rest_on_url: string;
  rest_off_url: string;
  enabled: boolean;
};

const SMART_PLUG_TYPE_OPTIONS: Array<{ key: SmartPlugType; label: string }> = [
  { key: 'tasmota', label: 'Tasmota' },
  { key: 'homeassistant', label: 'Home Assistant' },
  { key: 'mqtt', label: 'MQTT' },
  { key: 'rest', label: 'REST' },
];

const EMPTY_SMART_PLUG_FORM: SmartPlugFormState = {
  name: '',
  plug_type: 'tasmota',
  ip_address: '',
  username: '',
  password: '',
  ha_entity_id: '',
  mqtt_power_topic: '',
  mqtt_state_topic: '',
  rest_on_url: '',
  rest_off_url: '',
  enabled: true,
};

export default function PlugsSection() {
  const { colors } = useTheme();
  const { authEnabled, hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const smartPlugsQuery = useQuery({ queryKey: ['smartPlugs'], queryFn: api.getSmartPlugs });
  const [plugModalVisible, setPlugModalVisible] = useState(false);
  const [editingPlug, setEditingPlug] = useState<SmartPlug | null>(null);
  const [plugForm, setPlugForm] = useState<SmartPlugFormState>(EMPTY_SMART_PLUG_FORM);
  const [plugDeleteTarget, setPlugDeleteTarget] = useState<SmartPlug | null>(null);

  const canManageSmartPlugs = !authEnabled || hasPermission('smart_plugs:create') || hasPermission('smart_plugs:update');
  const canDeleteSmartPlugs = !authEnabled || hasPermission('smart_plugs:delete');
  const canControlSmartPlugs = !authEnabled || hasPermission('smart_plugs:control');

  const createSmartPlugMutation = useMutation({
    mutationFn: (payload: SmartPlugCreate) => api.createSmartPlug(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save smart plug.', 'error'),
  });

  const updateSmartPlugMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SmartPlugUpdate }) => api.updateSmartPlug(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update smart plug.', 'error'),
  });

  const deleteSmartPlugMutation = useMutation({
    mutationFn: (id: number) => api.deleteSmartPlug(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      setPlugDeleteTarget(null);
      showToast('Smart plug deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete smart plug.', 'error'),
  });

  function closePlugModal() {
    setPlugModalVisible(false);
    setEditingPlug(null);
    setPlugForm(EMPTY_SMART_PLUG_FORM);
  }

  function openPlugModal(plug?: SmartPlug) {
    if (plug) {
      setEditingPlug(plug);
      setPlugForm({
        name: plug.name,
        plug_type: plug.plug_type,
        ip_address: plug.ip_address ?? '',
        username: plug.username ?? '',
        password: '',
        ha_entity_id: plug.ha_entity_id ?? '',
        mqtt_power_topic: plug.mqtt_power_topic ?? plug.mqtt_topic ?? '',
        mqtt_state_topic: plug.mqtt_state_topic ?? '',
        rest_on_url: plug.rest_on_url ?? '',
        rest_off_url: plug.rest_off_url ?? '',
        enabled: plug.enabled,
      });
    } else {
      setEditingPlug(null);
      setPlugForm(EMPTY_SMART_PLUG_FORM);
    }
    setPlugModalVisible(true);
  }

  const handlePlugSave = () => {
    if (!plugForm.name.trim()) {
      showToast('Plug name is required.', 'error');
      return;
    }
    if (plugForm.plug_type === 'tasmota' && !plugForm.ip_address.trim()) {
      showToast('IP address is required for Tasmota plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'homeassistant' && !plugForm.ha_entity_id.trim()) {
      showToast('Entity ID is required for Home Assistant plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'mqtt' && !plugForm.mqtt_power_topic.trim()) {
      showToast('MQTT power topic is required for MQTT plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'rest' && (!plugForm.rest_on_url.trim() || !plugForm.rest_off_url.trim())) {
      showToast('REST plugs need both on and off URLs.', 'error');
      return;
    }

    const payload: SmartPlugCreate = {
      name: plugForm.name.trim(),
      plug_type: plugForm.plug_type,
      enabled: plugForm.enabled,
      ip_address: plugForm.plug_type === 'tasmota' ? plugForm.ip_address.trim() || null : null,
      username: plugForm.plug_type === 'tasmota' ? plugForm.username.trim() || null : null,
      ha_entity_id: plugForm.plug_type === 'homeassistant' ? plugForm.ha_entity_id.trim() || null : null,
      mqtt_power_topic: plugForm.plug_type === 'mqtt' ? plugForm.mqtt_power_topic.trim() || null : null,
      mqtt_state_topic: plugForm.plug_type === 'mqtt' ? plugForm.mqtt_state_topic.trim() || null : null,
      rest_on_url: plugForm.plug_type === 'rest' ? plugForm.rest_on_url.trim() || null : null,
      rest_off_url: plugForm.plug_type === 'rest' ? plugForm.rest_off_url.trim() || null : null,
    };

    if (plugForm.password.trim()) {
      payload.password = plugForm.password;
    }

    if (editingPlug) {
      updateSmartPlugMutation.mutate({ id: editingPlug.id, payload });
    } else {
      createSmartPlugMutation.mutate(payload);
    }
  };

  if (smartPlugsQuery.isLoading) {
    return <LoadingScreen message="Loading smart plugs…" />;
  }

  if (smartPlugsQuery.isError) {
    return <ErrorState message="Unable to load smart plugs." onRetry={() => void smartPlugsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Smart plugs" subtitle="Add, edit, test, and control power devices.">
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Manage Tasmota, Home Assistant, MQTT, and REST-based plugs from mobile.</Text>
        <PrimaryButton label={editingPlug ? 'Editing plug…' : 'Add smart plug'} variant="secondary" onPress={() => openPlugModal()} disabled={!canManageSmartPlugs} />
      </SectionCard>
      {(smartPlugsQuery.data ?? []).length > 0 ? (
        (smartPlugsQuery.data ?? []).map(plug => (
          <SmartPlugCardMobile
            key={plug.id}
            plug={plug}
            canControl={canControlSmartPlugs}
            canEdit={canManageSmartPlugs}
            canDelete={canDeleteSmartPlugs}
            onEdit={() => openPlugModal(plug)}
            onDelete={() => setPlugDeleteTarget(plug)}
          />
        ))
      ) : (
        <EmptyState icon="⏻" title="No smart plugs" message="Create a plug to monitor online status and power state here." />
      )}

      <SimpleModal
        visible={plugModalVisible}
        title={editingPlug ? 'Edit smart plug' : 'Add smart plug'}
        subtitle="Name, connection details, type, and basic on/off behavior."
        onClose={closePlugModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={plugForm.name} onChangeText={value => setPlugForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label="Plug type" value={plugForm.plug_type} options={SMART_PLUG_TYPE_OPTIONS} onChange={value => setPlugForm(current => ({ ...EMPTY_SMART_PLUG_FORM, ...current, plug_type: value as SmartPlugType }))} />
          {plugForm.plug_type === 'tasmota' ? (
            <>
              <TextField label="IP address" value={plugForm.ip_address} onChangeText={value => setPlugForm(current => ({ ...current, ip_address: value }))} autoCapitalize="none" />
              <TextField label="Username" value={plugForm.username} onChangeText={value => setPlugForm(current => ({ ...current, username: value }))} autoCapitalize="none" />
              <TextField label="Password" value={plugForm.password} onChangeText={value => setPlugForm(current => ({ ...current, password: value }))} secureTextEntry placeholder={editingPlug ? 'Leave blank to keep current password' : undefined} />
            </>
          ) : null}
          {plugForm.plug_type === 'homeassistant' ? <TextField label="Entity ID" value={plugForm.ha_entity_id} onChangeText={value => setPlugForm(current => ({ ...current, ha_entity_id: value }))} autoCapitalize="none" /> : null}
          {plugForm.plug_type === 'mqtt' ? (
            <>
              <TextField label="Power topic" value={plugForm.mqtt_power_topic} onChangeText={value => setPlugForm(current => ({ ...current, mqtt_power_topic: value }))} autoCapitalize="none" />
              <TextField label="State topic" value={plugForm.mqtt_state_topic} onChangeText={value => setPlugForm(current => ({ ...current, mqtt_state_topic: value }))} autoCapitalize="none" />
            </>
          ) : null}
          {plugForm.plug_type === 'rest' ? (
            <>
              <TextField label="Power on URL" value={plugForm.rest_on_url} onChangeText={value => setPlugForm(current => ({ ...current, rest_on_url: value }))} autoCapitalize="none" />
              <TextField label="Power off URL" value={plugForm.rest_off_url} onChangeText={value => setPlugForm(current => ({ ...current, rest_off_url: value }))} autoCapitalize="none" />
            </>
          ) : null}
          <SwitchRow label="Enabled" value={plugForm.enabled} onValueChange={value => setPlugForm(current => ({ ...current, enabled: value }))} />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closePlugModal} />
            <PrimaryButton
              label={editingPlug ? (updateSmartPlugMutation.isPending ? 'Saving…' : 'Save plug') : (createSmartPlugMutation.isPending ? 'Creating…' : 'Create plug')}
              onPress={handlePlugSave}
              loading={createSmartPlugMutation.isPending || updateSmartPlugMutation.isPending}
              disabled={createSmartPlugMutation.isPending || updateSmartPlugMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={plugDeleteTarget !== null}
        title="Delete smart plug"
        message={plugDeleteTarget ? `Delete ${plugDeleteTarget.name}?` : 'Delete this smart plug?'}
        confirmLabel="Delete"
        onClose={() => setPlugDeleteTarget(null)}
        onConfirm={() => plugDeleteTarget && void deleteSmartPlugMutation.mutateAsync(plugDeleteTarget.id)}
        loading={deleteSmartPlugMutation.isPending}
      />
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
    mutationFn: (action: 'on' | 'off') => api.controlSmartPlug(plug.id, action),
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
  const connection = describePlugConnection(plug);
  const powerValue = statusQuery.data?.energy?.power;
  const monitorOnly = plug.plug_type === 'mqtt';

  return (
    <SectionCard title={plug.name} subtitle={connection} right={<StatusBadge label={reachable ? 'online' : 'offline'} color={reachable ? colors.success : colors.error} />}>
      <View style={styles.plugSummaryRow}>
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
      <View style={styles.actions}>
        <PrimaryButton
          label={statusQuery.isFetching ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => {
            void statusQuery.refetch().then(result => {
              if (result.data?.reachable) {
                showToast(`${plug.name} is reachable.`, 'success');
              } else {
                showToast(`${plug.name} is offline.`, 'error');
              }
            });
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

function describePlugConnection(plug: SmartPlug) {
  switch (plug.plug_type) {
    case 'tasmota':
      return plug.ip_address || 'No IP address';
    case 'homeassistant':
      return plug.ha_entity_id || 'No entity ID';
    case 'mqtt':
      return plug.mqtt_power_topic || plug.mqtt_topic || 'No MQTT topic';
    case 'rest':
      return plug.rest_on_url || plug.rest_off_url || 'No REST endpoint';
    default:
      return 'Unknown connection';
  }
}
