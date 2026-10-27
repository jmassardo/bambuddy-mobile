import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spoolbuddyApi } from '@/api/spoolbuddy';
import { ApiError } from '@/api/http';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { SimpleModal } from '@/components/settings/shared';
import { useAuth } from '@/contexts/AuthContext';
import {
  useSpoolBuddyRemoteState,
  setSpoolBuddyState,
  matchSpoolBuddyTag,
} from '@/hooks/spoolbuddyEvents';
import { useSpoolBuddyTare } from '@/hooks/useSpoolBuddyTare';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';
import { formatDateTime } from '@/utils/data';
import type {
  InventorySpool,
  SpoolBuddyDiagnostic,
  SpoolBuddySystemCommand,
} from '@/types/api';

type Confirmation = {
  title: string;
  message: string;
  run: () => Promise<void>;
};
type SpoolMode = 'existing' | 'replace' | 'create' | 'link';
type PendingTagCreate = {
  id: number;
  uid: string | null;
  tray: string | null;
  weight: number | null;
};
const commands: Record<
  SpoolBuddySystemCommand,
  { label: string; detail: string }
> = {
  restart_browser: {
    label: 'Restart browser',
    detail:
      'Restart only the kiosk browser on the remote device. The phone browser is not affected.',
  },
  restart_daemon: {
    label: 'Restart daemon',
    detail:
      'Restart the remote NFC/scale daemon. Readings will briefly disconnect.',
  },
  reboot: {
    label: 'Reboot device',
    detail:
      'Reboot the remote unit. The kiosk and hardware will disconnect while it restarts.',
  },
  shutdown: {
    label: 'Shut down device',
    detail:
      'Power off the remote unit. Physical access is required to turn it on again. This does not remove its server registration.',
  },
};

function spoolLabel(spool: Partial<InventorySpool>) {
  return `#${spool.id} ${[
    spool.brand,
    spool.material,
    spool.subtype,
    spool.color_name,
  ]
    .filter(Boolean)
    .join(' · ')}`;
}

export function RemoteSpoolBuddyModal({
  deviceId,
  onClose,
}: {
  deviceId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SimpleModal
      visible={deviceId != null}
      title={t('spoolbuddy.remoteTitle', { defaultValue: 'Remote SpoolBuddy' })}
      subtitle={deviceId ?? ''}
      onClose={onClose}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {deviceId ? (
          <RemoteSpoolBuddyPanel key={deviceId} deviceId={deviceId} />
        ) : null}
      </ScrollView>
    </SimpleModal>
  );
}

export function RemoteSpoolBuddyPanel({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
  const tr = (key: string, defaultValue: string) =>
    t(`spoolbuddy.${key}`, { defaultValue });
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory:update');
  const canCreate = hasPermission('inventory:create');
  const client = useQueryClient();
  const connection = useWebSocket({ onlySpoolBuddy: true });
  const remote = useSpoolBuddyRemoteState(deviceId);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(
    null,
  );
  const [feedback, setFeedback] = React.useState('');
  const [spoolMode, setSpoolMode] = React.useState<SpoolMode>('existing');
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [pendingTagCreate, setPendingTagCreate] =
    React.useState<PendingTagCreate | null>(null);
  const [knownWeight, setKnownWeight] = React.useState('');
  const [material, setMaterial] = React.useState('PLA');
  const [labelWeight, setLabelWeight] = React.useState('1000');
  const [coreWeight, setCoreWeight] = React.useState('250');
  const [sshExpanded, setSshExpanded] = React.useState(false);
  const [diagnostic, setDiagnostic] =
    React.useState<SpoolBuddyDiagnostic | null>(null);
  const [diagnosticRunning, setDiagnosticRunning] = React.useState(false);
  const [diagnosticRun, setDiagnosticRun] = React.useState(0);
  const [diagnosticMessage, setDiagnosticMessage] = React.useState('');
  const [updateQueued, setUpdateQueued] = React.useState(false);
  const [updateReconnect, setUpdateReconnect] = React.useState(false);
  const devices = useQuery({
    queryKey: ['spoolbuddyDevices'],
    queryFn: spoolbuddyApi.devices,
    refetchInterval: 3000,
  });
  const device = devices.data?.find(item => item.device_id === deviceId);
  const tare = useSpoolBuddyTare(device, devices.refetch);
  const online = device?.online ?? remote.online ?? false;
  const modeQuery = useQuery({
    queryKey: ['spoolbuddyInventoryMode'],
    queryFn: spoolbuddyApi.inventoryMode,
  });
  const spoolman = modeQuery.data?.enabled === true;
  const spools = useQuery({
    queryKey: ['spoolbuddySpools', spoolman],
    queryFn: () => spoolbuddyApi.spools(spoolman),
    enabled: modeQuery.isSuccess,
  });
  const update = useQuery({
    queryKey: ['spoolbuddyUpdateCheck', deviceId],
    queryFn: () => spoolbuddyApi.checkUpdate(deviceId),
  });
  const ssh = useQuery({
    queryKey: ['spoolbuddySshKey'],
    queryFn: spoolbuddyApi.sshKey,
    enabled: sshExpanded && hasPermission('settings:read'),
    staleTime: Infinity,
  });
  const diagnosticResult = useQuery({
    queryKey: ['spoolbuddyDiagnostic', deviceId, diagnostic, diagnosticRun],
    queryFn: () => spoolbuddyApi.diagnosticResult(deviceId, diagnostic!),
    enabled: diagnosticRunning && diagnostic != null,
    retry: false,
    refetchInterval: diagnosticRunning ? 500 : false,
  });
  const mutation = useMutation({
    mutationFn: (action: Confirmation) => action.run(),
    onSuccess: () => {
      setConfirmation(null);
    },
    onError: (error: Error) => {
      setFeedback(error.message);
      setConfirmation(null);
    },
  });
  const busy = mutation.isPending || tare.waiting || diagnosticRunning;
  const writing = remote.writeStatus === 'queued';
  const liveUpdateIsNewer =
    remote.updateReportedAt != null &&
    remote.updateReportedAt >= devices.dataUpdatedAt;
  const updateStatus = liveUpdateIsNewer
    ? remote.updateStatus
    : device?.update_status;
  const updateMessage = liveUpdateIsNewer
    ? remote.updateMessage
    : device?.update_message;
  const updating =
    updateQueued || updateStatus === 'pending' || updateStatus === 'updating';
  const locked =
    busy || writing || updating || Boolean(device?.pending_command);
  const selected = spools.data?.find(spool => spool.id === selectedId);
  const positiveWeight = Number(knownWeight);
  const validWeight = Number.isFinite(positiveWeight) && positiveWeight > 0;
  const validCreate =
    material.trim() &&
    material.trim().length <= 50 &&
    Number.isInteger(Number(labelWeight)) &&
    Number(labelWeight) > 0 &&
    (spoolman ||
      (Number.isInteger(Number(coreWeight)) && Number(coreWeight) >= 0));
  const list = (spools.data ?? []).filter(
    spool =>
      !spool.archived_at &&
      (spoolMode === 'replace'
        ? Boolean(spool.tag_uid || spool.tray_uuid)
        : !spool.tag_uid && !spool.tray_uuid) &&
      spoolLabel(spool).toLowerCase().includes(search.toLowerCase()),
  );

  async function refreshSpools() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['spoolbuddySpools'] }),
      client.invalidateQueries({ queryKey: ['inventorySpools'] }),
    ]);
  }
  React.useEffect(() => {
    if (remote.writeStatus === 'success') {
      void client.invalidateQueries({ queryKey: ['spoolbuddySpools'] });
      void client.invalidateQueries({ queryKey: ['inventorySpools'] });
    }
  }, [remote.writeStatus, client]);
  React.useEffect(() => {
    if (
      diagnosticResult.data ||
      (diagnosticResult.error &&
        !(
          diagnosticResult.error instanceof ApiError &&
          diagnosticResult.error.status === 404
        ))
    ) {
      setDiagnosticRunning(false);
    }
  }, [diagnosticResult.data, diagnosticResult.error]);
  React.useEffect(() => {
    if (!diagnosticRunning) return;
    const timer = setTimeout(() => {
      setDiagnosticRunning(false);
      setDiagnosticMessage(
        t('spoolbuddy.diagnosticTimeout', {
          defaultValue:
            'Diagnostic timed out after 30 seconds. Check the daemon and retry.',
        }),
      );
    }, 30000);
    return () => clearTimeout(timer);
  }, [diagnosticRunning, t]);
  React.useEffect(() => {
    if (updateStatus === 'pending' || updateStatus === 'updating') {
      setUpdateQueued(false);
      setUpdateReconnect(true);
    }
    if (updateStatus === 'complete' || updateStatus === 'error')
      setUpdateQueued(false);
  }, [updateStatus]);
  const observedOffline = React.useRef(false);
  const updateOnlineBaseline = React.useRef(remote.onlineRevision);
  React.useEffect(() => {
    if (updateReconnect && !online) observedOffline.current = true;
    if (
      updateReconnect &&
      ((online && observedOffline.current) ||
        remote.onlineRevision > updateOnlineBaseline.current)
    ) {
      observedOffline.current = false;
      updateOnlineBaseline.current = remote.onlineRevision;
      setUpdateReconnect(false);
      setFeedback(
        t('spoolbuddy.updateReconnected', {
          defaultValue:
            'Remote device reconnected after update. Verify the reported version below.',
        }),
      );
      void update.refetch();
      void devices.refetch();
    }
  }, [online, updateReconnect, remote.onlineRevision, update, devices, t]);
  React.useEffect(() => {
    if (!updateQueued) return;
    const timer = setTimeout(() => {
      setUpdateQueued(false);
      setFeedback(
        t('spoolbuddy.updateTimeout', {
          defaultValue:
            'Update acknowledgement timed out. Check remote daemon status and SSH setup before retrying.',
        }),
      );
    }, 30000);
    return () => clearTimeout(timer);
  }, [updateQueued, t]);

  function execute(title: string, run: () => Promise<void>) {
    mutation.mutate({ title, message: '', run });
  }
  function confirm(title: string, message: string, run: () => Promise<void>) {
    setConfirmation({
      title,
      message: `${device?.hostname ?? deviceId} (${deviceId})\n\n${message}`,
      run,
    });
  }
  async function queueWrite(spoolId: number) {
    setSpoolBuddyState(deviceId, {
      writeStatus: 'queued',
      writeSpoolId: spoolId,
      message: null,
    });
    try {
      const result = await spoolbuddyApi.write(deviceId, spoolId);
      setFeedback(
        result.warnings?.join('\n') ||
          tr(
            'writeQueued',
            'Write queued on remote hardware. Waiting for the device result; do not remove the tag.',
          ),
      );
    } catch (writeError) {
      setSpoolBuddyState(deviceId, {
        writeStatus: 'error',
        message:
          writeError instanceof Error
            ? writeError.message
            : tr('queueFailed', 'Queue failed.'),
      });
      throw writeError;
    }
  }
  async function createSpool(tag?: {
    uid: string | null;
    tray: string | null;
    weight: number | null;
  }) {
    if (
      tag?.weight != null &&
      (!Number.isFinite(tag.weight) || tag.weight < 0 || tag.weight > 100000)
    ) {
      throw new Error(
        tr(
          'invalidMeasuredWeight',
          'Measured spool weight must be between 0 and 100000 g. Check the scale before adding.',
        ),
      );
    }
    const created = await spoolbuddyApi.createSpool(spoolman, {
      material: material.trim(),
      label_weight: Number(labelWeight),
      weight_used: 0,
      ...(spoolman
        ? {}
        : {
            core_weight: Number(coreWeight),
            data_origin: 'spoolbuddy',
            tag_type: 'generic',
          }),
      last_scale_weight: tag?.weight != null ? Math.round(tag.weight) : null,
      last_weighed_at: tag?.weight != null ? new Date().toISOString() : null,
      ...(!spoolman && tag
        ? { tag_uid: tag.uid, tray_uuid: tag.uid ? null : tag.tray }
        : {}),
    });
    setSelectedId(created.id);
    setSpoolMode(tag ? 'link' : 'existing');
    await refreshSpools();
    if (spoolman && tag) {
      const pending = { id: created.id, ...tag };
      setPendingTagCreate(pending);
      await finishSpoolmanTagCreate(pending);
    }
    if (tag) {
      matchSpoolBuddyTag(deviceId, tag.uid, tag.tray, created);
      setFeedback(tr('spoolAddedLinked', 'Spool added and remote tag linked.'));
      await refreshSpools();
    } else
      setFeedback(
        tr(
          'spoolCreatedForWrite',
          'Spool created. Select Write to queue its remote NFC write.',
        ),
      );
  }
  async function finishSpoolmanTagCreate(pending: PendingTagCreate) {
    const linked = await spoolbuddyApi.link(true, pending.id, {
      tag_uid: pending.uid || undefined,
      tray_uuid: !pending.uid ? pending.tray || undefined : undefined,
    });
    if (pending.weight != null)
      await spoolbuddyApi.weighSpoolman(pending.id, pending.weight);
    setPendingTagCreate(null);
    matchSpoolBuddyTag(deviceId, pending.uid, pending.tray, linked);
    await refreshSpools();
    setFeedback(tr('spoolAddedLinked', 'Spool added and remote tag linked.'));
  }
  const textStyle = [styles.text, { color: colors.text }];
  const reported = (value: unknown) =>
    value == null ? tr('notReported', 'not reported') : String(value);
  const error = devices.error || modeQuery.error || spools.error;
  return (
    <View style={styles.content}>
      <SectionCard
        title={device?.hostname ?? deviceId}
        subtitle={`${deviceId} · ${
          online ? tr('onlineStatus', 'online') : tr('offlineStatus', 'offline')
        }`}
      >
        <Text style={textStyle}>
          {tr(
            'remoteExplanation',
            'Remote physical NFC reader and scale. Phone NFC can only read a UID; it does not write these tags.',
          )}
        </Text>
        <Text style={textStyle}>
          {connection.isConnected
            ? tr('liveConnected', 'Live remote events connected.')
            : tr(
                'liveDisconnected',
                'Live remote events disconnected. Reconnecting; do not assume queued jobs have completed.',
              )}
        </Text>
        {error ? <Text style={textStyle}>{error.message}</Text> : null}
        {error ? (
          <PrimaryButton
            label={tr('retryConnection', 'Retry device / inventory connection')}
            onPress={() => {
              void devices.refetch();
              void modeQuery.refetch();
              void spools.refetch();
            }}
          />
        ) : null}
        {feedback ? (
          <Text accessibilityLiveRegion="polite" style={textStyle}>
            {feedback}
          </Text>
        ) : null}
        {!canEdit ? (
          <Text style={textStyle}>
            {tr(
              'updatePermissionRequired',
              'Inventory update permission is required for remote commands.',
            )}
          </Text>
        ) : null}
        {device?.pending_command ? (
          <Text style={textStyle}>
            {t('spoolbuddy.pendingCommand', {
              defaultValue: 'Server pending command: {{command}}',
              command: device.pending_command,
            })}
          </Text>
        ) : null}
      </SectionCard>
      <SectionCard
        title={tr('reader', 'Remote reader')}
        subtitle={tr(
          'scanInstructions',
          'Scan a tag on this SpoolBuddy, not on the phone.',
        )}
      >
        <Text accessibilityLiveRegion="polite" style={textStyle}>
          {remote.tagState === 'waiting'
            ? tr('waitingForScan', 'Waiting for a remote scan…')
            : remote.tagState === 'removed'
            ? tr('tagRemoved', 'Tag removed from reader.')
            : remote.tagState === 'matched' && remote.spool
            ? t('spoolbuddy.matchedSummary', {
                defaultValue: 'Matched {{spool}}\nRemaining: {{weight}}',
                spool: spoolLabel(remote.spool),
                weight:
                  remote.spool.label_weight != null &&
                  remote.spool.weight_used != null
                    ? Math.max(
                        0,
                        remote.spool.label_weight - remote.spool.weight_used,
                      ) + ' g'
                    : reported(null),
              })
            : remote.tagState === 'error'
            ? remote.message ||
              tr(
                'spoolmanUnavailable',
                'Spoolman lookup unavailable. Try scanning again.',
              )
            : t('spoolbuddy.unknownTag', {
                defaultValue: 'Unknown tag: {{tag}}',
                tag: remote.tagUid || remote.trayUuid || reported(null),
              })}
        </Text>
        {remote.tagState === 'unknown' ? (
          <>
            <PrimaryButton
              label={tr('linkUnknown', 'Link unknown tag')}
              disabled={
                !canEdit || locked || !(remote.tagUid || remote.trayUuid)
              }
              onPress={() => {
                setSpoolMode('link');
                setSelectedId(null);
              }}
            />
            <PrimaryButton
              label={tr('quickAdd', 'Quick add spool')}
              disabled={
                !canCreate ||
                !canEdit ||
                locked ||
                !validCreate ||
                !modeQuery.isSuccess ||
                pendingTagCreate != null ||
                !(remote.tagUid || remote.trayUuid)
              }
              onPress={() => {
                const tag = {
                  uid: remote.tagUid,
                  tray: remote.trayUuid,
                  weight: remote.weight,
                };
                confirm(
                  tr('confirmQuickAdd', 'Add and link spool?'),
                  t('spoolbuddy.quickAddDetails', {
                    defaultValue:
                      '{{material}}, {{grams}} g; {{core}}. Captured scale: {{weight}}. Tag: {{tag}}',
                    material,
                    grams: labelWeight,
                    core: spoolman
                      ? tr('inheritedCore', 'inherited core weight')
                      : `${coreWeight} g core`,
                    weight:
                      tag.weight == null
                        ? tr('notAvailable', 'not available')
                        : `${tag.weight} g`,
                    tag: tag.uid || tag.tray || '',
                  }),
                  () => createSpool(tag),
                );
              }}
            />
          </>
        ) : null}
        {pendingTagCreate ? (
          <>
            <Text style={textStyle}>
              {t('spoolbuddy.partialQuickAdd', {
                defaultValue:
                  'Spool #{{id}} already exists. Retry its captured tag link / weight update instead of creating a duplicate.',
                id: pendingTagCreate.id,
              })}
            </Text>
            <PrimaryButton
              label={tr('retryQuickAdd', 'Retry captured tag link / weight')}
              disabled={!canEdit || locked}
              onPress={() =>
                confirm(
                  tr(
                    'confirmRetryQuickAdd',
                    'Finish adding the created spool?',
                  ),
                  `${pendingTagCreate.uid || pendingTagCreate.tray} → #${
                    pendingTagCreate.id
                  }; ${
                    pendingTagCreate.weight == null
                      ? reported(null)
                      : pendingTagCreate.weight + ' g'
                  }`,
                  () => finishSpoolmanTagCreate(pendingTagCreate),
                )
              }
            />
          </>
        ) : null}
        {remote.tagState !== 'waiting' ? (
          <PrimaryButton
            label={tr('dismissScan', 'Dismiss scan result')}
            variant="secondary"
            onPress={() =>
              setSpoolBuddyState(deviceId, {
                tagState: 'waiting',
                tagUid: null,
                trayUuid: null,
                spool: null,
                sak: null,
              })
            }
          />
        ) : null}
      </SectionCard>
      <SectionCard
        title={tr('writeJobs', 'Remote NFC write jobs')}
        subtitle={tr(
          'writeExplanation',
          'Write OpenTag3D data with the selected remote reader. Untag only removes the inventory link; it does not erase the physical tag.',
        )}
      >
        <Text style={textStyle}>
          {remote.tagState === 'unknown' && remote.sak === 0
            ? t('spoolbuddy.blankTagReady', {
                defaultValue: 'Writable NTAG detected: {{tag}}',
                tag: remote.tagUid || '',
              })
            : remote.tagState === 'matched'
            ? tr(
                'replacementReady',
                'Tag on reader — replacement will overwrite compatible NTAG data.',
              )
            : tr(
                'blankTagInstructions',
                'Place a compatible blank NTAG on the remote reader. A queued write waits for a tag.',
              )}
        </Text>
        <Text accessibilityLiveRegion="polite" style={textStyle}>
          {t('spoolbuddy.jobStatus', {
            defaultValue: 'Job: {{status}}{{message}}',
            status: tr(`job.${remote.writeStatus}`, remote.writeStatus),
            message: remote.message ? ` — ${remote.message}` : '',
          })}
        </Text>
        {(['existing', 'replace', 'create'] as const).map(mode => (
          <PrimaryButton
            key={mode}
            label={
              mode === 'existing'
                ? tr('chooseUntagged', 'Choose untagged spool')
                : mode === 'replace'
                ? tr('replaceExisting', 'Replace existing tag')
                : tr('createForWriting', 'Create spool for writing')
            }
            variant="secondary"
            disabled={locked}
            onPress={() => {
              setSpoolMode(mode);
              setSelectedId(null);
            }}
          />
        ))}
        {spoolMode !== 'create' ? (
          <>
            <TextField
              label={tr('searchSpools', 'Search spools')}
              value={search}
              onChangeText={setSearch}
            />
            {list.map(spool => (
              <PrimaryButton
                key={spool.id}
                label={`${
                  selectedId === spool.id
                    ? tr('selectedPrefix', 'Selected: ')
                    : ''
                }${spoolLabel(spool)}`}
                variant="secondary"
                disabled={locked}
                onPress={() => setSelectedId(spool.id)}
              />
            ))}
            {spools.isSuccess && !list.length ? (
              <Text style={textStyle}>
                {tr('noMatchingSpools', 'No matching spools.')}
              </Text>
            ) : null}
          </>
        ) : null}
        <TextField
          label={tr('newMaterial', 'New spool material')}
          value={material}
          onChangeText={setMaterial}
        />
        <TextField
          label={tr('newLabelWeight', 'New spool label weight (g)')}
          value={labelWeight}
          onChangeText={setLabelWeight}
          keyboardType="decimal-pad"
        />
        {!spoolman ? (
          <TextField
            label={tr('newCoreWeight', 'New spool core weight (g)')}
            value={coreWeight}
            onChangeText={setCoreWeight}
            keyboardType="decimal-pad"
          />
        ) : null}
        {spoolMode === 'create' ? (
          <PrimaryButton
            label={tr('createSpool', 'Create spool')}
            disabled={
              !canCreate || locked || !validCreate || !modeQuery.isSuccess
            }
            onPress={() =>
              confirm(
                tr('confirmCreateSpool', 'Create spool?'),
                t('spoolbuddy.createDetails', {
                  defaultValue:
                    '{{material}}, {{grams}} g. This creates inventory only; remote writing is a separate action.',
                  material,
                  grams: labelWeight,
                }),
                () => createSpool(),
              )
            }
          />
        ) : null}
        {spoolMode === 'link' ? (
          <PrimaryButton
            label={tr('confirmLink', 'Confirm link to selected spool')}
            disabled={
              !canEdit || locked || !selected || remote.tagState !== 'unknown'
            }
            onPress={() => {
              if (!selected) return;
              const uid = remote.tagUid;
              const tray = remote.trayUuid;
              const tag = {
                tag_uid: uid || undefined,
                tray_uuid: !uid ? tray || undefined : undefined,
                data_origin: 'spoolbuddy',
              };
              confirm(
                tr('confirmRemoteLink', 'Link remote tag?'),
                `${remote.tagUid || remote.trayUuid} → ${spoolLabel(selected)}`,
                async () => {
                  const linked = await spoolbuddyApi.link(
                    spoolman,
                    selected.id,
                    tag,
                  );
                  await refreshSpools();
                  matchSpoolBuddyTag(deviceId, uid, tray, linked);
                  setFeedback(
                    tr(
                      'tagLinkedNoWrite',
                      'Remote tag linked to inventory. No NFC write was performed.',
                    ),
                  );
                },
              );
            }}
          />
        ) : (
          <PrimaryButton
            label={
              spoolMode === 'replace'
                ? tr('writeReplacement', 'Write replacement tag')
                : tr('writeTag', 'Write tag on remote device')
            }
            disabled={
              !canEdit || !online || !device?.has_nfc || locked || !selected
            }
            onPress={() => {
              if (selected)
                confirm(
                  spoolMode === 'replace'
                    ? tr('confirmReplaceTag', 'Replace spool tag?')
                    : tr('confirmWriteTag', 'Write remote NFC tag?'),
                  t('spoolbuddy.writeDetails', {
                    defaultValue:
                      'Write {{spool}} using the physical reader. {{replacement}}',
                    spool: spoolLabel(selected),
                    replacement:
                      spoolMode === 'replace'
                        ? tr(
                            'replacementWarning',
                            'The old inventory tag link will be replaced after a successful write.',
                          )
                        : '',
                  }),
                  () => queueWrite(selected.id),
                );
            }}
          />
        )}
        {writing ? (
          <PrimaryButton
            label={tr('cancelWrite', 'Cancel queued write')}
            variant="danger"
            disabled={mutation.isPending || !canEdit}
            onPress={() =>
              execute('Cancel write', async () => {
                await spoolbuddyApi.cancelWrite(deviceId);
                setSpoolBuddyState(deviceId, {
                  writeStatus: 'cancelled',
                  message: tr(
                    'writeCancelled',
                    'Cancellation queued. A physical write already in progress might still finish; inspect the tag before retrying.',
                  ),
                });
                setFeedback(
                  tr(
                    'cancellationAcknowledged',
                    'Cancellation acknowledged by server, not proof that an in-progress physical write was interrupted.',
                  ),
                );
              })
            }
          />
        ) : null}
        {remote.writeStatus === 'error' && remote.writeSpoolId != null ? (
          <PrimaryButton
            label={tr('retryWrite', 'Retry remote write')}
            disabled={!canEdit || !online || locked}
            onPress={() =>
              confirm(
                tr('confirmRetryWrite', 'Retry remote write?'),
                t('spoolbuddy.retryWriteDetails', {
                  defaultValue: 'Retry spool #{{id}} on {{device}}.',
                  id: remote.writeSpoolId ?? '',
                  device: deviceId,
                }),
                () => queueWrite(remote.writeSpoolId!),
              )
            }
          />
        ) : null}
        {selected && (selected.tag_uid || selected.tray_uuid) ? (
          <PrimaryButton
            label={tr('untagSpool', 'Untag selected spool')}
            variant="danger"
            disabled={!canEdit || locked}
            onPress={() =>
              confirm(
                tr('confirmUntag', 'Remove inventory tag link?'),
                t('spoolbuddy.untagDetails', {
                  defaultValue:
                    'Unlink {{spool}}. This does not erase the physical NFC tag.',
                  spool: spoolLabel(selected),
                }),
                async () => {
                  await spoolbuddyApi.untag(spoolman, selected.id);
                  await refreshSpools();
                  setSelectedId(null);
                  setFeedback(
                    tr(
                      'untagged',
                      'Inventory tag link removed. Physical tag unchanged.',
                    ),
                  );
                },
              )
            }
          />
        ) : null}
      </SectionCard>
      <SectionCard title={tr('scaleCalibration', 'Remote scale calibration')}>
        <Text style={textStyle}>
          {t('spoolbuddy.scaleReadings', {
            defaultValue:
              'Weight: {{weight}} · {{stability}}\nRaw ADC: {{adc}}\nOffset: {{offset}} · Factor: {{factor}}',
            weight:
              remote.weight == null ? reported(null) : remote.weight + ' g',
            stability: remote.stable
              ? tr('stable', 'stable')
              : tr('unstable', 'unstable / waiting'),
            adc: reported(remote.rawAdc),
            offset: reported(device?.tare_offset),
            factor: reported(device?.calibration_factor),
          })}
        </Text>
        {tare.message ? (
          <Text accessibilityLiveRegion="polite" style={textStyle}>
            {tare.message}
          </Text>
        ) : null}
        <PrimaryButton
          label={tr('tare', 'Tare empty scale')}
          disabled={!canEdit || !online || !device?.has_scale || locked}
          onPress={() => execute('Tare', () => tare.tare(remote.rawAdc, false))}
        />
        {tare.step === 'idle' ? (
          <PrimaryButton
            label={tr('startCalibration', 'Start known-weight calibration')}
            disabled={!canEdit || !online || !device?.has_scale || locked}
            onPress={() => tare.setStep('zero')}
          />
        ) : (
          <>
            <Text style={textStyle}>
              {tare.step === 'zero'
                ? tr(
                    'emptyScaleInstructions',
                    'Remove everything from the scale, wait for stability, then capture zero.',
                  )
                : t('spoolbuddy.knownWeightInstructions', {
                    defaultValue:
                      'Zero ADC preserved: {{zero}}. Place a known weight on the scale and wait for stability.',
                    zero: tare.zero ?? '',
                  })}
            </Text>
            {tare.step === 'zero' ? (
              <PrimaryButton
                label={tr('captureZero', 'Capture empty-scale zero')}
                disabled={
                  !canEdit ||
                  !online ||
                  !connection.isConnected ||
                  locked ||
                  remote.rawAdc == null ||
                  !remote.stable
                }
                onPress={() =>
                  execute('Set zero', () => tare.tare(remote.rawAdc, true))
                }
              />
            ) : (
              <>
                <TextField
                  label={tr('knownWeight', 'Known weight (g)')}
                  value={knownWeight}
                  onChangeText={setKnownWeight}
                  keyboardType="decimal-pad"
                />
                <PrimaryButton
                  label={tr('saveFactor', 'Save calibration factor')}
                  disabled={
                    !canEdit ||
                    !online ||
                    !connection.isConnected ||
                    locked ||
                    !validWeight ||
                    remote.rawAdc == null ||
                    tare.zero == null ||
                    remote.rawAdc === tare.zero ||
                    !remote.stable
                  }
                  onPress={() =>
                    execute('Save calibration', async () => {
                      await spoolbuddyApi.calibrate(
                        deviceId,
                        positiveWeight,
                        remote.rawAdc!,
                        tare.zero!,
                      );
                      tare.setStep('idle');
                      setFeedback(
                        tr(
                          'calibrationSaved',
                          'Known-weight calibration saved.',
                        ),
                      );
                      await devices.refetch();
                    })
                  }
                />
              </>
            )}
            <PrimaryButton
              label={tr('cancelCalibration', 'Cancel calibration')}
              variant="secondary"
              disabled={mutation.isPending}
              onPress={tare.cancel}
            />
          </>
        )}
      </SectionCard>
      <SectionCard
        title={tr('diagnosticsHealth', 'Hardware diagnostics and health')}
      >
        <Text selectable style={textStyle}>
          {t('spoolbuddy.deviceHealth', {
            defaultValue:
              'NFC installed: {{hasNfc}} · healthy: {{nfcOk}}\nReader: {{reader}} · Connection: {{connection}}\nScale installed: {{hasScale}} · healthy: {{scaleOk}}\nDaemon uptime (s): {{uptime}}\nLast seen: {{lastSeen}}\nSystem telemetry (CPU/load, memory, disk, OS, uptime):\n{{telemetry}}',
            hasNfc: reported(device?.has_nfc),
            nfcOk: reported(device?.nfc_ok),
            reader: reported(device?.nfc_reader_type),
            connection: reported(device?.nfc_connection),
            hasScale: reported(device?.has_scale),
            scaleOk: reported(device?.scale_ok),
            uptime: reported(device?.uptime_s),
            lastSeen: device?.last_seen ? formatDateTime(device.last_seen) : reported(null),
            telemetry: device?.system_stats
              ? JSON.stringify(device.system_stats, null, 2)
              : reported(null),
          })}
        </Text>
        {(['nfc', 'scale', 'read_tag'] as const).map(type => (
          <PrimaryButton
            key={type}
            label={t(`spoolbuddy.diagnostic.${type}`, {
              defaultValue: 'Run {{type}} diagnostic',
              type: type === 'read_tag' ? 'read-tag' : type,
            })}
            disabled={
              !online ||
              locked ||
              !hasPermission('inventory:read') ||
              (type === 'scale' ? !device?.has_scale : !device?.has_nfc)
            }
            onPress={() => {
              setDiagnostic(type);
              setDiagnosticMessage('');
              setDiagnosticRun(run => run + 1);
            }}
          />
        ))}
        <SimpleModal
          visible={diagnostic != null}
          title={tr('diagnosticTitle', 'Hardware diagnostic')}
          subtitle={`${deviceId} · ${diagnostic ?? ''}`}
          onClose={() => {
            if (!mutation.isPending) {
              setDiagnosticRunning(false);
              setDiagnostic(null);
            }
          }}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={textStyle}>
              {t('spoolbuddy.diagnosticType', {
                defaultValue: '{{type}} diagnostic',
                type: diagnostic ?? '',
              })}
            </Text>
            {diagnosticRunning ? (
              <Text style={textStyle}>
                {tr(
                  'waitingForDiagnostic',
                  'Waiting for remote diagnostic result…',
                )}
              </Text>
            ) : null}
            {diagnosticMessage ? (
              <Text accessibilityLiveRegion="polite" style={textStyle}>
                {diagnosticMessage}
              </Text>
            ) : null}
            {diagnosticResult.data ? (
              <Text selectable style={textStyle}>
                {t('spoolbuddy.diagnosticResult', {
                  defaultValue: '{{status}} · Exit code: {{code}}\n{{output}}',
                  status: diagnosticResult.data.success
                    ? tr('success', 'Success')
                    : tr('failed', 'Failed'),
                  code: diagnosticResult.data.exit_code,
                  output: diagnosticResult.data.output,
                })}
              </Text>
            ) : null}
            {diagnosticResult.error &&
            !(
              diagnosticResult.error instanceof ApiError &&
              diagnosticResult.error.status === 404
            ) ? (
              <Text style={textStyle}>{diagnosticResult.error.message}</Text>
            ) : null}
            <PrimaryButton
              label={tr('runRetryDiagnostic', 'Run / retry diagnostic')}
              disabled={!online || locked || diagnostic == null}
              onPress={() =>
                execute('Run diagnostic', async () => {
                  if (!diagnostic) return;
                  setDiagnosticMessage('');
                  try {
                    await spoolbuddyApi.diagnose(deviceId, diagnostic);
                  } catch (diagnosticError) {
                    setDiagnosticMessage(
                      diagnosticError instanceof Error
                        ? diagnosticError.message
                        : tr(
                            'diagnosticQueueFailed',
                            'Unable to queue diagnostic.',
                          ),
                    );
                    throw diagnosticError;
                  }
                  setDiagnosticRun(run => run + 1);
                  setDiagnosticRunning(true);
                  setFeedback('');
                })
              }
            />
            <PrimaryButton
              label={tr('closeDiagnostic', 'Close diagnostic')}
              variant="secondary"
              disabled={mutation.isPending}
              onPress={() => {
                setDiagnosticRunning(false);
                setDiagnostic(null);
              }}
            />
          </ScrollView>
        </SimpleModal>
      </SectionCard>
      <SectionCard title={tr('updatesSsh', 'Daemon updates and SSH setup')}>
        <Text style={textStyle}>
          {t('spoolbuddy.updateDetails', {
            defaultValue:
              'Current: {{current}}\nLatest server release: {{latest}}\nUpdate: {{status}}\n{{message}}{{reconnect}}',
            current: reported(
              device?.firmware_version ?? update.data?.current_version,
            ),
            latest: reported(update.data?.latest_version),
            status: updateQueued
              ? tr(
                  'queuedAcknowledgement',
                  'queued; waiting for acknowledgement',
                )
              : tr(
                  `updateStatus.${updateStatus ?? 'idle'}`,
                  updateStatus ?? 'idle',
                ),
            message: updateMessage ?? '',
            reconnect: updateReconnect
              ? '\n' +
                tr(
                  'waitingForReconnect',
                  'Waiting for remote reconnect; completion is not inferred from dispatch.',
                )
              : '',
          })}
        </Text>
        {update.error ? (
          <Text style={textStyle}>{update.error.message}</Text>
        ) : null}
        <PrimaryButton
          label={tr('checkUpdates', 'Check device updates')}
          variant="secondary"
          loading={update.isFetching}
          onPress={() => {
            void update.refetch();
          }}
        />
        <PrimaryButton
          label={
            update.data?.update_available
              ? tr('applyUpdate', 'Apply device update')
              : tr('forceUpdate', 'Force device update')
          }
          disabled={!canEdit || !online || locked}
          onPress={() =>
            confirm(
              update.data?.update_available
                ? tr('confirmUpdate', 'Apply daemon update?')
                : tr('confirmForceUpdate', 'Force daemon update?'),
              tr(
                'updateWarning',
                'The server will SSH into this remote device, install its matching release and restart the daemon. The device may disconnect.',
              ),
              async () => {
                updateOnlineBaseline.current = remote.onlineRevision;
                await spoolbuddyApi.update(deviceId);
                setSpoolBuddyState(deviceId, {
                  updateStatus: null,
                  updateMessage: null,
                  updateReportedAt: null,
                });
                setUpdateQueued(true);
                setUpdateReconnect(true);
                setFeedback(
                  tr(
                    'updateQueued',
                    'Update queued. Waiting for server-reported progress.',
                  ),
                );
                await devices.refetch();
              },
            )
          }
        />
        <PrimaryButton
          label={tr('sshSetup', 'SSH setup / public key')}
          variant="secondary"
          disabled={!hasPermission('settings:read')}
          onPress={() => setSshExpanded(value => !value)}
        />
        {sshExpanded ? (
          <>
            <Text style={textStyle}>
              {tr(
                'sshInstructions',
                'The server deploys its SSH key automatically. For manual setup, add this public key to ~/.ssh/authorized_keys on the remote device.',
              )}
            </Text>
            <Text selectable style={textStyle}>
              {ssh.data?.public_key ??
                ssh.error?.message ??
                tr('loadingSshKey', 'Loading public key…')}
            </Text>
            <PrimaryButton
              label={tr('copySshKey', 'Copy SSH public key')}
              disabled={!ssh.data?.public_key}
              onPress={() => {
                Clipboard.setString(ssh.data!.public_key);
                setFeedback(tr('sshKeyCopied', 'SSH public key copied.'));
              }}
            />
            {ssh.isError ? (
              <PrimaryButton
                label={tr('retrySshKey', 'Retry public key')}
                onPress={() => {
                  void ssh.refetch();
                }}
              />
            ) : null}
          </>
        ) : null}
      </SectionCard>
      <SectionCard
        title={tr('lifecycle', 'Remote device lifecycle')}
        subtitle={tr(
          'lifecycleExplanation',
          'These actions affect only this remote unit, never the phone.',
        )}
      >
        {(Object.keys(commands) as SpoolBuddySystemCommand[]).map(command => (
          <PrimaryButton
            key={command}
            label={tr(`commands.${command}`, commands[command].label)}
            variant={command === 'shutdown' ? 'danger' : 'secondary'}
            disabled={!canEdit || !online || busy || writing || updating}
            onPress={() =>
              confirm(
                tr(
                  `commands.${command}.confirm`,
                  `${commands[command].label}?`,
                ),
                `${tr(`commands.${command}.detail`, commands[command].detail)}${
                  device?.pending_command
                    ? '\n' +
                      t('spoolbuddy.replacePending', {
                        defaultValue:
                          'This replaces pending command: {{command}}.',
                        command: device.pending_command,
                      })
                    : ''
                }`,
                async () => {
                  await spoolbuddyApi.command(deviceId, command);
                  setFeedback(
                    t('spoolbuddy.commandQueued', {
                      defaultValue:
                        '{{command}} queued for {{device}}. Server acknowledgement is not proof of device recovery. Monitor last seen / online state.',
                      command: tr(
                        `commands.${command}`,
                        commands[command].label,
                      ),
                      device: deviceId,
                    }),
                  );
                  await devices.refetch();
                },
              )
            }
          />
        ))}
      </SectionCard>
      <ConfirmModal
        visible={confirmation != null}
        title={confirmation?.title ?? ''}
        message={confirmation?.message ?? ''}
        confirmLabel={tr('confirmAction', 'Confirm remote action')}
        loading={mutation.isPending}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) mutation.mutate(confirmation);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  text: { marginVertical: spacing.xs },
});
