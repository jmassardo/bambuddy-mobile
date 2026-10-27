import { useEffect, useState } from 'react';
import { spoolbuddyApi } from '@/api/spoolbuddy';
import type { SpoolBuddyDevice } from '@/types/api';
import { useTranslation } from '@/i18n';

export function useSpoolBuddyTare(
  device: SpoolBuddyDevice | undefined,
  refreshDevice: () => Promise<unknown>,
) {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState<{
    id: string;
    before: string | null;
    calibrating: boolean;
    deadline: number;
  } | null>(null);
  const [zero, setZero] = useState<number | null>(null);
  const [step, setStep] = useState<'idle' | 'zero' | 'weight'>('idle');
  const [message, setMessage] = useState('');
  const id = device?.device_id;

  useEffect(() => {
    setWaiting(null);
    setZero(null);
    setStep('idle');
    setMessage('');
  }, [id]);

  useEffect(() => {
    if (!waiting || !device || device.device_id !== waiting.id) return;
    if (
      device.last_calibrated_at !== waiting.before &&
      device.last_calibrated_at != null
    ) {
      setWaiting(null);
      setMessage(
        t('spoolbuddy.tareConfirmed', {
          defaultValue: 'Tare confirmed by remote device.',
        }),
      );
      if (waiting.calibrating) setStep('weight');
    }
  }, [device, waiting, t]);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => {
      void refreshDevice().catch(() => {});
    }, 1000);
    const timer = setTimeout(() => {
      setWaiting(null);
      setMessage(
        t('spoolbuddy.tareTimeout', {
          defaultValue:
            'Tare timed out after 15 seconds. Check that the SpoolBuddy daemon is running and connected, then retry.',
        }),
      );
    }, Math.max(0, waiting.deadline - Date.now()));
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
    };
  }, [waiting, t, refreshDevice]);

  async function tare(raw: number | null, calibrating: boolean) {
    if (!device || !device.online)
      throw new Error(
        t('spoolbuddy.offline', { defaultValue: 'Remote device is offline.' }),
      );
    if (calibrating && raw === null)
      throw new Error(
        t('spoolbuddy.waitForAdc', {
          defaultValue: 'Wait for a live raw ADC reading before setting zero.',
        }),
      );
    setZero(raw);
    setMessage(
      t('spoolbuddy.waitingForTare', {
        defaultValue: 'Waiting for remote tare acknowledgement…',
      }),
    );
    const pending = {
      id: device.device_id,
      before: device.last_calibrated_at,
      calibrating,
      deadline: Date.now() + 15000,
    };
    setWaiting(pending);
    try {
      await spoolbuddyApi.tare(device.device_id);
    } catch (error) {
      setWaiting(null);
      setMessage(
        error instanceof Error
          ? error.message
          : t('spoolbuddy.tareQueueFailed', {
              defaultValue: 'Unable to queue tare.',
            }),
      );
      throw error;
    }
  }

  function cancel() {
    setWaiting(null);
    setStep('idle');
    setZero(null);
    setMessage(
      t('spoolbuddy.calibrationCancelled', {
        defaultValue:
          'Calibration cancelled locally. A tare already queued on the device cannot be recalled.',
      }),
    );
  }

  return {
    waiting: waiting != null,
    zero,
    step,
    setStep,
    message,
    tare,
    cancel,
  };
}
