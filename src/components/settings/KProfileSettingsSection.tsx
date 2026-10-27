import React from 'react';
import { KProfileManager } from '@/components/profiles/KProfileManager';
import type { SettingsScreenController } from './useSettingsScreenController';

export const KProfileSettingsSection: React.FC<{ controller: SettingsScreenController }> = () => <KProfileManager />;
