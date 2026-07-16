import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { EmptyState } from '@/components/common/StateScreens';
import { pickRecordArray, pickString, type ApiRecord } from '@/utils/data';

export default function MakerWorldScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'MakerWorld' });
  }, [navigation]);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [resolved, setResolved] = useState<ApiRecord | null>(null);

  const recentQuery = useQuery({
    queryKey: ['makerworldRecentImports'],
    queryFn: () => api.getMakerworldRecentImports(),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveMakerworldUrl(url.trim()),
    onSuccess: data => {
      setResolved(data as ApiRecord);
      showToast('Model resolved successfully.', 'success');
    },
    onError: () => showToast('Could not resolve that MakerWorld URL.', 'error'),
  });

  const importMutation = useMutation({
    mutationFn: (plateIndex?: number) =>
      api.importMakerworldPlate({ url: url.trim(), plate_index: plateIndex }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['makerworldRecentImports'],
      });
      showToast('MakerWorld import started.', 'success');
    },
    onError: () => showToast('Import failed.', 'error'),
  });

  const plates = useMemo(
    () => pickRecordArray(resolved, ['plates', 'items']),
    [resolved],
  );
  const recentImports = (recentQuery.data ?? []) as ApiRecord[];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={recentQuery.isRefetching}
          onRefresh={() => void recentQuery.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <SectionCard
        title="Import from MakerWorld"
        subtitle="Paste a MakerWorld model link to resolve and import plates into Bambuddy."
      >
        <TextField
          label="MakerWorld URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PrimaryButton
          label={resolveMutation.isPending ? 'Resolving…' : 'Resolve Model'}
          onPress={() => void resolveMutation.mutateAsync()}
          loading={resolveMutation.isPending}
          disabled={url.trim().length === 0}
        />
      </SectionCard>

      {resolved ? (
        <SectionCard
          title={pickString(resolved, ['name', 'title'], 'MakerWorld Model')}
          subtitle={`${
            plates.length || pickString(resolved, ['plate_count'], '0')
          } plates available`}
        >
          <Image
            source={{
              uri: pickString(resolved, ['image', 'thumbnail_url', 'cover']),
            }}
            style={styles.previewImage}
          />
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {pickString(
              resolved,
              ['description', 'summary'],
              'No preview description available.',
            )}
          </Text>
          <View style={styles.buttonGroup}>
            <PrimaryButton
              label={
                importMutation.isPending ? 'Importing…' : 'Import First Plate'
              }
              onPress={() => void importMutation.mutateAsync(0)}
              loading={importMutation.isPending}
            />
            {plates.slice(1, 4).map((plate, index) => (
              <PrimaryButton
                key={index}
                label={`Import ${pickString(
                  plate,
                  ['name'],
                  `Plate ${index + 2}`,
                )}`}
                onPress={() => void importMutation.mutateAsync(index + 1)}
                variant="secondary"
              />
            ))}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Recent Imports">
        {recentImports.length > 0 ? (
          recentImports.map(item => (
            <View
              key={pickString(
                item,
                ['id', 'request_id'],
                Math.random().toString(),
              )}
              style={[
                styles.recentCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.recentTitle, { color: colors.text }]}>
                {pickString(item, ['name', 'model_name'], 'MakerWorld Import')}
              </Text>
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
              >
                {pickString(item, ['status', 'result'], 'Pending')}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState
            icon="🌐"
            title="No recent imports"
            message="Resolved MakerWorld models you import will appear here."
          />
        )}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.xl,
    backgroundColor: '#111827',
  },
  description: { fontSize: fontSize.sm, lineHeight: 20 },
  buttonGroup: { gap: spacing.md },
  recentCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  recentTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
