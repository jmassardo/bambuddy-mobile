import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '@/api/maintenance';
import {
  PrimaryButton,
  InlineTabBar,
  TextField,
} from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { spacing } from '@/theme/tokens';
import {
  maintenanceDocumentation,
  validMaintenanceNumber,
} from '@/utils/maintenance';
import type {
  MaintenanceStatus,
  PrinterMaintenanceOverview,
} from '@/types/api';

export function MaintenanceControls({
  printer,
  item,
}: {
  printer: PrinterMaintenanceOverview;
  item?: MaintenanceStatus;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'hours' | 'days'>('hours');
  const canUpdate = hasPermission('maintenance:update');
  const canDelete = hasPermission('maintenance:delete');
  const mutation = useMutation({
    mutationFn: async (operation: 'save' | 'reset' | 'remove') => {
      if (item) {
        if (operation === 'remove')
          return maintenanceApi.removeMaintenanceItem(item.id);
        if (operation === 'reset')
          return maintenanceApi.updateMaintenanceItem(item.id, {
            custom_interval_hours: null,
            custom_interval_type: null,
          });
        const number = validMaintenanceNumber(value, 1);
        if (number === null)
          throw new Error(
            t('maintenance.invalidInterval', {
              defaultValue: 'Enter an interval of at least 1.',
            }),
          );
        return maintenanceApi.updateMaintenanceItem(item.id, {
          custom_interval_hours: number,
          custom_interval_type: unit,
        });
      }
      const number = validMaintenanceNumber(value);
      if (number === null)
        throw new Error(
          t('maintenance.invalidHours', {
            defaultValue: 'Enter nonnegative total hours.',
          }),
        );
      return maintenanceApi.setPrinterHours(printer.printer_id, number);
    },
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({
        queryKey: ['maintenanceOverview'],
      });
      showToast(
        t('maintenance.updated', { defaultValue: 'Maintenance updated.' }),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const documentation = item
    ? maintenanceDocumentation(
        item.maintenance_type_name,
        printer.printer_model,
        item.maintenance_type_wiki_url,
      )
    : null;
  return (
    <View style={styles.body}>
      {documentation ? (
        <PrimaryButton
          label={t('maintenance.documentation', {
            defaultValue: 'Documentation',
          })}
          variant="secondary"
          onPress={() =>
            void Linking.openURL(documentation).catch(error =>
              showToast(String(error), 'error'),
            )
          }
        />
      ) : null}
      {canUpdate && !editing ? (
        <PrimaryButton
          label={
            item
              ? t('maintenance.editInterval', {
                  defaultValue: 'Override interval',
                })
              : t('maintenance.editHours', {
                  defaultValue: 'Correct lifetime hours',
                })
          }
          variant="secondary"
          onPress={() => {
            setValue(String(item?.interval_hours ?? printer.total_print_hours));
            setUnit(item?.interval_type ?? 'hours');
            setEditing(true);
          }}
        />
      ) : null}
      {editing ? (
        <>
          <TextField
            label={
              item
                ? t('maintenance.interval', { defaultValue: 'Interval' })
                : t('maintenance.totalHours', {
                    defaultValue: 'Total lifetime hours',
                  })
            }
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
          />
          {item ? (
            <InlineTabBar
              value={unit}
              tabs={[
                {
                  key: 'hours',
                  get label() { return translateNative('maintenance.hours', { defaultValue: 'Hours' }); },
                },
                {
                  key: 'days',
                  get label() { return translateNative('maintenance.days', { defaultValue: 'Days' }); },
                },
              ]}
              onChange={setUnit}
            />
          ) : null}
          <PrimaryButton
            label={t('common.save')}
            disabled={
              mutation.isPending ||
              validMaintenanceNumber(value, item ? 1 : 0) === null
            }
            loading={mutation.isPending}
            onPress={() => mutation.mutate('save')}
          />
          <PrimaryButton
            label={t('common.cancel')}
            disabled={mutation.isPending}
            variant="secondary"
            onPress={() => setEditing(false)}
          />
        </>
      ) : null}
      {item && canUpdate ? (
        <PrimaryButton
          label={t('maintenance.resetInterval', {
            defaultValue: 'Use type default interval',
          })}
          variant="secondary"
          disabled={mutation.isPending}
          onPress={() => mutation.mutate('reset')}
        />
      ) : null}
      {item && canDelete ? (
        <PrimaryButton
          label={t('maintenance.removeAssignment', {
            defaultValue: 'Remove assignment',
          })}
          variant="danger"
          disabled={mutation.isPending}
          onPress={() =>
            Alert.alert(
              t('maintenance.removeAssignment', {
                defaultValue: 'Remove assignment',
              }),
              item.maintenance_type_name,
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => mutation.mutate('remove'),
                },
              ],
            )
          }
        />
      ) : null}
    </View>
  );
}

export function RestoreMaintenanceDefaults() {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: maintenanceApi.restoreDefaultMaintenanceTypes,
    onSuccess: async result => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['maintenanceTypes'] }),
        client.invalidateQueries({ queryKey: ['maintenanceOverview'] }),
      ]);
      showToast(
        t('maintenance.restored', {
          defaultValue: '{{count}} default types restored.',
          count: result.restored,
        }),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return hasPermission('maintenance:delete') ? (
    <PrimaryButton
      label={t('maintenance.restore', {
        defaultValue: 'Restore default types',
      })}
      loading={mutation.isPending}
      disabled={mutation.isPending}
      onPress={() => mutation.mutate()}
    />
  ) : null;
}
const styles = StyleSheet.create({ body: { gap: spacing.sm } });
