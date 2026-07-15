import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { InlineTabBar } from '../../components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { formatDateTime, pickArray, pickId, pickString, type ApiRecord } from '../../utils/data';

type AdminTab = 'users' | 'groups';

function GroupRow({ group }: { group: ApiRecord }) {
  const { colors } = useTheme();
  const groupId = Number(pickId(group));
  const groupDetailQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
    enabled: Number.isFinite(groupId),
  });

  const detail = groupDetailQuery.data as ApiRecord | undefined;
  const users = pickArray(detail, ['users']).length;
  const permissions = pickArray(detail, ['permissions']).length;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <Text style={[styles.title, { color: colors.text }]}>{pickString(group, ['name'], 'Unnamed group')}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>Members: {users}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>Permissions: {permissions}</Text>
    </View>
  );
}

export default function UsersScreen() {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => api.getUsers(), enabled: isAdmin });
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => api.getGroups(), enabled: isAdmin });

  const activeQuery = tab === 'users' ? usersQuery : groupsQuery;
  const data = useMemo(() => ((activeQuery.data ?? []) as ApiRecord[]), [activeQuery.data]);

  if (!isAdmin) {
    return <EmptyState icon="🛡" title="Admin access required" message="Only administrators can view users and groups from the mobile app." />;
  }

  if (usersQuery.isLoading || groupsQuery.isLoading) {
    return <LoadingScreen message="Loading users and groups…" />;
  }

  if (activeQuery.isError) {
    return <ErrorState message="Unable to load this admin view." onRetry={() => void activeQuery.refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={data}
        keyExtractor={(item) => `${tab}-${pickId(item)}`}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => void activeQuery.refetch()} tintColor={colors.accent} />}
        ListHeaderComponent={<InlineTabBar value={tab} tabs={[{ key: 'users', label: 'Users' }, { key: 'groups', label: 'Groups' }]} onChange={setTab} />}
        renderItem={({ item }) => {
          if (tab === 'groups') return <GroupRow group={item} />;

          const groups = pickArray(item, ['groups']).map((group) => {
            if (typeof group === 'string') return group;
            if (typeof group === 'object' && group !== null && 'name' in group) return String((group as { name?: unknown }).name ?? '');
            return '';
          }).filter(Boolean).join(', ');

          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <Text style={[styles.title, { color: colors.text }]}>{pickString(item, ['username'], 'Unknown user')}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{pickString(item, ['email'], 'No email')}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Groups: {groups || 'None'}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Last login: {formatDateTime(pickString(item, ['last_login']))}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="👥" title={`No ${tab} found`} message="Create a user or group from the Bambuddy web app to manage it here." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  separator: { height: spacing.md },
  card: { borderWidth: 1, borderRadius: borderRadius.xl, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.sm },
});
