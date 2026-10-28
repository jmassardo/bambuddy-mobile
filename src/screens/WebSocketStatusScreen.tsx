import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';
import React, { useCallback, useEffect, useState } from 'react';
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
import { formatPreferredTime } from '@/utils/preferences';

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export default function WebSocketStatusScreen() {
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'WebSocketStatus'>>();
  const { colors } = useTheme();

  const { isConnected, isReconnecting, errors, clearErrors } = useWebSocket();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, _setAutoRefreshEnabled] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('screen.websocketStatus') });
  }, [navigation, titleLocale]);

  const connectionState: ConnectionState = useLocalizedMemo(() => {
    if (isConnected) return 'connected';
    if (isReconnecting) return 'reconnecting';
    return 'disconnected';
  }, [isConnected, isReconnecting]);

  const connectionBadge = useLocalizedMemo(() => {
    switch (connectionState) {
      case 'connected':
        return { get label() { return translateNative('native.7a24d4ce1f2c4857'); }, color: colors.success };
      case 'reconnecting':
        return { get label() { return translateNative('native.832310d1b8ab2796'); }, color: colors.warning };
      case 'disconnected':
        return { get label() { return translateNative('native.22cd1cee4ce4b061'); }, color: colors.error };
    }
  }, [connectionState, colors]);

  const recentErrors = useLocalizedMemo(() => {
    return errors.slice(-10).reverse();
  }, [errors]);

  const handleReconnect = useCallback(() => {
    if (connectionState === 'connected') {
      Alert.alert(
        translateNative('screen.websocketStatus'),
        translateNative('native.e1c01220a6768583'),
        [
          { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
          {
            get text() { return translateNative('native.6192c91424256298'); },
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
      translateNative('native.a5ed31a85005df6b'),
      translateNative('native.b25423a76431bf94'),
      [
        { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
        {
          get text() { return translateNative('native.1f62863691c7afa1'); },
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
    return formatPreferredTime(new Date(timestamp), undefined, true);
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
        <Text style={[styles.title, { color: colors.text }]}>{translateNative('screen.websocketStatus')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.29559e3b4de82def')}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
            {translateNative('native.7fe604a336d7051b')}</Text>
          <StatusBadge label={connectionBadge.label} color={connectionBadge.color} />
        </View>

        {connectionState === 'reconnecting' && (
          <View style={styles.reconnectingIndicator}>
            <View style={[styles.reconnectingDot, { backgroundColor: colors.warning }]} />
            <Text style={[styles.reconnectingText, { color: colors.warning }]}>
              {translateNative('native.fbbf3c5a74c71561')}</Text>
          </View>
        )}

        {connectionState === 'disconnected' && (
          <View style={styles.disconnectedHint}>
            <Text style={[styles.disconnectedText, { color: colors.textSecondary }]}>
              {translateNative('native.8c9447bb1d2b8c55')}{autoRefreshEnabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}.
            </Text>
          </View>
        )}
      </View>

      {recentErrors.length > 0 && (
        <View style={styles.errorsCard}>
          <View style={styles.errorsHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}><NativeTranslation id="native.cfe8deb362907dd6" values={{ value0: (recentErrors.length) }} /></Text>
            <PrimaryButton
              label={translateNative('native.1f62863691c7afa1')}
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
                    <Text style={[styles.errorAttempt, { color: colors.textSecondary }]}><NativeTranslation id="native.5cf45cb1c7f94d45" values={{ value0: (error.attempt + 1) }} /></Text>
                  )}
                  {error.code !== undefined && (
                    <Text style={[styles.errorCode, { color: colors.textSecondary }]}><NativeTranslation id="native.962fe46b94c01fc5" values={{ value0: (error.code) }} /></Text>
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
          label={connectionState === 'connected' ? translateNative('native.03cdc606fb4f2bc3') : translateNative('native.6192c91424256298')}
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
