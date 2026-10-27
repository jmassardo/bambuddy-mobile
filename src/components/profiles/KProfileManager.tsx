import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/http';
import { printersApi } from '@/api/printers';
import {
  kProfileIdentity,
  profileManagementApi,
} from '@/api/profileManagement';
import {
  PrimaryButton,
  SectionCard,
  TextField,
  InlineTabBar,
} from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { KProfile, KProfileCreate, PresetGroups } from '@/types/api';
import { pickProfileJson, shareProfileJson } from '@/utils/profileFiles';
import {
  genericKFilament,
  kFlow,
  kProfileNoteKeys,
  validateKImport,
} from '@/utils/kProfiles';
import { presetMetadata, presetRows } from '@/utils/profilePresets';

interface FilamentOption {
  key: string;
  id: string;
  name: string;
  source: string;
  cloudId?: string;
}
type Editor = { profile: KProfile | null; copy: boolean };
export function KProfileManager() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [printerId, setPrinterId] = useState<number | null>(null);
  const [nozzle, setNozzle] = useState('0.4');
  const [search, setSearch] = useState('');
  const [extruder, setExtruder] = useState('all');
  const [flow, setFlow] = useState('all');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [kValue, setKValue] = useState('0.020');
  const [nCoef, setNCoef] = useState('0');
  const [filament, setFilament] = useState('');
  const [filamentSearch, setFilamentSearch] = useState('');
  const [editorFlow, setEditorFlow] = useState('HS00');
  const [editorExtruder, setEditorExtruder] = useState('0');
  const [editorNozzle, setEditorNozzle] = useState('0.4');
  const [note, setNote] = useState('');
  const [pendingImport, setPendingImport] = useState<KProfileCreate[] | null>(
    null,
  );
  const canWrite = hasPermission('kprofiles:update');
  const canDelete = hasPermission('kprofiles:delete');
  const printers = useQuery({
    queryKey: ['kConnectedPrinters'],
    queryFn: async () => {
      const rows = await printersApi.getPrinters();
      return Promise.all(
        rows.map(async printer => {
          const status = await printersApi.getPrinterStatus(printer.id);
          return { ...printer, connected: status.connected };
        }),
      );
    },
    refetchInterval: 30000,
  });
  const livePrinters = useMemo(
    () => (printers.data ?? []).filter(printer => printer.connected),
    [printers.data],
  );
  const printer = livePrinters.find(row => row.id === printerId);
  useEffect(() => {
    if (!printer && livePrinters.length) setPrinterId(livePrinters[0].id);
    else if (!printer && printers.data && printerId !== null)
      setPrinterId(null);
  }, [printer, livePrinters, printers.data, printerId]);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setEditor(null);
    setPendingImport(null);
  }, [printerId, nozzle]);
  const query = useQuery({
    queryKey: ['kprofiles', printerId, nozzle],
    queryFn: () => profileManagementApi.kList(printerId!, nozzle),
    enabled: !!printer,
  });
  const notes = useQuery({
    queryKey: ['kProfileNotes', printerId],
    queryFn: () => profileManagementApi.kNotes(printerId!),
    enabled: !!printer,
  });
  const filaments = useQuery({
    queryKey: ['kFilamentOptions'],
    queryFn: async () => {
      const results = await Promise.allSettled([
        profileManagementApi.localList(),
        request<PresetGroups>('/orca-cloud/profiles'),
        request<PresetGroups>('/cloud/settings'),
        request<Array<{ filament_id: string; name: string }>>(
          '/cloud/builtin-filaments',
        ),
      ]);
      const options: FilamentOption[] = [];
      const names = new Set<string>();
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const source = ['local', 'orca', 'cloud', 'builtin'][index];
        const rows = presetRows(result.value);
        const tierNames = new Set<string>();
        rows
          .filter(
            row =>
              index === 3 ||
              row.type === 'filament' ||
              row.preset_type === 'filament',
          )
          .forEach(row => {
            const label = String(row.name ?? '')
              .replace(/@.+$/, '')
              .replace(/^# /, '')
              .trim();
            if (
              tierNames.has(label.toLowerCase()) ||
              (index === 3 && names.has(label.toLowerCase()))
            )
              return;
            tierNames.add(label.toLowerCase());
            names.add(label.toLowerCase());
            const handle = String(row.setting_id ?? row.id ?? row.filament_id);
            const cloudId = index === 2 ? handle : undefined;
            const id =
              index === 3
                ? String(row.filament_id)
                : index === 2
                ? handle.startsWith('GFS')
                  ? handle.split('_')[0].replace(/^GFS/, 'GF')
                  : ''
                : genericKFilament(
                    String(row.filament_type ?? presetMetadata(row).filament),
                  );
            options.push({
              key: `${source}:${handle}`,
              id,
              name: label,
              source,
              cloudId,
            });
          });
      });
      return options;
    },
    enabled: editor !== null,
  });
  const rows = useMemo(
    () => (printer ? query.data?.profiles ?? [] : []),
    [printer, query.data],
  );
  const filtered = useMemo(
    () =>
      rows
        .filter(
          row =>
            `${row.name} ${row.filament_id}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (extruder === 'all' || String(row.extruder_id) === extruder) &&
            (flow === 'all' || kFlow(row.nozzle_id) === flow),
        )
        .sort((a, b) =>
          sort === 'k_value'
            ? Number(a.k_value) - Number(b.k_value)
            : String(
                a[sort === 'filament' ? 'filament_id' : 'name'],
              ).localeCompare(
                String(b[sort === 'filament' ? 'filament_id' : 'name']),
              ),
        ),
    [rows, search, extruder, flow, sort],
  );
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['kprofiles', printerId] }),
      client.invalidateQueries({ queryKey: ['kProfileNotes', printerId] }),
    ]);
  };
  const currentNote = (profile: KProfile) => {
    const key = kProfileNoteKeys(profile).find(
      candidate => notes.data?.notes[candidate],
    );
    return { key, text: key ? notes.data?.notes[key] ?? '' : '' };
  };
  const open = (profile: KProfile | null, copy = false) => {
    setEditor({ profile, copy });
    setName(profile ? `${profile.name}${copy ? ' (copy)' : ''}` : '');
    setKValue(profile?.k_value ?? '0.020');
    setNCoef(profile?.n_coef ?? '0');
    setFilament(profile?.filament_id ?? '');
    setFilamentSearch('');
    setEditorFlow(kFlow(profile?.nozzle_id ?? ''));
    setEditorExtruder(
      profile && !copy
        ? String(profile.extruder_id)
        : printer?.nozzle_count === 2
        ? 'both'
        : '0',
    );
    setEditorNozzle(profile?.nozzle_diameter ?? nozzle);
    setNote(profile ? currentNote(profile).text : '');
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!editor || !printer)
        throw new Error(
          t('profiles.k.selectPrinter', {
            defaultValue: 'Select a connected printer.',
          }),
        );
      if (
        !name.trim() ||
        !filament ||
        !kValue.trim() ||
        !Number.isFinite(Number(kValue)) ||
        Number(kValue) < 0 ||
        !Number.isFinite(Number(nCoef))
      )
        throw new Error(
          t('profiles.k.invalid', {
            defaultValue: 'Enter name, filament and valid nonnegative K value.',
          }),
        );
      const editing = editor.profile && !editor.copy;
      const original = editor.profile;
      const selectedFilament = filaments.data?.find(
        option => option.key === filament,
      );
      let filamentId =
        editing || editor.copy
          ? original!.filament_id
          : selectedFilament?.id ?? filament;
      if (selectedFilament?.cloudId && !selectedFilament.id) {
        const detail = await profileManagementApi.detail(
          selectedFilament.cloudId,
        );
        filamentId = String(
          detail.filament_id ??
            (Array.isArray(detail.setting.filament_id)
              ? detail.setting.filament_id[0]
              : detail.setting.filament_id) ??
            '',
        );
      }
      if (!filamentId || filamentId.includes(':'))
        throw new Error(
          t('profiles.k.unresolvedFilament', {
            defaultValue: 'This preset has no resolvable Bambu filament ID.',
          }),
        );
      const data: KProfileCreate = {
        name: name.trim(),
        k_value: Number(kValue).toFixed(6),
        n_coef: Number(nCoef).toFixed(6),
        filament_id: filamentId,
        nozzle_diameter: editing ? original!.nozzle_diameter : editorNozzle,
        nozzle_id: editing
          ? original!.nozzle_id || `${editorFlow}-${original!.nozzle_diameter}`
          : `${editorFlow}-${editorNozzle}`,
        extruder_id: editing
          ? original!.extruder_id
          : Number(editorExtruder === 'both' ? '0' : editorExtruder),
        slot_id: editing ? original!.slot_id : 0,
        setting_id: editing ? original!.setting_id : null,
        ams_id: original?.ams_id ?? 0,
        tray_id: original?.tray_id ?? -1,
      };
      if (!editing && editorExtruder === 'both')
        await profileManagementApi.kBatch(printer.id, [
          { ...data, extruder_id: 0 },
          { ...data, extruder_id: 1 },
        ]);
      else await profileManagementApi.kSave(printer.id, data);
      const oldNote = original ? currentNote(original) : null;
      const key =
        editing && printer.nozzle_count === 2
          ? original!.setting_id ||
            `slot_${original!.slot_id}_${original!.filament_id}_${
              original!.extruder_id
            }`
          : `name_${data.name}_${filamentId}`;
      if (note || oldNote?.text) {
        try {
          await profileManagementApi.kNote(printer.id, key, note);
          if (editing) {
            for (const previousKey of kProfileNoteKeys(original!)) {
              if (previousKey !== key && notes.data?.notes[previousKey])
                await profileManagementApi.kNote(printer.id, previousKey, '');
            }
          }
        } catch (error) {
          return String(error);
        }
      }
      return null;
    },
    onSuccess: async noteError => {
      setEditor(null);
      await refresh();
      showToast(
        noteError
          ? t('profiles.k.noteFailed', {
              defaultValue: 'Profiles saved, but notes failed: {{error}}',
              error: noteError,
            })
          : t('profiles.k.saved', { defaultValue: 'K profiles saved.' }),
        noteError ? 'error' : 'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: async (profiles: KProfile[]) => {
      if (!printer)
        throw new Error(
          t('profiles.k.selectPrinter', {
            defaultValue: 'Select a connected printer.',
          }),
        );
      const failures: string[] = [];
      for (const profile of profiles) {
        try {
          await profileManagementApi.kRemove(printer.id, profile);
        } catch (error) {
          failures.push(`${profile.name}: ${String(error)}`);
        }
      }
      return { deleted: profiles.length - failures.length, failures };
    },
    onSuccess: async result => {
      await refresh();
      setSelected([]);
      setSelecting(false);
      showToast(
        t('profiles.k.deleted', {
          defaultValue: '{{count}} deleted. {{errors}}',
          count: result.deleted,
          errors: result.failures.join('; '),
        }),
        result.failures.length ? 'error' : 'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const importMutation = useMutation({
    mutationFn: async (profiles: KProfileCreate[]) => {
      if (!printer)
        throw new Error(
          t('profiles.k.selectPrinter', {
            defaultValue: 'Select a connected printer.',
          }),
        );
      if (
        printer.nozzle_count !== 2 &&
        profiles.some(profile => profile.extruder_id === 1)
      )
        throw new Error(
          t('profiles.k.unsupportedExtruder', {
            defaultValue: 'This printer has only one extruder.',
          }),
        );
      return profileManagementApi.kBatch(printer.id, profiles);
    },
    onSuccess: async () => {
      setPendingImport(null);
      await refresh();
      showToast(
        t('profiles.k.imported', { defaultValue: 'K profiles imported.' }),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const fileAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showToast(String(error), 'error');
    }
  };
  const confirmDelete = (profiles: KProfile[]) =>
    Alert.alert(
      t('profiles.k.delete', { defaultValue: 'Delete K profiles?' }),
      profiles
        .map(
          profile =>
            `${profile.name} · ${profile.nozzle_id} · ${
              profile.extruder_id === 1 ? 'L' : 'R'
            } · ${profile.slot_id}`,
        )
        .join('\n'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => remove.mutate(profiles),
        },
      ],
    );
  return (
    <View style={styles.body}>
      <SectionCard
        title={t('profiles.k.context', {
          defaultValue: 'Connected printer / nozzle',
        })}
      >
        {printers.isError ? (
          <PrimaryButton
            label={t('common.retry', { defaultValue: 'Retry' })}
            onPress={() => void printers.refetch()}
          />
        ) : null}
        {!livePrinters.length ? (
          <Text style={{ color: colors.text }}>
            {t('profiles.k.noneConnected', {
              defaultValue:
                'Connect a printer to manage its calibration profiles.',
            })}
          </Text>
        ) : null}
        {livePrinters.map(row => (
          <PrimaryButton
            key={row.id}
            label={row.name}
            variant={printerId === row.id ? 'primary' : 'secondary'}
            onPress={() => setPrinterId(row.id)}
          />
        ))}
        <InlineTabBar
          value={nozzle}
          tabs={['0.2', '0.4', '0.6', '0.8'].map(key => ({
            key,
            label: `${key} mm`,
          }))}
          onChange={setNozzle}
        />
      </SectionCard>
      <TextField
        label={t('profiles.k.search', {
          defaultValue: 'Search name / filament ID',
        })}
        value={search}
        onChangeText={setSearch}
      />
      <InlineTabBar
        value={extruder}
        tabs={[
          {
            key: 'all',
            label: t('common.all', { defaultValue: 'All extruders' }),
          },
          {
            key: '0',
            label: t('profiles.k.right', { defaultValue: 'Right / single' }),
          },
          ...(printer?.nozzle_count === 2
            ? [
                {
                  key: '1',
                  label: t('profiles.k.left', { defaultValue: 'Left' }),
                },
              ]
            : []),
        ]}
        onChange={setExtruder}
      />
      <InlineTabBar
        value={flow}
        tabs={[
          {
            key: 'all',
            label: t('common.all', { defaultValue: 'All flow types' }),
          },
          {
            key: 'HS00',
            label: t('profiles.k.standard', { defaultValue: 'Standard' }),
          },
          {
            key: 'HH00',
            label: t('profiles.k.highFlow', { defaultValue: 'High flow' }),
          },
        ]}
        onChange={setFlow}
      />
      <InlineTabBar
        value={sort}
        tabs={[
          {
            key: 'name',
            label: t('profiles.k.sortName', { defaultValue: 'Sort name' }),
          },
          { key: 'k_value', label: 'K' },
          {
            key: 'filament',
            label: t('profiles.k.sortFilament', {
              defaultValue: 'Sort filament',
            }),
          },
        ]}
        onChange={setSort}
      />
      <PrimaryButton
        label={t('common.refresh', { defaultValue: 'Refresh' })}
        loading={query.isFetching}
        onPress={() => void query.refetch()}
        disabled={!printer}
      />
      {query.isError ? (
        <Text style={{ color: colors.error }}>{query.error.message}</Text>
      ) : null}
      {query.isLoading ? (
        <Text style={{ color: colors.text }}>
          {t('common.loading', { defaultValue: 'Loading…' })}
        </Text>
      ) : null}
      {printer && canWrite ? (
        <PrimaryButton
          label={t('profiles.k.create', { defaultValue: 'Create K profile' })}
          onPress={() => open(null)}
        />
      ) : null}
      {printer ? (
        <PrimaryButton
          label={t('profiles.k.export', {
            defaultValue: 'Export printer/nozzle JSON',
          })}
          variant="secondary"
          disabled={!query.data}
          onPress={() =>
            void fileAction(() =>
              shareProfileJson(
                {
                  version: 1,
                  printer_id: printerId,
                  nozzle_diameter: nozzle,
                  profiles: rows,
                },
                `${printer.name}-K-${nozzle}`,
              ),
            )
          }
        />
      ) : null}
      {printer && canWrite ? (
        <PrimaryButton
          label={t('profiles.k.import', {
            defaultValue: 'Import K profile JSON',
          })}
          variant="secondary"
          onPress={() =>
            void fileAction(async () => {
              const data = await pickProfileJson(true);
              if (data) setPendingImport(validateKImport(data, nozzle));
            })
          }
        />
      ) : null}
      {pendingImport ? (
        <View style={styles.body}>
          <Text style={{ color: colors.text }}>
            {t('profiles.k.importConfirm', {
              defaultValue:
                'Import {{count}} profiles into {{printer}} / {{nozzle}} mm?',
              count: pendingImport.length,
              printer: printer?.name,
              nozzle,
            })}
          </Text>
          <PrimaryButton
            label={t('common.confirm', { defaultValue: 'Confirm import' })}
            loading={importMutation.isPending}
            disabled={importMutation.isPending}
            onPress={() => importMutation.mutate(pendingImport)}
          />
          <PrimaryButton
            label={t('common.cancel')}
            disabled={importMutation.isPending}
            variant="secondary"
            onPress={() => setPendingImport(null)}
          />
        </View>
      ) : null}
      {canDelete ? (
        <PrimaryButton
          label={
            selecting
              ? t('common.cancel')
              : t('profiles.k.select', { defaultValue: 'Select profiles' })
          }
          variant="secondary"
          onPress={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        />
      ) : null}
      {selecting ? (
        <>
          <PrimaryButton
            label={t('profiles.k.selectAll', {
              defaultValue: 'Select all matching',
            })}
            variant="secondary"
            onPress={() => setSelected(filtered.map(kProfileIdentity))}
          />
          <PrimaryButton
            label={t('profiles.k.deleteSelected', {
              defaultValue: 'Delete selected ({{count}})',
              count: selected.length,
            })}
            variant="danger"
            loading={remove.isPending}
            disabled={!selected.length || remove.isPending}
            onPress={() =>
              confirmDelete(
                rows.filter(row => selected.includes(kProfileIdentity(row))),
              )
            }
          />
        </>
      ) : null}
      {filtered.map(profile => {
        const key = kProfileIdentity(profile);
        return (
          <SectionCard
            key={key}
            title={profile.name}
            subtitle={`${profile.filament_id} · ${
              profile.nozzle_id ||
              `${kFlow(profile.nozzle_id)}-${profile.nozzle_diameter}`
            } · ${profile.extruder_id === 1 ? 'L' : 'R'} · K ${
              profile.k_value
            } · N ${profile.n_coef}`}
          >
            <Text style={{ color: colors.textSecondary }}>
              {t('profiles.k.placement', {
                defaultValue: 'AMS {{ams}} · Tray {{tray}} · Slot {{slot}}',
                ams: profile.ams_id,
                tray: profile.tray_id,
                slot: profile.slot_id,
              })}
            </Text>
            <Text selectable style={{ color: colors.textSecondary }}>
              {currentNote(profile).text}
            </Text>
            {selecting ? (
              <PrimaryButton
                label={
                  selected.includes(key)
                    ? t('profiles.k.selected', { defaultValue: 'Selected' })
                    : t('profiles.k.selectOne', { defaultValue: 'Select' })
                }
                variant={selected.includes(key) ? 'primary' : 'secondary'}
                onPress={() =>
                  setSelected(current =>
                    current.includes(key)
                      ? current.filter(item => item !== key)
                      : [...current, key],
                  )
                }
              />
            ) : null}
            {canWrite ? (
              <>
                <PrimaryButton
                  label={t('common.edit', { defaultValue: 'Edit' })}
                  variant="secondary"
                  onPress={() => open(profile)}
                />
                <PrimaryButton
                  label={t('profiles.k.copy', {
                    defaultValue: 'Copy to another nozzle / extruder',
                  })}
                  variant="secondary"
                  onPress={() => open(profile, true)}
                />
              </>
            ) : null}
            {canDelete ? (
              <PrimaryButton
                label={t('common.delete')}
                variant="danger"
                disabled={remove.isPending}
                onPress={() => confirmDelete([profile])}
              />
            ) : null}
          </SectionCard>
        );
      })}
      {query.data && !filtered.length ? (
        <Text style={{ color: colors.text }}>
          {t('profiles.k.empty', { defaultValue: 'No matching K profiles.' })}
        </Text>
      ) : null}
      <Modal
        visible={editor !== null}
        animationType="slide"
        onRequestClose={() => {
          if (!save.isPending) setEditor(null);
        }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: colors.background },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: colors.text }}>
            {printer?.name} ·{' '}
            {t('profiles.k.editor', { defaultValue: 'K profile editor' })}
          </Text>
          {editor?.profile && !editor.copy ? (
            <Text style={{ color: colors.textSecondary }}>
              {t('profiles.k.lockedIdentity', {
                defaultValue:
                  'Filament, nozzle and extruder identities are locked while editing. Use Copy to change them.',
              })}
            </Text>
          ) : null}
          <TextField
            label={t('profiles.name', { defaultValue: 'Name' })}
            value={name}
            onChangeText={setName}
          />
          {editor?.profile ? (
            <Text selectable style={{ color: colors.text }}>
              {editor.profile.filament_id}
            </Text>
          ) : (
            <>
              <TextField
                label={t('profiles.k.filamentSearch', {
                  defaultValue: 'Search filament presets',
                })}
                value={filamentSearch}
                onChangeText={setFilamentSearch}
              />
              {filaments.isFetching ? (
                <Text style={{ color: colors.text }}>
                  {t('common.loading', { defaultValue: 'Loading…' })}
                </Text>
              ) : null}
              {(filaments.data ?? [])
                .filter(option =>
                  option.name
                    .toLowerCase()
                    .includes(filamentSearch.toLowerCase()),
                )
                .map(option => (
                  <PrimaryButton
                    key={option.key}
                    label={`${option.source}: ${option.name}`}
                    variant={filament === option.key ? 'primary' : 'secondary'}
                    onPress={() => {
                      setFilament(option.key);
                      if (!name) setName(option.name);
                    }}
                  />
                ))}
              <TextField
                label={t('profiles.k.manualFilament', {
                  defaultValue: 'Filament choice / Bambu filament ID',
                })}
                value={filament}
                onChangeText={setFilament}
                autoCapitalize="none"
              />
            </>
          )}
          <InlineTabBar
            value={editorFlow}
            tabs={[
              {
                key: 'HS00',
                label: t('profiles.k.standard', { defaultValue: 'Standard' }),
              },
              {
                key: 'HH00',
                label: t('profiles.k.highFlow', { defaultValue: 'High flow' }),
              },
            ]}
            onChange={value => {
              if (!editor?.profile || editor.copy) setEditorFlow(value);
            }}
          />
          <InlineTabBar
            value={editorNozzle}
            tabs={['0.2', '0.4', '0.6', '0.8'].map(key => ({
              key,
              label: `${key} mm`,
            }))}
            onChange={value => {
              if (!editor?.profile || editor.copy) setEditorNozzle(value);
            }}
          />
          <InlineTabBar
            value={editorExtruder}
            tabs={[
              {
                key: '0',
                label: t('profiles.k.right', {
                  defaultValue: 'Right / single',
                }),
              },
              ...(printer?.nozzle_count === 2
                ? [
                    {
                      key: '1',
                      label: t('profiles.k.left', { defaultValue: 'Left' }),
                    },
                    {
                      key: 'both',
                      label: t('profiles.k.both', { defaultValue: 'Both' }),
                    },
                  ]
                : []),
            ]}
            onChange={value => {
              if (!editor?.profile || editor.copy) setEditorExtruder(value);
            }}
          />
          <TextField
            label={t('profiles.k.value', { defaultValue: 'K value' })}
            value={kValue}
            onChangeText={setKValue}
            keyboardType="decimal-pad"
          />
          <TextField
            label={t('profiles.k.ncoef', { defaultValue: 'N coefficient' })}
            value={nCoef}
            onChangeText={setNCoef}
            keyboardType="decimal-pad"
          />
          <TextField
            label={t('profiles.k.notes', { defaultValue: 'Notes' })}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <PrimaryButton
            label={t('common.save')}
            disabled={save.isPending}
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
          <PrimaryButton
            label={t('common.cancel')}
            variant="secondary"
            disabled={save.isPending}
            onPress={() => setEditor(null)}
          />
        </ScrollView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { gap: spacing.md },
  modal: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
});
