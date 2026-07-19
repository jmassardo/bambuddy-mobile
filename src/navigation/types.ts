// Navigation type definitions for all screens and params

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dashboard: undefined;
  Queue: undefined;
  Archives: undefined;
  Files: undefined;
  More: undefined;
};

export type RootStackParamList = {
  ServerSetup: undefined;
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  PrinterDetail: { id: number };
  ArchiveDetail: { id: number };
  ProjectDetail: { id: number };
  Camera: { id: number };
  Scanner: { mode?: string } | undefined;
  Settings: undefined;
  Setup: undefined;
  Notifications: undefined;
  Inventory: undefined;
  Maintenance: undefined;
  MakerWorld: undefined;
  Profiles: undefined;
  Projects: undefined;
  Stats: undefined;
  System: undefined;
  Users: undefined;
};

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;
