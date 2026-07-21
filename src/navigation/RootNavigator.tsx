// Root navigator handles auth gating and screen stack
// Pattern: ServerSetup -> Login -> Main (tabs) + modal screens

import React, { useCallback, useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { useServerStore } from '@/api/server';
import { PrimaryButton } from '@/components/common/AppUI';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

import MainNavigator from './MainNavigator';
import ServerSetupScreen from '@/screens/ServerSetupScreen';
import LoginScreen from '@/screens/LoginScreen';
import PrinterDetailScreen from '@/screens/PrinterDetailScreen';
import ArchiveDetailScreen from '@/screens/ArchiveDetailScreen';
import ProjectDetailScreen from '@/screens/ProjectDetailScreen';
import CameraScreen from '@/screens/CameraScreen';
import ScannerScreen from '@/screens/ScannerScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import SetupScreen from '@/screens/SetupScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import InventoryScreen from '@/screens/InventoryScreen';
import MaintenanceScreen from '@/screens/MaintenanceScreen';
import MakerWorldScreen from '@/screens/MakerWorldScreen';
import ProfilesScreen from '@/screens/ProfilesScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import StatsScreen from '@/screens/StatsScreen';
import SystemScreen from '@/screens/SystemScreen';
import UsersScreen from '@/screens/UsersScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function BiometricLockOverlay({
  biometricLabel,
  onUnlock,
}: {
  biometricLabel: string;
  onUnlock: () => Promise<boolean>;
}) {
  const theme = useTheme();
  const [authenticating, setAuthenticating] = useState(false);

  const unlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      await onUnlock();
    } finally {
      setAuthenticating(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    void unlock();
  }, [unlock]);

  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}> 
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }]}> 
        <Text style={[styles.title, { color: theme.colors.text }]}>App Locked</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}> 
          Unlock Bambuddy with {biometricLabel} to continue.
        </Text>
        <PrimaryButton
          label={`Unlock with ${biometricLabel}`}
          onPress={() => {
            void unlock();
          }}
          loading={authenticating}
        />
      </View>
    </View>
  );
}

export default function RootNavigator() {
  const { user, authEnabled, loading, requiresSetup } = useAuth();
  const serverUrl = useServerStore((s) => s.serverUrl);
  const serverLoading = useServerStore((s) => s.loading);
  const theme = useTheme();
  const {
    authenticate,
    enabled: biometricEnabled,
    getBiometricLabel,
    isUnlocked,
    loading: biometricLoading,
  } = useBiometricAuth();

  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.text,
    headerTitleStyle: { color: theme.colors.text },
    contentStyle: { backgroundColor: theme.colors.background },
  };

  // Still hydrating server URL from storage
  if (serverLoading) return null;

  // No server configured yet
  if (!serverUrl) {
    return (
      <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
        <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
        <Stack.Screen name="Scanner" component={ScannerScreen} />
      </Stack.Navigator>
    );
  }

  // Loading auth state
  if (loading || biometricLoading) return null;

  // Server requires first-time setup
  if (requiresSetup) {
    return (
      <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
        <Stack.Screen name="Setup" component={SetupScreen} />
      </Stack.Navigator>
    );
  }

  // Auth enabled but not logged in
  if (authEnabled && !user) {
    return (
      <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  // Authenticated (or auth disabled) show main app
  return (
    <>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="Main"
          component={MainNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PrinterDetail"
          component={PrinterDetailScreen}
          options={{ title: 'Printer' }}
        />
        <Stack.Screen
          name="ArchiveDetail"
          component={ArchiveDetailScreen}
          options={{ title: 'Archive' }}
        />
        <Stack.Screen
          name="ProjectDetail"
          component={ProjectDetailScreen}
          options={{ title: 'Project' }}
        />
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: 'Camera', headerShown: false }}
        />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: 'QR Scanner' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />
        <Stack.Screen
          name="Inventory"
          component={InventoryScreen}
          options={{ title: 'Inventory' }}
        />
        <Stack.Screen
          name="Maintenance"
          component={MaintenanceScreen}
          options={{ title: 'Maintenance' }}
        />
        <Stack.Screen
          name="MakerWorld"
          component={MakerWorldScreen}
          options={{ title: 'MakerWorld' }}
        />
        <Stack.Screen
          name="Profiles"
          component={ProfilesScreen}
          options={{ title: 'Profiles' }}
        />
        <Stack.Screen
          name="Projects"
          component={ProjectsScreen}
          options={{ title: 'Projects' }}
        />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          options={{ title: 'Statistics' }}
        />
        <Stack.Screen
          name="System"
          component={SystemScreen}
          options={{ title: 'System' }}
        />
        <Stack.Screen
          name="Users"
          component={UsersScreen}
          options={{ title: 'Users' }}
        />
      </Stack.Navigator>
      {biometricEnabled && !isUnlocked ? (
        <BiometricLockOverlay
          biometricLabel={getBiometricLabel()}
          onUnlock={authenticate}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
});
