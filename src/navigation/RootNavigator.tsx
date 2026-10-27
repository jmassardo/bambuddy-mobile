// Root navigator — handles auth gating and screen stack
// Pattern: ServerSetup → Login → Main (tabs) + modal screens

import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { useServerStore } from '@/api/server';
import { useTheme } from '@/theme';
import { useStreamToken } from '@/hooks/useStreamToken';
import { useTranslation } from '@/i18n';
import { useNavigationItems } from './useNavigationItems';
import { BUILT_IN_NAV_ITEMS, canAccessNavigationItem } from './navigationConfig';

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
import Model3DPreviewScreen from '@/screens/Model3DPreviewScreen';
import MakerWorldScreen from '@/screens/MakerWorldScreen';
import ProfilesScreen from '@/screens/ProfilesScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import StatsScreen from '@/screens/StatsScreen';
import SystemScreen from '@/screens/SystemScreen';
import UsersScreen from '@/screens/UsersScreen';
import EnergyScreen from '@/screens/EnergyScreen';
import VirtualPrintersScreen from '@/screens/VirtualPrintersScreen';
import SpoolBuddyScreen from '@/screens/SpoolBuddyScreen';
import ExternalLinkBrowserScreen from '@/screens/ExternalLinkBrowserScreen';
import FailureAnalysisScreen from '@/screens/FailureAnalysisScreen';
import WebSocketStatusScreen from '@/screens/WebSocketStatusScreen';
import TimelapseEditorScreen from '@/screens/TimelapseEditorScreen';
import PrintLogScreen from '@/screens/PrintLogScreen';
import SpoolAssignmentHistoryScreen from '@/screens/SpoolAssignmentHistoryScreen';
import AnnouncementsScreen from '@/screens/AnnouncementsScreen';
import CameraWallScreen from '@/screens/CameraWallScreen';
import CameraIntegrationsScreen from '@/screens/CameraIntegrationsScreen';
import FinanceScreen from '@/screens/FinanceScreen';
import ConnectAuthorizeScreen from '@/screens/ConnectAuthorizeScreen';
import { SlicerPipelinesScreen } from '@/screens/SlicerPipelinesScreen';
import { PipelineRunsScreen } from '@/screens/PipelineRunsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator({ entryReady = true }: { entryReady?: boolean }) {
  const { user, authEnabled, loading, requiresSetup, hasPermission } = useAuth();
  const serverUrl = useServerStore((s) => s.serverUrl);
  const serverLoading = useServerStore((s) => s.loading);
  const theme = useTheme();
  const { text } = useTranslation();
  const { access } = useNavigationItems();
  const canOpen = (route: keyof RootStackParamList) => {
    const item = BUILT_IN_NAV_ITEMS.find(candidate => candidate.stackRoute === route);
    return !item || canAccessNavigationItem(item, access);
  };
  const locksIPhoneToPortrait = Platform.OS === 'ios' && !Platform.isPad;

  // Fetch stream token for thumbnail/camera URLs (must be after auth)
  useStreamToken();

  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.text,
    headerTitleStyle: { color: theme.colors.text },
    headerBackTitle: text('Back'),
    contentStyle: { backgroundColor: theme.colors.background },
    ...(locksIPhoneToPortrait ? { orientation: 'portrait_up' as const } : {}),
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
  if (loading) return null;

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

  if (!entryReady) return null;

  // Authenticated (or auth disabled) — show main app
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainNavigator}
        options={{ headerShown: false }}
      />
      {hasPermission('printers:read') && <Stack.Screen
        name="PrinterDetail"
        component={PrinterDetailScreen}
        options={{ title: text('Printer') }}
      />}
      {canOpen('PrintLog') && <Stack.Screen
        name="ArchiveDetail"
        component={ArchiveDetailScreen}
        options={{ title: text('Archive') }}
      />}
      {canOpen('Projects') && <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{ title: text('Project') }}
      />}
      {hasPermission('camera:view') && <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
          ...(Platform.OS === 'ios'
            ? { presentation: 'fullScreenModal' as const }
            : {}),
          ...(locksIPhoneToPortrait ? { orientation: 'default' as const } : {}),
        }}
      />}
      <Stack.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{ title: text('QR Scanner') }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: text('Settings') }}
      />
      {canOpen('Notifications') && <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: text('Notifications') }}
      />}
      {canOpen('Inventory') && <Stack.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ title: text('Inventory') }}
      />}
      {canOpen('Maintenance') && <Stack.Screen
        name="Maintenance"
        component={MaintenanceScreen}
        options={{ title: text('Maintenance') }}
      />}
      {canOpen('MakerWorld') && <Stack.Screen
        name="MakerWorld"
        component={MakerWorldScreen}
        options={{ title: text('MakerWorld') }}
      />}
      {canOpen('Profiles') && <Stack.Screen
        name="Profiles"
        component={ProfilesScreen}
        options={{ title: text('Profiles') }}
      />}
      {canOpen('Projects') && <Stack.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ title: text('Projects') }}
      />}
      {canOpen('Stats') && <Stack.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: text('Statistics') }}
      />}
      {canOpen('System') && <Stack.Screen
        name="System"
        component={SystemScreen}
        options={{ title: text('System') }}
      />}
      {canOpen('Users') && <Stack.Screen
        name="Users"
        component={UsersScreen}
        options={{ title: text('Users') }}
      />}
      {canOpen('Energy') && <Stack.Screen
        name="Energy"
        component={EnergyScreen}
        options={{ title: text('Energy') }}
      />}
      {canOpen('VirtualPrinters') && <Stack.Screen
        name="VirtualPrinters"
        component={VirtualPrintersScreen}
        options={{ title: text('Virtual Printers') }}
      />}
      {canOpen('SpoolBuddy') && <Stack.Screen
        name="SpoolBuddy"
        component={SpoolBuddyScreen}
        options={{ title: text('SpoolBuddy') }}
      />}
      <Stack.Screen
        name="ExternalLinkBrowser"
        component={ExternalLinkBrowserScreen}
        options={{ title: text('External Link') }}
      />
      <Stack.Screen
        name="Model3DPreview"
        component={Model3DPreviewScreen}
        options={{ title: text('3D Preview') }}
      />
      {canOpen('FailureAnalysis') && <Stack.Screen
        name="FailureAnalysis"
        component={FailureAnalysisScreen}
        options={{ title: text('Failure Analysis') }}
      />}
      <Stack.Screen
        name="WebSocketStatus"
        component={WebSocketStatusScreen}
        options={{ title: text('WebSocket Status') }}
      />
      <Stack.Screen
        name="TimelapseEditor"
        component={TimelapseEditorScreen}
        options={{ title: text('Edit Timelapse') }}
      />
      {canOpen('PrintLog') && <Stack.Screen
        name="PrintLog"
        component={PrintLogScreen}
        options={{ title: text('Print Log') }}
      />}
      {hasPermission('inventory:view_assignments') && <Stack.Screen
        name="SpoolAssignmentHistory"
        component={SpoolAssignmentHistoryScreen}
        options={{ title: text('Assignment History') }}
      />}
      <Stack.Screen name="Announcements" component={AnnouncementsScreen} options={{ title: text('Announcements') }} />
      {canOpen('CameraWall') && <Stack.Screen name="CameraWall" component={CameraWallScreen} options={{ title: text('Camera Wall') }} />}
      {canOpen('CameraIntegrations') && <Stack.Screen name="CameraIntegrations" component={CameraIntegrationsScreen} options={{ title: text('Camera Integrations') }} />}
      {canOpen('SlicerPipelines') && <Stack.Screen name="SlicerPipelines" component={SlicerPipelinesScreen} options={{ title: text('Slicer Pipelines') }} />}
      {canOpen('PipelineRuns') && <Stack.Screen name="PipelineRuns" component={PipelineRunsScreen} options={{ title: text('Pipeline Runs') }} />}
      {canOpen('Finance') && <Stack.Screen name="Finance" component={FinanceScreen} options={{ title: text('Finance'), presentation: 'modal' }} />}
      {user && <Stack.Screen name="ConnectAuthorize" component={ConnectAuthorizeScreen} options={{ title: text('Connect') }} />}
    </Stack.Navigator>
  );
}
