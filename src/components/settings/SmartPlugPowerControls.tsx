import React, { useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { integrationsApi } from '@/api/integrations';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type { SmartPlug, SmartPlugStatus } from '@/types/api';
import { SimpleModal, SwitchRow } from './shared';
import { useTranslation } from '@/i18n';
import { useIntegrationTranslation } from './useIntegrationTranslation';

export function plugPowerState(status?: SmartPlugStatus, fallback?: string | null): 'ON' | 'OFF' | 'Unknown' {
  const state = status ? status.state : fallback;
  return state?.toUpperCase() === 'ON' ? 'ON' : state?.toUpperCase() === 'OFF' ? 'OFF' : 'Unknown';
}

export function canPowerAction(plug: SmartPlug, action: 'on' | 'off'): boolean {
  return plug.plug_type !== 'mqtt' && (plug.plug_type !== 'rest' || Boolean(action === 'on' ? plug.rest_on_url : plug.rest_off_url));
}

export function PlugPowerControl({ plug, canControl }: { plug: SmartPlug; canControl: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tr = useIntegrationTranslation();
  const { showToast } = useToast();
  const client = useQueryClient();
  const powerBusy = useRef(false);
  const [confirm, setConfirm] = useState<'on' | 'off' | null>(null);
  const status = useQuery({ queryKey: ['smartPlugStatus', plug.id], queryFn: () => integrationsApi.plugStatus(plug.id), refetchInterval: 15000 });
  const power = useMutation({
    mutationFn: (action: 'on' | 'off') => {
      if (!canControl || !canPowerAction(plug, action)) throw new Error(tr('Power control is unavailable for this device.'));
      return integrationsApi.control(plug.id, action);
    },
    onSuccess: async () => {
      setConfirm(null);
      await Promise.all(['smartPlugStatus', 'smartPlugs', 'smartPlugByPrinter', 'printers'].map(key => client.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error: Error) => showToast(error.message, 'error'),
    onSettled: () => { powerBusy.current = false; },
  });
  const state = plugPowerState(status.data, plug.last_state);
  return <>
    <Text style={{ color: colors.text }}>{plug.name} • {tr(state)} • {status.data?.energy?.power == null ? '— W' : `${Math.round(status.data.energy.power)} W`}{status.data?.reachable === false ? ` • ${tr('unreachable')}` : ''}</Text>
    {plug.plug_type === 'mqtt' ? <Text style={{ color: colors.textSecondary }}>{tr('MQTT monitor-only')}</Text> : (['on', 'off'] as const).map(action => <PrimaryButton key={action} label={tr(action === 'on' ? 'Turn on' : 'Turn off')} variant={action === 'off' ? 'danger' : 'secondary'} disabled={!canControl || !canPowerAction(plug, action) || power.isPending} onPress={() => setConfirm(action)} />)}
    <ConfirmModal visible={confirm != null} title={t(`integrations.confirm_${confirm}`, { defaultValue: `Turn ${confirm ?? ''} {{name}}?`, name: plug.name })} message={t('integrations.powerImpact', { defaultValue: 'This changes power for {{name}}{{association}}.', name: plug.name, association: plug.printer_id ? tr(' and its associated printer or accessory') : '' })} confirmLabel={tr(confirm === 'off' ? 'Turn off' : 'Turn on')} onConfirm={() => { if (confirm && !powerBusy.current && canControl) { powerBusy.current = true; power.mutate(confirm); } }} onClose={() => setConfirm(null)} loading={power.isPending} />
  </>;
}

export function BulkPlugPower({ plugs, canControl }: { plugs: SmartPlug[]; canControl: boolean }) {
  const { colors } = useTheme();
  const tr = useIntegrationTranslation();
  const { t } = useTranslation();
  const client = useQueryClient();
  const bulkBusy = useRef(false);
  const [pending, setPending] = useState<{ action: 'on' | 'off'; plugs: SmartPlug[] } | null>(null);
  const [result, setResult] = useState('');
  const mutation = useMutation({
    mutationFn: async (request: NonNullable<typeof pending>) => {
      if (!canControl) throw new Error(tr('You do not have permission to control smart plugs.'));
      const outcomes = await Promise.allSettled(request.plugs.map(plug => integrationsApi.control(plug.id, request.action)));
      return outcomes.map((outcome, index) => `${request.plugs[index].name}: ${outcome.status === 'fulfilled' ? tr('success') : outcome.reason instanceof Error ? outcome.reason.message : tr('failed')}`).join('\n');
    },
    onSuccess: async message => {
      setResult(message); setPending(null);
      await Promise.all(['smartPlugStatus', 'smartPlugs', 'smartPlugByPrinter', 'printers'].map(key => client.invalidateQueries({ queryKey: [key] })));
    },
    onSettled: () => { bulkBusy.current = false; },
  });
  return <>
    {(['on', 'off'] as const).map(action => <PrimaryButton key={action} label={tr(action === 'on' ? 'All on' : 'All off')} variant={action === 'off' ? 'danger' : 'secondary'} disabled={!canControl || mutation.isPending || !plugs.some(plug => plug.enabled && canPowerAction(plug, action))} onPress={() => setPending({ action, plugs: plugs.filter(plug => plug.enabled && canPowerAction(plug, action)) })} />)}
    {result ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{result}</Text> : null}
    {mutation.error ? <Text style={{ color: colors.error }}>{mutation.error.message}</Text> : null}
    <ConfirmModal visible={pending != null} title={tr(pending?.action === 'off' ? 'Turn all off?' : 'Turn all on?')} message={t('integrations.bulkImpact', { defaultValue: 'Only these enabled, switchable devices will change:\n{{names}}', names: pending?.plugs.map(plug => plug.name).join('\n') ?? '' })} confirmLabel={tr('Confirm power change')} loading={mutation.isPending} onClose={() => setPending(null)} onConfirm={() => { if (pending && canControl && !bulkBusy.current) { bulkBusy.current = true; mutation.mutate(pending); } }} />
  </>;
}

export function QuickSmartPlugPanel() {
  const [visible, setVisible] = useState(false);
  const tr = useIntegrationTranslation();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('smart_plugs:read');
  const plugs = useQuery({ queryKey: ['smartPlugs'], queryFn: () => api.getSmartPlugs(), enabled: canRead });
  if (!canRead || !(plugs.data ?? []).some(plug => plug.enabled && plug.show_in_switchbar)) return null;
  const shown = (plugs.data ?? []).filter(plug => plug.enabled && plug.show_in_switchbar);
  return <>
    <PrimaryButton label={tr('Quick power switches')} variant="secondary" onPress={() => setVisible(true)} />
    {visible ? <SimpleModal visible title={tr('Quick power switches')} onClose={() => setVisible(false)}>
      <PowerPanel plugs={shown} canControl={hasPermission('smart_plugs:control')} />
    </SimpleModal> : null}
  </>;
}

function PowerPanel({ plugs, canControl }: { plugs: SmartPlug[]; canControl: boolean }) {
  return <ScrollView><BulkPlugPower plugs={plugs} canControl={canControl} />{plugs.map(plug => <SectionCard key={plug.id} title={plug.name}><PlugPowerControl plug={plug} canControl={canControl} /></SectionCard>)}</ScrollView>;
}

export function PrinterPowerIntegration({ printerId }: { printerId: number }) {
  const { hasPermission } = useAuth();
  const tr = useIntegrationTranslation();
  const { showToast } = useToast();
  const client = useQueryClient();
  const autoOffBusy = useRef(false);
  const plug = useQuery({
    queryKey: ['smartPlugByPrinter', printerId], queryFn: () => integrationsApi.linkedPlug(printerId),
    enabled: hasPermission('smart_plugs:read'), refetchInterval: 15000,
  });
  const autoOff = useMutation({
    mutationFn: (value: boolean) => integrationsApi.updatePlug(plug.data!.id, { auto_off: value }),
    onSuccess: async () => {
      await Promise.all(['smartPlugByPrinter', 'smartPlugs'].map(key => client.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error: Error) => showToast(error.message, 'error'),
    onSettled: () => { autoOffBusy.current = false; },
  });
  if (!hasPermission('smart_plugs:read') || !plug.data || plug.data.show_on_printer_card === false) return null;
  return <SectionCard title={tr('Printer power')}>
    <PlugPowerControl plug={plug.data} canControl={hasPermission('smart_plugs:control')} />
    <SwitchRow label={tr(plug.data.auto_off_executed ? 'Auto-off already executed' : 'Auto-off after print')} value={plug.data.auto_off || plug.data.auto_off_executed} disabled={!hasPermission('smart_plugs:control') || autoOff.isPending || plug.data.auto_off_executed} onValueChange={value => { if (hasPermission('smart_plugs:control') && !autoOffBusy.current && !plug.data?.auto_off_executed) { autoOffBusy.current = true; autoOff.mutate(value); } }} />
  </SectionCard>;
}
