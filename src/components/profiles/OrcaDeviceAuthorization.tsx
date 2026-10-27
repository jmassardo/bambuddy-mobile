import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { profileManagementApi } from '@/api/profileManagement';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { OrcaDeviceAuthorization as Authorization } from '@/types/api';

export function OrcaDeviceAuthorization() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [session, setSession] = useState<
    (Authorization & { expiresAt: number }) | null
  >(null);
  const [status, setStatus] = useState('');
  const [starting, setStarting] = useState(false);
  const statusLabels: Record<string, string> = {
    authorization_pending: t('profiles.orca.authorization_pending', {
      defaultValue: 'Waiting for approval…',
    }),
    slow_down: t('profiles.orca.slow_down', {
      defaultValue: 'Waiting for approval; polling less frequently…',
    }),
    access_denied: t('profiles.orca.access_denied', {
      defaultValue: 'Approval denied. Start again to retry.',
    }),
    expired_token: t('profiles.orca.expired_token', {
      defaultValue: 'Approval expired. Start again to retry.',
    }),
    complete: t('profiles.orca.complete', {
      defaultValue: 'Orca Cloud connected.',
    }),
  };
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!session) return;
    let active = true;
    let interval = Math.max(session.interval, 1) * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= session.expiresAt) {
        setStatus('expired_token');
        setSession(null);
        return;
      }
      try {
        const result = await profileManagementApi.orcaPoll();
        if (!active) return;
        setStatus(result.status);
        if (result.status === 'complete') {
          setSession(null);
          await Promise.all([
            client.invalidateQueries({ queryKey: ['orcaCloudStatus'] }),
            client.invalidateQueries({ queryKey: ['orcaCloudProfiles'] }),
          ]);
          return;
        }
        if (
          result.status === 'access_denied' ||
          result.status === 'expired_token'
        ) {
          setSession(null);
          return;
        }
        if (result.status === 'slow_down') interval += 5000;
        timer = setTimeout(
          poll,
          Math.min(interval, Math.max(0, session.expiresAt - Date.now())),
        );
      } catch (error) {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : String(error));
        setSession(null);
      }
    };
    timer = setTimeout(
      poll,
      Math.min(interval, Math.max(0, session.expiresAt - Date.now())),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, client]);
  const start = async () => {
    const id = ++generation.current;
    setStarting(true);
    try {
      const authorization = await profileManagementApi.orcaStart();
      if (id !== generation.current) return;
      setSession({
        ...authorization,
        expiresAt: Date.now() + authorization.expires_in * 1000,
      });
      setStatus('authorization_pending');
    } catch (error) {
      if (id === generation.current)
        setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (id === generation.current) setStarting(false);
    }
  };
  return (
    <View style={styles.body}>
      {status ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          {statusLabels[status] ?? status}
        </Text>
      ) : null}
      {session ? (
        <>
          <Text selectable style={{ color: colors.text }}>
            {t('profiles.orca.code', {
              defaultValue: 'Approval code: {{code}}',
              code: session.user_code,
            })}
          </Text>
          <Text selectable style={{ color: colors.textSecondary }}>
            {session.verification_uri}
          </Text>
          <PrimaryButton
            label={t('profiles.orca.open', {
              defaultValue: 'Open Orca approval page',
            })}
            onPress={() =>
              void Linking.openURL(
                session.verification_uri_complete || session.verification_uri,
              ).catch(error => setStatus(String(error)))
            }
          />
        </>
      ) : (
        <PrimaryButton
          label={t('profiles.orca.connect', {
            defaultValue: 'Connect with device approval',
          })}
          loading={starting}
          disabled={starting}
          onPress={() => void start()}
        />
      )}
      {session || starting ? (
        <PrimaryButton
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => {
            generation.current += 1;
            setSession(null);
            setStarting(false);
            setStatus(
              t('profiles.orca.cancelled', {
                defaultValue: 'Approval cancelled.',
              }),
            );
          }}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ body: { gap: spacing.sm } });
