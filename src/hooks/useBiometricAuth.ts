// Biometric authentication for app unlock
// Uses react-native-keychain for Face ID / Touch ID / Fingerprint

import { useCallback, useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_ENABLED_KEY = 'bambuddy-biometric-enabled';

interface BiometricState {
  available: boolean;
  biometricType: 'fingerprint' | 'facial' | 'iris' | null;
  enabled: boolean;
  loading: boolean;
}

export function useBiometricAuth() {
  const [state, setState] = useState<BiometricState>({
    available: false,
    biometricType: null,
    enabled: false,
    loading: true,
  });

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const biometryType = await Keychain.getSupportedBiometryType();
      const available = biometryType !== null;

      let biometricType: 'fingerprint' | 'facial' | 'iris' | null = null;
      if (biometryType === Keychain.BIOMETRY_TYPE.FACE_ID ||
          biometryType === Keychain.BIOMETRY_TYPE.FACE) {
        biometricType = 'facial';
      } else if (biometryType === Keychain.BIOMETRY_TYPE.TOUCH_ID ||
                 biometryType === Keychain.BIOMETRY_TYPE.FINGERPRINT) {
        biometricType = 'fingerprint';
      } else if (biometryType === Keychain.BIOMETRY_TYPE.IRIS) {
        biometricType = 'iris';
      }

      const enabledStr = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      const enabled = enabledStr === 'true' && available;

      setState({ available, biometricType, enabled, loading: false });
    } catch {
      setState({ available: false, biometricType: null, enabled: false, loading: false });
    }
  };

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      // Use Keychain with biometric access control to trigger auth prompt
      const creds = await Keychain.getGenericPassword({
        service: 'bambuddy-biometric-check',
        authenticationPrompt: {
          title: 'Unlock Bambuddy',
          cancel: 'Use Password',
        },
      });
      // If no credential stored yet, set one first
      if (!creds) {
        await Keychain.setGenericPassword('biometric', 'check', {
          service: 'bambuddy-biometric-check',
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
          accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
        });
        // Try reading it back with biometric
        const result = await Keychain.getGenericPassword({
          service: 'bambuddy-biometric-check',
          authenticationPrompt: {
            title: 'Unlock Bambuddy',
            cancel: 'Use Password',
          },
        });
        return !!result;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const success = await authenticate();
      if (!success) return false;
    }
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
    setState((prev) => ({ ...prev, enabled }));
    return true;
  }, [authenticate]);

  const getBiometricLabel = useCallback((): string => {
    switch (state.biometricType) {
      case 'facial':
        return 'Face ID';
      case 'fingerprint':
        return 'Fingerprint';
      case 'iris':
        return 'Iris';
      default:
        return 'Biometric';
    }
  }, [state.biometricType]);

  return {
    ...state,
    authenticate,
    setEnabled,
    getBiometricLabel,
  };
}
