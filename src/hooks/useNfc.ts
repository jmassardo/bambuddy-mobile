// NFC support for SpoolBuddy tag reading and writing
// Uses react-native-nfc-manager

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

export interface NfcState {
  supported: boolean;
  enabled: boolean;
  reading: boolean;
}

export function useNfc() {
  const [state, setState] = useState<NfcState>({
    supported: false,
    enabled: false,
    reading: false,
  });

  useEffect(() => {
    checkNfcSupport();
  }, []);

  const checkNfcSupport = async () => {
    try {
      const supported = await NfcManager.isSupported();
      if (supported) {
        await NfcManager.start();
        const enabled = await NfcManager.isEnabled();
        setState({ supported: true, enabled, reading: false });
      } else {
        setState({ supported: false, enabled: false, reading: false });
      }
    } catch {
      setState({ supported: false, enabled: false, reading: false });
    }
  };

  const readTag = useCallback(async (): Promise<{
    uid: string;
    data: string | null;
  } | null> => {
    if (!state.supported || !state.enabled) {
      Alert.alert(
        'NFC Not Available',
        'Please enable NFC in your device settings.',
      );
      return null;
    }

    try {
      setState(prev => ({ ...prev, reading: true }));

      await NfcManager.requestTechnology(NfcTech.Ndef);

      const tag = await NfcManager.getTag();
      if (!tag) {
        setState(prev => ({ ...prev, reading: false }));
        return null;
      }

      const uid = tag.id || '';
      let data: string | null = null;

      if (tag.ndefMessage && tag.ndefMessage.length > 0) {
        const record = tag.ndefMessage[0];
        if (record.payload) {
          // Decode NDEF text record
          const payload = record.payload as number[];
          // Skip the language code prefix for text records
          const langCodeLen = payload[0];
          data = String.fromCharCode(...payload.slice(1 + langCodeLen));
        }
      }

      setState(prev => ({ ...prev, reading: false }));
      return { uid, data };
    } catch (error) {
      setState(prev => ({ ...prev, reading: false }));
      console.warn('[NFC] Read error:', error);
      return null;
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }, [state.supported, state.enabled]);

  const writeTag = useCallback(
    async (data: string): Promise<boolean> => {
      if (!state.supported || !state.enabled) {
        Alert.alert(
          'NFC Not Available',
          'Please enable NFC in your device settings.',
        );
        return false;
      }

      try {
        setState(prev => ({ ...prev, reading: true }));

        await NfcManager.requestTechnology(NfcTech.Ndef);

        const bytes = Ndef.encodeMessage([Ndef.textRecord(data)]);
        if (bytes) {
          await NfcManager.ndefHandler.writeNdefMessage(bytes);
        }

        setState(prev => ({ ...prev, reading: false }));
        return true;
      } catch (error) {
        setState(prev => ({ ...prev, reading: false }));
        console.warn('[NFC] Write error:', error);
        Alert.alert(
          'Write Failed',
          'Could not write to NFC tag. Please try again.',
        );
        return false;
      } finally {
        NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    },
    [state.supported, state.enabled],
  );

  const cancelRead = useCallback(async () => {
    try {
      await NfcManager.cancelTechnologyRequest();
      setState(prev => ({ ...prev, reading: false }));
    } catch {
      // Ignore
    }
  }, []);

  return { ...state, readTag, writeTag, cancelRead };
}
