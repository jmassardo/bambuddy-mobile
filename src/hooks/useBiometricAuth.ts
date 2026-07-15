// Biometric authentication for app unlock
// Uses expo-local-authentication for Face ID / Touch ID / Fingerprint

import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
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
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;

      let biometricType: 'fingerprint' | 'facial' | 'iris' | null = null;
      if (available) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          biometricType = 'facial';
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          biometricType = 'fingerprint';
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          biometricType = 'iris';
        }
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
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Bambuddy',
        cancelLabel: 'Use Password',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      // Verify biometrics work before enabling
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
