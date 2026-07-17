import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Trash2 } from 'lucide-react-native';
import { api } from '@/api/client';
import { ActionSheetModal } from '@/components/common/ActionSheetModal';
import { FloatingActionButton, InlineTabBar, PrimaryButton, StatusBadge, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { GroupEditModal } from '@/components/common/GroupEditModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickArray, pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';

type CreateMode = 'local' | 'ldap';

interface UserFormState {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  groupIds: number[];
}

const DEFAULT_FORM: UserFormState = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  groupIds: [],
};

export default function UsersScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Users' });
  }, [navigation]);

  const { colors } = useTheme();
  const { isAdmin, user: currentUser } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('local');
  const [editingUser, setEditingUser] = useState<ApiRecord | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<ApiRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(DEFAULT_FORM);
  const [ldapQuery, setLdapQuery] = useState('');
  const [selectedLdap, setSelectedLdap] = useState<ApiRecord | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: isAdmin,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.getGroups(),
    enabled: isAdmin,
  });
  const advancedAuthQuery = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: () => api.getAdvancedAuthStatus(),
    enabled: isAdmin,
  });
  const ldapStatusQuery = useQuery({
    queryKey: ['ldapStatus'],
    queryFn: () => api.getLDAPStatus(),
    enabled: isAdmin,
  });
  const ldapSearchQuery = useQuery({
    queryKey: ['ldapSearch', ldapQuery],
    queryFn: () => api.searchLDAPDirectory(ldapQuery.trim()),
    enabled: showCreate && createMode === 'ldap' && ldapQuery.trim().length >= 2,
  });

  const refreshAll = async () => {
    await Promise.all([
      usersQuery.refetch(),
      groupsQuery.refetch(),
      advancedAuthQuery.refetch(),
      ldapStatusQuery.refetch(),
    ]);
  };

  const resetCreateState = () => {
    setShowCreate(false);
    setCreateMode('local');
    setForm(DEFAULT_FORM);
    setLdapQuery('');
    setSelectedLdap(null);
  };

  const openEdit = (target: ApiRecord) => {
    setEditingUser(target);
    setForm({
      username: pickString(target, ['username']),
      email: pickString(target, ['email']),
      password: '',
      confirmPassword: '',
      groupIds: pickArray(target, ['groups'])
        .map(group => pickNumber(group, ['id'], -1))
        .filter(id => id >= 0),
    });
    setShowEdit(true);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setEditingUser(null);
    setForm(DEFAULT_FORM);
  };

  const invalidateUsers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const advancedAuth = pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled'], false);
      return api.createUser({
        username: form.username.trim(),
        password: advancedAuth ? undefined : form.password,
        email: form.email.trim() || undefined,
        group_ids: form.groupIds.length > 0 ? form.groupIds : undefined,
      });
    },
    onSuccess: async () => {
      await invalidateUsers();
      resetCreateState();
      showToast('User created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create user.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateUser(pickNumber(editingUser, ['id']), {
        username: form.username.trim(),
        email: form.email.trim() || undefined,
        password: form.password.trim() || undefined,
        group_ids: form.groupIds,
      }),
    onSuccess: async () => {
      await invalidateUsers();
      closeEdit();
      showToast('User updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update user.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.deleteUser(userId),
    onSuccess: async () => {
      await invalidateUsers();
      showToast('User deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete user.', 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: number) => api.resetUserPassword({ user_id: userId }),
    onSuccess: data => showToast(pickString(data, ['message'], 'Password reset email sent.'), 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to reset password.', 'error'),
  });

  const provisionLdapMutation = useMutation({
    mutationFn: (username: string) => api.provisionLDAPUser(username),
    onSuccess: async data => {
      await invalidateUsers();
      resetCreateState();
      showToast(`Provisioned ${pickString(data, ['username'], 'LDAP user')}.`, 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to provision LDAP user.', 'error'),
  });

  const users = useMemo(() => ((usersQuery.data ?? []) as ApiRecord[]), [usersQuery.data]);
  const groups = useMemo(() => ((groupsQuery.data ?? []) as ApiRecord[]), [groupsQuery.data]);
  const advancedAuthEnabled = pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled'], false);
  const ldapEnabled = pickBoolean(ldapStatusQuery.data, ['ldap_enabled'], false);
  const isCreateDisabled = useMemo(() => {
    if (!form.username.trim()) return true;
    if (advancedAuthEnabled) return !form.email.trim();
    return form.password.length < 6 || form.password !== form.confirmPassword;
  }, [advancedAuthEnabled, form]);
  const isEditDisabled = useMemo(() => {
    if (!form.username.trim()) return true;
    if (!form.password) return false;
    return form.password.length < 6 || form.password !== form.confirmPassword;
  }, [form]);

  const toggleGroup = (groupId: number) => {
    setForm(current => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter(id => id !== groupId)
        : [...current.groupIds, groupId],
    }));
  };

  // Group management state
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => api.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      showToast('Group deleted.', 'success');
      setDeleteGroupId(null);
    },
    onError: (e: Error) => showToast(e.message || 'Failed to delete group.', 'error'),
  });

  if (!isAdmin) {
    return (
      <EmptyState
        icon="🛡"
        title="Admin access required"
        message="Only administrators can manage users from the mobile app."
      />
    );
  }

  if (usersQuery.isLoading || groupsQuery.isLoading) {
    return <LoadingScreen message="Loading users…" />;
  }

  if (usersQuery.isError || groupsQuery.isError) {
    return (
      <ErrorState
        message="Unable to load users."
        onRetry={() => void refreshAll()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={users}
        keyExtractor={item => pickString(item, ['id'])}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={usersQuery.isRefetching || groupsQuery.isRefetching}
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => {
          const groupNames = pickArray(item, ['groups'])
            .map(group => pickString(group, ['name']))
            .filter(Boolean)
            .join(', ');
          const role = pickBoolean(item, ['is_admin']) ? 'admin' : groupNames || 'user';
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  <Text style={[styles.name, { color: colors.text }]}>{pickString(item, ['username'], 'Unknown user')}</Text>
                  <Text style={[styles.email, { color: colors.textSecondary }]}>{pickString(item, ['email'], 'No email')}</Text>
                </View>
                <StatusBadge label={role} color={statusColor(role, colors)} />
              </View>

              <View style={styles.metaBlock}>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Groups: {groupNames || 'None'}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Status: {pickBoolean(item, ['is_active'], true) ? 'Active' : 'Inactive'}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Last login: {formatDateTime(pickString(item, ['last_login']))}</Text>
              </View>

              <View style={styles.actions}>
                <PrimaryButton label="Edit" variant="secondary" onPress={() => openEdit(item)} />
                {pickNumber(item, ['id']) !== pickNumber(currentUser, ['id']) ? (
                  <PrimaryButton
                    label={resetPasswordMutation.isPending ? 'Resetting…' : 'Reset password'}
                    variant="secondary"
                    onPress={() => void resetPasswordMutation.mutateAsync(pickNumber(item, ['id']))}
                  />
                ) : null}
                {pickNumber(item, ['id']) !== pickNumber(currentUser, ['id']) ? (
                  <PrimaryButton
                    label="Delete"
                    variant="danger"
                    onPress={() => setPendingDeleteUser(item)}
                  />
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="👥" title="No users" message="Create the first user to get started." />}
        ListFooterComponent={
          <View style={[styles.groupsSection, { borderTopColor: colors.borderSubtle }]}>
            <View style={styles.groupsSectionHeader}>
              <Text style={[styles.groupsSectionTitle, { color: colors.text }]}>Groups</Text>
              <Pressable
                onPress={() => { setEditGroupId(null); setShowGroupEdit(true); }}
                style={[styles.groupAddBtn, { backgroundColor: colors.accent }]}
              >
                <Plus size={14} color="#fff" strokeWidth={2.5} />
              </Pressable>
            </View>
            {groups.length > 0 ? groups.map(group => {
              const gId = pickNumber(group, ['id']);
              const gName = pickString(group, ['name']);
              const isSystem = pickBoolean(group, ['is_system']);
              const permCount = (pickArray(group, ['permissions']) as string[]).length;
              return (
                <View key={gId} style={[styles.groupRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.groupName, { color: colors.text }]}>{gName}</Text>
                    <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>
                      {permCount} permissions{isSystem ? ' • System' : ''}
                    </Text>
                  </View>
                  <View style={styles.groupActions}>
                    <Pressable onPress={() => { setEditGroupId(gId); setShowGroupEdit(true); }} style={styles.groupActionBtn}>
                      <Edit2 size={14} color={colors.textSecondary} />
                    </Pressable>
                    {!isSystem && (
                      <Pressable onPress={() => setDeleteGroupId(gId)} style={styles.groupActionBtn}>
                        <Trash2 size={14} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }) : (
              <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>No groups configured.</Text>
            )}
          </View>
        }
      />

      <ActionSheetModal
        visible={pendingDeleteUser != null}
        title="Delete user"
        subtitle={
          pendingDeleteUser
            ? `Delete ${pickString(pendingDeleteUser, ['username'])}?`
            : undefined
        }
        onClose={() => setPendingDeleteUser(null)}
        actions={[
          {
            label: 'Cancel',
            onPress: () => setPendingDeleteUser(null),
          },
          {
            label: 'Delete',
            onPress: () => {
              if (!pendingDeleteUser) return;
              const userId = pickNumber(pendingDeleteUser, ['id']);
              setPendingDeleteUser(null);
              void deleteMutation.mutateAsync(userId);
            },
            destructive: true,
          },
        ]}
      />

      <FloatingActionButton icon="plus" label="Create user" onPress={() => setShowCreate(true)} />

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create user</Text>
              {ldapEnabled ? (
                <InlineTabBar
                  value={createMode}
                  tabs={[
                    { key: 'local', label: advancedAuthEnabled ? 'Email invite' : 'Local' },
                    { key: 'ldap', label: 'LDAP' },
                  ]}
                  onChange={value => setCreateMode(value as CreateMode)}
                />
              ) : null}

              {createMode === 'ldap' ? (
                <View style={styles.ldapSection}>
                  <TextField label="Search LDAP" value={ldapQuery} onChangeText={setLdapQuery} placeholder="Type at least 2 characters" />
                  {(ldapSearchQuery.data as ApiRecord[] | undefined)?.map(result => {
                    const selected = selectedLdap && pickString(selectedLdap, ['dn']) === pickString(result, ['dn']);
                    const disabled = pickBoolean(result, ['already_provisioned']);
                    return (
                      <Pressable
                        key={pickString(result, ['dn'])}
                        onPress={() => !disabled && setSelectedLdap(result)}
                        style={[
                          styles.ldapRow,
                          {
                            backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                            borderColor: selected ? colors.accent : colors.border,
                            opacity: disabled ? 0.5 : 1,
                          },
                        ]}
                      >
                        <View style={styles.cardText}>
                          <Text style={[styles.name, { color: colors.text }]}>{pickString(result, ['username'])}</Text>
                          <Text style={[styles.email, { color: colors.textSecondary }]}>{pickString(result, ['email'], pickString(result, ['display_name'], 'No email'))}</Text>
                        </View>
                        {disabled ? <StatusBadge label="Provisioned" color={colors.textTertiary} /> : null}
                      </Pressable>
                    );
                  })}
                  <View style={styles.modalActions}>
                    <PrimaryButton label="Cancel" variant="secondary" onPress={resetCreateState} />
                    <PrimaryButton
                      label={provisionLdapMutation.isPending ? 'Provisioning…' : 'Provision LDAP user'}
                      onPress={() =>
                        selectedLdap &&
                        void provisionLdapMutation.mutateAsync(pickString(selectedLdap, ['username']))
                      }
                      disabled={!selectedLdap || provisionLdapMutation.isPending}
                      loading={provisionLdapMutation.isPending}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <TextField label="Username" value={form.username} onChangeText={value => setForm(current => ({ ...current, username: value }))} />
                  <TextField label="Email" value={form.email} onChangeText={value => setForm(current => ({ ...current, email: value }))} placeholder="user@example.com" keyboardType="email-address" />
                  {!advancedAuthEnabled ? (
                    <>
                      <TextField label="Password" value={form.password} onChangeText={value => setForm(current => ({ ...current, password: value }))} secureTextEntry />
                      <TextField label="Confirm password" value={form.confirmPassword} onChangeText={value => setForm(current => ({ ...current, confirmPassword: value }))} secureTextEntry />
                    </>
                  ) : (
                    <Text style={[styles.helper, { color: colors.textSecondary }]}>A secure password will be generated and emailed to the user.</Text>
                  )}

                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Groups</Text>
                  <View style={styles.groupWrap}>
                    {groups.map(group => {
                      const groupId = pickNumber(group, ['id']);
                      const selected = form.groupIds.includes(groupId);
                      return (
                        <Pressable
                          key={groupId}
                          onPress={() => toggleGroup(groupId)}
                          style={[
                            styles.groupChip,
                            {
                              backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                              borderColor: selected ? colors.accent : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.groupLabel, { color: selected ? colors.accentLight : colors.textSecondary }]}>{pickString(group, ['name'], 'Group')}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.modalActions}>
                    <PrimaryButton label="Cancel" variant="secondary" onPress={resetCreateState} />
                    <PrimaryButton
                      label={createMutation.isPending ? 'Creating…' : 'Create user'}
                      onPress={() => void createMutation.mutateAsync()}
                      disabled={isCreateDisabled || createMutation.isPending}
                      loading={createMutation.isPending}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showEdit} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit user</Text>
              <TextField label="Username" value={form.username} onChangeText={value => setForm(current => ({ ...current, username: value }))} />
              <TextField label="Email" value={form.email} onChangeText={value => setForm(current => ({ ...current, email: value }))} placeholder="user@example.com" keyboardType="email-address" />
              <TextField label="New password" value={form.password} onChangeText={value => setForm(current => ({ ...current, password: value, confirmPassword: '' }))} secureTextEntry />
              {form.password ? (
                <TextField label="Confirm password" value={form.confirmPassword} onChangeText={value => setForm(current => ({ ...current, confirmPassword: value }))} secureTextEntry />
              ) : null}

              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Groups</Text>
              <View style={styles.groupWrap}>
                {groups.map(group => {
                  const groupId = pickNumber(group, ['id']);
                  const selected = form.groupIds.includes(groupId);
                  return (
                    <Pressable
                      key={groupId}
                      onPress={() => toggleGroup(groupId)}
                      style={[
                        styles.groupChip,
                        {
                          backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                          borderColor: selected ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.groupLabel, { color: selected ? colors.accentLight : colors.textSecondary }]}>{pickString(group, ['name'], 'Group')}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={closeEdit} />
                <PrimaryButton
                  label={updateMutation.isPending ? 'Saving…' : 'Save changes'}
                  onPress={() => void updateMutation.mutateAsync()}
                  disabled={isEditDisabled || updateMutation.isPending}
                  loading={updateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GroupEditModal
        visible={showGroupEdit}
        onClose={() => setShowGroupEdit(false)}
        groupId={editGroupId}
      />

      <ConfirmModal
        visible={deleteGroupId != null}
        onClose={() => setDeleteGroupId(null)}
        onConfirm={() => deleteGroupId && deleteGroupMutation.mutate(deleteGroupId)}
        title="Delete Group"
        message="Are you sure you want to delete this group? Users in this group will lose their permissions."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteGroupMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 96,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  email: {
    fontSize: fontSize.sm,
  },
  metaBlock: {
    gap: spacing.xs,
  },
  meta: {
    fontSize: fontSize.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '90%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  groupWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  groupLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  groupsSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  groupsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  groupsSectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  groupAddBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  groupName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  groupMeta: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs / 2,
  },
  groupActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  groupActionBtn: {
    padding: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ldapSection: {
    gap: spacing.md,
  },
  ldapRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
});
