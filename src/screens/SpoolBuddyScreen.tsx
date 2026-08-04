import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import {
  PrimaryButton,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { SimpleModal } from '@/components/settings/shared';
import { useToast } from '@/contexts/ToastContext';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import {
  formatDuration,
  pickBoolean,
  pickNumber,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

type CreateDeviceForm = {
  device_id: string;
  hostname: string;
  ip_address: string;
  backend_url: string;
  api_key: string;
};

type EditDeviceForm = {
  hostname: string;
  ip_address: string;
  backend_url: string;
  api_key: string;
  display_brightness: string;
  display_blank_timeout: string;
};

const EMPTY_CREATE_FORM: CreateDeviceForm = {
  device_id: '',
  hostname: '',
  ip_address: '',
  backend_url: '',
  api_key: '',
};

const EMPTY_EDIT_FORM: EditDeviceForm = {
  hostname: '',
  ip_address: '',
  backend_url: '',
  api_key: '',
  display_brightness: '',
  display_blank_timeout: '',
};

function describeBattery(device: ApiRecord) {
  const battery = pickNumber(
    device,
    ['battery_percent', 'battery_level', 'system_stats.battery_percent'],
    -1,
  );
  if (battery < 0) return 'n/a';
  return `${Math.max(0, Math.min(100, Math.round(battery)))}%`;
}

function describeLastSeen(device: ApiRecord) {
  const lastSeen = pickString(device, ['last_seen']);
  if (!lastSeen) return 'never';

  const date = new Date(lastSeen);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString();
}

export default function SpoolBuddyScreen() {
  const navigation = useNavigation<RootNavigationProp<'SpoolBuddy'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'SpoolBuddy' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [createModalVisible, setCreateModalVisible] = React.useState(false);
  const [editModalVisible, setEditModalVisible] = React.useState(false);
  const [pendingDeleteDevice, setPendingDeleteDevice] =
    React.useState<ApiRecord | null>(null);
  const [editingDevice, setEditingDevice] =
    React.useState<ApiRecord | null>(null);
  const [createForm, setCreateForm] =
    React.useState<CreateDeviceForm>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] =
    React.useState<EditDeviceForm>(EMPTY_EDIT_FORM);

  const spoolbuddyQuery = useQuery({
    queryKey: ['spoolbuddyDevices'],
    queryFn: api.getSpoolBuddyDevices,
  });

  const closeCreateModal = React.useCallback(() => {
    setCreateModalVisible(false);
    setCreateForm(EMPTY_CREATE_FORM);
  }, []);

  const closeEditModal = React.useCallback(() => {
    setEditModalVisible(false);
    setEditingDevice(null);
    setEditForm(EMPTY_EDIT_FORM);
  }, []);

  const invalidateDevices = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  }, [queryClient]);

  const createSpoolBuddyMutation = useMutation({
    mutationFn: () =>
      api.createSpoolBuddyDevice({
        device_id: createForm.device_id.trim(),
        hostname: createForm.hostname.trim() || null,
        ip_address: createForm.ip_address.trim() || null,
        backend_url: createForm.backend_url.trim() || null,
        api_key: createForm.api_key.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateDevices();
      closeCreateModal();
      showToast('SpoolBuddy device added.', 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || 'Unable to add SpoolBuddy device.',
        'error',
      ),
  });

  const updateSpoolBuddyMutation = useMutation({
    mutationFn: async () => {
      const deviceId = pickString(editingDevice, ['device_id', 'id']);
      const brightness = Number(editForm.display_brightness);
      const blankTimeout = Number(editForm.display_blank_timeout);
      return api.updateSpoolBuddyDevice(deviceId, {
        hostname: editForm.hostname.trim() || null,
        ip_address: editForm.ip_address.trim() || null,
        backend_url: editForm.backend_url.trim() || null,
        api_key: editForm.api_key.trim() || null,
        display_brightness: Number.isFinite(brightness)
          ? brightness
          : undefined,
        display_blank_timeout: Number.isFinite(blankTimeout)
          ? blankTimeout
          : undefined,
      });
    },
    onSuccess: async () => {
      await invalidateDevices();
      closeEditModal();
      showToast('SpoolBuddy settings updated.', 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || 'Unable to update SpoolBuddy settings.',
        'error',
      ),
  });

  const deleteSpoolBuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.deleteSpoolBuddyDevice(deviceId),
    onSuccess: async () => {
      await invalidateDevices();
      setPendingDeleteDevice(null);
      showToast('SpoolBuddy device removed.', 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || 'Unable to remove SpoolBuddy device.',
        'error',
      ),
  });

  const calibrateSpoolBuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await invalidateDevices();
      showToast('Calibration command sent.', 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || 'Unable to calibrate SpoolBuddy device.',
        'error',
      ),
  });

  const openEditModal = React.useCallback((device: ApiRecord) => {
    setEditingDevice(device);
    setEditForm({
      hostname: pickString(device, ['hostname']),
      ip_address: pickString(device, ['ip_address']),
      backend_url: pickString(device, ['backend_url']),
      api_key: '',
      display_brightness: String(
        pickNumber(device, ['display_brightness'], 0),
      ),
      display_blank_timeout: String(
        pickNumber(device, ['display_blank_timeout'], 0),
      ),
    });
    setEditModalVisible(true);
  }, []);

  const handleCreateDevice = React.useCallback(() => {
    if (!createForm.device_id.trim()) {
      showToast('Device ID is required.', 'error');
      return;
    }
    createSpoolBuddyMutation.mutate();
  }, [createForm.device_id, createSpoolBuddyMutation, showToast]);

  const handleSaveDevice = React.useCallback(() => {
    if (!editingDevice) {
      showToast('No SpoolBuddy device selected.', 'error');
      return;
    }
    updateSpoolBuddyMutation.mutate();
  }, [editingDevice, showToast, updateSpoolBuddyMutation]);

  const devices = (spoolbuddyQuery.data ?? []) as ApiRecord[];

  if (spoolbuddyQuery.isLoading) {
    return <LoadingScreen message="Loading SpoolBuddy devices…" />;
  }

  if (spoolbuddyQuery.isError) {
    return (
      <ErrorState
        message="Unable to load SpoolBuddy devices."
        onRetry={() => void spoolbuddyQuery.refetch()}
      />
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={spoolbuddyQuery.isRefetching}
            onRefresh={() => void spoolbuddyQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            SpoolBuddy
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Manage connected devices, status, and per-device settings.
          </Text>
        </View>

        <SectionCard
          title="Devices"
          subtitle="Connected state, firmware, battery, sensors, and configuration actions."
        >
          <PrimaryButton
            label="Add device"
            variant="secondary"
            onPress={() => setCreateModalVisible(true)}
          />
          {devices.length > 0 ? (
            devices.map(device => {
              const deviceId = pickString(device, ['device_id', 'id']);
              const online = pickBoolean(device, ['online']);
              return (
                <View
                  key={deviceId}
                  style={[
                    styles.deviceCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.deviceHeader}>
                    <View style={styles.deviceText}>
                      <Text
                        style={[styles.deviceTitle, { color: colors.text }]}
                      >
                        {pickString(
                          device,
                          ['hostname', 'device_id'],
                          'SpoolBuddy',
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.deviceMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        ID: {deviceId}
                      </Text>
                    </View>
                    <StatusBadge
                      label={online ? 'online' : 'offline'}
                      color={statusColor(
                        online ? 'success' : 'offline',
                        colors,
                      )}
                    />
                  </View>
                  <View style={styles.metricsRow}>
                    <InfoChip
                      label="Battery"
                      value={describeBattery(device)}
                      colors={colors}
                    />
                    <InfoChip
                      label="Firmware"
                      value={pickString(
                        device,
                        ['firmware_version'],
                        'n/a',
                      )}
                      colors={colors}
                    />
                  </View>
                  <Text
                    style={[
                      styles.deviceMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    NFC: {pickBoolean(device, ['has_nfc']) ? 'yes' : 'no'} (
                    {pickBoolean(device, ['nfc_ok']) ? 'ok' : 'error'}) •
                    Scale: {pickBoolean(device, ['has_scale']) ? 'yes' : 'no'} (
                    {pickBoolean(device, ['scale_ok']) ? 'ok' : 'error'})
                  </Text>
                  <Text
                    style={[
                      styles.deviceMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Last seen: {describeLastSeen(device)} • Uptime:{' '}
                    {formatDuration(pickNumber(device, ['uptime_s'], 0))}
                  </Text>
                  <Text
                    style={[
                      styles.deviceMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Server URL:{' '}
                    {pickString(
                      device,
                      ['backend_url'],
                      'Not configured',
                    )}
                  </Text>

                  <View style={styles.actionsRow}>
                    <PrimaryButton
                      label="Configure"
                      variant="secondary"
                      onPress={() => openEditModal(device)}
                    />
                    <PrimaryButton
                      label="Calibrate"
                      variant="secondary"
                      onPress={() =>
                        calibrateSpoolBuddyMutation.mutate(deviceId)
                      }
                      loading={calibrateSpoolBuddyMutation.isPending}
                      disabled={calibrateSpoolBuddyMutation.isPending}
                    />
                    <PrimaryButton
                      label="Remove"
                      variant="danger"
                      onPress={() => setPendingDeleteDevice(device)}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              icon="nfc"
              title="No SpoolBuddy devices found"
              message="Register a device to start managing status and settings from mobile."
            />
          )}
        </SectionCard>
      </ScrollView>

      <SimpleModal
        visible={createModalVisible}
        title="Add SpoolBuddy device"
        subtitle="Register a SpoolBuddy by its device ID and optional network settings."
        onClose={closeCreateModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField
            label="Device ID"
            value={createForm.device_id}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, device_id: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label="Hostname"
            value={createForm.hostname}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, hostname: value }))
            }
          />
          <TextField
            label="IP address"
            value={createForm.ip_address}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, ip_address: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label="Server URL"
            value={createForm.backend_url}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, backend_url: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label="API key"
            value={createForm.api_key}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, api_key: value }))
            }
            autoCapitalize="none"
            secureTextEntry
          />
          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeCreateModal}
            />
            <PrimaryButton
              label={
                createSpoolBuddyMutation.isPending
                  ? 'Adding…'
                  : 'Add device'
              }
              onPress={handleCreateDevice}
              loading={createSpoolBuddyMutation.isPending}
              disabled={createSpoolBuddyMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal
        visible={editModalVisible}
        title="Configure SpoolBuddy"
        subtitle="Update network and display settings for this device."
        onClose={closeEditModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField
            label="Hostname"
            value={editForm.hostname}
            onChangeText={value =>
              setEditForm(current => ({ ...current, hostname: value }))
            }
          />
          <TextField
            label="IP address"
            value={editForm.ip_address}
            onChangeText={value =>
              setEditForm(current => ({ ...current, ip_address: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label="Server URL"
            value={editForm.backend_url}
            onChangeText={value =>
              setEditForm(current => ({ ...current, backend_url: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label="API key (optional)"
            value={editForm.api_key}
            onChangeText={value =>
              setEditForm(current => ({ ...current, api_key: value }))
            }
            autoCapitalize="none"
            secureTextEntry
          />
          <TextField
            label="Display brightness"
            value={editForm.display_brightness}
            onChangeText={value =>
              setEditForm(current => ({
                ...current,
                display_brightness: value,
              }))
            }
            keyboardType="number-pad"
          />
          <TextField
            label="Display blank timeout (s)"
            value={editForm.display_blank_timeout}
            onChangeText={value =>
              setEditForm(current => ({
                ...current,
                display_blank_timeout: value,
              }))
            }
            keyboardType="number-pad"
          />
          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeEditModal}
            />
            <PrimaryButton
              label={updateSpoolBuddyMutation.isPending ? 'Saving…' : 'Save'}
              onPress={handleSaveDevice}
              loading={updateSpoolBuddyMutation.isPending}
              disabled={updateSpoolBuddyMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={pendingDeleteDevice !== null}
        title="Remove SpoolBuddy device"
        message={
          pendingDeleteDevice
            ? `Remove ${pickString(
                pendingDeleteDevice,
                ['hostname', 'device_id'],
                'this device',
              )}?`
            : 'Remove this device?'
        }
        confirmLabel="Remove"
        onClose={() => setPendingDeleteDevice(null)}
        onConfirm={() => {
          if (pendingDeleteDevice) {
            deleteSpoolBuddyMutation.mutate(
              pickString(pendingDeleteDevice, ['device_id', 'id']),
            );
          }
        }}
        loading={deleteSpoolBuddyMutation.isPending}
      />
    </>
  );
}

function InfoChip({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={[
        styles.infoChip,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <Text style={[styles.infoChipLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.infoChipValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  deviceCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  deviceText: {
    flex: 1,
    gap: spacing.xs,
  },
  deviceTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  deviceMeta: {
    fontSize: fontSize.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  infoChipLabel: {
    fontSize: fontSize.xs,
  },
  infoChipValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
