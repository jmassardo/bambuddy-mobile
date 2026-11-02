import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { Text } from 'react-native';
import {
  SearchBar,
  SectionCard,
  SettingRow,
  StatusBadge,
} from '@/components/common/AppUI';

import { searchSettings, SETTINGS_SEARCH_INDEX } from './settingsSearch';
import { selectSettingsSearchResult } from './SettingsSearchFocus';
import { summarize, SECTION_ITEMS } from './constants';
import type { SettingsScreenController } from './useSettingsScreenController';

export function SettingsSectionsList({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  useNativeLocale();
  const { t, text } = useTranslation();
  const [query, setQuery] = useState('');
  const results = searchSettings(
    query,
    SETTINGS_SEARCH_INDEX.map(item => ({
      ...item,
      keywords: `${item.keywords ?? ''} ${text(item.label)}`,
    })),
  );
  return (
    <>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('workflow.searchSettings', {
          defaultValue: 'Search all settings',
        })}
      />
      {query.trim() ? (
        <SectionCard
          title={t('workflow.searchResults', {
            defaultValue: 'Matching settings',
          })}
        >
          {!results.length ? (
            <Text style={{ color: controller.colors.textSecondary }}>
              {t('workflow.noSearchResults', {
                defaultValue: 'No matching settings.',
              })}
            </Text>
          ) : (
            results.map((result, index) => (
              <SettingRow
                key={`${result.section}:${result.panel ?? ''}:${
                  result.label
                }:${index}`}
                icon="settings"
                label={text(result.label)}
                description={`${
                  SECTION_ITEMS.find(item => item.key === result.section)
                    ?.title ?? result.section
                }${result.panel ? ` › ${result.panel}` : ''}`}
                onPress={() => {
                  selectSettingsSearchResult(result);
                  controller.actions.setSection(result.section);
                  if (result.panel)
                    controller.actions.setUserPanel(result.panel);
                }}
              />
            ))
          )}
        </SectionCard>
      ) : null}
      {!query.trim() ? (
        <>
          {SECTION_ITEMS.map(item => (
            <SectionCard
              key={item.key}
              title={item.title}
              subtitle={item.description}
              right={
                <StatusBadge
                  label={summarize(
                    item.key,
                    controller.derived.sectionSummaries,
                  )}
                  color={controller.colors.accent}
                />
              }
            >
              <SettingRow
                icon={item.icon}
                label={translateNative('native.f65342ba3567b1c7', { value0: String(item.title) })}
                description={item.description}
                onPress={() => {
                  selectSettingsSearchResult(null);
                  controller.actions.setSection(item.key);
                  if (item.key === 'users') {
                    controller.actions.setUserPanel('auth');
                  }
                }}
              />
            </SectionCard>
          ))}
        </>
      ) : null}
    </>
  );
}
