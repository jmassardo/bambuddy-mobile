import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {
  X,
  Search,
  ChevronRight,
  Stethoscope,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import { useTheme } from '@/theme';
import { api } from '@/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DiscoveredPrinter, PrinterDiagnosticResult, DiagnosticCheck } from '@/types/api';

const PRINTER_MODELS = [
  { group: 'A1 Series', models: ['A1', 'A1 Mini'] },
  { group: 'A2 Series', models: ['A2L'] },
  { group: 'H2 Series', models: ['H2C', 'H2D', 'H2D Pro', 'H2S'] },
  { get group() { return translateNative('native.2b6ee4ad967b8cc0'); }, models: ['P1P', 'P1S', 'P2S'] },
  { group: 'X1 Series', models: ['X1', 'X1 Carbon', 'X1E'] },
  { group: 'X2 Series', models: ['X2D'] },
];

function mapModelCode(code: string): string {
  const modelMap: Record<string, string> = {
    BL_P001: 'X1 Carbon', BL_P002: 'X1', BL_P003: 'X1E',
    BL_A001: 'A1 Mini', BL_A003: 'A1',
    C12: 'X1 Carbon', C11: 'X1', N2S: 'P1S', N1: 'P1P',
    C13: 'X1E', A04: 'A1', A01: 'A1 Mini',
    K11: 'H2D', K12: 'H2D Pro', K21: 'H2S', K31: 'H2C',
    L01: 'A2L', J01: 'P2S', G01: 'X2D',
  };
  return modelMap[code] || code;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    serial_number: string;
    ip_address: string;
    access_code: string;
    model: string;
    location: string;
    auto_archive: boolean;
  }) => void;
  existingSerials: string[];
}

export function AddPrinterModal({ visible, onClose, onAdd, existingSerials }: Props) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [useCustomSubnet, setUseCustomSubnet] = useState(false);
  const [customSubnet, setCustomSubnet] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [model, setModel] = useState('');
  const [location, setLocation] = useState('');
  const [autoArchive, setAutoArchive] = useState(true);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [discoveryError, setDiscoveryError] = useNativeMessageState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [subnet, setSubnet] = useState('');
  const [detectedSubnets, setDetectedSubnets] = useState<string[]>([]);
  const [isDocker, setIsDocker] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 });

  // Preflight state
  const [checkingSave, setCheckingSave] = useState(false);
  const [saveWarning, setSaveWarning] = useState<PrinterDiagnosticResult | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<PrinterDiagnosticResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch discovery info on mount
  useEffect(() => {
    if (!visible) return;
    const loadDiscoveryInfo = async () => {
      const last = await AsyncStorage.getItem('printer-custom-cidr').catch(() => null);
      if (last) setCustomSubnet(last);
      try {
        const info = await api.getDiscoveryInfo();
        setIsDocker(info.is_docker);
        if (info.subnets?.length > 0) {
          setDetectedSubnets(info.subnets);
          setSubnet(info.subnets[0]);
        }
      } catch {}
    };

    void loadDiscoveryInfo();
  }, [visible]);

  // Reset form on close
  useEffect(() => {
    if (!visible) {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setName('');
      setSerialNumber('');
      setIpAddress('');
      setAccessCode('');
      setModel('');
      setLocation('');
      setAutoArchive(true);
      setDiscovering(false);
      setDiscovered([]);
      setDiscoveryError('');
      setHasScanned(false);
      setSaveWarning(null);
      setShowDiagnostic(false);
      setDiagnosticResult(null);
    }
  }, [setDiscoveryError, visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      api.stopDiscovery?.().catch(() => {});
      api.stopSubnetScan?.().catch(() => {});
    };
  }, []);

  const newPrinters = discovered.filter(p => !existingSerials.includes(p.serial));

  const startDiscovery = async () => {
    setDiscoveryError('');
    setDiscovered([]);
    setDiscovering(true);
    setHasScanned(false);
    setScanProgress({ scanned: 0, total: 0 });

    try {
      if (useCustomSubnet || (isDocker && subnet)) {
        const scanSubnet = useCustomSubnet ? customSubnet.trim() : subnet;
        if (!/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(scanSubnet) ||
            Number(scanSubnet.split('/')[1]) > 32 ||
            scanSubnet.split('/')[0].split('.').some(part => Number(part) > 255)) {
          throw new Error(t('fleet.invalidCIDR', { defaultValue: 'Enter a valid IPv4 CIDR, e.g. 192.168.1.0/24.' }));
        }
        if (useCustomSubnet) await AsyncStorage.setItem('printer-custom-cidr', scanSubnet);
        // Subnet scan for Docker
        await api.startSubnetScan?.(scanSubnet);
        pollRef.current = setInterval(async () => {
          try {
            const status = await api.getSubnetScanStatus?.();
            if (status) setScanProgress({ scanned: status.scanned ?? 0, total: status.total ?? 0 });
            const printers = await api.getDiscoveredPrinters?.();
            if (printers) setDiscovered(printers);
            if (status && !status.running) {
              if (pollRef.current) clearInterval(pollRef.current);
              setDiscovering(false);
              setHasScanned(true);
            }
          } catch (error) {
            if (pollRef.current) clearInterval(pollRef.current);
            setDiscoveryError(error instanceof Error ? error.message : nativeMessage('fleet.scanFailed', () => ({ defaultValue: 'Subnet scan failed.' })));
            setDiscovering(false);
            setHasScanned(true);
            void api.stopSubnetScan().catch(() => {});
          }
        }, 500);
      } else {
        // SSDP discovery
        await api.startDiscovery?.(10);
        pollRef.current = setInterval(async () => {
          try {
            const printers = await api.getDiscoveredPrinters?.();
            if (printers) setDiscovered(printers);
          } catch {}
        }, 1000);

        timeoutRef.current = setTimeout(async () => {
          if (pollRef.current) clearInterval(pollRef.current);
          try { await api.stopDiscovery?.(); } catch {}
          setDiscovering(false);
          setHasScanned(true);
          try {
            const printers = await api.getDiscoveredPrinters?.();
            if (printers) setDiscovered(printers);
          } catch {}
        }, 10000);
      }
    } catch (e) {
      setDiscoveryError(e instanceof Error ? e.message : nativeMessage('native.7ce438a79ab9d810'));
      setDiscovering(false);
      setHasScanned(true);
    }
  };

  const selectPrinter = (printer: DiscoveredPrinter) => {
    setName(printer.name || '');
    setSerialNumber(printer.serial.startsWith('unknown-') ? '' : printer.serial);
    setIpAddress(printer.ip_address);
    setModel(mapModelCode(printer.model ?? ''));
    setDiscovered([]);
  };

  const runDiagnostic = async () => {
    if (!ipAddress.trim()) return;
    setDiagnosing(true);
    setDiagnosticResult(null);
    try {
      const result = await api.diagnoseConnection({
        ip_address: ipAddress.trim(),
        serial_number: serialNumber.trim() || undefined,
        access_code: accessCode || undefined,
      });
      setDiagnosticResult(result);
      setShowDiagnostic(true);
    } catch {
      setDiagnosticResult(null);
    } finally {
      setDiagnosing(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !ipAddress.trim() || !serialNumber.trim() || !accessCode.trim()) return;

    setCheckingSave(true);
    try {
      const result = await api.diagnoseConnection({
        ip_address: ipAddress.trim(),
        serial_number: serialNumber.trim() || undefined,
        access_code: accessCode || undefined,
      });
      if (result.checks?.some((c) => c.status === 'fail')) {
        setSaveWarning(result);
        setCheckingSave(false);
        return;
      }
    } catch {
      // Diagnostic failed — don't block save
    }
    setCheckingSave(false);
    onAdd({
      name: name.trim(),
      serial_number: serialNumber.trim(),
      ip_address: ipAddress.trim(),
      access_code: accessCode,
      model,
      location: location.trim(),
      auto_archive: autoArchive,
    });
  };

  const handleSaveAnyway = () => {
    setSaveWarning(null);
    onAdd({
      name: name.trim(),
      serial_number: serialNumber.trim(),
      ip_address: ipAddress.trim(),
      access_code: accessCode,
      model,
      location: location.trim(),
      auto_archive: autoArchive,
    });
  };

  const isFormValid = name.trim() && ipAddress.trim() && serialNumber.trim() && accessCode.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.112c324655102ccb')}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Discovery Section */}
            <View style={[styles.section, { borderBottomColor: colors.borderSubtle }]}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('fleet.customCIDR', { defaultValue: 'Scan custom CIDR (instead of SSDP)' })}</Text>
                <Switch value={useCustomSubnet} onValueChange={setUseCustomSubnet} disabled={discovering} accessibilityLabel={t('fleet.customCIDR', { defaultValue: 'Scan custom CIDR (instead of SSDP)' })} />
                {useCustomSubnet ? <TextInput value={customSubnet} onChangeText={setCustomSubnet} editable={!discovering} autoCapitalize="none" placeholder="192.168.1.0/24" style={[styles.input, { color: colors.text, borderColor: colors.border }]} /> : null}
                {isDocker ? <Pressable disabled={discovering} onPress={() => { setIsDocker(false); setUseCustomSubnet(false); }}><Text style={{ color: colors.accent }}>{t('fleet.ssdp', { defaultValue: 'Use SSDP discovery instead' })}</Text></Pressable> : null}
              </View>
              {detectedSubnets.length > 0 && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.d5a49d761833ee68')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subnetRow}>
                    {detectedSubnets.map(s => (
                      <Pressable
                        key={s}
                        onPress={() => setSubnet(s)}
                        style={[
                          styles.subnetChip,
                          {
                            backgroundColor: subnet === s ? colors.accent : colors.surfaceElevated,
                            borderColor: subnet === s ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.subnetText, { color: subnet === s ? colors.textInverse : colors.text }]}>{s}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {detectedSubnets.length === 0 && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.1866383ae724127f')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                    value={subnet}
                    onChangeText={setSubnet}
                    placeholder="192.168.1.0/24"
                    placeholderTextColor={colors.inputPlaceholder}
                    editable={!discovering}
                  />
                </View>
              )}

              <Pressable
                onPress={startDiscovery}
                disabled={discovering}
                style={[styles.discoveryBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                {discovering ? (
                  <>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.discoveryBtnText, { color: colors.text }]}>
                      {scanProgress.total > 0
                        ? translateNative('native.4aa190f42a145545', { value0: String(scanProgress.scanned), value1: String(scanProgress.total) })
                        : translateNative('native.70b1a1de8ad75810')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Search size={16} color={colors.accent} />
                    <Text style={[styles.discoveryBtnText, { color: colors.text }]}>
                      {isDocker || useCustomSubnet ? t('fleet.scanSubnet', { defaultValue: 'Scan subnet' }) : translateNative('native.f9f56a993f325d68')}
                    </Text>
                  </>
                )}
              </Pressable>

              {discoveryError ? (
                <Text style={[styles.hint, { color: colors.error }]}>{discoveryError}</Text>
              ) : null}

              {newPrinters.length > 0 && (
                <View style={styles.discoveredList}>
                  {newPrinters.map(p => (
                    <Pressable
                      key={p.serial}
                      onPress={() => selectPrinter(p)}
                      style={[styles.discoveredItem, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.discoveredName, { color: colors.text }]} numberOfLines={1}>
                          {p.name || p.serial}
                        </Text>
                        <Text style={[styles.discoveredDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                          {mapModelCode(p.model ?? '') || translateNative('native.ff12a040d13addb7')} • {p.ip_address}
                          {p.serial.startsWith('unknown-') ? translateNative('native.f360982dfadefaf1') : ''}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={colors.textTertiary} />
                    </Pressable>
                  ))}
                </View>
              )}

              {hasScanned && !discovering && discovered.length === 0 && (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>{translateNative('native.8e0b19c75cf452b6')}</Text>
              )}

              {hasScanned && !discovering && discovered.length > 0 && newPrinters.length === 0 && (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>{translateNative('native.8e1b0a07b5aecf46')}</Text>
              )}
            </View>

            {/* Form fields */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.4770e36748f4c6d3')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={name}
                onChangeText={setName}
                placeholder={translateNative('native.0795d0073d5c0b05')}
                placeholderTextColor={colors.inputPlaceholder}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.37c736a3b2b18c54')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder={translateNative('native.7b1e1b764343cc19')}
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.8c67c1f88f421588')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={serialNumber}
                onChangeText={setSerialNumber}
                placeholder={translateNative('native.0223088e116a0a30')}
                placeholderTextColor={colors.inputPlaceholder}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.d9087f78d120047a')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder={translateNative('native.4eb1bbb87faa51b4')}
                placeholderTextColor={colors.inputPlaceholder}
                secureTextEntry
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.8b1a1fcf5ba1cde5')}</Text>
              <Pressable
                onPress={() => setShowModelPicker(!showModelPicker)}
                style={[styles.input, styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              >
                <Text style={{ color: model ? colors.inputText : colors.inputPlaceholder }}>
                  {model || translateNative('native.4bf6eb2451dfd9a8')}
                </Text>
                <ChevronRight size={16} color={colors.textTertiary} style={{ transform: [{ rotate: showModelPicker ? '90deg' : '0deg' }] }} />
              </Pressable>
              {showModelPicker && (
                <View style={[styles.modelList, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Pressable onPress={() => { setModel(''); setShowModelPicker(false); }} style={styles.modelItem}>
                    <Text style={{ color: colors.textSecondary }}>{translateNative('common.none')}</Text>
                  </Pressable>
                  {PRINTER_MODELS.map(group => (
                    <View key={group.group}>
                      <Text style={[styles.modelGroup, { color: colors.textTertiary }]}>{group.group}</Text>
                      {group.models.map(m => (
                        <Pressable
                          key={m}
                          onPress={() => { setModel(m); setShowModelPicker(false); }}
                          style={[styles.modelItem, model === m && { backgroundColor: colors.accentBg }]}
                        >
                          <Text style={{ color: model === m ? colors.accent : colors.text }}>{m}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{translateNative('native.d14cac8b69c6fd0d')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={location}
                onChangeText={setLocation}
                placeholder={translateNative('native.d7561e7cdb0780a6')}
                placeholderTextColor={colors.inputPlaceholder}
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                {translateNative('native.84f9bb1f5b062224')}</Text>
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>{translateNative('native.b19073c85f66bbda')}</Text>
              <Switch
                value={autoArchive}
                onValueChange={setAutoArchive}
                trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                thumbColor={colors.textInverse}
              />
            </View>

            {/* Diagnostic button */}
            <Pressable
              onPress={runDiagnostic}
              disabled={!ipAddress.trim() || diagnosing}
              style={[
                styles.diagBtn,
                {
                  borderColor: colors.border,
                  opacity: !ipAddress.trim() ? 0.4 : 1,
                },
              ]}
            >
              {diagnosing ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Stethoscope size={16} color={colors.textSecondary} />
              )}
              <Text style={[styles.diagBtnText, { color: colors.textSecondary }]}>{translateNative('native.c0f33ed0f24741b3')}</Text>
            </Pressable>

            {/* Diagnostic results */}
            {showDiagnostic && diagnosticResult && (
              <View style={[styles.diagResults, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                {diagnosticResult.checks?.map((check: DiagnosticCheck, i: number) => (
                  <View key={i} style={styles.diagCheck}>
                    {check.status === 'pass' ? (
                      <CheckCircle size={14} color={colors.success} />
                    ) : check.status === 'fail' ? (
                      <XCircle size={14} color={colors.error} />
                    ) : (
                      <AlertTriangle size={14} color={colors.warning} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.diagCheckName, { color: colors.text }]}>{check.id.replace(/_/g, ' ')}</Text>
                      {Object.keys(check.params).length > 0 && (
                        <Text style={[styles.diagCheckMsg, { color: colors.textSecondary }]}>
                          {Object.entries(check.params).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Save warning */}
            {saveWarning && (
              <View style={[styles.warningBox, { backgroundColor: `${colors.warning}15`, borderColor: `${colors.warning}40` }]}>
                <View style={styles.warningHeader}>
                  <AlertTriangle size={16} color={colors.warning} />
                  <Text style={[styles.warningText, { color: colors.warning }]}>
                    {translateNative('native.0397bdd5d3861caa')}</Text>
                </View>
                {saveWarning.checks?.map((c: DiagnosticCheck, i: number) => (
                  c.status === 'fail' && (
                    <Text key={i} style={[styles.warningDetail, { color: colors.textSecondary }]}>
                      • {c.id.replace(/_/g, ' ')}: {Object.values(c.params).join(', ') || translateNative('native.4951b5090ada997d')}
                    </Text>
                  )
                ))}
                <View style={[styles.buttons, { marginTop: 12 }]}>
                  <Pressable
                    onPress={() => setSaveWarning(null)}
                    style={[styles.btn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  >
                    <Text style={[styles.btnText, { color: colors.text }]}>{translateNative('native.e6dd858940c0efeb')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveAnyway}
                    style={[styles.btn, { backgroundColor: colors.accent }]}
                  >
                    <Text style={[styles.btnText, { color: colors.textInverse }]}>{translateNative('native.59a79c34c9d40959')}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Submit buttons */}
            {!saveWarning && (
              <View style={styles.buttons}>
                <Pressable
                  onPress={onClose}
                  style={[styles.btn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                >
                  <Text style={[styles.btnText, { color: colors.text }]}>{translateNative('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!isFormValid || checkingSave}
                  style={[
                    styles.btn,
                    {
                      backgroundColor: isFormValid ? colors.accent : colors.surfaceHover,
                      borderColor: 'transparent',
                    },
                  ]}
                >
                  {checkingSave ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={[styles.btnText, { color: isFormValid ? colors.textInverse : colors.textTertiary }]}>{translateNative('native.112c324655102ccb')}</Text>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelList: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    maxHeight: 200,
    overflow: 'hidden',
  },
  modelGroup: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  modelItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 14,
  },
  subnetRow: {
    flexDirection: 'row',
  },
  subnetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  subnetText: {
    fontSize: 13,
    fontWeight: '500',
  },
  discoveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  discoveryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  discoveredList: {
    marginTop: 12,
    gap: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  discoveredName: {
    fontSize: 14,
    fontWeight: '500',
  },
  discoveredDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  diagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  diagBtnText: {
    fontSize: 13,
  },
  diagResults: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  diagCheck: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  diagCheckName: {
    fontSize: 13,
    fontWeight: '500',
  },
  diagCheckMsg: {
    fontSize: 12,
    marginTop: 2,
  },
  warningBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  warningDetail: {
    fontSize: 12,
    marginLeft: 24,
    marginBottom: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
