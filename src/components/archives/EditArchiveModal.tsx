import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Trash2, X } from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { Archive, Printer, Project } from '@/types/api';

const ARCHIVE_STATUSES = ['completed', 'failed', 'aborted', 'printing'] as const;
const FAILURE_REASONS = [
  'adhesionFailure',
  'spaghettiDetached',
  'layerShift',
  'cloggedNozzle',
  'filamentRunout',
  'warping',
  'stringing',
  'underExtrusion',
  'powerFailure',
  'userCancelled',
  'other',
] as const;

type SelectorKey = 'printer' | 'project' | 'status' | 'failureReason' | null;
type SelectorValue = string | number | null;

interface EditArchiveModalProps {
  visible: boolean;
  archive: Archive | null;
  onClose: () => void;
  onSaved?: () => void;
}

interface SelectOption {
  label: string;
  value: SelectorValue;
  helper?: string;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function titleCase(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeTags(value: string) {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function assetToUpload(asset: Asset) {
  if (!asset.uri) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? `archive-photo-${Date.now()}.jpg`,
    type: asset.type ?? 'image/jpeg',
  };
}

function SelectField({
  label,
  value,
  placeholder,
  open,
  options,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  open: boolean;
  options: SelectOption[];
  onToggle: () => void;
  onSelect: (value: SelectorValue) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={onToggle}
        style={[
          styles.selectField,
          { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
        ]}
      >
        <Text style={[styles.selectText, { color: value ? colors.text : colors.inputPlaceholder }]}>
          {value || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View
          style={[
            styles.optionsPanel,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <ScrollView nestedScrollEnabled style={styles.optionsScroll}>
            {options.map(option => (
              <Pressable
                key={`${label}-${String(option.value)}`}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.optionRow,
                  { borderColor: colors.borderSubtle, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
                {option.helper ? (
                  <Text style={[styles.optionHelper, { color: colors.textSecondary }]}>
                    {option.helper}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function EditArchiveModal({
  visible,
  archive,
  onClose,
  onSaved,
}: EditArchiveModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeSelector, setActiveSelector] = useState<SelectorKey>(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState<string | null>(null);
  const [printName, setPrintName] = useState('');
  const [printerId, setPrinterId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<(typeof ARCHIVE_STATUSES)[number]>('completed');
  const [failureReason, setFailureReason] = useState<string>('');
  const [quantity, setQuantity] = useState('1');
  const [photos, setPhotos] = useState<string[]>([]);
  const [externalUrl, setExternalUrl] = useState('');

  useEffect(() => {
    if (!archive || !visible) return;
    setPrintName(archive.print_name ?? '');
    setPrinterId(archive.printer_id ?? null);
    setProjectId(archive.project_id ?? null);
    setNotes(archive.notes ?? '');
    setTags(archive.tags ?? '');
    setStatus((ARCHIVE_STATUSES.includes(archive.status as (typeof ARCHIVE_STATUSES)[number])
      ? archive.status
      : 'completed') as (typeof ARCHIVE_STATUSES)[number]);
    setFailureReason(archive.failure_reason ?? '');
    setQuantity(String(Math.max(1, archive.quantity ?? 1)));
    setPhotos(archive.photos ?? []);
    setExternalUrl(archive.external_url ?? '');
    setActiveSelector(null);
    setPendingPhotoDelete(null);
  }, [archive, visible]);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
    enabled: visible,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    enabled: visible,
  });

  const tagsQuery = useQuery({
    queryKey: ['archiveTags'],
    queryFn: () => api.getTags(),
    enabled: visible,
  });

  const printers = useMemo(
    () =>
      (Array.isArray(printersQuery.data)
        ? [...(printersQuery.data as unknown as Printer[])].sort((a, b) => a.name.localeCompare(b.name))
        : []),
    [printersQuery.data],
  );
  const projects = useMemo(
    () =>
      (Array.isArray(projectsQuery.data)
        ? [...(projectsQuery.data as unknown as Project[])].sort((a, b) => a.name.localeCompare(b.name))
        : []),
    [projectsQuery.data],
  );
  const tagNames = useMemo(
    () => (Array.isArray(tagsQuery.data) ? tagsQuery.data.map(tag => tag.name) : []),
    [tagsQuery.data],
  );
  const tagList = useMemo(() => normalizeTags(tags), [tags]);
  const currentTagInput = useMemo(() => {
    const parts = tags.split(',');
    return parts[parts.length - 1]?.trim().toLowerCase() ?? '';
  }, [tags]);
  const tagSuggestions = useMemo(
    () =>
      tagNames.filter(tag => {
        const lower = tag.toLowerCase();
        if (tagList.some(existing => existing.toLowerCase() === lower)) return false;
        return !currentTagInput || lower.includes(currentTagInput);
      }),
    [currentTagInput, tagList, tagNames],
  );

  const currentPrinter = printers.find(printer => printer.id === printerId);
  const currentProject = projects.find(project => project.id === projectId);

  const invalidateArchiveQueries = async () => {
    if (!archive) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['archives'] }),
      queryClient.invalidateQueries({ queryKey: ['archive', archive.id] }),
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!archive) throw new Error('Archive unavailable');
      const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
      return api.updateArchive(archive.id, {
        print_name: printName.trim() || null,
        printer_id: printerId,
        project_id: projectId,
        notes: notes.trim() || null,
        tags: tagList.join(', ') || null,
        status,
        failure_reason: status === 'failed' || status === 'aborted' ? failureReason || null : null,
        quantity: parsedQuantity,
        external_url: externalUrl.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast('Archive updated.', 'success');
      onSaved?.();
      onClose();
    },
    onError: error => showToast(getErrorMessage(error, 'Unable to update archive.'), 'error'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (asset: Asset) => {
      if (!archive) throw new Error('Archive unavailable');
      const file = assetToUpload(asset);
      if (!file) throw new Error('Selected image is unavailable');
      await api.uploadArchivePhoto(archive.id, file);
      return api.getArchivePhotos(archive.id);
    },
    onSuccess: async nextPhotos => {
      setPhotos(nextPhotos);
      await invalidateArchiveQueries();
      showToast('Photo uploaded.', 'success');
    },
    onError: error => showToast(getErrorMessage(error, 'Unable to upload photo.'), 'error'),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photo: string) => {
      if (!archive) throw new Error('Archive unavailable');
      await api.deleteArchivePhoto(archive.id, photo);
      return api.getArchivePhotos(archive.id);
    },
    onSuccess: async nextPhotos => {
      setPhotos(nextPhotos);
      setPendingPhotoDelete(null);
      await invalidateArchiveQueries();
      showToast('Photo removed.', 'success');
    },
    onError: error => showToast(getErrorMessage(error, 'Unable to remove photo.'), 'error'),
  });

  const handlePhotoPick = async (source: 'camera' | 'gallery') => {
    try {
      const result =
        source === 'camera'
          ? await launchCamera({ mediaType: 'photo', cameraType: 'back', saveToPhotos: true })
          : await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });

      if (result.didCancel) return;
      if (result.errorMessage) {
        showToast(result.errorMessage, 'error');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset) {
        showToast('No photo was selected.', 'warning');
        return;
      }
      uploadPhotoMutation.mutate(asset);
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to open the image picker.'), 'error');
    }
  };

  const addSuggestedTag = (tag: string) => {
    const existing = normalizeTags(tags).filter(
      item => item.toLowerCase() !== currentTagInput.toLowerCase(),
    );
    const unique = [...existing.filter(item => item.toLowerCase() !== tag.toLowerCase()), tag];
    setTags(unique.join(', '));
  };

  const removeTag = (tag: string) => {
    setTags(tagList.filter(item => item !== tag).join(', '));
  };

  const selectionOptions: Record<Exclude<SelectorKey, null>, SelectOption[]> = {
    printer: [
      { label: 'No printer', value: null },
      ...printers.map(printer => ({
        label: printer.name,
        value: printer.id,
        helper: printer.location ?? undefined,
      })),
    ],
    project: [
      { label: 'No project', value: null },
      ...projects.map(project => ({
        label: project.name,
        value: project.id,
        helper: project.status,
      })),
    ],
    status: ARCHIVE_STATUSES.map(value => ({ label: titleCase(value), value })),
    failureReason: [
      { label: 'No failure reason', value: null },
      ...FAILURE_REASONS.map(value => ({ label: titleCase(value), value })),
    ],
  };

  const handleSelectValue = (value: SelectorValue) => {
    switch (activeSelector) {
      case 'printer':
        setPrinterId(typeof value === 'number' ? value : null);
        break;
      case 'project':
        setProjectId(typeof value === 'number' ? value : null);
        break;
      case 'status':
        setStatus((value as (typeof ARCHIVE_STATUSES)[number]) ?? 'completed');
        if (value !== 'failed' && value !== 'aborted') {
          setFailureReason('');
        }
        break;
      case 'failureReason':
        setFailureReason(typeof value === 'string' ? value : '');
        break;
      default:
        break;
    }
    setActiveSelector(null);
  };

  if (!archive) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
                  <Text style={[styles.title, { color: colors.text }]}>Edit archive</Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Update print details, failure notes, tags, and attached photos.</Text>
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

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TextField
                  label="Print name"
                  value={printName}
                  onChangeText={setPrintName}
                  placeholder="Print name"
                />

                <SelectField
                  label="Printer"
                  value={currentPrinter?.name ?? ''}
                  placeholder={printersQuery.isLoading ? 'Loading printers…' : 'Select a printer'}
                  open={activeSelector === 'printer'}
                  options={selectionOptions.printer}
                  onToggle={() => setActiveSelector(current => (current === 'printer' ? null : 'printer'))}
                  onSelect={handleSelectValue}
                />

                <SelectField
                  label="Project"
                  value={currentProject?.name ?? ''}
                  placeholder={projectsQuery.isLoading ? 'Loading projects…' : 'Select a project'}
                  open={activeSelector === 'project'}
                  options={selectionOptions.project}
                  onToggle={() => setActiveSelector(current => (current === 'project' ? null : 'project'))}
                  onSelect={handleSelectValue}
                />

                <TextField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Failure analysis, tuning notes, or post-print observations"
                  multiline
                />

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tags</Text>
                  {tagList.length > 0 ? (
                    <View style={styles.tagsRow}>
                      {tagList.map(tag => (
                        <Pressable
                          key={tag}
                          onPress={() => removeTag(tag)}
                          style={[
                            styles.tag,
                            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                          ]}
                        >
                          <Text style={[styles.tagText, { color: colors.text }]}>{tag}</Text>
                          <X size={14} color={colors.textSecondary} strokeWidth={2} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <TextField
                    label=""
                    value={tags}
                    onChangeText={setTags}
                    placeholder="quality-check, customer-a, pla"
                    style={styles.tagInput}
                  />
                  {tagSuggestions.length > 0 ? (
                    <View style={styles.suggestionsWrap}>
                      {tagSuggestions.slice(0, 8).map(tag => (
                        <Pressable
                          key={tag}
                          onPress={() => addSuggestedTag(tag)}
                          style={[
                            styles.suggestion,
                            { backgroundColor: colors.accentBg, borderColor: colors.accent },
                          ]}
                        >
                          <Text style={[styles.suggestionText, { color: colors.accentLight }]}>{tag}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <SelectField
                  label="Status"
                  value={titleCase(status)}
                  placeholder="Select a status"
                  open={activeSelector === 'status'}
                  options={selectionOptions.status}
                  onToggle={() => setActiveSelector(current => (current === 'status' ? null : 'status'))}
                  onSelect={handleSelectValue}
                />

                {status === 'failed' || status === 'aborted' ? (
                  <SelectField
                    label="Failure reason"
                    value={failureReason ? titleCase(failureReason) : ''}
                    placeholder="Select a failure reason"
                    open={activeSelector === 'failureReason'}
                    options={selectionOptions.failureReason}
                    onToggle={() =>
                      setActiveSelector(current =>
                        current === 'failureReason' ? null : 'failureReason',
                      )
                    }
                    onSelect={handleSelectValue}
                  />
                ) : null}

                <TextField
                  label="Quantity"
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="1"
                  keyboardType="number-pad"
                />

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Photos</Text>
                  <View style={styles.photoGrid}>
                    {photos.map(photo => (
                      <View key={photo} style={styles.photoWrap}>
                        <Image
                          source={{ uri: api.getArchivePhotoUrl(archive.id, photo) }}
                          style={styles.photo}
                        />
                        <Pressable
                          onPress={() => setPendingPhotoDelete(photo)}
                          style={[styles.photoDelete, { backgroundColor: colors.error }]}
                        >
                          <Trash2 size={14} color="#fff" strokeWidth={2} />
                        </Pressable>
                      </View>
                    ))}
                    {(uploadPhotoMutation.isPending || deletePhotoMutation.isPending) ? (
                      <View
                        style={[
                          styles.photoActionCard,
                          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                        ]}
                      >
                        <ActivityIndicator color={colors.accent} />
                        <Text style={[styles.photoActionText, { color: colors.textSecondary }]}>Updating…</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.photoActions}>
                    <PrimaryButton
                      label="Camera"
                      variant="secondary"
                      onPress={() => void handlePhotoPick('camera')}
                      disabled={uploadPhotoMutation.isPending}
                    />
                    <PrimaryButton
                      label="Gallery"
                      variant="secondary"
                      onPress={() => void handlePhotoPick('gallery')}
                      disabled={uploadPhotoMutation.isPending}
                    />
                  </View>
                </View>

                <TextField
                  label="External URL"
                  value={externalUrl}
                  onChangeText={setExternalUrl}
                  placeholder="https://printables.com/model/..."
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ScrollView>

              <View style={styles.actions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
                <PrimaryButton
                  label={saveMutation.isPending ? 'Saving…' : 'Save'}
                  onPress={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ConfirmModal
        visible={pendingPhotoDelete !== null}
        title="Delete photo"
        message="Remove this archive photo?"
        confirmLabel="Delete"
        variant="danger"
        loading={deletePhotoMutation.isPending}
        onClose={() => setPendingPhotoDelete(null)}
        onConfirm={() => {
          if (!pendingPhotoDelete) return;
          deletePhotoMutation.mutate(pendingPhotoDelete);
        }}
      />
    </>
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
    maxHeight: '90%',
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
    lineHeight: 20,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  selectField: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  optionsPanel: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  optionsScroll: {
    maxHeight: 220,
  },
  optionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  optionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  optionHelper: {
    fontSize: fontSize.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  tagInput: {
    marginTop: 0,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  suggestion: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  suggestionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.lg,
    backgroundColor: '#1f2937',
  },
  photoDelete: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionCard: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  photoActionText: {
    fontSize: fontSize.xs,
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
