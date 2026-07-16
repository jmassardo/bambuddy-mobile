// Navigation type definitions for all screens and params

export type RootStackParamList = {
  ServerSetup: undefined;
  Login: undefined;
  Main: undefined;
  PrinterDetail: { id: number };
  ArchiveDetail: { id: number };
  ProjectDetail: { id: number };
  Camera: { id: number };
  Scanner: undefined;
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

export type MainTabParamList = {
  Dashboard: undefined;
  Queue: undefined;
  Archives: undefined;
  Files: undefined;
  More: undefined;
};
