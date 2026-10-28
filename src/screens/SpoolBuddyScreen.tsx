import { NativeTranslation, nativeEnglishSuffix, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React from 'react';
import {
  Alert,
  Pressable,
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
import { RemoteSpoolBuddyModal } from '@/components/spoolbuddy/RemoteSpoolBuddyPanel';

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
  formatDateTime,
  pickBoolean,
  pickNumber,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';
import type { InventorySpool, SpoolBuddySlot, SpoolBuddySlotAssignment, SpoolBuddyUsageRecord, SpoolBuddyUsageSummary } from '@/types/api';

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

type SlotAssignmentForm = {
  spoolId: string;
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

const EMPTY_SLOT_FORM: SlotAssignmentForm = {
  spoolId: '',
};

type TabKey = 'devices' | 'slots' | 'usage';

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
  return Number.isNaN(date.getTime()) ? 'never' : formatDateTime(lastSeen);
}

export default function SpoolBuddyScreen() {
  useNativeLocale();
  const { t } = useTranslation();
  const remoteControlsLabel = t('spoolbuddy.remoteControls', { defaultValue: 'Remote controls / calibrate' });
  const navigation = useNavigation<RootNavigationProp<'SpoolBuddy'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'SpoolBuddy' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TabKey>('devices');
  const [createModalVisible, setCreateModalVisible] = React.useState(false);
  const [editModalVisible, setEditModalVisible] = React.useState(false);
  const [assignModalVisible, setAssignModalVisible] = React.useState(false);
  const [pendingDeleteDevice, setPendingDeleteDevice] =
    React.useState<ApiRecord | null>(null);
  const [editingDevice, setEditingDevice] =
    React.useState<ApiRecord | null>(null);
  const [createForm, setCreateForm] =
    React.useState<CreateDeviceForm>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] =
    React.useState<EditDeviceForm>(EMPTY_EDIT_FORM);
  const [slotForm, setSlotForm] =
    React.useState<SlotAssignmentForm>(EMPTY_SLOT_FORM);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [remoteDeviceId, setRemoteDeviceId] = React.useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = React.useState<SpoolBuddySlot | null>(null);

  const spoolbuddyQuery = useQuery({
    queryKey: ['spoolbuddyDevices'],
    queryFn: api.getSpoolBuddyDevices,
  });

  const spoolsQuery = useQuery({
    queryKey: ['inventorySpools'],
    queryFn: () => api.getSpools(true),
  });

  const deviceSlotsQuery = useQuery({
    queryKey: ['spoolbuddySlots', selectedDeviceId],
    queryFn: () =>
      selectedDeviceId ? api.getSpoolBuddySlots(selectedDeviceId) : null,
    enabled: selectedDeviceId != null,
  });

  const slotAssignmentsQuery = useQuery({
    queryKey: ['spoolbuddySlotAssignments', selectedDeviceId],
    queryFn: () =>
      selectedDeviceId
        ? api.getSpoolBuddySlotAssignments(selectedDeviceId)
        : null,
    enabled: selectedDeviceId != null,
  });

  const usageQuery = useQuery({
    queryKey: ['spoolbuddyUsage', selectedDeviceId],
    queryFn: () =>
      selectedDeviceId ? api.getSpoolBuddyUsage(selectedDeviceId, 50) : null,
    enabled: selectedDeviceId != null,
  });

  const usageSummaryQuery = useQuery({
    queryKey: ['spoolbuddyUsageSummary', selectedDeviceId],
    queryFn: () =>
      selectedDeviceId
        ? api.getSpoolBuddyUsageSummary(selectedDeviceId)
        : null,
    enabled: selectedDeviceId != null,
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

  const closeAssignModal = React.useCallback(() => {
    setAssignModalVisible(false);
    setSelectedSlot(null);
    setSlotForm(EMPTY_SLOT_FORM);
  }, []);

  const invalidateDevices = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  }, [queryClient]);

  const invalidateSlots = React.useCallback(async (deviceId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['spoolbuddySlots'] }),
      queryClient.invalidateQueries({ queryKey: ['spoolbuddySlotAssignments'] }),
      queryClient.invalidateQueries({ queryKey: ['spoolbuddyUsage'] }),
      queryClient.invalidateQueries({ queryKey: ['spoolbuddyUsageSummary'] }),
    ]);
    if (deviceId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spoolbuddySlots', deviceId] }),
        queryClient.invalidateQueries({ queryKey: ['spoolbuddySlotAssignments', deviceId] }),
        queryClient.invalidateQueries({ queryKey: ['spoolbuddyUsage', deviceId] }),
        queryClient.invalidateQueries({ queryKey: ['spoolbuddyUsageSummary', deviceId] }),
      ]);
    }
  }, [queryClient]);

  const invalidateSpools = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventorySpools'] });
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
      showToast(nativeMessage('native.68ffb94cd0c4779c'), 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || nativeMessage('native.bb087745ef7ad27b'),
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
      showToast(nativeMessage('native.bb34d5b539f21c97'), 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || nativeMessage('native.e0c46d263ba72498'),
        'error',
      ),
  });

  const deleteSpoolBuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.deleteSpoolBuddyDevice(deviceId),
    onSuccess: async () => {
      await invalidateDevices();
      setPendingDeleteDevice(null);
      showToast(nativeMessage('native.247639345a30b307'), 'success');
    },
    onError: (error: Error) =>
      showToast(
        error.message || nativeMessage('native.bfa672d17a397569'),
        'error',
      ),
  });

  const createSlotMutation = useMutation({
    mutationFn: () =>
      selectedDeviceId
        ? api.createSpoolBuddySlot({
            device_id: selectedDeviceId,
            slot_index: 0,
          })
        : Promise.reject(new Error(translateNative('native.c98328becee2fef5'))),
    onSuccess: async () => {
      await invalidateSlots();
      showToast(nativeMessage('native.2b12e94e5919627f'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.d4e219b64be52525'), 'error'),
  });

  const deleteSlotMutation = useMutation({
    mutationFn: ({ deviceId, slotIndex }: { deviceId: string; slotIndex: number }) =>
      api.deleteSpoolBuddySlot(deviceId, slotIndex),
    onSuccess: async () => {
      await invalidateSlots();
      showToast(nativeMessage('native.b87ea5ac5db1a469'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.66464f9fedfb30dd'), 'error'),
  });

  const assignSlotMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlot || !selectedDeviceId || !slotForm.spoolId) {
        return Promise.reject(new Error(translateNative('native.bc09ed13741d0086')));
      }
      return api.assignSpoolBuddySlot({
        device_id: selectedDeviceId,
        slot_index: selectedSlot.slot_index,
        spool_id: Number(slotForm.spoolId),
      });
    },
    onSuccess: async () => {
      await invalidateSlots();
      await invalidateSpools();
      closeAssignModal();
      showToast(nativeMessage('native.4714d4f6199f9c64'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.410ce58cbd32a366'), 'error'),
  });

  const unassignSlotMutation = useMutation({
    mutationFn: ({ deviceId, slotIndex }: { deviceId: string; slotIndex: number }) =>
      api.unassignSpoolBuddySlot(deviceId, slotIndex),
    onSuccess: async () => {
      await invalidateSlots();
      await invalidateSpools();
      showToast(nativeMessage('native.c3433976d24113dc'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.4e6a92e509672538'), 'error'),
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
      showToast(nativeMessage('native.b570bc67c3f526f1'), 'error');
      return;
    }
    createSpoolBuddyMutation.mutate();
  }, [createForm.device_id, createSpoolBuddyMutation, showToast]);

  const handleSaveDevice = React.useCallback(() => {
    if (!editingDevice) {
      showToast(nativeMessage('native.e27723c81c41bd6b'), 'error');
      return;
    }
    updateSpoolBuddyMutation.mutate();
  }, [editingDevice, showToast, updateSpoolBuddyMutation]);

  const handleAssignSpool = React.useCallback(() => {
    if (!slotForm.spoolId || Number(slotForm.spoolId) <= 0) {
      showToast(nativeMessage('native.f81279366a1f8447'), 'error');
      return;
    }
    assignSlotMutation.mutate();
  }, [slotForm.spoolId, assignSlotMutation, showToast]);

  const devices = (spoolbuddyQuery.data ?? []) as ApiRecord[];
  const spools = (spoolsQuery.data ?? []) as InventorySpool[];
  const slots = (deviceSlotsQuery.data ?? []) as SpoolBuddySlot[];
  const assignments = (slotAssignmentsQuery.data ?? []) as SpoolBuddySlotAssignment[];
  const usageRecords = (usageQuery.data ?? []) as SpoolBuddyUsageRecord[];
  const usageSummaries = (usageSummaryQuery.data ?? []) as SpoolBuddyUsageSummary[];

  const assignmentMap = useLocalizedMemo(() => {
    const map = new Map<number, SpoolBuddySlotAssignment>();
    assignments.forEach(a => {
      map.set(a.slot_index, a);
    });
    return map;
  }, [assignments]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'devices', get label() { return translateNative('native.cfe7dce2f506ba52'); } },
    { key: 'slots', get label() { return translateNative('native.e49983648890590f'); } },
    { key: 'usage', get label() { return translateNative('native.3a113f405662380e'); } },
  ];

  if (spoolbuddyQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.c82527729f392e28')} />;
  }

  if (spoolbuddyQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.50d126c0a9867d39')}
        onRetry={() => void spoolbuddyQuery.refetch()}
      />
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.tabBar}>
          {tabs.map(tab => (
            <Pressable
              key={tab.key}
              style={[
                styles.tabButton,
                activeTab === tab.key && [styles.tabButtonActive, { backgroundColor: colors.accent }],
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab.key && styles.tabButtonTextActive,
                  { color: activeTab === tab.key ? colors.background : colors.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={spoolbuddyQuery.isRefetching || deviceSlotsQuery.isRefetching}
              onRefresh={() => {
                void spoolbuddyQuery.refetch();
                if (selectedDeviceId) {
                  void deviceSlotsQuery.refetch();
                }
              }}
              tintColor={colors.accent}
            />
          }
        >
          {activeTab === 'devices' && renderDevicesSection({
            devices,
            colors,
            createModalVisible,
            setCreateModalVisible,
            openEditModal,
            setPendingDeleteDevice,
            openRemoteDevice: setRemoteDeviceId,
            remoteControlsLabel,
            deleteSpoolBuddyMutation,
            invalidateDevices,
            handleCreateDevice,
            createSpoolBuddyMutation,
            createForm,
            setCreateForm,
            closeCreateModal,
            editingDevice,
            pendingDeleteDevice,
            onDeviceSelect: (id) => {
              setSelectedDeviceId(id);
              setActiveTab('slots');
            },
          })}

          {activeTab === 'slots' && renderSlotsSection({
            slots,
            deviceSlotsQuery,
            selectedDeviceId,
            setSelectedDeviceId,
            devices,
            spoolbuddyQuery,
            colors,
            spools,
            selectedSlot,
            setSelectedSlot,
            assignModalVisible,
            setAssignModalVisible,
            slotForm,
            setSlotForm,
            closeAssignModal,
            handleAssignSpool,
            assignSlotMutation,
            unassignSlotMutation,
            deleteSlotMutation,
            createSlotMutation,
            invalidateSlots,
            assignmentMap,
            openEditModal,
            openRemoteDevice: setRemoteDeviceId,
            remoteControlsLabel,
            deleteSpoolBuddyMutation,
            invalidateDevices,
            handleCreateDevice,
            createSpoolBuddyMutation,
            createForm,
            setCreateForm,
            closeCreateModal,
            editModalVisible,
            editForm,
            setEditForm,
            closeEditModal,
            handleSaveDevice,
            updateSpoolBuddyMutation,
            editingDevice,
            pendingDeleteDevice,
            setPendingDeleteDevice,
          })}

          {activeTab === 'usage' && renderUsageSection({
            usageQuery,
            usageRecords,
            usageSummaryQuery,
            usageSummaries,
            selectedDeviceId,
            setSelectedDeviceId,
            devices,
            spoolbuddyQuery,
            colors,
            onDeviceSelect: (id) => {
              setSelectedDeviceId(id);
            },
          })}
        </ScrollView>
      </View>

      <RemoteSpoolBuddyModal deviceId={remoteDeviceId} onClose={() => setRemoteDeviceId(null)} />

      {/* Create device modal */}
      <SimpleModal
        visible={createModalVisible}
        title={translateNative('native.cd7d93058f0f33db')}
        subtitle={translateNative('native.4e432c8f77e2d0ff')}
        onClose={closeCreateModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField
            label={translateNative('native.e7992ba86db917ee')}
            value={createForm.device_id}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, device_id: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label={translateNative('native.34c7bb242505a716')}
            value={createForm.hostname}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, hostname: value }))
            }
          />
          <TextField
            label={translateNative('native.034a6032919bb741')}
            value={createForm.ip_address}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, ip_address: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label={translateNative('native.301fd81a82ae3258')}
            value={createForm.backend_url}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, backend_url: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label={translateNative('native.fbfa086fd7173e5a')}
            value={createForm.api_key}
            onChangeText={value =>
              setCreateForm(current => ({ ...current, api_key: value }))
            }
            autoCapitalize="none"
            secureTextEntry
          />
          <View style={styles.modalFooter}>
            <PrimaryButton
              label={translateNative('common.cancel')}
              variant="secondary"
              onPress={closeCreateModal}
            />
            <PrimaryButton
              label={
                createSpoolBuddyMutation.isPending
                  ? translateNative('native.71daaf40bd1e94d2')
                  : translateNative('native.262040b14fbd4c58')
              }
              onPress={handleCreateDevice}
              loading={createSpoolBuddyMutation.isPending}
              disabled={createSpoolBuddyMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      {/* Edit device modal */}
      <SimpleModal
        visible={editModalVisible}
        title={translateNative('native.f04b3b91415b1c20')}
        subtitle={translateNative('native.edf6ae8b0b2a8976')}
        onClose={closeEditModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField
            label={translateNative('native.34c7bb242505a716')}
            value={editForm.hostname}
            onChangeText={value =>
              setEditForm(current => ({ ...current, hostname: value }))
            }
          />
          <TextField
            label={translateNative('native.034a6032919bb741')}
            value={editForm.ip_address}
            onChangeText={value =>
              setEditForm(current => ({ ...current, ip_address: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label={translateNative('native.301fd81a82ae3258')}
            value={editForm.backend_url}
            onChangeText={value =>
              setEditForm(current => ({ ...current, backend_url: value }))
            }
            autoCapitalize="none"
          />
          <TextField
            label={translateNative('native.16320a8f424ca295')}
            value={editForm.api_key}
            onChangeText={value =>
              setEditForm(current => ({ ...current, api_key: value }))
            }
            autoCapitalize="none"
            secureTextEntry
          />
          <TextField
            label={translateNative('native.6198a1def03bfc98')}
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
            label={translateNative('native.fc3a57fdf89f134a')}
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
              label={translateNative('common.cancel')}
              variant="secondary"
              onPress={closeEditModal}
            />
            <PrimaryButton
              label={updateSpoolBuddyMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')}
              onPress={handleSaveDevice}
              loading={updateSpoolBuddyMutation.isPending}
              disabled={updateSpoolBuddyMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      {/* Assign spool to slot modal */}
      <SimpleModal
        visible={assignModalVisible}
        title={translateNative('native.2aed15fa9939f47f')}
        subtitle={
          selectedSlot
            ? translateNative('native.83d45f583036598f', { value0: String(selectedSlot.slot_index), value1: String(selectedDeviceId) })
            : translateNative('native.5f2c9daed0b2507b')
        }
        onClose={closeAssignModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          {spools.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spoolChips}>
              {spools
                .filter(s => pickNumber(s, ['id']) > 0 && !pickString(s, ['archived_at']))
                .map(spool => {
                  const spoolId = pickNumber(spool, ['id']);
                  const spoolLabel = [
                    pickString(spool, ['brand']),
                    pickString(spool, ['material']),
                    pickString(spool, ['color_name']),
                  ].filter(Boolean).join(' ') || translateNative('native.695cc238a31cecd5', { value0: String(spoolId) });
                  return (
                    <Pressable
                      key={spoolId}
                      style={[
                        styles.spoolChip,
                        {
                          backgroundColor:
                            slotForm.spoolId === String(spoolId)
                              ? colors.accent
                              : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSlotForm({ spoolId: String(spoolId) })}
                    >
                      <Text
                        style={[
                          styles.spoolChipText,
                          {
                            color:
                              slotForm.spoolId === String(spoolId)
                                ? colors.background
                                : colors.text,
                          },
                        ]}
                      >
                        {spoolLabel}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          ) : (
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {translateNative('native.e212cb875d6f73df')}</Text>
          )}
          <View style={styles.modalFooter}>
            <PrimaryButton
              label={translateNative('common.cancel')}
              variant="secondary"
              onPress={closeAssignModal}
            />
            <PrimaryButton
              label={translateNative('native.aff9b055e1df6025')}
              onPress={handleAssignSpool}
              loading={assignSlotMutation.isPending}
              disabled={assignSlotMutation.isPending || !slotForm.spoolId}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      {/* Delete slot confirmation */}
      <ConfirmModal
        visible={pendingDeleteDevice !== null}
        title={translateNative('native.d4a96d2f26a68e12')}
        message={
          pendingDeleteDevice
            ? translateNative('native.be2129b437095e77', { value0: String(pickString(
                pendingDeleteDevice,
                ['hostname', 'device_id'],
                translateNative('native.2675dba07a684211'),
              )) })
            : translateNative('native.3f42a690ead34f73')
        }
        confirmLabel={translateNative('native.19c4ccf07e5b405d')}
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

function renderDevicesSection({
  devices,
  colors,
  createModalVisible: _createModalVisible,
  setCreateModalVisible,
  openEditModal,
  setPendingDeleteDevice,
  openRemoteDevice,
  remoteControlsLabel,
  deleteSpoolBuddyMutation: _deleteSpoolBuddyMutation,
  invalidateDevices: _invalidateDevices,
  handleCreateDevice: _handleCreateDevice,
  createSpoolBuddyMutation: _createSpoolBuddyMutation,
  createForm: _createForm,
  setCreateForm: _setCreateForm,
  closeCreateModal: _closeCreateModal,
  editingDevice: _editingDevice,
  pendingDeleteDevice: _pendingDeleteDevice,
  onDeviceSelect,
}: {
  devices: ApiRecord[];
  colors: ReturnType<typeof useTheme>['colors'];
  createModalVisible: boolean;
  setCreateModalVisible: (v: boolean) => void;
  openEditModal: (d: ApiRecord) => void;
  setPendingDeleteDevice: (d: ApiRecord | null) => void;
  openRemoteDevice: (id: string) => void;
  remoteControlsLabel: string;
  deleteSpoolBuddyMutation: any;
  invalidateDevices: () => Promise<void>;
  handleCreateDevice: () => void;
  createSpoolBuddyMutation: any;
  createForm: CreateDeviceForm;
  setCreateForm: (f: CreateDeviceForm) => void;
  closeCreateModal: () => void;
  editingDevice: ApiRecord | null;
  pendingDeleteDevice: ApiRecord | null;
  onDeviceSelect: (id: string) => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          SpoolBuddy
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.f450c1469558d158')}</Text>
      </View>

      <SectionCard
        title={translateNative('native.cfe7dce2f506ba52')}
        subtitle={translateNative('native.ef40596f1dd43b02')}
      >
        <PrimaryButton
          label={translateNative('native.262040b14fbd4c58')}
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
                    <Pressable
                      onPress={() => onDeviceSelect(deviceId)}
                      style={styles.clickable}
                    >
                      <Text
                        style={[styles.deviceTitle, { color: colors.text }]}
                      >
                        {pickString(
                          device,
                          ['hostname', 'device_id'],
                          'SpoolBuddy',
                        )}
                      </Text>
                    </Pressable>
                    <Text
                      style={[
                        styles.deviceMeta,
                        { color: colors.textSecondary },
                      ]}
                    ><NativeTranslation id="native.5316e7447ba324cb" values={{ value0: (deviceId) }} /></Text>
                  </View>
                  <StatusBadge
                    label={online ? translateNative('native.901d5a89d9f5cad2') : translateNative('native.c4b60eea6e399455')}
                    color={statusColor(
                      online ? 'success' : 'offline',
                      colors,
                    )}
                  />
                </View>
                <View style={styles.metricsRow}>
                  <InfoChip
                    label={translateNative('native.afb437bb136531b3')}
                    value={describeBattery(device)}
                    colors={colors}
                  />
                  <InfoChip
                    label={translateNative('native.b06111138c8370ed')}
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
                  {translateNative('native.d887a0c408b3f550')}{pickBoolean(device, ['has_nfc']) ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })} (
                  {pickBoolean(device, ['nfc_ok']) ? translateNative('native.826b3b4e892042f3', { defaultValue: 'ok' }) : translateNative('native.c10ff8329514e81e')}{translateNative('native.a51c65d40a2e2de9')}{pickBoolean(device, ['has_scale']) ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })} (
                  {pickBoolean(device, ['scale_ok']) ? translateNative('native.826b3b4e892042f3', { defaultValue: 'ok' }) : translateNative('native.c10ff8329514e81e')})
                </Text>
                <Text
                  style={[
                    styles.deviceMeta,
                    { color: colors.textSecondary },
                  ]}
                ><NativeTranslation id="native.e80c00f5144b858d" values={{ value0: (describeLastSeen(device)), value1: (formatDuration(pickNumber(device, ['uptime_s'], 0))) }} /></Text>
                <Text
                  style={[
                    styles.deviceMeta,
                    { color: colors.textSecondary },
                  ]}
                ><NativeTranslation id="native.b28318a758b5fb86" values={{ value0: (pickString(
                    device,
                    ['backend_url'],
                    translateNative('native.e26dc4caf4a4ad54'),
                  )) }} /></Text>
                <Text
                  style={[
                    styles.deviceAction,
                    { color: colors.accent },
                  ]}
                >
                  {translateNative('native.c588460c012e48cd')}</Text>

                <View style={styles.actionsRow}>
                  <PrimaryButton
                    label={translateNative('native.6d999fe2d85736ea')}
                    variant="secondary"
                    onPress={() => openEditModal(device)}
                  />
                  <PrimaryButton
                    label={remoteControlsLabel}
                    variant="secondary"
                    onPress={() =>
                      openRemoteDevice(deviceId)
                    }
                  />
                  <PrimaryButton
                    label={translateNative('native.19c4ccf07e5b405d')}
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
            title={translateNative('native.53adb0ea6cd57dbe')}
            message={translateNative('native.c5a2fb348daa7195')}
          />
        )}
      </SectionCard>

    </>
  );
}

function renderSlotsSection({
  slots,
  deviceSlotsQuery: _deviceSlotsQuery,
  selectedDeviceId,
  setSelectedDeviceId,
  devices,
  spoolbuddyQuery: _spoolbuddyQuery,
  colors,
  spools,
  selectedSlot,
  setSelectedSlot,
  assignModalVisible,
  setAssignModalVisible,
  slotForm,
  setSlotForm,
  closeAssignModal,
  handleAssignSpool,
  assignSlotMutation,
  unassignSlotMutation,
  deleteSlotMutation,
  createSlotMutation,
  invalidateSlots: _invalidateSlots,
  assignmentMap,
  openEditModal,
  openRemoteDevice,
  remoteControlsLabel,
  deleteSpoolBuddyMutation: _deleteSpoolBuddyMutation,
  invalidateDevices: _invalidateDevices,
  handleCreateDevice: _handleCreateDevice,
  createSpoolBuddyMutation: _createSpoolBuddyMutation,
  createForm: _createForm,
  setCreateForm: _setCreateForm,
  closeCreateModal: _closeCreateModal,
  editModalVisible: _editModalVisible,
  editForm: _editForm,
  setEditForm: _setEditForm,
  closeEditModal: _closeEditModal,
  handleSaveDevice: _handleSaveDevice,
  updateSpoolBuddyMutation: _updateSpoolBuddyMutation,
  editingDevice: _editingDevice,
  pendingDeleteDevice: _pendingDeleteDevice,
  setPendingDeleteDevice,
}: {
  slots: SpoolBuddySlot[];
  deviceSlotsQuery: any;
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  devices: ApiRecord[];
  spoolbuddyQuery: any;
  colors: ReturnType<typeof useTheme>['colors'];
  spools: InventorySpool[];
  selectedSlot: SpoolBuddySlot | null;
  setSelectedSlot: (s: SpoolBuddySlot | null) => void;
  assignModalVisible: boolean;
  setAssignModalVisible: (v: boolean) => void;
  slotForm: SlotAssignmentForm;
  setSlotForm: (f: SlotAssignmentForm) => void;
  closeAssignModal: () => void;
  handleAssignSpool: () => void;
  assignSlotMutation: any;
  unassignSlotMutation: any;
  deleteSlotMutation: any;
  createSlotMutation: any;
  invalidateSlots: () => Promise<void>;
  assignmentMap: Map<number, SpoolBuddySlotAssignment>;
  openEditModal: (d: ApiRecord) => void;
  openRemoteDevice: (id: string) => void;
  remoteControlsLabel: string;
  deleteSpoolBuddyMutation: any;
  invalidateDevices: () => Promise<void>;
  handleCreateDevice: () => void;
  createSpoolBuddyMutation: any;
  createForm: CreateDeviceForm;
  setCreateForm: (f: CreateDeviceForm) => void;
  closeCreateModal: () => void;
  editModalVisible: boolean;
  editForm: EditDeviceForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditDeviceForm>>;
  closeEditModal: () => void;
  handleSaveDevice: () => void;
  updateSpoolBuddyMutation: any;
  editingDevice: ApiRecord | null;
  pendingDeleteDevice: ApiRecord | null;
  setPendingDeleteDevice: any;
}) {
  if (!selectedDeviceId) {
    return (
      <>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {translateNative('native.03fe0c4dc87ebae7')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {translateNative('native.c6ef079b574b2775')}</Text>
        </View>
        {devices.length > 0 ? (
          <SectionCard
            title={translateNative('native.e6c6aadfa14c5a8a')}
            subtitle={translateNative('native.7a90d292d9b824a2')}
          >
            {devices.map(device => {
              const deviceId = pickString(device, ['device_id', 'id']);
              return (
                <PrimaryButton
                  key={deviceId}
                  label={pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}
                  variant="secondary"
                  onPress={() => setSelectedDeviceId(deviceId)}
                />
              );
            })}
          </SectionCard>
        ) : (
          <EmptyState
            icon="nfc"
            title={translateNative('native.cc68fb57cf62782e')}
            message={translateNative('native.1585fef048968c53')}
          />
        )}
      </>
    );
  }

  const currentDevice = devices.find(
    d => pickString(d, ['device_id', 'id']) === selectedDeviceId,
  );

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.03fe0c4dc87ebae7')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}><NativeTranslation id="native.c9b0848587a162eb" values={{ value0: (pickString(currentDevice, ['hostname', 'device_id'], selectedDeviceId)) }} /></Text>
      </View>

      {/* Device selector */}
      {devices.length > 1 && (
        <SectionCard title={translateNative('native.3bdb47beb17ae557')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spoolChips}>
            {devices.map(device => {
              const deviceId = pickString(device, ['device_id', 'id']);
              return (
                <Pressable
                  key={deviceId}
                  style={[
                    styles.deviceChip,
                    selectedDeviceId === deviceId && [
                      styles.deviceChipActive,
                      { backgroundColor: colors.accent },
                    ],
                  ]}
                  onPress={() => setSelectedDeviceId(deviceId)}
                >
                  <Text
                    style={[
                      styles.deviceChipText,
                      {
                        color:
                          selectedDeviceId === deviceId
                            ? colors.background
                            : colors.text,
                      },
                    ]}
                  >
                    {pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </SectionCard>
      )}

      <SectionCard
        title={translateNative('native.e49983648890590f')}
        subtitle={translateNative('native.466df31e845e6ae4', { value0: String(pickString(currentDevice, ['hostname', 'device_id'], selectedDeviceId)) })}
      >
        <PrimaryButton
          label={translateNative('native.a91769118a438e28')}
          variant="secondary"
          onPress={() => void createSlotMutation.mutateAsync()}
          loading={createSlotMutation.isPending}
          disabled={createSlotMutation.isPending}
        />
        {slots.length > 0 ? (
          slots.map(slot => {
            const assignment = assignmentMap.get(slot.slot_index);
            const hasSpool = slot.spool_id != null && slot.spool_id > 0;
            return (
              <View
                key={slot.slot_index}
                style={[
                  styles.slotCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: hasSpool ? colors.success : colors.border,
                  },
                ]}
              >
                <View style={styles.slotHeader}>
                  <View style={styles.slotTitleArea}>
                    <Text style={[styles.slotTitle, { color: colors.text }]}><NativeTranslation id="native.0fe9bbcfeac0b232" values={{ value0: (slot.slot_index) }} /></Text>
                    {hasSpool ? (
                      <Text
                        style={[styles.slotSpoolInfo, { color: colors.text }]}
                      >
                        {slot.spool_brand || translateNative('native.ff12a040d13addb7')} • {slot.spool_material || translateNative('native.ff12a040d13addb7')}
                        {slot.spool_color_name ? ` • ${slot.spool_color_name}` : ''}
                      </Text>
                    ) : (
                      <Text style={[styles.slotSpoolInfo, { color: colors.textTertiary }]}>
                        {translateNative('native.ee4487d54025a3ca')}</Text>
                    )}
                  </View>
                  <StatusBadge
                    label={slot.empty ? translateNative('native.392961b641438c61') : translateNative('native.a2acc21e44691893')}
                    color={statusColor(slot.empty ? 'warning' : 'success', colors)}
                  />
                </View>

                <View style={styles.metricsRow}>
                  <InfoChip
                    label={translateNative('common.weight')}
                    value={`${slot.weight_g.toFixed(1)} g`}
                    colors={colors}
                  />
                  <InfoChip
                    label={translateNative('native.2f9b92b2e3f94c24')}
                    value={`${slot.calibrated_weight_g.toFixed(1)} g`}
                    colors={colors}
                  />
                  <InfoChip
                    label={translateNative('native.e2f888ec587531e5')}
                    value={slot.scale_ok ? 'ok' : 'error'}
                    colors={colors}
                  />
                </View>

                {slot.last_read_at && (
                  <Text style={[styles.deviceMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.11f03fb5f333048d" values={{ value0: (formatDateTime(slot.last_read_at)) }} /></Text>
                )}

                <View style={styles.actionsRow}>
                  {hasSpool ? (
                    <Pressable
                      style={styles.slotCardAction}
                      onPress={() => {
                        setSelectedSlot(slot);
                        setSlotForm({ spoolId: String(slot.spool_id) });
                        setAssignModalVisible(true);
                      }}
                    >
                      <PrimaryButton
                        label={translateNative('native.43eb7cfa350a028b')}
                        variant="secondary"
                        onPress={() => {
                          setSelectedSlot(slot);
                          setSlotForm({ spoolId: String(slot.spool_id) });
                          setAssignModalVisible(true);
                        }}
                      />
                    </Pressable>
                  ) : (
                    <View>
                      <PrimaryButton
                        label={translateNative('native.81feec5a97a3034f')}
                        variant="secondary"
                        onPress={() => {
                          setSelectedSlot(slot);
                          setSlotForm(EMPTY_SLOT_FORM);
                          setAssignModalVisible(true);
                        }}
                      />
                    </View>
                  )}
                  {hasSpool && assignment ? (
                    <PrimaryButton
                      label={translateNative('native.1cc819b2aa2fbd6a')}
                      variant="secondary"
                      onPress={() => {
                        if (selectedDeviceId) {
                          unassignSlotMutation.mutate({
                            deviceId: selectedDeviceId,
                            slotIndex: slot.slot_index,
                          });
                        }
                      }}
                      loading={unassignSlotMutation.isPending}
                      disabled={unassignSlotMutation.isPending}
                    />
                  ) : null}
                  <PrimaryButton
                    label={translateNative('native.0fd77292395db6b4')}
                    variant="danger"
                    onPress={() => {
                      Alert.alert(
                        translateNative('native.0fd77292395db6b4'),
                        translateNative('native.4e6197d82f56fa89', { value0: String(slot.slot_index) }),
                        [
                          { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
                          {
                            get text() { return translateNative('native.19c4ccf07e5b405d'); },
                            style: 'destructive',
                            onPress: () =>
                              deleteSlotMutation.mutate({
                                deviceId: selectedDeviceId!,
                                slotIndex: slot.slot_index,
                              }),
                          },
                        ],
                      );
                    }}
                    loading={deleteSlotMutation.isPending}
                    disabled={deleteSlotMutation.isPending}
                  />
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="layers"
            title={translateNative('native.b608fd67bcb74c7c')}
            message={translateNative('native.ea479c2d0a31a007')}
          />
        )}
      </SectionCard>

      {/* Device actions */}
      <SectionCard title={translateNative('native.577ed9c8245d33e1')}>
        <View style={styles.actionsRow}>
          <PrimaryButton
            label={translateNative('native.6d999fe2d85736ea')}
            variant="secondary"
            onPress={() => currentDevice && openEditModal(currentDevice)}
          />
          <PrimaryButton
            label={remoteControlsLabel}
            variant="secondary"
            onPress={() =>
              selectedDeviceId && openRemoteDevice(selectedDeviceId)
            }
          />
          <PrimaryButton
            label={translateNative('native.4ca3cec70f0f781e')}
            variant="danger"
            onPress={() => currentDevice && setPendingDeleteDevice(currentDevice)}
          />
        </View>
      </SectionCard>

      {/* Spool assignment modal */}
      <SimpleModal
        visible={assignModalVisible}
        title={translateNative('native.2aed15fa9939f47f')}
        subtitle={
          selectedSlot
            ? translateNative('native.f1371c338f1b01d7', { value0: String(selectedSlot.slot_index) })
            : translateNative('native.5f2c9daed0b2507b')
        }
        onClose={closeAssignModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          {spools.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spoolChips}>
              {spools
                .filter(s => pickNumber(s, ['id']) > 0 && !pickString(s, ['archived_at']))
                .map(spool => {
                  const spoolId = pickNumber(spool, ['id']);
                  const spoolLabel = [
                    pickString(spool, ['brand']),
                    pickString(spool, ['material']),
                    pickString(spool, ['color_name']),
                  ].filter(Boolean).join(' ') || translateNative('native.695cc238a31cecd5', { value0: String(spoolId) });
                  return (
                    <Pressable
                      key={spoolId}
                      style={[
                        styles.spoolChip,
                        {
                          backgroundColor:
                            slotForm.spoolId === String(spoolId)
                              ? colors.accent
                              : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setSlotForm({ spoolId: String(spoolId) })}
                    >
                      <Text
                        style={[
                          styles.spoolChipText,
                          {
                            color:
                              slotForm.spoolId === String(spoolId)
                                ? colors.background
                                : colors.text,
                          },
                        ]}
                      >
                        {spoolLabel}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          ) : (
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {translateNative('native.e212cb875d6f73df')}</Text>
          )}
          <View style={styles.modalFooter}>
            <PrimaryButton
              label={translateNative('common.cancel')}
              variant="secondary"
              onPress={closeAssignModal}
            />
            <PrimaryButton
              label={translateNative('native.aff9b055e1df6025')}
              onPress={handleAssignSpool}
              loading={assignSlotMutation.isPending}
              disabled={assignSlotMutation.isPending || !slotForm.spoolId}
            />
          </View>
        </ScrollView>
      </SimpleModal>
    </>
  );
}

function renderUsageSection({
  usageQuery,
  usageRecords,
  usageSummaryQuery: _usageSummaryQuery,
  usageSummaries,
  selectedDeviceId,
  setSelectedDeviceId: _setSelectedDeviceId,
  devices,
  spoolbuddyQuery: _spoolbuddyQuery,
  colors,
  onDeviceSelect,
}: {
  usageQuery: any;
  usageRecords: SpoolBuddyUsageRecord[];
  usageSummaryQuery: any;
  usageSummaries: SpoolBuddyUsageSummary[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  devices: ApiRecord[];
  spoolbuddyQuery: any;
  colors: ReturnType<typeof useTheme>['colors'];
  onDeviceSelect: (id: string) => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.9ead714b4a1fe200')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.4964a4bf1d14ac31')}</Text>
      </View>

      {/* Device selector for usage */}
      <SectionCard title={translateNative('native.96c7bc4883b8d240')}>
        {devices.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spoolChips}>
            {devices.map(device => {
              const deviceId = pickString(device, ['device_id', 'id']);
              return (
                <Pressable
                  key={deviceId}
                  style={[
                    styles.deviceChip,
                    selectedDeviceId === deviceId && [
                      styles.deviceChipActive,
                      { backgroundColor: colors.accent },
                    ],
                  ]}
                  onPress={() => onDeviceSelect(deviceId)}
                >
                  <Text
                    style={[
                      styles.deviceChipText,
                      {
                        color:
                          selectedDeviceId === deviceId
                            ? colors.background
                            : colors.text,
                      },
                    ]}
                  >
                    {pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyState
            icon="trending-down"
            title={translateNative('native.cc68fb57cf62782e')}
            message={translateNative('native.04ec6d469da9d0eb')}
          />
        )}
      </SectionCard>

      {selectedDeviceId && usageSummaries.length > 0 && (
        <SectionCard
          title={translateNative('native.560123ef2582e046')}
          subtitle={translateNative('native.4886e8d5598450b9', { value0: String(pickString(devices.find(d => pickString(d, ['device_id', 'id']) === selectedDeviceId), ['hostname', 'device_id'], selectedDeviceId)) })}
        >
          {usageSummaries.map(summary => (
            <View key={summary.device_id} style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.70de98f6f1faf219')}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}><NativeTranslation id="native.9c765a3ca5313e91" values={{ value0: (summary.total_weight_used_g.toFixed(1)) }} /></Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.b738cd2bb44abf9a')}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}><NativeTranslation id="native.9c765a3ca5313e91" values={{ value0: (summary.total_weight_remaining_g.toFixed(1)) }} /></Text>
              </View>
              {summary.spool_consumptions.length > 0 && (
                <>
                  <Text
                    style={[styles.sectionSubTitle, { color: colors.textSecondary }]}
                  >
                    {translateNative('native.91cccf549c8cfa03')}</Text>
                  {summary.spool_consumptions.map((consumption, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.consumptionRow,
                        { borderBottomColor: colors.borderSubtle },
                      ]}
                    >
                      <View style={styles.consumptionText}>
                        <Text style={[styles.consumptionLabel, { color: colors.text }]}>
                          {consumption.spool_label}
                        </Text>
                        <Text style={[styles.consumptionMeta, { color: colors.textSecondary }]}>
                          {consumption.print_count} {translateNative('native.14fd7cf93e80c6e0')}{nativeEnglishSuffix(consumption.print_count !== 1 ? 's' : '')}
                        </Text>
                      </View>
                      <Text style={[styles.consumptionValue, { color: colors.text }]}><NativeTranslation id="native.9c765a3ca5313e91" values={{ value0: (consumption.total_used_g.toFixed(1)) }} /></Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          ))}
        </SectionCard>
      )}

      {selectedDeviceId && usageRecords.length > 0 && (
        <SectionCard
          title={translateNative('native.248e456ba5da5066')}
          subtitle={translateNative('native.85a90cb9d4d53fb7', { value0: String(usageRecords.length) })}
        >
          {usageRecords.map(record => (
            <View
              key={record.id}
              style={[styles.historyRow, { borderBottomColor: colors.borderSubtle }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {translateNative('native.abdcaabd55140ea9')}{record.slot_index}
                  {record.spool_brand
                    ? ` • ${record.spool_brand} ${record.spool_material || ''}`
                    : translateNative('native.b2b2902ee44580cc')}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {formatDateTime(record.recorded_at)}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowMeta, { color: colors.text }]}><NativeTranslation id="native.ea72e64ad1dc4991" values={{ value0: (record.weight_used_g.toFixed(1)) }} /></Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.ba564890f979f68b" values={{ value0: (record.calibrated_weight_g.toFixed(1)) }} /></Text>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {selectedDeviceId && usageRecords.length === 0 && usageQuery.isFetching && (
        <LoadingScreen message={translateNative('native.55718e7f69a944d5')} />
      )}

      {selectedDeviceId && usageRecords.length === 0 && !usageQuery.isFetching && (
        <EmptyState
          icon="trending-down"
          title={translateNative('native.e1bdc0f1ee95d0ec')}
          message={translateNative('native.bfcad6771cf71d5d')}
        />
      )}
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
  useNativeLocale();
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: 'transparent',
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabButtonActive: {},
  tabButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  tabButtonTextActive: {
    fontWeight: fontWeight.semibold,
  },
  scrollView: { flex: 1 },
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
  deviceAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
  slotCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  slotTitleArea: {
    flex: 1,
    gap: 2,
  },
  slotTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  slotSpoolInfo: {
    fontSize: fontSize.sm,
  },
  slotCardAction: {
    flex: 1,
  },
  spoolChips: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  spoolChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  spoolChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  deviceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  deviceChipActive: {},
  deviceChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: fontSize.sm,
  },
  summaryValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  sectionSubTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  consumptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  consumptionText: {
    flex: 1,
    gap: 2,
  },
  consumptionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  consumptionMeta: {
    fontSize: fontSize.xs,
  },
  consumptionValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  rowMeta: {
    fontSize: fontSize.xs,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  infoText: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  clickable: {
    flex: 1,
  },
});
