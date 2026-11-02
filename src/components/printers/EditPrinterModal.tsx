import { nativeMessage, translateNative, useNativeLocale, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { api, ApiError } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { Printer } from '@/types/api';
import { useAuth } from '@/contexts/AuthContext';

interface EditPrinterModalProps {
  visible: boolean;
  printer: Printer | null;
  onClose: () => void;
}

type EditablePrinter = Printer & { notes?: string | null };

function getErrorMessage<T extends string | import('@/i18n').NativeMessage>(error: unknown, fallback: T) {
  return error instanceof ApiError ? error.message : fallback;
}

export function EditPrinterModal({
  visible,
  printer,
  onClose,
}: EditPrinterModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [model, setModel] = useState('');
  const [autoArchive, setAutoArchive] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!printer) return;
    const editablePrinter = printer as EditablePrinter;
    setName(printer.name);
    setLocation(printer.location ?? '');
    setNotes(editablePrinter.notes ?? '');
    setIpAddress(printer.ip_address);
    setAccessCode('');
    setModel(printer.model ?? '');
    setAutoArchive(printer.auto_archive);
  }, [printer, visible]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!printer) throw new Error(translateNative('native.b88c48e2049ab0e4'));
      if (!hasPermission('printers:update')) throw new Error(t('fleet.editDenied', { defaultValue: 'Printer update permission required.' }));
      return api.updatePrinter(printer.id, {
        name: name.trim(),
        location: location.trim() || null,
        notes: notes.trim() || null,
        ip_address: ipAddress.trim(),
        ...(accessCode.trim() ? { access_code: accessCode.trim() } : {}),
        model: model.trim(),
        auto_archive: autoArchive,
      });
    },
    onSuccess: async () => {
      if (!printer) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        queryClient.invalidateQueries({ queryKey: ['printer', printer.id] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] }),
      ]);
      showToast(nativeMessage('native.a206e55ab1d4a78f'), 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.a55949c59db4d4a8')), 'error'),
  });

  const preflight = async () => {
    if (!printer) return;
    setChecking(true);
    try {
      const result = await api.diagnoseConnection({
        ip_address: ipAddress.trim(),
        serial_number: printer.serial_number,
        ...(accessCode.trim() ? { access_code: accessCode.trim() } : {}),
      });
      const checks = result.checks;
      if (checks?.some(check => check.status === 'fail')) {
        Alert.alert(
          t('fleet.preflightFailed', { defaultValue: 'Connection checks failed' }),
          checks.filter(check => check.status === 'fail').map(check => `${check.id}: ${Object.values(check.params).join(' · ')}`).join('\n'),
          [
            { text: t('common.back', { defaultValue: 'Back' }), style: 'cancel' },
            { text: t('fleet.saveAnyway', { defaultValue: 'Save anyway' }), onPress: () => saveMutation.mutate() },
          ],
        );
        return;
      }
    } catch (error) {
      Alert.alert(t('fleet.preflightFailed', { defaultValue: 'Connection checks failed' }), getErrorMessage(error, t('fleet.diagnosticUnavailable', { defaultValue: 'Diagnostic unavailable. Save without checking?' })), [
        { text: t('common.back', { defaultValue: 'Back' }), style: 'cancel' },
        { text: t('fleet.saveAnyway', { defaultValue: 'Save anyway' }), onPress: () => saveMutation.mutate() },
      ]);
      return;
    } finally {
      setChecking(false);
    }
    saveMutation.mutate();
  };

  if (!printer) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
      <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardArea}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {translateNative('native.b12f7dceaa30792e')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('fleet.editSubtitle', { defaultValue: 'Update connection, model, archiving, and profile.' })}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <X size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TextField label={t('fleet.ip', { defaultValue: 'IP / hostname' })} value={ipAddress} onChangeText={setIpAddress} autoCapitalize="none" />
              <TextField label={t('fleet.replacementCode', { defaultValue: 'Replacement access code (blank keeps existing)' })} value={accessCode} onChangeText={setAccessCode} secureTextEntry autoCapitalize="none" />
              <TextField label={t('fleet.model', { defaultValue: 'Model' })} value={model} onChangeText={setModel} />
              <View style={styles.toggle}>
                <Text style={{ color: colors.text }}>{t('fleet.autoArchive', { defaultValue: 'Automatically archive prints' })}</Text>
                <Switch value={autoArchive} onValueChange={setAutoArchive} accessibilityLabel={t('fleet.autoArchive', { defaultValue: 'Automatically archive prints' })} />
              </View>
              <TextField
                label={translateNative('common.name')}
                value={name}
                onChangeText={setName}
                placeholder={translateNative('native.d983863c9a265ef0')}
              />
              <TextField
                label={translateNative('native.4fa01b8a6af1174b')}
                value={location}
                onChangeText={setLocation}
                placeholder={translateNative('native.9569a6f13f0219a6')}
              />
              <TextField
                label={translateNative('native.be6245aeb9573da2')}
                value={notes}
                onChangeText={setNotes}
                placeholder={translateNative('native.67c529450a4ac6cd')}
                multiline
              />
            </ScrollView>

            <View style={styles.actions}>
              <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={onClose} />
              <PrimaryButton
                label={checking ? t('fleet.checking', { defaultValue: 'Checking connection…' }) : saveMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')}
                onPress={() => { void preflight(); }}
                disabled={!name.trim() || !ipAddress.trim() || checking || saveMutation.isPending || !hasPermission('printers:update')}
                loading={checking || saveMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  keyboardArea: {
    width: '100%',
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    gap: spacing.sm,
  },
});
