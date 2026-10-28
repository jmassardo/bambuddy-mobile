import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { integrationsApi } from '@/api/integrations';
import { VirtualPrinterAddress, VirtualPrinterDiagnostics, VirtualPrinterGlobalSetup } from '@/components/settings/VirtualPrinterIntegration';
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
import {
  OptionChipsField,
  settingsStyles,
  SimpleModal,
  SwitchRow,
} from '@/components/settings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  VirtualPrinterConfig,
  VirtualPrinterListResponse,
  VirtualPrinterMode,
} from '@/types/api';
import { pickBoolean, pickNumber, pickString, statusColor } from '@/utils/data';
import { useIntegrationTranslation } from '@/components/settings/useIntegrationTranslation';

const VIRTUAL_PRINTERS_QUERY_KEY = ['virtualPrinters'] as const;

const VIRTUAL_PRINTER_MODES: Array<{ key: VirtualPrinterMode; label: string; description: string }> = [
  { key: 'archive', get label() { return translateNative('screen.archive'); }, get description() { return translateNative('native.eec1df5b353934aa'); } },
  { key: 'review', get label() { return translateNative('native.aa4ba7807e38174f'); }, get description() { return translateNative('native.4ac857f3c845d5db'); } },
  { key: 'queue', get label() { return translateNative('nav.queue'); }, get description() { return translateNative('native.52302e8ca55f2007'); } },
  { key: 'proxy', get label() { return translateNative('native.0ba1456c0cc0e613'); }, get description() { return translateNative('native.137ebe7d53a87b3b'); } },
];

type VirtualPrinterFormState = {
  name: string;
  model: string;
  accessCode: string;
  enabled: boolean;
  mode: VirtualPrinterMode;
  targetPrinterId: string;
  autoDispatch: boolean;
  queueForceColorMatch: boolean;
  gcodeInjection: boolean;
  tailscaleDisabled: boolean;
  saveAmsMapping: boolean;
  bindIp: string;
  remoteInterfaceIp: string;
};

const EMPTY_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  accessCode: '',
  enabled: false,
  mode: 'archive',
  targetPrinterId: '',
  autoDispatch: false,
  queueForceColorMatch: false,
  gcodeInjection: false,
  tailscaleDisabled: false,
  saveAmsMapping: false,
  bindIp: '',
  remoteInterfaceIp: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVirtualPrinter(value: unknown): value is VirtualPrinterConfig {
  if (!isRecord(value) || !isRecord(value.status)) {
    return false;
  }
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.status.running === 'boolean' &&
    typeof value.status.pending_files === 'number'
  );
}

async function getVirtualPrinterList(): Promise<VirtualPrinterListResponse> {
  const response = await api.getVirtualPrinterList();
  const models = isRecord(response.models)
    ? Object.fromEntries(
        Object.entries(response.models).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

  return {
    printers: Array.isArray(response.printers)
      ? response.printers.filter(isVirtualPrinter)
      : [],
    models,
  };
}

export default function VirtualPrintersScreen() {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'VirtualPrinters'>>();
  const { colors } = useTheme();
  const tr = useIntegrationTranslation();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrinter, setEditingPrinter] =
    useState<VirtualPrinterConfig | null>(null);
  const [form, setForm] = useState<VirtualPrinterFormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] =
    useState<VirtualPrinterConfig | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ get title() { return translateNative('nav.virtual-printers'); } });
  }, [navigation]);

  const printersQuery = useQuery<VirtualPrinterListResponse>({
    queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
    queryFn: getVirtualPrinterList,
  });
  const targetsQuery = useQuery({ queryKey: ['printers'], queryFn: () => api.getPrinters() });
  const interfacesQuery = useQuery({ queryKey: ['networkInterfaces'], queryFn: integrationsApi.interfaces });

  const printers = printersQuery.data?.printers ?? [];
  const modelOptions = useLocalizedMemo(
    () =>
      Object.entries(printersQuery.data?.models ?? {}).map(([key, label]) => ({
        key,
        label,
      })),
    [printersQuery.data?.models],
  );

  const controlMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start'
        ? api.startVirtualPrinter(id)
        : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
    },
    onError: (error: Error) => {
      showToast(
        error.message || translateNative('native.14b5505c2f74cfed'),
        'error',
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        model: form.model.trim() || undefined,
        enabled: form.enabled,
        mode: form.mode,
      };
      if (form.accessCode.trim()) {
        payload.access_code = form.accessCode.trim();
      }
      payload.target_printer_id = form.targetPrinterId ? Number(form.targetPrinterId) : null;
      payload.auto_dispatch = form.autoDispatch;
      payload.queue_force_color_match = form.queueForceColorMatch;
      payload.gcode_injection = form.gcodeInjection;
      payload.tailscale_disabled = form.tailscaleDisabled;
      payload.save_ams_mapping = form.saveAmsMapping;
      payload.bind_ip = form.bindIp;
      payload.remote_interface_ip = form.remoteInterfaceIp;

      return editingPrinter
        ? api.updateVirtualPrinter(editingPrinter.id, payload)
        : api.createVirtualPrinter(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
      closeModal();
      showToast(translateNative('native.b29426730dbc63f4'), 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || translateNative('native.812d6533fb84ee13'), 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
      setPendingDelete(null);
      showToast(translateNative('native.cec7ccc368b4396c'), 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || translateNative('native.18fe6aa1022b78ba'), 'error');
    },
  });

  function closeModal() {
    setModalVisible(false);
    setEditingPrinter(null);
    setForm(EMPTY_FORM);
  }

  function openModal(printer?: VirtualPrinterConfig) {
    if (printer) {
      setEditingPrinter(printer);
      setForm({
        name: printer.name,
        model: printer.model || printer.model_name || 'BL-P001',
        accessCode: '',
        enabled: printer.enabled,
        mode: pickString(printer, ['mode'], 'archive') as VirtualPrinterMode,
        targetPrinterId: String(pickNumber(printer, ['target_printer_id']) || ''),
        autoDispatch: pickBoolean(printer, ['auto_dispatch'], false),
        queueForceColorMatch: pickBoolean(printer, ['queue_force_color_match'], false),
        gcodeInjection: pickBoolean(printer, ['gcode_injection'], false),
        tailscaleDisabled: pickBoolean(printer, ['tailscale_disabled'], false),
        saveAmsMapping: printer.save_ams_mapping ?? false,
        bindIp: printer.bind_ip ?? '',
        remoteInterfaceIp: printer.remote_interface_ip ?? '',
      });
    } else {
      setEditingPrinter(null);
      setForm(EMPTY_FORM);
    }
    setModalVisible(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      showToast(translateNative('native.4c132ed022f83d2c'), 'error');
      return;
    }
    if (form.mode === 'proxy' && !form.targetPrinterId) {
      showToast(translateNative('native.533e6830957bbfed'), 'error');
      return;
    }
    if (form.accessCode && form.accessCode.length !== 8) {
      showToast(tr('Access code must be exactly eight characters.'), 'error');
      return;
    }
    saveMutation.mutate();
  }

  const isProxyMode = form.mode === 'proxy';

  if (printersQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.2a8a7f354d674598')} />;
  }

  if (printersQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.8edf609d6589b7ee')}
        onRetry={() => void printersQuery.refetch()}
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
            refreshing={printersQuery.isRefetching}
            onRefresh={() => void printersQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {translateNative('nav.virtual-printers')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {translateNative('native.b91a1a51a54d1397')}</Text>
        </View>

        <VirtualPrinterGlobalSetup canEdit={isAdmin} />
        <SectionCard
          title={translateNative('native.e523ec9c18407002')}
          subtitle={translateNative('native.919d8e554177956c')}
        >
          {isAdmin ? (
            <PrimaryButton
              label={translateNative('native.72f5a60c986eaf7f')}
              variant="secondary"
              onPress={() => openModal()}
            />
          ) : null}
          {printers.length > 0 ? (
            printers.map(printer => {
              const running = printer.status.running;
              return (
                <View
                  key={printer.id}
                  style={[
                    settingsStyles.itemCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={settingsStyles.itemHeader}>
                    <View style={settingsStyles.itemText}>
                      <Text
                        style={[
                          settingsStyles.itemTitle,
                          { color: colors.text },
                        ]}
                      >
                        {printer.name}
                      </Text>
                      <Text
                        style={[
                          settingsStyles.itemMeta,
                          { color: colors.textSecondary },
                        ]}
                      ><NativeTranslation id="native.383f9fea9f78f8c8" values={{ value0: (printer.model_name ||
                          printer.model ||
                          translateNative('native.e292a54ac2d93315')), value1: (printer.mode), value2: (printer.status.pending_files) }} /></Text>
                    </View>
                    <StatusBadge
                      label={running ? translateNative('native.3180e7c2ebffe771') : translateNative('native.23ea8b9cde72dff7')}
                      color={statusColor(
                        running ? 'success' : 'offline',
                        colors,
                      )}
                    />
                  </View>

                  <VirtualPrinterAddress disabled={printer.tailscale_disabled} />
                  <VirtualPrinterDiagnostics id={printer.id} />

                  <View style={settingsStyles.actions}>
                    <PrimaryButton
                      label={translateNative('common.start')}
                      variant="secondary"
                      onPress={() =>
                        controlMutation.mutate({
                          id: printer.id,
                          action: 'start',
                        })
                      }
                      disabled={running || controlMutation.isPending}
                    />
                    <PrimaryButton
                      label={translateNative('common.stop')}
                      variant="secondary"
                      onPress={() =>
                        controlMutation.mutate({
                          id: printer.id,
                          action: 'stop',
                        })
                      }
                      disabled={!running || controlMutation.isPending}
                    />
                    {isAdmin ? (
                      <>
                        <PrimaryButton
                          label={translateNative('common.edit')}
                          variant="secondary"
                          onPress={() => openModal(printer)}
                        />
                        <PrimaryButton
                          label={translateNative('common.delete')}
                          variant="danger"
                          onPress={() => setPendingDelete(printer)}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              icon="printer"
              title={translateNative('native.0abb319ce2736eab')}
              message={translateNative('native.c2c4eb8efbdeca3a')}
            />
          )}
        </SectionCard>
      </ScrollView>

      <SimpleModal
        visible={modalVisible}
        title={editingPrinter ? translateNative('native.514c84a5ccbf6c63') : translateNative('native.72f5a60c986eaf7f')}
        subtitle={translateNative('native.407c4877dd7ac2ab')}
        onClose={closeModal}
      >
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField
            label={translateNative('common.name')}
            value={form.name}
            onChangeText={name => setForm(current => ({ ...current, name }))}
            placeholder={translateNative('native.397babf29402a4a9')}
          />

          <OptionChipsField
            label={translateNative('native.48ea225998ee692b')}
            value={form.mode}
            options={VIRTUAL_PRINTER_MODES}
            onChange={mode => setForm(current => ({ ...current, mode }))}
          />

          <OptionChipsField
            label={translateNative('native.8b62363d3367fc41')}
            value={form.model}
            options={modelOptions}
            onChange={model => setForm(current => ({ ...current, model }))}
          />

            <View style={styles.proxySection}>
              <Text style={[styles.proxyLabel, { color: colors.text }]}>
                {tr('Target printer')}
              </Text>
              <View style={styles.proxyInputRow}>
                <OptionChipsField label={tr('Target printer')} value={form.targetPrinterId} options={[...(!editingPrinter?.target_printer_id ? [{ key: '', label: tr('Select printer') }] : []), ...(targetsQuery.data ?? []).map(printer => ({ key: String(printer.id), label: `${printer.name} (${printer.ip_address})` }))]} onChange={targetPrinterId => setForm(current => ({ ...current, targetPrinterId }))} />
              </View>
              {form.targetPrinterId ? <VirtualPrinterDiagnostics key={form.targetPrinterId} id={Number(form.targetPrinterId)} target /> : null}
              <Text style={[styles.proxyHint, { color: colors.textSecondary }]}>
                {tr(isProxyMode ? 'The physical Bambu printer to proxy prints to.' : 'Optional target printer. The server inherits its access code when linked.')}
              </Text>
            </View>

          <TextField
            label={translateNative('native.7831792b80b64b30')}
            value={form.accessCode}
            onChangeText={accessCode =>
              setForm(current => ({ ...current, accessCode }))
            }
            autoCapitalize="characters"
            placeholder={translateNative('native.07f0ee2215b61612')}
          />

          <SwitchRow
            label={translateNative('common.enabled')}
            value={form.enabled}
            onValueChange={enabled =>
              setForm(current => ({ ...current, enabled }))
            }
          />
          <SwitchRow label={tr('Save AMS mapping')} value={form.saveAmsMapping} onValueChange={saveAmsMapping => setForm(current => ({ ...current, saveAmsMapping }))} />
          {(['bindIp', 'remoteInterfaceIp'] as const).map(key => <OptionChipsField key={key} label={tr(key === 'bindIp' ? 'Bind interface / IP' : 'Remote slicer interface / IP')} value={form[key]} options={[{ key: '', label: tr(key === 'bindIp' ? 'Select bind IP before enabling' : 'Automatic') }, ...(interfacesQuery.data?.interfaces ?? []).map(iface => ({ key: iface.ip, label: `${iface.name} (${iface.ip}) — ${iface.subnet}${iface.is_alias ? translateNative('native.9f47cc3cb5e97a30') : ''}` }))]} onChange={value => setForm(current => ({ ...current, [key]: value }))} />)}
          {interfacesQuery.error || targetsQuery.error ? <PrimaryButton label={tr('Retry network/printer choices')} variant="secondary" onPress={() => { void interfacesQuery.refetch(); void targetsQuery.refetch(); }} /> : null}

          <View style={styles.advancedToggle}>
            <Text
              style={[styles.advancedTitle, { color: colors.text }]}
              onPress={() => setShowAdvanced(!showAdvanced)}
            ><NativeTranslation id="native.a4d44c22da96b745" values={{ value0: (showAdvanced ? '▲' : '▼') }} /></Text>
          </View>

          {showAdvanced && (
            <View style={styles.advancedSection}>
              <SwitchRow
                label={translateNative('native.2162cbe7b887c1b7')}
                value={form.autoDispatch}
                onValueChange={autoDispatch =>
                  setForm(current => ({ ...current, autoDispatch }))
                }
              />
              <SwitchRow
                label={translateNative('native.5b309c9171c659c5')}
                value={form.queueForceColorMatch}
                onValueChange={queueForceColorMatch =>
                  setForm(current => ({ ...current, queueForceColorMatch }))
                }
              />
              <SwitchRow
                label={translateNative('native.d57b223220f72ff4')}
                value={form.gcodeInjection}
                onValueChange={gcodeInjection =>
                  setForm(current => ({ ...current, gcodeInjection }))
                }
              />
              <SwitchRow
                label={translateNative('native.b1e9a303c5ab90d5')}
                value={form.tailscaleDisabled}
                onValueChange={tailscaleDisabled =>
                  setForm(current => ({ ...current, tailscaleDisabled }))
                }
              />
            </View>
          )}

          <View style={settingsStyles.modalFooter}>
            <PrimaryButton
              label={translateNative('common.cancel')}
              variant="secondary"
              onPress={closeModal}
            />
            <PrimaryButton
              label={
                editingPrinter
                  ? saveMutation.isPending
                    ? translateNative('native.3eacfe080c68cb64')
                    : translateNative('native.4cbb21711c1fcc83')
                  : saveMutation.isPending
                    ? translateNative('native.82fd068711df32f8')
                    : translateNative('native.056fceb480b7ed73')
              }
              onPress={handleSave}
              loading={saveMutation.isPending}
              disabled={saveMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={pendingDelete !== null}
        title={translateNative('native.a144096ce76900d7')}
        message={
          pendingDelete
            ? translateNative('native.3e132ab74d3e7e22', { value0: String(pendingDelete.name) })
            : translateNative('native.8742adfec1b30469')
        }
        confirmLabel={translateNative('common.delete')}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate(pendingDelete.id);
          }
        }}
        loading={deleteMutation.isPending}
      />
    </>
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
  proxySection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  proxyLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  proxyInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  proxyInput: {
    flex: 1,
  },
  testButton: {
    minWidth: 70,
  },
  proxyHint: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  advancedToggle: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  advancedTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  advancedSection: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
  },
});
