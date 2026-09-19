import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTheme } from '@/theme';
import {
  fontSize,
  fontWeight,
  spacing,
  borderRadius,
} from '@/theme/tokens';
import { PrimaryButton, StatusBadge } from '@/components/common/AppUI';

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export default function WebSocketStatusScreen() {
  const navigation = useNavigation<RootNavigationProp<'WebSocketStatus'>>();
  const { colors } = useTheme();

  const { isConnected, isReconnecting, errors, clearErrors } = useWebSocket();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, _setAutoRefreshEnabled] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'WebSocket Status' });
  }, [navigation]);

  const connectionState: ConnectionState = useMemo(() => {
    if (isConnected) return 'connected';
    if (isReconnecting) return 'reconnecting';
    return 'disconnected';
  }, [isConnected, isReconnecting]);

  const connectionBadge = useMemo(() => {
    switch (connectionState) {
      case 'connected':
        return { label: 'Connected', color: colors.success };
      case 'reconnecting':
        return { label: 'Reconnecting', color: colors.warning };
      case 'disconnected':
        return { label: 'Disconnected', color: colors.error };
    }
  }, [connectionState, colors]);

  const recentErrors = useMemo(() => {
    return errors.slice(-10).reverse();
  }, [errors]);

  const handleReconnect = useCallback(() => {
    if (connectionState === 'connected') {
      Alert.alert(
        'WebSocket Status',
        'You are currently connected. Are you sure you want to disconnect and reconnect?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reconnect',
            style: 'destructive',
            onPress: () => {
              // Force a reconnection by unmounting/remounting the hook via navigation.
              navigation.goBack();
              setTimeout(() => {
                navigation.navigate('WebSocketStatus' as never);
              }, 100);
            },
          },
        ],
      );
    } else {
      navigation.goBack();
      setTimeout(() => {
        navigation.navigate('WebSocketStatus' as never);
      }, 100);
    }
  }, [connectionState, navigation]);

  const handleClearErrors = useCallback(() => {
    Alert.alert(
      'Clear Errors',
      'Are you sure you want to clear all WebSocket errors?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearErrors();
          },
        },
      ],
    );
  }, [clearErrors]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    navigation.goBack();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });
    void navigation.navigate('WebSocketStatus' as never);
    setIsRefreshing(false);
  }, [navigation]);

  // Auto-refresh every 5 seconds when disconnected
  useEffect(() => {
    if (!autoRefreshEnabled || connectionState !== 'disconnected') {
      return;
    }

    const interval = setInterval(() => {
      void handleRefresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, connectionState, handleRefresh]);

  const formatErrorTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>WebSocket Status</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Monitor your WebSocket connection to the Bambu server.
        </Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
            Connection State
          </Text>
          <StatusBadge label={connectionBadge.label} color={connectionBadge.color} />
        </View>

        {connectionState === 'reconnecting' && (
          <View style={styles.reconnectingIndicator}>
            <View style={[styles.reconnectingDot, { backgroundColor: colors.warning }]} />
            <Text style={[styles.reconnectingText, { color: colors.warning }]}>
              Attempting to reconnect…
            </Text>
          </View>
        )}

        {connectionState === 'disconnected' && (
          <View style={styles.disconnectedHint}>
            <Text style={[styles.disconnectedText, { color: colors.textSecondary }]}>
              Auto-refresh is {autoRefreshEnabled ? 'enabled' : 'disabled'}.
            </Text>
          </View>
        )}
      </View>

      {recentErrors.length > 0 && (
        <View style={styles.errorsCard}>
          <View style={styles.errorsHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Recent Errors ({recentErrors.length})
            </Text>
            <PrimaryButton
              label="Clear"
              variant="secondary"
              onPress={handleClearErrors}
            />
          </View>

          <View style={styles.errorsList}>
            {recentErrors.map((error, index) => (
              <View
                key={error.timestamp + '-' + index}
                style={[styles.errorItem, { borderColor: colors.border }]}
              >
                <View style={styles.errorHeader}>
                  <Text style={[styles.errorTime, { color: colors.textSecondary }]}>
                    {formatErrorTime(error.timestamp)}
                  </Text>
                  {error.attempt !== undefined && (
                    <Text style={[styles.errorAttempt, { color: colors.textSecondary }]}>
                      Attempt {error.attempt + 1}
                    </Text>
                  )}
                  {error.code !== undefined && (
                    <Text style={[styles.errorCode, { color: colors.textSecondary }]}>
                      Code {error.code}
                    </Text>
                  )}
                </View>
                <Text style={[styles.errorMessage, { color: colors.text }]}>{error.message}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label={connectionState === 'connected' ? 'Disconnect & Reconnect' : 'Reconnect'}
          variant={connectionState === 'connected' ? 'secondary' : 'primary'}
          onPress={handleReconnect}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  statusCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  reconnectingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reconnectingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reconnectingText: {
    fontSize: fontSize.sm,
  },
  disconnectedHint: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  disconnectedText: {
    fontSize: fontSize.sm,
  },
  errorsCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
  },
  errorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  errorsList: {
    gap: spacing.sm,
  },
  errorItem: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  errorTime: {
    fontSize: fontSize.xs,
  },
  errorAttempt: {
    fontSize: fontSize.xs,
  },
  errorCode: {
    fontSize: fontSize.xs,
  },
  errorMessage: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
  },
});
