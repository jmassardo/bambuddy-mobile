import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type {
  CompositeNavigationProp,
  NavigatorScreenParams,
  RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Navigation type definitions for all screens and params

export type MainTabParamList = {
  Dashboard: undefined;
  Queue: undefined;
  Archives: undefined;
  Files: { folderId?: number; fileId?: number; projectId?: number } | undefined;
  More: undefined;
};

export type RootStackParamList = {
  ServerSetup: undefined;
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  PrinterDetail: { id: number | string };
  ArchiveDetail: { id: number | string };
  ProjectDetail: { id: number | string };
  Camera: { id: number | string };
  CameraWall: undefined;
  CameraIntegrations: undefined;
  Announcements: { id?: string } | undefined;
  Scanner: { mode?: string } | undefined;
  Settings: undefined;
  Setup: undefined;
  Notifications: undefined;
  Inventory: { spool?: string } | undefined;
  Maintenance: undefined;
  MakerWorld: undefined;
  Profiles: undefined;
  Projects: undefined;
  Stats: undefined;
  System: undefined;
  Users: undefined;
  Energy: undefined;
  Finance: undefined;
  SlicerPipelines: undefined;
  PipelineRuns: undefined;
  VirtualPrinters: undefined;
  SpoolBuddy: undefined;
  ExternalLinkBrowser: { url: string; title?: string };
  Model3DPreview: {
    fileId?: number;
    archiveId?: number;
    filename: string;
    fileUrl?: string;
    fileSize?: number;
    source3mfPath?: string;
  };
  FailureAnalysis: undefined;
  WebSocketStatus: undefined;
  TimelapseEditor: { archiveId: number };
  PrintLog: { archiveId?: number } | undefined;
  SpoolAssignmentHistory: undefined;
  ConnectAuthorize: {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: 'S256';
    state?: string;
  };
};

export type RootNavigationProp<
  T extends keyof RootStackParamList = keyof RootStackParamList,
> = NativeStackNavigationProp<RootStackParamList, T>;

export type MainTabNavigationProp<
  T extends keyof MainTabParamList = keyof MainTabParamList,
> = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type RootRouteProp<T extends keyof RootStackParamList> = RouteProp<
  RootStackParamList,
  T
>;

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;
