import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check, Minus, Shield } from 'lucide-react-native';
import { api } from '@/api/client';
import { useTheme } from '@/theme';
import { useToast } from '@/contexts/ToastContext';
import {  } from '@/theme/tokens';
import { TextField, PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { pickArray, pickString, type ApiRecord } from '@/utils/data';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupId?: number | null; // null = create new
}

export function GroupEditModal({ visible, onClose, groupId }: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(groupId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId!),
    enabled: isEditing && visible,
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.getPermissions(),
    enabled: visible,
  });

  // Initialize form from group data
  useEffect(() => {
    if (isEditing && groupQuery.data) {
      const data = groupQuery.data as ApiRecord;
      setName(pickString(data, ['name']));
      setDescription(pickString(data, ['description']));
      setPermissions(pickArray(data, ['permissions']) as string[]);
    } else if (!isEditing && visible) {
      setName('');
      setDescription('');
      setPermissions([]);
    }
  }, [groupQuery.data, isEditing, visible]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; permissions: string[] }) =>
      api.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      showToast('Group created.', 'success');
      onClose();
    },
    onError: (e: Error) => showToast(e.message || 'Failed to create group.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; permissions: string[] }) =>
      api.updateGroup(groupId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      showToast('Group updated.', 'success');
      onClose();
    },
    onError: (e: Error) => showToast(e.message || 'Failed to update group.', 'error'),
  });

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Please enter a group name.', 'error');
      return;
    }
    if (isEditing) {
      updateMutation.mutate({ name, description, permissions });
    } else {
      createMutation.mutate({ name, description: description || undefined, permissions });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const categories = useMemo(() => {
    const data = permissionsQuery.data as ApiRecord | undefined;
    if (!data) return [];
    const cats = pickArray(data, ['categories']) as ApiRecord[];
    const searchLower = search.toLowerCase();
    return cats
      .map(cat => ({
        name: pickString(cat, ['name']),
        label: pickString(cat, ['label', 'name']),
        permissions: (pickArray(cat, ['permissions']) as ApiRecord[])
          .filter(p => !searchLower || pickString(p, ['label', 'name']).toLowerCase().includes(searchLower))
          .map(p => ({
            value: pickString(p, ['value', 'key']),
            label: pickString(p, ['label', 'name']),
            description: pickString(p, ['description']),
          })),
      }))
      .filter(cat => cat.permissions.length > 0);
  }, [permissionsQuery.data, search]);

  const allPerms = useMemo(() => {
    const data = permissionsQuery.data as ApiRecord | undefined;
    if (!data) return [];
    return pickArray(data, ['all_permissions']) as string[];
  }, [permissionsQuery.data]);

  const togglePermission = (perm: string) => {
    setPermissions(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const toggleCategory = (catPerms: string[], checked: boolean) => {
    setPermissions(prev => {
      const other = prev.filter(p => !catPerms.includes(p));
      return checked ? [...other, ...catPerms] : other;
    });
  };

  const selectAll = () => setPermissions([...allPerms]);
  const clearAll = () => setPermissions([]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {isEditing ? 'Edit Group' : 'Create Group'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {permissions.length}/{allPerms.length} permissions selected
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Name + Description */}
            <TextField label="Group Name" value={name} onChangeText={setName} placeholder="e.g. Operators" />
            <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional description" />

            {/* Permission controls */}
            <View style={styles.permHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                <Shield size={14} color={colors.accent} /> Permissions
              </Text>
              <View style={styles.permActions}>
                <Pressable onPress={selectAll}>
                  <Text style={[styles.actionLink, { color: colors.accent }]}>All</Text>
                </Pressable>
                <Pressable onPress={clearAll}>
                  <Text style={[styles.actionLink, { color: colors.textSecondary }]}>None</Text>
                </Pressable>
              </View>
            </View>

            <SearchBar value={search} onChangeText={setSearch} placeholder="Search permissions…" />

            {/* Permission categories */}
            {categories.map(cat => {
              const catPermValues = cat.permissions.map(p => p.value);
              const allSelected = catPermValues.every(p => permissions.includes(p));
              const someSelected = !allSelected && catPermValues.some(p => permissions.includes(p));
              return (
                <View key={cat.name} style={[styles.categoryCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Pressable
                    onPress={() => toggleCategory(catPermValues, !allSelected)}
                    style={styles.categoryHeader}
                  >
                    <View style={[
                      styles.checkbox,
                      {
                        backgroundColor: allSelected ? colors.accent : 'transparent',
                        borderColor: allSelected ? colors.accent : someSelected ? colors.accent : colors.border,
                      },
                    ]}>
                      {allSelected && <Check size={12} color={colors.textInverse} />}
                      {someSelected && !allSelected && <Minus size={12} color={colors.accent} />}
                    </View>
                    <Text style={[styles.categoryName, { color: colors.text }]}>{cat.label}</Text>
                    <Text style={[styles.categoryCount, { color: colors.textTertiary }]}>
                      {catPermValues.filter(p => permissions.includes(p)).length}/{catPermValues.length}
                    </Text>
                  </Pressable>
                  {cat.permissions.map(perm => (
                    <Pressable
                      key={perm.value}
                      onPress={() => togglePermission(perm.value)}
                      style={styles.permRow}
                    >
                      <View style={[
                        styles.checkbox,
                        {
                          backgroundColor: permissions.includes(perm.value) ? colors.accent : 'transparent',
                          borderColor: permissions.includes(perm.value) ? colors.accent : colors.border,
                        },
                      ]}>
                        {permissions.includes(perm.value) && <Check size={12} color={colors.textInverse} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.permLabel, { color: colors.text }]}>{perm.label}</Text>
                        {perm.description ? (
                          <Text style={[styles.permDesc, { color: colors.textTertiary }]}>{perm.description}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              );
            })}

            {/* Save button */}
            <PrimaryButton
              label={isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Group'}
              onPress={handleSave}
              loading={isSaving}
              disabled={!name.trim()}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  permHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permActions: { flexDirection: 'row', gap: 12 },
  actionLink: { fontSize: 13, fontWeight: '500' },
  categoryCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  categoryName: { fontSize: 14, fontWeight: '600', flex: 1 },
  categoryCount: { fontSize: 12 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  permLabel: { fontSize: 13 },
  permDesc: { fontSize: 11, marginTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
