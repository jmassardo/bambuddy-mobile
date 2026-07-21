import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import {
  Badge,
  Button,
  Card,
  Input,
  SectionHeader,
} from '@/components/common/UIComponents';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  NotificationLogEntry,
  NotificationProvider,
  NotificationProviderCreate,
  NotificationTemplate,
  ProviderType,
} from '@/types/api';
import { pickBoolean, pickString } from '@/utils/data';

const PREFERENCE_ROWS = [
  {
    key: 'notify_print_start',
    title: 'Print started',
    description: 'Get an email when a print begins.',
  },
  {
    key: 'notify_print_complete',
    title: 'Print completed',
    description: 'Get an email when a print finishes successfully.',
  },
  {
    key: 'notify_print_failed',
    title: 'Print failed',
    description: 'Get an email when a print fails or errors.',
  },
  {
    key: 'notify_print_stopped',
    title: 'Print stopped',
    description: 'Get an email when a print is stopped manually.',
  },
] as const;

type PreferenceKey = (typeof PREFERENCE_ROWS)[number]['key'];
type PreferenceState = Record<PreferenceKey, boolean>;
type ProviderKind =
  | 'email'
  | 'discord'
  | 'slack'
  | 'telegram'
  | 'pushover'
  | 'gotify'
  | 'ntfy'
  | 'generic_webhook';

type ProviderFormState = {
  name: string;
  enabled: boolean;
  kind: ProviderKind;
  config: Record<string, string>;
};

const DEFAULT_PREFERENCES: PreferenceState = {
  notify_print_start: false,
  notify_print_complete: false,
  notify_print_failed: true,
  notify_print_stopped: true,
};

const PROVIDER_OPTIONS: Array<{ key: ProviderKind; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'discord', label: 'Discord' },
  { key: 'slack', label: 'Slack' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'pushover', label: 'Pushover' },
  { key: 'gotify', label: 'Gotify' },
  { key: 'ntfy', label: 'ntfy' },
  { key: 'generic_webhook', label: 'Generic webhook' },
];

const DEFAULT_PROVIDER_EVENTS = {
  on_print_complete: true,
  on_print_failed: true,
  on_print_stopped: true,
};

function emptyProviderForm(kind: ProviderKind = 'email'): ProviderFormState {
  return {
    name: '',
    enabled: true,
    kind,
    config: defaultConfigForKind(kind),
  };
}

function defaultConfigForKind(kind: ProviderKind): Record<string, string> {
  switch (kind) {
    case 'email':
      return {
        smtp_server: '',
        smtp_port: '587',
        security: 'starttls',
        auth_enabled: 'true',
        username: '',
        password: '',
        from_email: '',
        to_email: '',
      };
    case 'discord':
      return { webhook_url: '' };
    case 'slack':
      return { webhook_url: '', auth_header: '' };
    case 'telegram':
      return { bot_token: '', chat_id: '' };
    case 'pushover':
      return { user_key: '', app_token: '', priority: '0' };
    case 'gotify':
      return { server_url: '', token: '' };
    case 'ntfy':
      return { server: 'https://ntfy.sh', topic: '', auth_token: '' };
    case 'generic_webhook':
      return {
        webhook_url: '',
        auth_header: '',
        field_title: 'title',
        field_message: 'message',
      };
    default:
      return {};
  }
}

function kindFromProvider(provider: NotificationProvider): ProviderKind {
  if (provider.provider_type === 'webhook') {
    const payloadFormat = pickString(provider.config as Record<string, unknown>, ['payload_format']);
    if (payloadFormat === 'slack') return 'slack';
    const webhookUrl = pickString(provider.config as Record<string, unknown>, ['webhook_url']).toLowerCase();
    if (webhookUrl.includes('gotify')) return 'gotify';
    return 'generic_webhook';
  }
  if (['email', 'discord', 'telegram', 'pushover', 'ntfy'].includes(provider.provider_type)) {
    return provider.provider_type as ProviderKind;
  }
  return 'generic_webhook';
}

function configFromProvider(provider: NotificationProvider, kind: ProviderKind) {
  const source = provider.config as Record<string, unknown>;
  const config = defaultConfigForKind(kind);
  Object.entries(source).forEach(([key, value]) => {
    config[key] = value == null ? '' : String(value);
  });

  if (kind === 'gotify') {
    const rawUrl = pickString(source, ['webhook_url']);
    const match = rawUrl.match(/^(.*?)(?:\/message)?(?:\?token=([^&]+))?$/i);
    config.server_url = match?.[1] ?? rawUrl;
    config.token = match?.[2] ?? '';
  }

  return config;
}

function formFromProvider(provider: NotificationProvider): ProviderFormState {
  const kind = kindFromProvider(provider);
  return {
    name: provider.name,
    enabled: provider.enabled,
    kind,
    config: configFromProvider(provider, kind),
  };
}

function buildProviderPayload(form: ProviderFormState): NotificationProviderCreate {
  let providerType: ProviderType;
  let config: Record<string, unknown> = {};

  switch (form.kind) {
    case 'slack':
      providerType = 'webhook';
      config = {
        webhook_url: form.config.webhook_url?.trim() ?? '',
        auth_header: form.config.auth_header?.trim() || undefined,
        payload_format: 'slack',
      };
      break;
    case 'generic_webhook':
      providerType = 'webhook';
      config = {
        webhook_url: form.config.webhook_url?.trim() ?? '',
        auth_header: form.config.auth_header?.trim() || undefined,
        payload_format: 'generic',
        field_title: form.config.field_title?.trim() || 'title',
        field_message: form.config.field_message?.trim() || 'message',
      };
      break;
    case 'gotify': {
      providerType = 'webhook';
      const base = form.config.server_url?.trim().replace(/\/$/, '') ?? '';
      const token = form.config.token?.trim();
      config = {
        webhook_url: token ? `${base}/message?token=${encodeURIComponent(token)}` : `${base}/message`,
        payload_format: 'generic',
        field_title: 'title',
        field_message: 'message',
      };
      break;
    }
    case 'email':
      providerType = 'email';
      config = {
        smtp_server: form.config.smtp_server?.trim() ?? '',
        smtp_port: Number(form.config.smtp_port || '587') || 587,
        security: form.config.security?.trim() || 'starttls',
        auth_enabled: form.config.auth_enabled !== 'false',
        username: form.config.username?.trim() || undefined,
        password: form.config.password || undefined,
        from_email: form.config.from_email?.trim() ?? '',
        to_email: form.config.to_email?.trim() ?? '',
      };
      break;
    case 'discord':
      providerType = 'discord';
      config = { webhook_url: form.config.webhook_url?.trim() ?? '' };
      break;
    case 'telegram':
      providerType = 'telegram';
      config = {
        bot_token: form.config.bot_token?.trim() ?? '',
        chat_id: form.config.chat_id?.trim() ?? '',
      };
      break;
    case 'pushover':
      providerType = 'pushover';
      config = {
        user_key: form.config.user_key?.trim() ?? '',
        app_token: form.config.app_token?.trim() ?? '',
        priority: form.config.priority?.trim() || '0',
      };
      break;
    case 'ntfy':
      providerType = 'ntfy';
      config = {
        server: form.config.server?.trim() || 'https://ntfy.sh',
        topic: form.config.topic?.trim() ?? '',
        auth_token: form.config.auth_token?.trim() || undefined,
      };
      break;
    default:
      providerType = 'email';
      config = {};
  }

  return {
    name: form.name.trim(),
    enabled: form.enabled,
    provider_type: providerType,
    config,
    ...DEFAULT_PROVIDER_EVENTS,
  };
}

function validateProviderForm(form: ProviderFormState) {
  if (!form.name.trim()) return 'Provider name is required.';

  switch (form.kind) {
    case 'email':
      if (!form.config.smtp_server?.trim()) return 'SMTP server is required.';
      if (!form.config.from_email?.trim()) return 'From email is required.';
      if (!form.config.to_email?.trim()) return 'Destination email is required.';
      return null;
    case 'discord':
    case 'slack':
    case 'generic_webhook':
      return form.config.webhook_url?.trim() ? null : 'Webhook URL is required.';
    case 'telegram':
      if (!form.config.bot_token?.trim()) return 'Bot token is required.';
      return form.config.chat_id?.trim() ? null : 'Chat ID is required.';
    case 'pushover':
      if (!form.config.user_key?.trim()) return 'User key is required.';
      return form.config.app_token?.trim() ? null : 'App token is required.';
    case 'gotify':
      return form.config.server_url?.trim() ? null : 'Gotify server URL is required.';
    case 'ntfy':
      if (!form.config.topic?.trim()) return 'ntfy topic is required.';
      return null;
    default:
      return null;
  }
}

function providerSummary(provider: NotificationProvider) {
  const config = provider.config as Record<string, unknown>;
  switch (kindFromProvider(provider)) {
    case 'email':
      return pickString(config, ['to_email']) || 'SMTP delivery';
    case 'discord':
      return 'Discord webhook';
    case 'slack':
      return 'Slack / Mattermost webhook';
    case 'telegram':
      return `Chat ${pickString(config, ['chat_id'], 'configured')}`;
    case 'pushover':
      return 'Pushover app delivery';
    case 'gotify':
      return 'Gotify message endpoint';
    case 'ntfy':
      return `${pickString(config, ['server'], 'ntfy')} · ${pickString(config, ['topic'], 'topic')}`;
    case 'generic_webhook':
      return 'Generic JSON webhook';
    default:
      return provider.provider_type;
  }
}

function providerTypeLabel(provider: NotificationProvider) {
  return PROVIDER_OPTIONS.find(option => option.key === kindFromProvider(provider))?.label ?? provider.provider_type;
}

function ProviderField({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  placeholder?: string;
}) {
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      placeholder={placeholder}
    />
  );
}

function ProviderConfigFields({
  form,
  setForm,
}: {
  form: ProviderFormState;
  setForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
}) {
  const updateConfig = (key: string, value: string) => {
    setForm(current => ({
      ...current,
      config: {
        ...current.config,
        [key]: value,
      },
    }));
  };

  switch (form.kind) {
    case 'email':
      return (
        <>
          <ProviderField label="SMTP server" value={form.config.smtp_server ?? ''} onChangeText={value => updateConfig('smtp_server', value)} placeholder="smtp.example.com" />
          <ProviderField label="SMTP port" value={form.config.smtp_port ?? ''} onChangeText={value => updateConfig('smtp_port', value)} keyboardType="number-pad" />
          <ProviderField label="Security" value={form.config.security ?? ''} onChangeText={value => updateConfig('security', value)} placeholder="starttls / ssl / none" />
          <ProviderField label="Auth enabled" value={form.config.auth_enabled ?? ''} onChangeText={value => updateConfig('auth_enabled', value)} placeholder="true or false" />
          <ProviderField label="Username" value={form.config.username ?? ''} onChangeText={value => updateConfig('username', value)} />
          <ProviderField label="Password" value={form.config.password ?? ''} onChangeText={value => updateConfig('password', value)} secureTextEntry />
          <ProviderField label="From email" value={form.config.from_email ?? ''} onChangeText={value => updateConfig('from_email', value)} keyboardType="email-address" />
          <ProviderField label="To email" value={form.config.to_email ?? ''} onChangeText={value => updateConfig('to_email', value)} keyboardType="email-address" />
        </>
      );
    case 'discord':
      return <ProviderField label="Webhook URL" value={form.config.webhook_url ?? ''} onChangeText={value => updateConfig('webhook_url', value)} placeholder="https://discord.com/api/webhooks/..." />;
    case 'slack':
      return (
        <>
          <ProviderField label="Webhook URL" value={form.config.webhook_url ?? ''} onChangeText={value => updateConfig('webhook_url', value)} placeholder="https://hooks.slack.com/services/..." />
          <ProviderField label="Authorization header" value={form.config.auth_header ?? ''} onChangeText={value => updateConfig('auth_header', value)} placeholder="Optional" secureTextEntry />
        </>
      );
    case 'telegram':
      return (
        <>
          <ProviderField label="Bot token" value={form.config.bot_token ?? ''} onChangeText={value => updateConfig('bot_token', value)} secureTextEntry />
          <ProviderField label="Chat ID" value={form.config.chat_id ?? ''} onChangeText={value => updateConfig('chat_id', value)} />
        </>
      );
    case 'pushover':
      return (
        <>
          <ProviderField label="User key" value={form.config.user_key ?? ''} onChangeText={value => updateConfig('user_key', value)} secureTextEntry />
          <ProviderField label="App token" value={form.config.app_token ?? ''} onChangeText={value => updateConfig('app_token', value)} secureTextEntry />
          <ProviderField label="Priority" value={form.config.priority ?? ''} onChangeText={value => updateConfig('priority', value)} keyboardType="number-pad" />
        </>
      );
    case 'gotify':
      return (
        <>
          <ProviderField label="Server URL" value={form.config.server_url ?? ''} onChangeText={value => updateConfig('server_url', value)} placeholder="https://gotify.example.com" />
          <ProviderField label="Token" value={form.config.token ?? ''} onChangeText={value => updateConfig('token', value)} secureTextEntry placeholder="Optional if embedded in URL" />
        </>
      );
    case 'ntfy':
      return (
        <>
          <ProviderField label="Server URL" value={form.config.server ?? ''} onChangeText={value => updateConfig('server', value)} placeholder="https://ntfy.sh" />
          <ProviderField label="Topic" value={form.config.topic ?? ''} onChangeText={value => updateConfig('topic', value)} />
          <ProviderField label="Auth token" value={form.config.auth_token ?? ''} onChangeText={value => updateConfig('auth_token', value)} secureTextEntry placeholder="Optional" />
        </>
      );
    case 'generic_webhook':
      return (
        <>
          <ProviderField label="Webhook URL" value={form.config.webhook_url ?? ''} onChangeText={value => updateConfig('webhook_url', value)} placeholder="https://example.com/webhook" />
          <ProviderField label="Authorization header" value={form.config.auth_header ?? ''} onChangeText={value => updateConfig('auth_header', value)} secureTextEntry placeholder="Bearer token or custom header value" />
          <ProviderField label="Title field" value={form.config.field_title ?? ''} onChangeText={value => updateConfig('field_title', value)} />
          <ProviderField label="Message field" value={form.config.field_message ?? ''} onChangeText={value => updateConfig('field_message', value)} />
        </>
      );
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const navigation = useNavigation<RootNavigationProp<'Notifications'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Notifications' });
  }, [navigation]);

  const { colors } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<PreferenceState>(DEFAULT_PREFERENCES);
  const [dirty, setDirty] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const [editingProvider, setEditingProvider] = useState<NotificationProvider | null>(null);
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [providerDeleteTarget, setProviderDeleteTarget] = useState<NotificationProvider | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, { title_template: string; body_template: string }>>({});

  const advancedAuthQuery = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: () => api.getAdvancedAuthStatus(),
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
  const preferencesQuery = useQuery({
    queryKey: ['userEmailPreferences'],
    queryFn: () => api.getUserEmailPreferences(),
  });
  const providersQuery = useQuery({
    queryKey: ['notificationProviders'],
    queryFn: () => api.getNotificationProviders(),
    enabled: !!user?.is_admin,
  });
  const notificationLogQuery = useQuery({
    queryKey: ['notificationLog'],
    queryFn: () => api.getNotificationLog({ limit: 50 }),
    enabled: !!user?.is_admin,
  });
  const notificationTemplatesQuery = useQuery({
    queryKey: ['notificationTemplates'],
    queryFn: () => api.getNotificationTemplates(),
    enabled: !!user?.is_admin,
  });

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences({
      notify_print_start: pickBoolean(preferencesQuery.data, ['notify_print_start']),
      notify_print_complete: pickBoolean(preferencesQuery.data, ['notify_print_complete']),
      notify_print_failed: pickBoolean(preferencesQuery.data, ['notify_print_failed']),
      notify_print_stopped: pickBoolean(preferencesQuery.data, ['notify_print_stopped']),
    });
    setDirty(false);
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (!notificationTemplatesQuery.data) return;
    const nextDrafts: Record<string, { title_template: string; body_template: string }> = {};
    ((notificationTemplatesQuery.data ?? []) as unknown as NotificationTemplate[]).forEach(template => {
      nextDrafts[String(template.id)] = {
        title_template: template.title_template,
        body_template: template.body_template,
      };
    });
    setTemplateDrafts(nextDrafts);
  }, [notificationTemplatesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateUserEmailPreferences(preferences),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['userEmailPreferences'] });
      setDirty(false);
      showToast('Email notification preferences saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Could not save preferences.', 'error'),
  });

  const providerCreateMutation = useMutation({
    mutationFn: (payload: NotificationProviderCreate) => api.createNotificationProvider(payload as unknown as Record<string, unknown>),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationProviders'] });
      closeProviderModal();
      showToast('Notification provider created.', 'success');
    },
    onError: (error: Error) => setProviderError(error.message || 'Unable to create provider.'),
  });

  const providerUpdateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NotificationProviderCreate> }) =>
      api.updateNotificationProvider(id, payload as unknown as Record<string, unknown>),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationProviders'] });
      closeProviderModal();
      showToast('Notification provider updated.', 'success');
    },
    onError: (error: Error) => setProviderError(error.message || 'Unable to update provider.'),
  });

  const providerDeleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNotificationProvider(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationProviders'] });
      setProviderDeleteTarget(null);
      showToast('Notification provider deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete provider.', 'error'),
  });

  const providerTestMutation = useMutation({
    mutationFn: (id: number) => api.testNotificationProvider(id),
    onSuccess: async result => {
      await queryClient.invalidateQueries({ queryKey: ['notificationProviders'] });
      showToast(result.message || 'Test notification sent.', result.success ? 'success' : 'warning');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to test provider.', 'error'),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateNotificationTemplate(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationTemplates'] });
      showToast('Notification template saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save template.', 'error'),
  });

  const resetTemplateMutation = useMutation({
    mutationFn: (id: string) => api.resetNotificationTemplate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationTemplates'] });
      showToast('Template reset to default.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to reset template.', 'error'),
  });

  const clearLogMutation = useMutation({
    mutationFn: () => api.clearNotificationLogs(30),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificationLog'] });
      showToast('Notification log cleared.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to clear notification log.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([
      advancedAuthQuery.refetch(),
      settingsQuery.refetch(),
      preferencesQuery.refetch(),
      user?.is_admin ? providersQuery.refetch() : Promise.resolve(),
      user?.is_admin ? notificationLogQuery.refetch() : Promise.resolve(),
      user?.is_admin ? notificationTemplatesQuery.refetch() : Promise.resolve(),
    ]);
  };

  const notificationsEnabled = useMemo(
    () => pickBoolean(settingsQuery.data, ['user_notifications_enabled'], false),
    [settingsQuery.data],
  );
  const advancedAuthEnabled = useMemo(
    () => pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled'], false),
    [advancedAuthQuery.data],
  );
  const providers = useMemo(
    () => (providersQuery.data ?? []) as unknown as NotificationProvider[],
    [providersQuery.data],
  );
  const notificationLog = useMemo(
    () => (notificationLogQuery.data ?? []) as unknown as NotificationLogEntry[],
    [notificationLogQuery.data],
  );
  const notificationTemplates = useMemo(
    () => (notificationTemplatesQuery.data ?? []) as unknown as NotificationTemplate[],
    [notificationTemplatesQuery.data],
  );

  const preferencesAvailable = advancedAuthEnabled && notificationsEnabled;

  const closeProviderModal = () => {
    setProviderModalVisible(false);
    setEditingProvider(null);
    setProviderError(null);
    setProviderForm(emptyProviderForm());
  };

  const openCreateProvider = () => {
    setProviderError(null);
    setEditingProvider(null);
    setProviderForm(emptyProviderForm());
    setProviderModalVisible(true);
  };

  const openEditProvider = (provider: NotificationProvider) => {
    setProviderError(null);
    setEditingProvider(provider);
    setProviderForm(formFromProvider(provider));
    setProviderModalVisible(true);
  };

  const handleProviderSubmit = () => {
    const validationError = validateProviderForm(providerForm);
    if (validationError) {
      setProviderError(validationError);
      return;
    }

    const payload = buildProviderPayload(providerForm);
    setProviderError(null);

    if (editingProvider) {
      void providerUpdateMutation.mutateAsync({
        id: editingProvider.id,
        payload,
      });
      return;
    }

    void providerCreateMutation.mutateAsync(payload);
  };

  if (advancedAuthQuery.isLoading || settingsQuery.isLoading || preferencesQuery.isLoading) {
    return <LoadingScreen message="Loading notification settings…" />;
  }

  if (advancedAuthQuery.isError || settingsQuery.isError || preferencesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load notification settings."
        onRetry={() => void refreshAll()}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              advancedAuthQuery.isRefetching ||
              settingsQuery.isRefetching ||
              preferencesQuery.isRefetching ||
              providersQuery.isRefetching ||
              notificationLogQuery.isRefetching ||
              notificationTemplatesQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        {user?.is_admin ? (
          <>
            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Notification providers" action={{ label: 'Add', onPress: openCreateProvider }} />
              {providersQuery.isLoading ? (
                <Text style={[styles.providerHint, { color: colors.textSecondary }]}>Loading providers…</Text>
              ) : providersQuery.isError ? (
                <Text style={[styles.providerHint, { color: colors.error }]}>Unable to load notification providers.</Text>
              ) : providers.length === 0 ? (
                <EmptyState
                  icon="📨"
                  title="No providers configured"
                  message="Add a provider so Bambuddy can deliver printer, queue, and failure alerts beyond per-user email settings."
                />
              ) : (
                <View style={styles.providerList}>
                  {providers.map(provider => (
                    <View
                      key={provider.id}
                      style={[
                        styles.providerCard,
                        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.providerHeader}>
                        <View style={styles.providerHeaderText}>
                          <Text style={[styles.providerName, { color: colors.text }]}>{provider.name}</Text>
                          <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
                            {providerTypeLabel(provider)} • {providerSummary(provider)}
                          </Text>
                        </View>
                        <Badge
                          label={provider.enabled ? 'Enabled' : 'Disabled'}
                          color={provider.enabled ? colors.success : colors.textSecondary}
                          backgroundColor={provider.enabled ? `${colors.success}22` : colors.surfaceHover}
                        />
                      </View>
                      {provider.last_success ? (
                        <Text style={[styles.providerMeta, { color: colors.textSecondary }]}>Last success: {provider.last_success}</Text>
                      ) : null}
                      {provider.last_error ? (
                        <Text style={[styles.providerMeta, { color: colors.warning }]}>Last error: {provider.last_error}</Text>
                      ) : null}
                      <View style={styles.providerActions}>
                        <Button
                          title={providerTestMutation.isPending ? 'Testing…' : 'Test'}
                          size="sm"
                          variant="secondary"
                          onPress={() => void providerTestMutation.mutateAsync(provider.id)}
                          disabled={providerTestMutation.isPending}
                        />
                        <Button title="Edit" size="sm" variant="secondary" onPress={() => openEditProvider(provider)} />
                        <Button title="Delete" size="sm" variant="danger" onPress={() => setProviderDeleteTarget(provider)} />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Notification log" action={{ label: 'Clear', onPress: () => void clearLogMutation.mutateAsync() }} />
              {notificationLogQuery.isLoading ? (
                <Text style={[styles.providerHint, { color: colors.textSecondary }]}>Loading delivery log…</Text>
              ) : notificationLog.length === 0 ? (
                <EmptyState icon="📜" title="No delivery log" message="Notification deliveries will appear here once providers send events." />
              ) : (
                <View style={styles.providerList}>
                  {notificationLog.map(entry => (
                    <View
                      key={entry.id}
                      style={[
                        styles.providerCard,
                        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.providerHeader}>
                        <View style={styles.providerHeaderText}>
                          <Text style={[styles.providerName, { color: colors.text }]}>{entry.event_type}</Text>
                          <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
                            {entry.created_at} • {entry.provider_name || entry.provider_type || 'Unknown recipient'}
                          </Text>
                        </View>
                        <Badge
                          label={entry.success ? 'Sent' : 'Failed'}
                          color={entry.success ? colors.success : colors.error}
                          backgroundColor={entry.success ? `${colors.success}22` : `${colors.error}22`}
                        />
                      </View>
                      <Text style={[styles.providerMeta, { color: colors.textSecondary }]}>
                        {entry.title || entry.message || entry.printer_name || 'Notification event'}
                      </Text>
                      {!entry.success && entry.error_message ? (
                        <Text style={[styles.providerMeta, { color: colors.warning }]}>{entry.error_message}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Templates" />
              {notificationTemplatesQuery.isLoading ? (
                <Text style={[styles.providerHint, { color: colors.textSecondary }]}>Loading templates…</Text>
              ) : notificationTemplates.length === 0 ? (
                <EmptyState icon="📝" title="No templates" message="The server did not return editable notification templates." />
              ) : (
                <View style={styles.providerList}>
                  {notificationTemplates.map(template => {
                    const draft = templateDrafts[String(template.id)] ?? {
                      title_template: template.title_template,
                      body_template: template.body_template,
                    };
                    return (
                      <View
                        key={template.id}
                        style={[
                          styles.providerCard,
                          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                        ]}
                      >
                        <View style={styles.providerHeader}>
                          <View style={styles.providerHeaderText}>
                            <Text style={[styles.providerName, { color: colors.text }]}>{template.name}</Text>
                            <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>{template.event_type}</Text>
                          </View>
                          <Badge
                            label={template.is_default ? 'Default' : 'Custom'}
                            color={template.is_default ? colors.textSecondary : colors.accent}
                            backgroundColor={template.is_default ? colors.surfaceHover : colors.accentBg}
                          />
                        </View>
                        <Input
                          label="Title template"
                          value={draft.title_template}
                          onChangeText={value => setTemplateDrafts(current => ({
                            ...current,
                            [String(template.id)]: {
                              title_template: value,
                              body_template: current[String(template.id)]?.body_template ?? template.body_template,
                            },
                          }))}
                        />
                        <Input
                          label="Body template"
                          value={draft.body_template}
                          onChangeText={value => setTemplateDrafts(current => ({
                            ...current,
                            [String(template.id)]: {
                              title_template: current[String(template.id)]?.title_template ?? template.title_template,
                              body_template: value,
                            },
                          }))}
                          multiline
                        />
                        <View style={styles.providerActions}>
                          <Button
                            title={updateTemplateMutation.isPending ? 'Saving…' : 'Save'}
                            size="sm"
                            onPress={() => void updateTemplateMutation.mutateAsync({
                              id: String(template.id),
                              payload: draft,
                            })}
                            disabled={updateTemplateMutation.isPending}
                          />
                          <Button
                            title={resetTemplateMutation.isPending ? 'Resetting…' : 'Reset'}
                            size="sm"
                            variant="secondary"
                            onPress={() => void resetTemplateMutation.mutateAsync(String(template.id))}
                            disabled={resetTemplateMutation.isPending}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </>
        ) : null}

        {!preferencesAvailable ? (
          <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <SectionHeader title="Email notification preferences" />
            <EmptyState
              icon="🔔"
              title="Email notifications are unavailable"
              message="Enable advanced authentication and user email notifications in Settings to manage per-user email alerts from mobile."
            />
            <View style={styles.emptyActions}>
              <Button title="Open Settings" onPress={() => navigation.navigate('Settings')} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Recipient" />
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: colors.accentBg }]}> 
                  <Text style={[styles.infoEmoji, { color: colors.accent }]}>✉️</Text>
                </View>
                <View style={styles.infoText}>
                  <Text style={[styles.infoTitle, { color: colors.text }]}>Email destination</Text>
                  <Text style={[styles.infoDescription, { color: colors.textSecondary }]}> 
                    {user?.email
                      ? `Notifications will be sent to ${user.email}.`
                      : 'Add an email address to your account to receive notification emails.'}
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Print job notifications" />
              {PREFERENCE_ROWS.map((row, index) => (
                <View
                  key={row.key}
                  style={[
                    styles.preferenceRow,
                    index < PREFERENCE_ROWS.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <View style={styles.preferenceText}>
                    <Text style={[styles.preferenceTitle, { color: colors.text }]}>{row.title}</Text>
                    <Text style={[styles.preferenceDescription, { color: colors.textSecondary }]}>
                      {row.description}
                    </Text>
                  </View>
                  <Switch
                    value={preferences[row.key]}
                    onValueChange={(value) => {
                      setPreferences(current => ({ ...current, [row.key]: value }));
                      setDirty(true);
                    }}
                    trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                    thumbColor={colors.text}
                    disabled={!user?.email}
                  />
                </View>
              ))}
            </Card>

            <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <SectionHeader title="Summary" />
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}> 
                {Object.values(preferences).filter(Boolean).length} of {PREFERENCE_ROWS.length} email alerts enabled.
              </Text>
            </Card>

            <View style={styles.saveButtonWrap}>
              <Button
                title={saveMutation.isPending ? 'Saving…' : 'Save preferences'}
                onPress={() => void saveMutation.mutateAsync()}
                disabled={!dirty || !user?.email || saveMutation.isPending}
                loading={saveMutation.isPending}
              />
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={providerModalVisible} transparent animationType="slide" onRequestClose={closeProviderModal}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
          <Pressable style={StyleSheet.absoluteFill} onPress={closeProviderModal} />
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingProvider ? 'Edit provider' : 'Add provider'}</Text>
              <Input label="Provider name" value={providerForm.name} onChangeText={value => setProviderForm(current => ({ ...current, name: value }))} placeholder="Production alerts" />
              <View style={styles.kindWrap}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Provider type</Text>
                <View style={styles.kindChips}>
                  {PROVIDER_OPTIONS.map(option => {
                    const selected = providerForm.kind === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() =>
                          setProviderForm(current => ({
                            ...current,
                            kind: option.key,
                            config: {
                              ...defaultConfigForKind(option.key),
                              ...current.config,
                            },
                          }))
                        }
                        style={[
                          styles.kindChip,
                          {
                            backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                            borderColor: selected ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.kindChipText, { color: selected ? colors.accentLight : colors.textSecondary }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={[styles.preferenceTitle, { color: colors.text }]}>Enabled</Text>
                  <Text style={[styles.preferenceDescription, { color: colors.textSecondary }]}>Allow this provider to receive new notification events.</Text>
                </View>
                <Switch
                  value={providerForm.enabled}
                  onValueChange={value => setProviderForm(current => ({ ...current, enabled: value }))}
                  trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                  thumbColor={colors.text}
                />
              </View>
              <ProviderConfigFields form={providerForm} setForm={setProviderForm} />
              {providerError ? <Text style={[styles.modalError, { color: colors.error }]}>{providerError}</Text> : null}
              <View style={styles.modalActions}>
                <Button title="Cancel" variant="secondary" onPress={closeProviderModal} />
                <Button
                  title={
                    editingProvider
                      ? providerUpdateMutation.isPending
                        ? 'Saving…'
                        : 'Save provider'
                      : providerCreateMutation.isPending
                        ? 'Creating…'
                        : 'Create provider'
                  }
                  onPress={handleProviderSubmit}
                  disabled={providerCreateMutation.isPending || providerUpdateMutation.isPending}
                  loading={providerCreateMutation.isPending || providerUpdateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={providerDeleteTarget !== null}
        onClose={() => setProviderDeleteTarget(null)}
        onConfirm={() => {
          if (providerDeleteTarget) {
            void providerDeleteMutation.mutateAsync(providerDeleteTarget.id);
          }
        }}
        title="Delete notification provider"
        message={providerDeleteTarget ? `Delete ${providerDeleteTarget.name}?` : 'Delete this provider?'}
        confirmLabel="Delete"
        loading={providerDeleteMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  providerList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  providerCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  providerHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  providerHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  providerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  providerDescription: {
    fontSize: fontSize.sm,
  },
  providerMeta: {
    fontSize: fontSize.xs,
  },
  providerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  providerHint: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
  emptyActions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    gap: spacing.xs,
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  infoDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    gap: spacing.xs,
  },
  preferenceText: {
    flex: 1,
    gap: spacing.xs,
  },
  preferenceTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  preferenceDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summaryText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
  saveButtonWrap: {
    marginTop: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '92%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  kindWrap: {
    gap: spacing.sm,
  },
  kindChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kindChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  kindChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalError: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
