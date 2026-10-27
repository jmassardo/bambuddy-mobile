import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { AMSTray, KProfile, UnifiedPreset } from '@/types/api';
import { presetIdentity, requireInteger } from './deviceControlUtils';

export function ConfigureDeviceSlot({ printerId, amsId, trayId, tray, preset, onSaved }: {
  printerId: number; amsId: number; trayId: number; tray: AMSTray; preset: UnifiedPreset; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [color, setColor] = useState((tray.tray_color || '').slice(0, 6));
  const [material, setMaterial] = useState(preset.filament_type || '');
  const [min, setMin] = useState(tray.nozzle_temp_min == null ? '' : String(tray.nozzle_temp_min));
  const [max, setMax] = useState(tray.nozzle_temp_max == null ? '' : String(tray.nozzle_temp_max));
  const [diameter, setDiameter] = useState('');
  const [kProfile, setKProfile] = useState<KProfile | null>(null);
  const [partial, setPartial] = useState(false);
  const status = useQuery({ queryKey: ['printerStatus', printerId], queryFn: () => api.getPrinterStatus(printerId) });
  const cloudDetail = useQuery({
    queryKey: ['cloudPresetDetail', preset.id], queryFn: () => api.getCloudProfileDetail(preset.id),
    enabled: preset.source === 'cloud',
  });
  const localPreset = useQuery({
    queryKey: ['localPreset', preset.id], queryFn: () => device.localPreset(preset.id), enabled: preset.source === 'local',
  });
  const profiles = useQuery({
    queryKey: ['kProfiles', printerId, diameter],
    queryFn: () => api.getKProfiles(printerId, diameter), enabled: !!diameter,
  });
  useEffect(() => {
    const nozzle = status.data?.nozzles?.[0]?.nozzle_diameter;
    if (nozzle) setDiameter(nozzle);
  }, [status.data?.nozzles]);
  useEffect(() => {
    const local = localPreset.data;
    if (!local) return;
    if (typeof local.filament_type === 'string') setMaterial(local.filament_type);
    if (typeof local.nozzle_temp_min === 'number') setMin(String(local.nozzle_temp_min));
    if (typeof local.nozzle_temp_max === 'number') setMax(String(local.nozzle_temp_max));
  }, [localPreset.data]);
  const identity = presetIdentity(preset,
    typeof cloudDetail.data?.filament_id === 'string' ? cloudDetail.data.filament_id
      : typeof cloudDetail.data?.setting?.filament_id === 'string' ? cloudDetail.data.setting.filament_id : undefined);
  const save = useMutation({
    mutationFn: async () => {
      const lower = requireInteger(min, 0, 320);
      const upper = requireInteger(max, lower, 320);
      if (!/^[0-9a-f]{6}$/i.test(color.replace('#', ''))) throw new Error(t('device.invalidColor', { defaultValue: 'Enter a six-digit RGB hex color.' }));
      if (!material.trim() || !Number.isFinite(Number(diameter)) || Number(diameter) <= 0) throw new Error(t('device.materialNozzle', { defaultValue: 'Material and valid nozzle diameter are required.' }));
      const result = await device.configure(printerId, amsId, trayId, {
        tray_info_idx: identity.tray_info_idx, tray_type: material.trim(),
        tray_sub_brands: preset.name.replace(/@.+$/, '').trim(), tray_color: `${color.replace('#', '').toUpperCase()}FF`,
        nozzle_temp_min: lower, nozzle_temp_max: upper,
        nozzle_diameter: diameter, cali_idx: kProfile?.slot_id ?? -1,
        setting_id: identity.setting_id, orca_profile_id: identity.orca_profile_id,
        kprofile_filament_id: kProfile?.filament_id,
        kprofile_setting_id: kProfile?.setting_id ?? undefined,
        k_value: kProfile ? Number(kProfile.k_value) : 0,
      });
      setPartial(true);
      await device.saveMapping(printerId, amsId, trayId, identity.mappingId, preset.name, identity.source, result.tray_info_idx);
      setPartial(false);
      return result;
    },
    onSuccess: async result => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['slotPresets', printerId] }),
        client.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      ]);
      if (result.orca_fallback_reason) Alert.alert(t('device.orcaFallback', { defaultValue: 'Orca profile fallback' }), result.orca_fallback_reason);
      onSaved();
    },
  });
  const reset = useMutation({
    mutationFn: () => device.resetSlot(printerId, amsId, trayId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      await client.invalidateQueries({ queryKey: ['slotPresets', printerId] });
      onSaved();
    },
  });
  const allowed = hasPermission('printers:control') && hasPermission('printers:update') && status.data?.connected;
  return <View style={styles.stack}>
    <Text style={{ color: colors.text }}>{preset.name} · {preset.source}</Text>
    <TextField label={t('device.material', { defaultValue: 'Material (device type)' })} value={material} onChangeText={setMaterial} />
    <TextField label={t('device.color', { defaultValue: 'Color (RGB hex)' })} value={color} onChangeText={setColor} autoCapitalize="characters" />
    <TextField label={t('device.minNozzle', { defaultValue: 'Minimum nozzle temperature °C' })} value={min} onChangeText={setMin} keyboardType="number-pad" />
    <TextField label={t('device.maxNozzle', { defaultValue: 'Maximum nozzle temperature °C' })} value={max} onChangeText={setMax} keyboardType="number-pad" />
    <TextField label={t('device.nozzleDiameter', { defaultValue: 'Nozzle diameter mm' })} value={diameter} onChangeText={value => { setDiameter(value); setKProfile(null); }} keyboardType="decimal-pad" />
    <PrimaryButton label={t('device.defaultK', { defaultValue: 'Default K profile' })} variant={kProfile ? 'secondary' : 'primary'} onPress={() => setKProfile(null)} />
    {profiles.data?.profiles.map(profile => <PrimaryButton key={`${profile.extruder_id}-${profile.slot_id}`}
      label={`${profile.name} · K=${profile.k_value} · ${profile.extruder_id === 1 ? 'L' : 'R'}`}
      variant={kProfile === profile ? 'primary' : 'secondary'} onPress={() => setKProfile(profile)} />)}
    {profiles.error || cloudDetail.error || localPreset.error ? <Text style={{ color: colors.error }}>{profiles.error?.message || cloudDetail.error?.message || localPreset.error?.message}</Text> : null}
    <PrimaryButton label={t('device.configureAndSave', { defaultValue: 'Configure printer and save profile association' })} disabled={!allowed} loading={save.isPending}
      onPress={() => { Alert.alert(t('device.configureSlot', { defaultValue: 'Configure physical slot?' }),
        t('device.configureSlotConfirm', { defaultValue: 'Replace the device material, color and pressure advance configuration with these values?' }),
        [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => save.mutate() }]); }} />
    <PrimaryButton label={t('device.resetSlot', { defaultValue: 'Reset slot to generic defaults' })} variant="danger" disabled={!allowed || save.isPending} loading={reset.isPending}
      onPress={() => Alert.alert(t('device.resetSlot', { defaultValue: 'Reset slot to generic defaults' }), t('device.resetSlotConfirm', { defaultValue: 'Clear the slot configuration and saved preset association?' }),
        [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => reset.mutate() }])} />
    {partial ? <Text style={{ color: colors.warning }}>{t('device.partialConfigure', { defaultValue: 'Device configured, but saving its profile association failed. Retry to finish; this is not a complete save.' })}</Text> : null}
    {save.error || reset.error ? <Text style={{ color: colors.error }}>{save.error?.message || reset.error?.message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ stack: { gap: spacing.sm, paddingVertical: spacing.sm } });
