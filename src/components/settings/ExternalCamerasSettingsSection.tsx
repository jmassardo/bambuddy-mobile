import { useNativeLocale } from '@/i18n';
import React from 'react';
import type { SettingsScreenController } from './useSettingsScreenController';
import { PrinterCameraSettingsSection } from './PrinterCameraSettingsSection';

export function ExternalCamerasSettingsSection(_props: { controller: SettingsScreenController }) {
  useNativeLocale();
  return <PrinterCameraSettingsSection />;
}
