import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import { localizedStatus } from '@/utils/statusLabel';


import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Users'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('nav.users') });
  }, [navigation, titleLocale]);

  const { colors } = useTheme();
  const { authEnabled, isAdmin, user: currentUser, hasPermission } = useAuth();
  const canRead = hasPermission('users:read');
  const canReadGroups = hasPermission('groups:read');
  const canAdminister = !authEnabled || isAdmin;
  const canCreateUser = canAdminister && hasPermission('users:create');
  const canUpdateUser = canAdminister && hasPermission('users:update');
  const canDeleteUser = canAdminister && hasPermission('users:delete');
  const canCreateGroup = canAdminister && hasPermission('groups:create');
  const canUpdateGroup = canAdminister && hasPermission('groups:update');
  const canDeleteGroup = canAdminister && hasPermission('groups:delete');
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
    enabled: canRead,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.getGroups(),
    enabled: canReadGroups,
  });
  const advancedAuthQuery = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: () => api.getAdvancedAuthStatus(),
    enabled: canRead,
  });
  const ldapStatusQuery = useQuery({
    queryKey: ['ldapStatus'],
    queryFn: () => api.getLDAPStatus(),
    enabled: canRead,
  });
  const ldapSearchQuery = useQuery({
    queryKey: ['ldapSearch', ldapQuery],
    queryFn: () => api.searchLDAPDirectory(ldapQuery.trim()),
    enabled: canCreateUser && showCreate && createMode === 'ldap' && ldapQuery.trim().length >= 2,
  });

  const refreshAll = async () => {
    await Promise.all([
      usersQuery.refetch(),
      ...(canReadGroups ? [groupsQuery.refetch()] : []),
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
      showToast(nativeMessage('native.1b83329311564cd5'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.5f08a22f988b47b6'), 'error'),
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
      showToast(nativeMessage('native.0c147492b47fcf9e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d73761ce692dd794'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.deleteUser(userId),
    onSuccess: async () => {
      await invalidateUsers();
      showToast(nativeMessage('native.49427fd128a5a9b7'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.b9bd4a803eab5aea'), 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: number) => api.resetUserPassword({ user_id: userId }),
    onSuccess: data => showToast(pickString(data, ['message'], nativeMessage('native.d0604eb29f05821f')), 'success'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.55fde6654e6acd96'), 'error'),
  });

  const provisionLdapMutation = useMutation({
    mutationFn: (username: string) => api.provisionLDAPUser(username),
    onSuccess: async data => {
      await invalidateUsers();
      resetCreateState();
      showToast(nativeMessage('native.251d74fd49246426', () => ({ value0: String(pickString(data, ['username'], translateNative('native.54112fb1f004c9ee'))) })), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.eae083d66bd13878'), 'error'),
  });

  const users = useLocalizedMemo(() => ((usersQuery.data ?? []) as ApiRecord[]), [usersQuery.data]);
  const groups = useLocalizedMemo(() => ((canReadGroups ? groupsQuery.data ?? [] : []) as ApiRecord[]), [canReadGroups, groupsQuery.data]);
  const advancedAuthEnabled = pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled'], false);
  const ldapEnabled = pickBoolean(ldapStatusQuery.data, ['ldap_enabled'], false);
  const isCreateDisabled = useLocalizedMemo(() => {
    if (!form.username.trim()) return true;
    if (advancedAuthEnabled) return !form.email.trim();
    return form.password.length < 6 || form.password !== form.confirmPassword;
  }, [advancedAuthEnabled, form]);
  const isEditDisabled = useLocalizedMemo(() => {
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
      showToast(nativeMessage('native.2e6143709b1a2452'), 'success');
      setDeleteGroupId(null);
    },
    onError: (e: Error) => showToast(e.message || nativeMessage('native.0f33269c89fb3ba3'), 'error'),
  });

  if (!canRead) {
    return (
      <EmptyState
        icon="🛡"
        title={translateNative('native.e64faa96106d2ea3')}
        message={translateNative('native.dfaf6026acd8feeb')}
      />
    );
  }

  if (usersQuery.isLoading || (canReadGroups && groupsQuery.isLoading)) {
    return <LoadingScreen message={translateNative('native.30fb5ac9c6663286')} />;
  }

  if (usersQuery.isError || (canReadGroups && groupsQuery.isError)) {
    return (
      <ErrorState
        message={translateNative('native.aa11dd58c9f6ac20')}
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
        ItemSeparatorComponent={UsersItemSeparator}
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
                  <Text style={[styles.name, { color: colors.text }]}>{pickString(item, ['username'], translateNative('native.4cb2955dec6a0e41'))}</Text>
                  <Text style={[styles.email, { color: colors.textSecondary }]}>{pickString(item, ['email'], translateNative('native.f191acf23a08048e'))}</Text>
                </View>
                <StatusBadge label={localizedStatus(role)} color={statusColor(role, colors)} />
              </View>

              <View style={styles.metaBlock}>
                <Text style={[styles.meta, { color: colors.textSecondary }]}><NativeTranslation id="native.b08fc17853bc384b" values={{ value0: (groupNames || 'None') }} /></Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{translateNative('native.79236fcebf0a8b1d')}{pickBoolean(item, ['is_active'], true) ? translateNative('native.338a8c40557b22a0') : translateNative('native.e4288d9846e01891')}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}><NativeTranslation id="native.017f814118bfa2ec" values={{ value0: (formatDateTime(pickString(item, ['last_login']))) }} /></Text>
              </View>

              <View style={styles.actions}>
                {canUpdateUser ? <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={() => openEdit(item)} /> : null}
                {isAdmin && pickNumber(item, ['id']) !== pickNumber(currentUser, ['id']) ? (
                  <PrimaryButton
                    label={resetPasswordMutation.isPending ? translateNative('native.cc1642fca0298ffc') : translateNative('native.3ffb98cec8b0e01b')}
                    variant="secondary"
                    disabled={resetPasswordMutation.isPending}
                    loading={resetPasswordMutation.isPending}
                    onPress={() => Alert.alert(
                      translateNative('native.3ffb98cec8b0e01b'),
                      pickString(item, ['username']),
                      [
                        { text: translateNative('common.cancel'), style: 'cancel' },
                        { text: translateNative('native.3ffb98cec8b0e01b'), style: 'destructive', onPress: () => resetPasswordMutation.mutate(pickNumber(item, ['id'])) },
                      ],
                    )}
                  />
                ) : null}
                {canDeleteUser && pickNumber(item, ['id']) !== pickNumber(currentUser, ['id']) ? (
                  <PrimaryButton
                    label={translateNative('common.delete')}
                    variant="danger"
                    onPress={() => setPendingDeleteUser(item)}
                  />
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="👥" title={translateNative('native.559a834c47b1b78c')} message={translateNative('native.98fdd8adc965a6d3')} />}
        ListFooterComponent={
          canReadGroups ? <View style={[styles.groupsSection, { borderTopColor: colors.borderSubtle }]}>
            <View style={styles.groupsSectionHeader}>
              <Text style={[styles.groupsSectionTitle, { color: colors.text }]}>{translateNative('native.66f53452f7bc5afc')}</Text>
              <Pressable
                disabled={!canCreateGroup}
                onPress={() => { setEditGroupId(null); setShowGroupEdit(true); }}
                style={[styles.groupAddBtn, { backgroundColor: colors.accent }]}
                accessibilityLabel={translateNative('native.c706494d805923fb')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canCreateGroup }}
                hitSlop={10}
              >
                <Plus size={14} color={colors.textInverse} strokeWidth={2.5} />
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
                      {permCount} {translateNative('native.49f9cf11734c50af')}{isSystem ? translateNative('native.5a86e9d8906c547c') : ''}
                    </Text>
                  </View>
                  <View style={styles.groupActions}>
                    <Pressable disabled={!canUpdateGroup} onPress={() => { setEditGroupId(gId); setShowGroupEdit(true); }} style={styles.groupActionBtn} accessibilityLabel={translateNative('native.e49ab65dcc95ff22')} accessibilityRole="button" accessibilityState={{ disabled: !canUpdateGroup }}>
                      <Edit2 size={14} color={colors.textSecondary} />
                    </Pressable>
                    {!isSystem && canDeleteGroup && (
                      <Pressable onPress={() => setDeleteGroupId(gId)} style={styles.groupActionBtn} accessibilityLabel={translateNative('native.0c7a76cc9819a759')} accessibilityRole="button">
                        <Trash2 size={14} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }) : (
              <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>{translateNative('native.bc03de1933cfdc7c')}</Text>
            )}
          </View> : null
        }
      />

      <ActionSheetModal
        visible={canDeleteUser && pendingDeleteUser != null}
        title={translateNative('native.d6df329a121486fe')}
        subtitle={
          pendingDeleteUser
            ? translateNative('native.3e132ab74d3e7e22', { value0: String(pickString(pendingDeleteUser, ['username'])) })
            : undefined
        }
        onClose={() => setPendingDeleteUser(null)}
        actions={[
          {
            get label() { return translateNative('common.cancel'); },
            onPress: () => setPendingDeleteUser(null),
          },
          {
            get label() { return translateNative('common.delete'); },
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

      {canCreateUser ? <FloatingActionButton icon="plus" label={translateNative('native.7d75125ed0d1c636')} onPress={() => setShowCreate(true)} /> : null}

      <Modal visible={showCreate && canCreateUser} animationType="slide" transparent onRequestClose={resetCreateState}>
        <SafeAreaProvider style={styles.container}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>{translateNative('native.7d75125ed0d1c636')}</Text>
              {ldapEnabled && canCreateUser ? (
                <InlineTabBar
                  value={createMode}
                  tabs={[
                    { key: 'local', label: advancedAuthEnabled ? translateNative('native.6803ed8404a0f762') : translateNative('native.3df9c3407ef31a85') },
                    { key: 'ldap', label: 'LDAP' },
                  ]}
                  onChange={value => setCreateMode(value as CreateMode)}
                />
              ) : null}

              {createMode === 'ldap' ? (
                <View style={styles.ldapSection}>
                  <TextField label={translateNative('native.210759e4a7699b94')} value={ldapQuery} onChangeText={setLdapQuery} placeholder={translateNative('native.1f6c3cea3c9e60bc')} />
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
                          <Text style={[styles.email, { color: colors.textSecondary }]}>{pickString(result, ['email'], pickString(result, ['display_name'], translateNative('native.f191acf23a08048e')))}</Text>
                        </View>
                        {disabled ? <StatusBadge label={translateNative('native.4f51a43580df39cf')} color={colors.textTertiary} /> : null}
                      </Pressable>
                    );
                  })}
                  <View style={styles.modalActions}>
                    <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={resetCreateState} />
                    <PrimaryButton
                      label={provisionLdapMutation.isPending ? translateNative('native.2841f6f297bca17d') : translateNative('native.d37a30c44a70e18d')}
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
                  <TextField label={translateNative('native.f503af8b2bf430e6')} value={form.username} onChangeText={value => setForm(current => ({ ...current, username: value }))} />
                  <TextField label={translateNative('native.6d96e259f012a733')} value={form.email} onChangeText={value => setForm(current => ({ ...current, email: value }))} placeholder="user@example.com" keyboardType="email-address" />
                  {!advancedAuthEnabled ? (
                    <>
                      <TextField label={translateNative('native.08c9c68cc706272f')} value={form.password} onChangeText={value => setForm(current => ({ ...current, password: value }))} secureTextEntry />
                      <TextField label={translateNative('native.40d2f662e19a7553')} value={form.confirmPassword} onChangeText={value => setForm(current => ({ ...current, confirmPassword: value }))} secureTextEntry />
                    </>
                  ) : (
                    <Text style={[styles.helper, { color: colors.textSecondary }]}>{translateNative('native.050018859acf4161')}</Text>
                  )}

                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{translateNative('native.66f53452f7bc5afc')}</Text>
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
                    <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={resetCreateState} />
                    <PrimaryButton
                      label={createMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.7d75125ed0d1c636')}
                      onPress={() => void createMutation.mutateAsync()}
                      disabled={isCreateDisabled || createMutation.isPending}
                      loading={createMutation.isPending}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>

      <Modal visible={showEdit && canUpdateUser} animationType="slide" transparent onRequestClose={closeEdit}>
        <SafeAreaProvider style={styles.container}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>{translateNative('native.ba0406d32c9fd83e')}</Text>
              <TextField label={translateNative('native.f503af8b2bf430e6')} value={form.username} onChangeText={value => setForm(current => ({ ...current, username: value }))} />
              <TextField label={translateNative('native.6d96e259f012a733')} value={form.email} onChangeText={value => setForm(current => ({ ...current, email: value }))} placeholder="user@example.com" keyboardType="email-address" />
              <TextField label={translateNative('native.e7fd2f088551a901')} value={form.password} onChangeText={value => setForm(current => ({ ...current, password: value, confirmPassword: '' }))} secureTextEntry />
              {form.password ? (
                <TextField label={translateNative('native.40d2f662e19a7553')} value={form.confirmPassword} onChangeText={value => setForm(current => ({ ...current, confirmPassword: value }))} secureTextEntry />
              ) : null}

              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{translateNative('native.66f53452f7bc5afc')}</Text>
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
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={closeEdit} />
                <PrimaryButton
                  label={updateMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.9d405330309a30e5')}
                  onPress={() => void updateMutation.mutateAsync()}
                  disabled={isEditDisabled || updateMutation.isPending}
                  loading={updateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>

      <GroupEditModal
        visible={showGroupEdit && (editGroupId == null ? canCreateGroup : canUpdateGroup)}
        onClose={() => setShowGroupEdit(false)}
        groupId={editGroupId}
      />

      <ConfirmModal
        visible={canDeleteGroup && deleteGroupId != null}
        onClose={() => setDeleteGroupId(null)}
        onConfirm={() => deleteGroupId && deleteGroupMutation.mutate(deleteGroupId)}
        title={translateNative('native.a6061480db846f65')}
        message={translateNative('native.1d3608dd89db1fc8')}
        confirmLabel={translateNative('common.delete')}
        variant="danger"
        loading={deleteGroupMutation.isPending}
      />
    </View>
  );
}

function UsersItemSeparator() {
  useNativeLocale();
  return <View style={{ height: spacing.md }} />;
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
    minHeight: 48,
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
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
