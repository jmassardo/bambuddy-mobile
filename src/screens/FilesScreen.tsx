import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DocumentPicker, { isCancel } from 'react-native-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { FloatingActionButton } from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import {
  fileIconName,
  formatDate,
  pickBoolean,
  pickId,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';
import { Icon } from '@/components/common/TabBarIcon';

interface FolderNode {
  id?: number;
  name: string;
}

export default function FilesScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Files' });
  }, [navigation]);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [folderStack, setFolderStack] = useState<FolderNode[]>([
    { name: 'Library' },
  ]);
  const currentFolder = folderStack.at(-1);

  const filesQuery = useQuery({
    queryKey: ['libraryFiles', currentFolder?.id ?? 'root'],
    queryFn: () => api.getLibraryFiles(currentFolder?.id),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      try {
        const asset = await DocumentPicker.pickSingle({
          type: [DocumentPicker.types.allFiles],
        });

        return api.uploadLibraryFile(
          {
            uri: asset.fileCopyUri ?? asset.uri,
            name: asset.name ?? 'upload',
            type: asset.type ?? 'application/octet-stream',
          },
          currentFolder?.id,
        );
      } catch (error) {
        if (isCancel(error)) return null;
        throw error;
      }
    },
    onSuccess: async data => {
      if (!data) return;
      showToast('File uploaded to library.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['libraryFiles'] });
    },
    onError: () => showToast('Upload failed. Please try again.', 'error'),
  });

  const files = useMemo(
    () => (filesQuery.data ?? []) as ApiRecord[],
    [filesQuery.data],
  );

  const handleOpen = (item: ApiRecord) => {
    const isFolder = pickBoolean(
      item,
      ['is_folder'],
      pickString(item, ['type', 'kind']) === 'folder',
    );
    if (isFolder) {
      setFolderStack(current => [
        ...current,
        {
          id: Number(pickId(item)),
          name: pickString(item, ['name'], 'Folder'),
        },
      ]);
      return;
    }

    showToast(`Selected ${pickString(item, ['name'], 'file')}`, 'info');
  };

  if (filesQuery.isLoading) {
    return <LoadingScreen message="Loading library files…" />;
  }

  if (filesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load your file library."
        onRetry={() => void filesQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={files}
        keyExtractor={item => pickId(item)}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={filesQuery.isRefetching}
            onRefresh={() => void filesQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.breadcrumbs}
          >
            {folderStack.map((folder, index) => (
              <Pressable
                key={`${folder.id ?? 'root'}-${folder.name}`}
                onPress={() => setFolderStack(folderStack.slice(0, index + 1))}
                style={[
                  styles.breadcrumb,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.breadcrumbText, { color: colors.text }]}>
                  {folder.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        }
        renderItem={({ item }) => {
          const name = pickString(item, ['name'], 'Unnamed');
          const isFolder = pickBoolean(
            item,
            ['is_folder'],
            pickString(item, ['type', 'kind']) === 'folder',
          );
          const size = pickNumber(item, ['size', 'size_bytes'], 0);
          const iconName = fileIconName(name, isFolder);
          return (
            <Pressable
              onPress={() => handleOpen(item)}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: colors.accentBg },
                ]}
              >
                <Icon name={iconName} size={20} color={colors.accentLight} />
              </View>
              <View style={styles.cardText}>
                <Text
                  style={[styles.name, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {isFolder
                    ? 'Folder'
                    : `${(size / 1024 / 1024).toFixed(
                        size > 0 ? 1 : 0,
                      )} MB`}{' '}
                  • {formatDate(pickString(item, ['updated_at', 'created_at']))}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="📁"
            title="This folder is empty"
            message="Upload a file or open another folder to get started."
          />
        }
      />
      <FloatingActionButton
        icon="upload"
        label={uploadMutation.isPending ? 'Uploading…' : 'Upload'}
        onPress={() => void uploadMutation.mutateAsync()}
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
  breadcrumbs: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  breadcrumb: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  breadcrumbText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  separator: { height: spacing.md },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    fontSize: fontSize.sm,
  },
});
