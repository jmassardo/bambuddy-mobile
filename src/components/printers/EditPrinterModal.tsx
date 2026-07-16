import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { api, ApiError } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { Printer } from '@/types/api';

interface EditPrinterModalProps {
  visible: boolean;
  printer: Printer | null;
  onClose: () => void;
}

type EditablePrinter = Printer & { notes?: string | null };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function EditPrinterModal({
  visible,
  printer,
  onClose,
}: EditPrinterModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!printer) return;
    const editablePrinter = printer as EditablePrinter;
    setName(printer.name);
    setLocation(printer.location ?? '');
    setNotes(editablePrinter.notes ?? '');
  }, [printer]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!printer) throw new Error('Printer unavailable');
      return api.updatePrinter(printer.id, {
        name: name.trim(),
        location: location.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async () => {
      if (!printer) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        queryClient.invalidateQueries({ queryKey: ['printer', printer.id] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] }),
      ]);
      showToast('Printer updated.', 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to update printer.'), 'error'),
  });

  if (!printer) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  Edit printer
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Update name, location, and notes.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <X size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Printer name"
              />
              <TextField
                label="Location"
                value={location}
                onChangeText={setLocation}
                placeholder="Workshop, Office, Rack A…"
              />
              <TextField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Maintenance info, nozzle details, quirks…"
                multiline
              />
            </ScrollView>

            <View style={styles.actions}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
              <PrimaryButton
                label={saveMutation.isPending ? 'Saving…' : 'Save'}
                onPress={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                loading={saveMutation.isPending}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    gap: spacing.sm,
  },
});
