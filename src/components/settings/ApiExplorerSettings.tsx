import { translateNative, useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useQuery } from '@tanstack/react-query';
import {
  apiExplorerApi,
  listOperations,
  schemaExample,
} from '@/api/apiExplorer';
import { useServerStore } from '@/api/server';
import {
  PrimaryButton,
  SearchBar,
  SectionCard,
  SettingRow,
  TextField,
} from '@/components/common/AppUI';

import { useTheme } from '@/theme';
import type { WorkflowExplorerResponse } from '@/types/api';
import { settingsStyles } from './shared';

type Operation = ReturnType<typeof listOperations>[number];

export function ApiExplorerSettings() {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const server = useServerStore(state => state.serverUrl);
  const schema = useQuery({
    queryKey: ['workflow-openapi', server],
    queryFn: apiExplorerApi.getSchema,
  });
  const [apiKey, setApiKey] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<WorkflowExplorerResponse | null>(
    null,
  );
  const [error, setError] = useNativeMessageState('');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setApiKey('');
    setSelected(null);
    setResponse(null);
  }, [server]);
  const operations = useLocalizedMemo(
    () => (schema.data ? listOperations(schema.data) : []),
    [schema.data],
  );
  const matches = operations.filter(item =>
    `${item.path} ${item.method} ${item.group} ${item.operation.summary ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const groups = [...new Set(matches.map(item => item.group))].sort();
  const label = (key: string, fallback: string) =>
    t(`workflow.explorer.${key}`, { defaultValue: fallback });
  const execute = async () => {
    if (!selected) return;
    setRunning(true);
    setError('');
    setResponse(null);
    setCopied(false);
    try {
      setResponse(
        await apiExplorerApi.execute(
          selected.path,
          selected.method,
          selected.operation,
          parameters,
          body,
          apiKey,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };
  const requestExecution = () => {
    if (selected?.method === 'get' || selected?.method === 'head')
      void execute();
    else
      Alert.alert(
        label('confirmTitle', 'Execute a live request?'),
        label(
          'confirmHelp',
          'This operation can modify server data or control printers. It uses only the explicit test key below.',
        ),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: label('execute', 'Execute'),
            style: 'destructive',
            onPress: () => void execute(),
          },
        ],
      );
  };
  return (
    <>
      <SectionCard
        title={label('webhooks', 'Webhook usage reference')}
        subtitle={label(
          'authHelp',
          'Use X-API-Key: <your key>. API-key permissions apply; never put the key in a URL.',
        )}
      >
        <Text
          selectable
          style={[settingsStyles.helper, { color: colors.text }]}
        >
          {
            translateNative('native.ac0d6e66841f8555')
          }
        </Text>
        <Text
          selectable
          style={[settingsStyles.helper, { color: colors.textSecondary }]}
        >{translateNative('native.3bb1064a78c7d2c2', { value0: String(server ?? '') })}</Text>
        <Text
          selectable
          style={[settingsStyles.helper, { color: colors.textSecondary }]}
        >{translateNative('native.fde20ebcc952bdd5', { value0: String(server ?? '') })}</Text>
        <Text style={[settingsStyles.helper, { color: colors.textSecondary }]}>
          {label(
            'webhookPermissions',
            'Keys need Read Status for status/queue reads, Queue for queue/add, and Control Printer for start/stop/cancel. Printer restrictions still apply. Replace the example archive/printer IDs with your own.',
          )}
        </Text>
      </SectionCard>
      <SectionCard
        title={label('title', 'API explorer')}
        subtitle={label(
          'help',
          'Browse this server’s OpenAPI schema. Requests execute against the live server with explicit credentials, not your signed-in session.',
        )}
      >
        <TextField
          label={label('testKey', 'API test key')}
          value={apiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setApiKey}
        />
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={label('search', 'Search endpoints or groups')}
        />
        {schema.isError ? (
          <>
            <Text style={[settingsStyles.helper, { color: colors.error }]}>
              {schema.error.message}
            </Text>
            <PrimaryButton
              label={t('common.retry', { defaultValue: 'Retry' })}
              onPress={() => void schema.refetch()}
            />
          </>
        ) : null}
        {schema.isLoading ? (
          <Text
            style={[settingsStyles.helper, { color: colors.textSecondary }]}
          >
            {t('common.loading')}
          </Text>
        ) : null}
        {!schema.isLoading && !matches.length ? (
          <Text
            style={[settingsStyles.helper, { color: colors.textSecondary }]}
          >
            {label('noMatches', 'No matching endpoints.')}
          </Text>
        ) : null}
        {groups.map(name => (
          <View key={name}>
            <SettingRow
              icon="layers"
              label={`${name} (${
                matches.filter(item => item.group === name).length
              })`}
              onPress={() => setGroup(group === name ? null : name)}
            />
            {group === name
              ? matches
                  .filter(item => item.group === name)
                  .map(item => (
                    <SettingRow
                      key={`${item.method}:${item.path}`}
                      icon="globe"
                      label={`${item.method.toUpperCase()} ${item.path}`}
                      description={item.operation.summary}
                      onPress={() => {
                        setSelected(item);
                        setParameters({});
                        setResponse(null);
                        setError('');
                        setCopied(false);
                        const json =
                          item.operation.requestBody?.content?.[
                            'application/json'
                          ]?.schema;
                        setBody(
                          json && schema.data
                            ? JSON.stringify(
                                schemaExample(schema.data, json),
                                null,
                                2,
                              )
                            : '',
                        );
                      }}
                    />
                  ))
              : null}
          </View>
        ))}
      </SectionCard>
      {selected ? (
        <SectionCard
          title={`${selected.method.toUpperCase()} ${selected.path}`}
          subtitle={
            selected.operation.description ?? selected.operation.summary
          }
        >
          {(selected.operation.parameters ?? []).map(parameter => (
            <TextField
              key={`${parameter.in}:${parameter.name}`}
              label={`${parameter.in}: ${parameter.name}${
                parameter.required ? ' *' : ''
              }`}
              value={parameters[`${parameter.in}:${parameter.name}`] ?? ''}
              autoCapitalize="none"
              onChangeText={value =>
                setParameters(current => ({
                  ...current,
                  [`${parameter.in}:${parameter.name}`]: value,
                }))
              }
            />
          ))}
          {selected.operation.requestBody ? (
            <TextField
              label={label('body', 'JSON request body')}
              value={body}
              onChangeText={setBody}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              scrollEnabled={false}
            />
          ) : null}
          <PrimaryButton
            label={label('execute', 'Execute')}
            loading={running}
            disabled={running}
            onPress={requestExecution}
          />
          {error ? (
            <Text
              selectable
              accessibilityLiveRegion="polite"
              style={[settingsStyles.helper, { color: colors.error }]}
            >
              {error}
            </Text>
          ) : null}
          {response ? (
            <>
              <Text
                style={[settingsStyles.helper, { color: colors.text }]}
              >{translateNative('native.1a4c99996e99fe40', { value0: String(response.status), value1: String(response.statusText), value2: String(response.duration) })}</Text>
              <Text
                selectable
                style={[settingsStyles.helper, { color: colors.textSecondary }]}
              >
                {response.body || label('emptyBody', '(empty response body)')}
              </Text>
              <PrimaryButton
                label={
                  copied
                    ? label('copied', 'Copied')
                    : label('copy', 'Copy response')
                }
                variant="secondary"
                onPress={() => {
                  Clipboard.setString(JSON.stringify(response, null, 2));
                  setCopied(true);
                }}
              />
            </>
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}
