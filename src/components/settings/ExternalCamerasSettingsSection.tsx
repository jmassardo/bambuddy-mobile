import React from 'react';
import type { SettingsScreenController } from './useSettingsScreenController';
import { PrinterCameraSettingsSection } from './PrinterCameraSettingsSection';

export function ExternalCamerasSettingsSection(_props: { controller: SettingsScreenController }) {
  return <PrinterCameraSettingsSection />;
}
