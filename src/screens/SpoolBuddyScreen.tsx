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

  const createSlotMutation = useMutation({
    mutationFn: () =>
      selectedDeviceId
        ? api.createSpoolBuddySlot({
            device_id: selectedDeviceId,
            slot_index: 0,
          })
        : Promise.reject(new Error('No device selected')),
    onSuccess: async () => {
      await invalidateSlots();
      showToast('Slot created.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to create slot.', 'error'),
  });

  const deleteSlotMutation = useMutation({
    mutationFn: ({ deviceId, slotIndex }: { deviceId: string; slotIndex: number }) =>
      api.deleteSpoolBuddySlot(deviceId, slotIndex),
    onSuccess: async () => {
      await invalidateSlots();
      showToast('Slot removed.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to remove slot.', 'error'),
  });

  const assignSlotMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlot || !selectedDeviceId || !slotForm.spoolId) {
        return Promise.reject(new Error('Missing required fields'));
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
      showToast('Spool assigned to slot.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to assign spool.', 'error'),
  });

  const unassignSlotMutation = useMutation({
    mutationFn: ({ deviceId, slotIndex }: { deviceId: string; slotIndex: number }) =>
      api.unassignSpoolBuddySlot(deviceId, slotIndex),
    onSuccess: async () => {
      await invalidateSlots();
      await invalidateSpools();
      showToast('Spool unassigned from slot.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to unassign spool.', 'error'),
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

  const handleAssignSpool = React.useCallback(() => {
    if (!slotForm.spoolId || Number(slotForm.spoolId) <= 0) {
      showToast('Please select a valid spool.', 'error');
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

  const assignmentMap = React.useMemo(() => {
    const map = new Map<number, SpoolBuddySlotAssignment>();
    assignments.forEach(a => {
      map.set(a.slot_index, a);
    });
    return map;
  }, [assignments]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'devices', label: 'Devices' },
    { key: 'slots', label: 'Slots' },
    { key: 'usage', label: 'Usage' },
  ];

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
            calibrateSpoolBuddyMutation,
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
            calibrateSpoolBuddyMutation,
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

      {/* Create device modal */}
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

      {/* Edit device modal */}
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

      {/* Assign spool to slot modal */}
      <SimpleModal
        visible={assignModalVisible}
        title="Assign Spool to Slot"
        subtitle={
          selectedSlot
            ? `Assign a spool to slot ${selectedSlot.slot_index} on device ${selectedDeviceId}`
            : 'Select a spool to assign to this slot'
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
                  ].filter(Boolean).join(' ') || `Spool #${spoolId}`;
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
              No active spools available. Add spools in the Inventory tab first.
            </Text>
          )}
          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeAssignModal}
            />
            <PrimaryButton
              label="Assign"
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

function renderDevicesSection({
  devices,
  colors,
  createModalVisible: _createModalVisible,
  setCreateModalVisible,
  openEditModal,
  setPendingDeleteDevice,
  calibrateSpoolBuddyMutation,
  deleteSpoolBuddyMutation: _deleteSpoolBuddyMutation,
  invalidateDevices: _invalidateDevices,
  handleCreateDevice: _handleCreateDevice,
  createSpoolBuddyMutation: _createSpoolBuddyMutation,
  createForm: _createForm,
  setCreateForm: _setCreateForm,
  closeCreateModal: _closeCreateModal,
  editModalVisible,
  editForm,
  setEditForm,
  closeEditModal,
  handleSaveDevice,
  updateSpoolBuddyMutation,
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
  calibrateSpoolBuddyMutation: any;
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
  onDeviceSelect: (id: string) => void;
}) {
  return (
    <>
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
                <Text
                  style={[
                    styles.deviceAction,
                    { color: colors.accent },
                  ]}
                >
                  Tap to manage slots →
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

      {/* Edit device modal inline */}
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
  calibrateSpoolBuddyMutation,
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
  calibrateSpoolBuddyMutation: any;
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
            Slot Management
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Select a device above to manage its slots and spool assignments.
          </Text>
        </View>
        {devices.length > 0 ? (
          <SectionCard
            title="Select a device"
            subtitle="Choose a SpoolBuddy device to view and manage its slots."
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
            title="No devices available"
            message="Add a SpoolBuddy device on the Devices tab first."
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
          Slot Management
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage slots, assign spools, and track filament weight for{' '}
          {pickString(currentDevice, ['hostname', 'device_id'], selectedDeviceId)}.
        </Text>
      </View>

      {/* Device selector */}
      {devices.length > 1 && (
        <SectionCard title="Switch device">
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
        title="Slots"
        subtitle={`Physical slots on ${pickString(currentDevice, ['hostname', 'device_id'], selectedDeviceId)}. Tap a slot to assign or unassign a spool.`}
      >
        <PrimaryButton
          label="Add slot"
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
                    <Text style={[styles.slotTitle, { color: colors.text }]}>
                      Slot {slot.slot_index}
                    </Text>
                    {hasSpool ? (
                      <Text
                        style={[styles.slotSpoolInfo, { color: colors.text }]}
                      >
                        {slot.spool_brand || 'Unknown'} • {slot.spool_material || 'Unknown'}
                        {slot.spool_color_name ? ` • ${slot.spool_color_name}` : ''}
                      </Text>
                    ) : (
                      <Text style={[styles.slotSpoolInfo, { color: colors.textTertiary }]}>
                        Empty
                      </Text>
                    )}
                  </View>
                  <StatusBadge
                    label={slot.empty ? 'empty' : 'loaded'}
                    color={statusColor(slot.empty ? 'warning' : 'success', colors)}
                  />
                </View>

                <View style={styles.metricsRow}>
                  <InfoChip
                    label="Weight"
                    value={`${slot.weight_g.toFixed(1)} g`}
                    colors={colors}
                  />
                  <InfoChip
                    label="Calibrated"
                    value={`${slot.calibrated_weight_g.toFixed(1)} g`}
                    colors={colors}
                  />
                  <InfoChip
                    label="Scale"
                    value={slot.scale_ok ? 'ok' : 'error'}
                    colors={colors}
                  />
                </View>

                {slot.last_read_at && (
                  <Text style={[styles.deviceMeta, { color: colors.textSecondary }]}>
                    Last read: {new Date(slot.last_read_at).toLocaleString()}
                  </Text>
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
                        label="Change spool"
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
                        label="Assign spool"
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
                      label="Unassign"
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
                    label="Remove slot"
                    variant="danger"
                    onPress={() => {
                      Alert.alert(
                        'Remove slot',
                        `Remove slot ${slot.slot_index}? This cannot be undone.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
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
            title="No slots configured"
            message="Add a slot to start tracking filament weight and assigning spools."
          />
        )}
      </SectionCard>

      {/* Device actions */}
      <SectionCard title="Device actions">
        <View style={styles.actionsRow}>
          <PrimaryButton
            label="Configure"
            variant="secondary"
            onPress={() => currentDevice && openEditModal(currentDevice)}
          />
          <PrimaryButton
            label="Calibrate scale"
            variant="secondary"
            onPress={() =>
              selectedDeviceId && calibrateSpoolBuddyMutation.mutate(selectedDeviceId)
            }
            loading={calibrateSpoolBuddyMutation.isPending}
            disabled={calibrateSpoolBuddyMutation.isPending}
          />
          <PrimaryButton
            label="Remove device"
            variant="danger"
            onPress={() => currentDevice && setPendingDeleteDevice(currentDevice)}
          />
        </View>
      </SectionCard>

      {/* Spool assignment modal */}
      <SimpleModal
        visible={assignModalVisible}
        title="Assign Spool to Slot"
        subtitle={
          selectedSlot
            ? `Assign a spool to slot ${selectedSlot.slot_index}`
            : 'Select a spool to assign to this slot'
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
                  ].filter(Boolean).join(' ') || `Spool #${spoolId}`;
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
              No active spools available. Add spools in the Inventory tab first.
            </Text>
          )}
          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeAssignModal}
            />
            <PrimaryButton
              label="Assign"
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
          Filament Usage
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Track filament consumption via SpoolBuddy scale readings.
        </Text>
      </View>

      {/* Device selector for usage */}
      <SectionCard title="Select device">
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
            title="No devices available"
            message="Add a SpoolBuddy device to track filament usage."
          />
        )}
      </SectionCard>

      {selectedDeviceId && usageSummaries.length > 0 && (
        <SectionCard
          title="Usage summary"
          subtitle={`Total consumption for ${pickString(devices.find(d => pickString(d, ['device_id', 'id']) === selectedDeviceId), ['hostname', 'device_id'], selectedDeviceId)}`}
        >
          {usageSummaries.map(summary => (
            <View key={summary.device_id} style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  Total used
                </Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {summary.total_weight_used_g.toFixed(1)} g
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  Remaining
                </Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {summary.total_weight_remaining_g.toFixed(1)} g
                </Text>
              </View>
              {summary.spool_consumptions.length > 0 && (
                <>
                  <Text
                    style={[styles.sectionSubTitle, { color: colors.textSecondary }]}
                  >
                    By spool
                  </Text>
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
                          {consumption.print_count} print{consumption.print_count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Text style={[styles.consumptionValue, { color: colors.text }]}>
                        {consumption.total_used_g.toFixed(1)} g
                      </Text>
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
          title="Recent readings"
          subtitle={`Latest ${usageRecords.length} scale readings`}
        >
          {usageRecords.map(record => (
            <View
              key={record.id}
              style={[styles.historyRow, { borderBottomColor: colors.borderSubtle }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Slot {record.slot_index}
                  {record.spool_brand
                    ? ` • ${record.spool_brand} ${record.spool_material || ''}`
                    : ' • (unassigned)'}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {new Date(record.recorded_at).toLocaleString()}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowMeta, { color: colors.text }]}>
                  {record.weight_used_g.toFixed(1)} g used
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {record.calibrated_weight_g.toFixed(1)} g remaining
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {selectedDeviceId && usageRecords.length === 0 && usageQuery.isFetching && (
        <LoadingScreen message="Loading usage data…" />
      )}

      {selectedDeviceId && usageRecords.length === 0 && !usageQuery.isFetching && (
        <EmptyState
          icon="trending-down"
          title="No usage data"
          message="Scale readings will appear here once SpoolBuddy starts recording filament weight."
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
