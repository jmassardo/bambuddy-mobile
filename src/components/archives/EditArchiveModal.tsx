import { translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
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
import { validateArchiveQuantities } from '@/utils/archiveWorkflows';
import { WorkflowChip as Chip } from './ArchiveWorkflowUI';

const ARCHIVE_STATUSES = ['completed', 'failed', 'aborted', 'printing', 'archived', 'cancelled', 'stopped', 'paused', 'skipped'] as const;
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
  useNativeLocale();
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
  useNativeLocale();
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
  const [filamentGrams, setFilamentGrams] = useState('');
  const [verdict, setVerdict] = useState<'good' | 'reject' | null>(null);
  const { t } = useTranslation();

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
    setQuantity(String(archive.quantity ?? 1));
    setFilamentGrams(archive.filament_used_grams == null ? '' : String(archive.filament_used_grams));
    const storedVerdict = (archive as unknown as { user_verdict?: 'good' | 'reject' | null }).user_verdict;
    setVerdict(storedVerdict ?? null);
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

  const printers = useLocalizedMemo(
    () =>
      (Array.isArray(printersQuery.data)
        ? [...(printersQuery.data as unknown as Printer[])].sort((a, b) => a.name.localeCompare(b.name))
        : []),
    [printersQuery.data],
  );
  const projects = useLocalizedMemo(
    () =>
      (Array.isArray(projectsQuery.data)
        ? [...(projectsQuery.data as unknown as Project[])].sort((a, b) => a.name.localeCompare(b.name))
        : []),
    [projectsQuery.data],
  );
  const tagNames = useLocalizedMemo(
    () => (Array.isArray(tagsQuery.data) ? tagsQuery.data.map(tag => tag.name) : []),
    [tagsQuery.data],
  );
  const tagList = useLocalizedMemo(() => normalizeTags(tags), [tags]);
  const currentTagInput = useLocalizedMemo(() => {
    const parts = tags.split(',');
    return parts[parts.length - 1]?.trim().toLowerCase() ?? '';
  }, [tags]);
  const tagSuggestions = useLocalizedMemo(
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
      if (!archive) throw new Error(translateNative('native.e6be5c36d55115b3'));
      const quantities = validateArchiveQuantities(quantity, filamentGrams, t);
      return api.updateArchive(archive.id, {
        print_name: printName.trim() || null,
        printer_id: printerId,
        project_id: projectId,
        notes: notes.trim() || null,
        tags: tagList.join(', ') || null,
        status,
        failure_reason: status === 'failed' || status === 'aborted' || verdict === 'reject' ? failureReason || null : null,
        ...quantities,
        ...(status === 'completed' && verdict !== (archive.user_verdict ?? null) ? { user_verdict: verdict, user_verdict_source: 'dialog' } : {}),
        external_url: externalUrl.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast(translateNative('native.263bbce85bde3aef'), 'success');
      onSaved?.();
      onClose();
    },
    onError: error => showToast(getErrorMessage(error, translateNative('native.2209c790c4b8ea65')), 'error'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (asset: Asset) => {
      if (!archive) throw new Error(translateNative('native.e6be5c36d55115b3'));
      const file = assetToUpload(asset);
      if (!file) throw new Error(translateNative('native.9e62fcda42958ceb'));
      await api.uploadArchivePhoto(archive.id, file);
      return api.getArchivePhotos(archive.id);
    },
    onSuccess: async nextPhotos => {
      setPhotos(nextPhotos);
      await invalidateArchiveQueries();
      showToast(translateNative('native.7b1106f0bfc4156f'), 'success');
    },
    onError: error => showToast(getErrorMessage(error, translateNative('native.c450951dfd4a358d')), 'error'),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photo: string) => {
      if (!archive) throw new Error(translateNative('native.e6be5c36d55115b3'));
      await api.deleteArchivePhoto(archive.id, photo);
      return api.getArchivePhotos(archive.id);
    },
    onSuccess: async nextPhotos => {
      setPhotos(nextPhotos);
      setPendingPhotoDelete(null);
      await invalidateArchiveQueries();
      showToast(translateNative('native.fe5b6b06f65e3dd4'), 'success');
    },
    onError: error => showToast(getErrorMessage(error, translateNative('native.7b4fada8f2819f53')), 'error'),
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
        showToast(translateNative('native.d6a3777d24ec7466'), 'warning');
        return;
      }
      uploadPhotoMutation.mutate(asset);
    } catch (error) {
      showToast(getErrorMessage(error, translateNative('native.57a0bea0571bde29')), 'error');
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
      { get label() { return translateNative('native.bbad1fcfe1f97009'); }, value: null },
      ...printers.map(printer => ({
        label: printer.name,
        value: printer.id,
        helper: printer.location ?? undefined,
      })),
    ],
    project: [
      { get label() { return translateNative('native.d9e7e5742ee28212'); }, value: null },
      ...projects.map(project => ({
        label: project.name,
        value: project.id,
        helper: project.status,
      })),
    ],
    status: ARCHIVE_STATUSES.map(value => ({ label: titleCase(value), value })),
    failureReason: [
      { get label() { return translateNative('native.2ef2687d5533a329'); }, value: null },
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
                  <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.22636471158cb125')}</Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{translateNative('native.88568da902e5ab41')}</Text>
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
                  label={translateNative('native.861e032040547eee')}
                  value={printName}
                  onChangeText={setPrintName}
                  placeholder={translateNative('native.861e032040547eee')}
                />

                <SelectField
                  label={translateNative('screen.printer')}
                  value={currentPrinter?.name ?? ''}
                  placeholder={printersQuery.isLoading ? translateNative('native.5172319c7d271115') : translateNative('native.e79e94e277427366')}
                  open={activeSelector === 'printer'}
                  options={selectionOptions.printer}
                  onToggle={() => setActiveSelector(current => (current === 'printer' ? null : 'printer'))}
                  onSelect={handleSelectValue}
                />

                <SelectField
                  label={translateNative('screen.project')}
                  value={currentProject?.name ?? ''}
                  placeholder={projectsQuery.isLoading ? translateNative('native.12593164867ec279') : translateNative('native.4ff77ce1cbc25427')}
                  open={activeSelector === 'project'}
                  options={selectionOptions.project}
                  onToggle={() => setActiveSelector(current => (current === 'project' ? null : 'project'))}
                  onSelect={handleSelectValue}
                />

                <TextField
                  label={translateNative('native.be6245aeb9573da2')}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={translateNative('native.143f6d9b1c39c3c8')}
                  multiline
                />

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{translateNative('native.0157f54b2e4d9f8e')}</Text>
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
                    placeholder={translateNative('native.c93b2a5492109cf5')}
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
                  label={translateNative('common.status')}
                  value={titleCase(status)}
                  placeholder={translateNative('native.5be0d2dc733c5ee7')}
                  open={activeSelector === 'status'}
                  options={selectionOptions.status}
                  onToggle={() => setActiveSelector(current => (current === 'status' ? null : 'status'))}
                  onSelect={handleSelectValue}
                />

                {status === 'failed' || status === 'aborted' ? (
                  <SelectField
                    label={translateNative('native.6c33df27c679d6f1')}
                    value={failureReason ? titleCase(failureReason) : ''}
                    placeholder={translateNative('native.e6dc4a654bcabe72')}
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
                  label={translateNative('native.742a646ad4b230ba')}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="1"
                  keyboardType="number-pad"
                />
                <TextField label={t('archives.filamentGrams', { defaultValue: 'Filament used (g); leave empty to clear' })} value={filamentGrams} onChangeText={setFilamentGrams} keyboardType="decimal-pad" />
                {status === 'completed' ? <View style={styles.fieldGroup}>
                  <Text style={{ color: colors.text }}>{t('archives.qualityVerdict', { defaultValue: 'Quality verdict (does not change machine status)' })}</Text>
                  {verdict === (archive.user_verdict ?? null) && archive.user_verdict_source ? <Text style={{ color: colors.textSecondary }}>{t('archives.verdictProvenance', { defaultValue: 'Stored verdict source: {{source}}', source: archive.user_verdict_source })}</Text> : null}
                  <View style={styles.suggestionsWrap}>{([null, 'good', 'reject'] as const).map(value => <Chip key={String(value)} label={value === null ? t('archives.none', { defaultValue: 'None / clear' }) : value === 'good' ? t('archives.good', { defaultValue: 'Good' }) : t('archives.reject', { defaultValue: 'Reject' })} active={verdict === value} onPress={() => setVerdict(value)} />)}</View>
                  {verdict === 'reject' ? <TextField label={t('archives.rejectionReason', { defaultValue: 'Rejection reason' })} value={failureReason} onChangeText={setFailureReason} /> : null}
                </View> : null}

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{translateNative('native.7d5c5671012db5ee')}</Text>
                  <View style={styles.photoGrid}>
                    {photos.map(photo => (
                      <View key={photo} style={styles.photoWrap}>
                        <Image
                          source={{ uri: api.getArchivePhotoUrl(archive.id, photo) }}
                          style={[styles.photo, { backgroundColor: colors.surface }]}
                        />
                        <Pressable
                          onPress={() => setPendingPhotoDelete(photo)}
                          style={[styles.photoDelete, { backgroundColor: colors.error }]}
                        >
                          <Trash2 size={14} color={colors.textInverse} strokeWidth={2} />
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
                        <Text style={[styles.photoActionText, { color: colors.textSecondary }]}>{translateNative('native.2f062a3481054e2f')}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.photoActions}>
                    <PrimaryButton
                      label={translateNative('native.ac1081d67c0eb4a3')}
                      variant="secondary"
                      onPress={() => void handlePhotoPick('camera')}
                      disabled={uploadPhotoMutation.isPending}
                    />
                    <PrimaryButton
                      label={translateNative('native.730291cdbc8cfb3e')}
                      variant="secondary"
                      onPress={() => void handlePhotoPick('gallery')}
                      disabled={uploadPhotoMutation.isPending}
                    />
                  </View>
                </View>

                <TextField
                  label={translateNative('native.b543b3bf7894c9d6')}
                  value={externalUrl}
                  onChangeText={setExternalUrl}
                  placeholder="https://printables.com/model/..."
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ScrollView>

              <View style={styles.actions}>
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={onClose} />
                <PrimaryButton
                  label={saveMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')}
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
        title={translateNative('native.b6870532d6ae062d')}
        message={translateNative('native.e72f7c297a057f10')}
        confirmLabel={translateNative('common.delete')}
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
