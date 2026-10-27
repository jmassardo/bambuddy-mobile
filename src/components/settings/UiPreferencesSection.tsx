import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { printersApi } from '@/api/printers';
import { SectionCard, PrimaryButton } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useTranslation } from '@/i18n';
import { BUILT_IN_NAV_ITEMS } from '@/navigation/navigationConfig';
import { useUiPreferencesStore } from '@/store/uiPreferencesStore';
import { useArchiveFiltersStore } from '@/store/archiveFiltersStore';
import { useTheme } from '@/theme';
import { accentOptions, backgroundOptions, styleOptions, type ThemeCustomization } from '@/theme/preferences';
import { spacing } from '@/theme/tokens';
import { OptionChipsField, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function UiPreferencesSection({ controller }: { controller: SettingsScreenController }) {
  const { t, resetLanguage } = useTranslation();
  const theme = useTheme();
  const { landingPage, setLandingPage, reset } = useUiPreferencesStore();
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const canEdit = controller.permissions.canUpdateSettings;
  const { data: printers, isError, refetch } = useQuery({ queryKey: ['printers', 'default-preference'], queryFn: printersApi.getPrinters });
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(false);
  const selectedPrinter = typeof draft.default_printer_id === 'number' ? draft.default_printer_id : null;
  const printerOptions = [
    { key: '', label: t('preferences.noPrinter') },
    ...(printers ?? []).map(printer => ({ key: String(printer.id), label: printer.name })),
  ];
  if (selectedPrinter !== null && !printers?.some(printer => printer.id === selectedPrinter)) {
    printerOptions.push({ key: String(selectedPrinter), label: t('preferences.removedPrinter', { id: selectedPrinter }) });
  }
  function updateTheme(key: keyof ThemeCustomization, value: string) {
    const patch = { [key]: value } as Partial<ThemeCustomization>;
    void theme.setCustomization(patch).catch(() => setError(true));
    setDraft(current => ({ ...current, [key]: value }));
  }
  async function resetPreferences() {
    setResetting(true);
    setError(false);
    try {
      await Promise.all([resetLanguage(), theme.resetTheme(), useArchiveFiltersStore.getState().clearFilters()]);
      await reset();
      setConfirmReset(false);
    } catch { setError(true); }
    finally { setResetting(false); }
  }
  return <>
    <SectionCard title={t('preferences.title')}>
      <OptionChipsField label={t('preferences.landing')} value={landingPage}
        options={BUILT_IN_NAV_ITEMS.filter(item => item.id !== 'more').map(item => ({ key: item.id, label: t(`nav.${item.id}`, { defaultValue: item.label }) }))}
        onChange={value => { void setLandingPage(value).catch(() => setError(true)); }} />
      <OptionChipsField label={t('preferences.printer')} value={selectedPrinter === null ? '' : String(selectedPrinter)}
        options={printerOptions} disabled={!canEdit}
        onChange={value => setDraft(current => ({ ...current, default_printer_id: value ? Number(value) : null }))} />
      {isError ? <PrimaryButton label={t('common.retry')} variant="secondary" onPress={() => { void refetch(); }} /> : null}
      {(['dark', 'light'] as const).map(mode => <View key={mode} style={styles.group}>
        <Text style={{ color: theme.colors.text }}>{t(`preferences.${mode}`)}</Text>
        <OptionChipsField label={t('preferences.background')} value={theme.customization[`${mode}_background`]}
          options={backgroundOptions[mode].map(key => ({ key, label: t(`preferences.background.${key}`, { defaultValue: key }) }))}
          disabled={!canEdit} onChange={value => updateTheme(`${mode}_background`, value)} />
        <OptionChipsField label={t('preferences.accent')} value={theme.customization[`${mode}_accent`]}
          options={accentOptions.map(key => ({ key, label: t(`preferences.accent.${key}`, { defaultValue: key }) }))}
          disabled={!canEdit} onChange={value => updateTheme(`${mode}_accent`, value)} />
        <OptionChipsField label={t('preferences.style')} value={theme.customization[`${mode}_style`]}
          options={styleOptions.map(key => ({ key, label: t(`preferences.style.${key}`, { defaultValue: key }) }))}
          disabled={!canEdit} onChange={value => updateTheme(`${mode}_style`, value)} />
      </View>)}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{t('common.error')}</Text> : null}
      <PrimaryButton label={t('preferences.reset')} variant="danger" onPress={() => setConfirmReset(true)} />
    </SectionCard>
    {canEdit ? <SectionCard title={t('announcements.title')}>
      <SwitchRow label={t('preferences.announcementsEnabled')} value={draft.announcements_enabled !== false}
        onValueChange={value => setDraft(current => ({ ...current, announcements_enabled: value }))} />
      <SwitchRow label={t('preferences.announcementsAllUsers')} value={draft.announcements_all_users === true}
        disabled={draft.announcements_enabled === false}
        onValueChange={value => setDraft(current => ({ ...current, announcements_all_users: value }))} />
    </SectionCard> : null}
    <ConfirmModal visible={confirmReset} title={t('preferences.reset')} message={t('preferences.resetMessage')}
      confirmLabel={t('common.reset')} cancelLabel={t('common.cancel')} loading={resetting}
      onClose={() => setConfirmReset(false)} onConfirm={() => { void resetPreferences(); }} />
  </>;
}
const styles = StyleSheet.create({ group: { gap: spacing.sm } });
