import React from 'react';
import { SectionCard, SettingRow, StatusBadge } from '@/components/common/AppUI';
import { summarize, SECTION_ITEMS } from './constants';
import type { SettingsScreenController } from './useSettingsScreenController';

export function SettingsSectionsList({ controller }: { controller: SettingsScreenController }) {
  return (
    <>
      {SECTION_ITEMS.map(item => (
        <SectionCard
          key={item.key}
          title={item.title}
          subtitle={item.description}
          right={<StatusBadge label={summarize(item.key, controller.derived.sectionSummaries)} color={controller.colors.accent} />}
        >
          <SettingRow
            icon={item.icon}
            label={`Open ${item.title}`}
            description={item.description}
            onPress={() => {
              controller.actions.setSection(item.key);
              if (item.key === 'users') {
                controller.actions.setUserPanel('auth');
              }
            }}
          />
        </SectionCard>
      ))}
    </>
  );
}
