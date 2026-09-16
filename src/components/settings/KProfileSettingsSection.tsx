import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { SimpleModal } from './shared';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { statusColor } from '@/utils/data';
import { fontWeight, spacing } from '@/theme/tokens';
import type { KProfile } from '@/types/api';

function formatKProfileValue(value: string | number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return Number(value).toFixed(decimals);
  }
  const trimmed = String(value).trim();
  return trimmed || '-';
}

function formatKProfileRow(label: string, value: string | number | null | undefined): React.ReactNode {
  return (
    <View style={settingsStyles.summaryRow}>
      <Text style={[settingsStyles.summaryLabel, { color: 'rgba(255,255,255,0.55)' }]}>{label}</Text>
      <Text style={[settingsStyles.summaryValue, { color: '#fff' }]}>{formatKProfileValue(value)}</Text>
    </View>
  );
}

type ModalState = {
  visible: boolean;
  editingKProfile: KProfile | null;
  form: {
    slot_id: string;
    extruder_id: string;
    nozzle_id: string;
    nozzle_diameter: string;
    filament_id: string;
    name: string;
    k_value: string;
    n_coef: string;
    ams_id: string;
    tray_id: string;
    setting_id: string;
  };
};

export function KProfileSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { state, actions, mutations, derived } = controller;
  const { kprofileModal, pendingDeleteKProfile } = state;
  const editingKProfile = kprofileModal.editingKProfile;

  const kprofiles = (derived.sectionSummaries?.kprofiles ?? []) as KProfile[];

  const updateFormField = (field: keyof ModalState['form'], value: string) => {
    actions.setKprofileModalVisible(true);
    actions.setKprofileForm((current: ModalState['form']) => ({ ...current, [field]: value }));
  };

  const nozzleDiameterOptions = derived.nozzleDiameterOptions ?? [
    { key: '0.4', label: '0.4 mm' },
  ];

  return (
    <>
      <SectionCard title="Nozzle diameter" subtitle="K-profiles are tied to a specific nozzle diameter.">
        <View style={settingsStyles.chipWrap}>
          {nozzleDiameterOptions.map(opt => (
            <StatusBadge
              key={opt.key}
              label={opt.label}
              color={statusColor('info', controller.colors)}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="K-profiles" subtitle={`Pressure advance calibration data (${kprofiles.length} profile${kprofiles.length !== 1 ? 's' : ''}).`}>
        {kprofiles.map(profile => (
          <View
            key={`${profile.slot_id}-${profile.filament_id}`}
            style={[
              settingsStyles.itemCard,
              { borderColor: controller.colors.border },
            ]}
          >
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>
                  {profile.name || `Filament ${profile.filament_id}`}
                </Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>
                  Nozzle {profile.nozzle_id} · {profile.nozzle_diameter} mm
                </Text>
              </View>
              <StatusBadge
                label={`K ${formatKProfileValue(profile.k_value, 4)}`}
                color={statusColor('info', controller.colors)}
              />
            </View>

            <View style={{ gap: 4, marginTop: 4 }}>
              {formatKProfileRow('N-coef', profile.n_coef)}
              {formatKProfileRow('Extruder', profile.extruder_id)}
              {formatKProfileRow('AMS', profile.ams_id)}
              {formatKProfileRow('Tray', profile.tray_id)}
              {profile.setting_id ? formatKProfileRow('Setting', profile.setting_id) : null}
            </View>

            <View style={settingsStyles.actions}>
              <PrimaryButton
                label="Edit"
                variant="secondary"
                onPress={() => actions.openKProfileModal(profile)}
              />
              <PrimaryButton
                label="Delete"
                variant="danger"
                onPress={() => actions.setPendingDeleteKProfile(profile)}
              />
            </View>
          </View>
        ))}

        {kprofiles.length === 0 && (
          <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary, marginTop: spacing.sm }]}>
            No K-profiles have been created yet.
          </Text>
        )}
      </SectionCard>

      <PrimaryButton
        label="Create K-profile"
        onPress={() => actions.openKProfileModal()}
      />

      {/* Create/Edit K-profile Modal */}
      <SimpleModal
        visible={kprofileModal.visible}
        title={editingKProfile ? 'Edit K-profile' : 'Create K-profile'}
        subtitle="Pressure advance calibration values for a specific nozzle and filament."
        onClose={actions.closeKProfileModal}
      >
        <View style={settingsStyles.modalBody}>
          <View style={settingsStyles.twoColumnGrid}>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Nozzle ID" value={kprofileModal.form.nozzle_id} onChangeText={value => updateFormField('nozzle_id', value)} autoCapitalize="none" placeholder="HH00-0.4" />
            </View>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Nozzle diameter" value={kprofileModal.form.nozzle_diameter} onChangeText={value => updateFormField('nozzle_diameter', value)} placeholder="0.4" />
            </View>
          </View>

          <View style={settingsStyles.twoColumnGrid}>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Filament ID" value={kprofileModal.form.filament_id} onChangeText={value => updateFormField('filament_id', value)} autoCapitalize="none" placeholder="e.g., GFA00" />
            </View>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Name (optional)" value={kprofileModal.form.name} onChangeText={value => updateFormField('name', value)} placeholder="Auto-fills from filament ID" />
            </View>
          </View>

          <View style={settingsStyles.twoColumnGrid}>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="K value (pressure advance)" value={kprofileModal.form.k_value} onChangeText={value => updateFormField('k_value', value)} placeholder="e.g., 0.020" keyboardType="decimal-pad" />
            </View>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="N-coef (optional)" value={kprofileModal.form.n_coef} onChangeText={value => updateFormField('n_coef', value)} placeholder="e.g., 0.01" keyboardType="decimal-pad" />
            </View>
          </View>

          <View style={settingsStyles.twoColumnGrid}>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Slot ID" value={kprofileModal.form.slot_id} onChangeText={value => updateFormField('slot_id', value)} keyboardType="number-pad" />
            </View>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Extruder ID" value={kprofileModal.form.extruder_id} onChangeText={value => updateFormField('extruder_id', value)} keyboardType="number-pad" />
            </View>
          </View>

          <View style={settingsStyles.twoColumnGrid}>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="AMS ID" value={kprofileModal.form.ams_id} onChangeText={value => updateFormField('ams_id', value)} keyboardType="number-pad" />
            </View>
            <View style={settingsStyles.twoColumnCell}>
              <TextField label="Tray ID" value={kprofileModal.form.tray_id} onChangeText={value => updateFormField('tray_id', value)} keyboardType="number-pad" />
            </View>
          </View>

          <TextField label="Setting ID (optional)" value={kprofileModal.form.setting_id} onChangeText={value => updateFormField('setting_id', value)} autoCapitalize="none" placeholder="For X1C series" />

          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeKProfileModal} />
            <PrimaryButton
              label={editingKProfile ? (mutations.updateKProfileMutation.isPending ? 'Saving…' : 'Save') : (mutations.createKProfileMutation.isPending ? 'Creating…' : 'Create')}
              onPress={actions.handleSaveKProfile}
              loading={mutations.createKProfileMutation.isPending || mutations.updateKProfileMutation.isPending}
              disabled={mutations.createKProfileMutation.isPending || mutations.updateKProfileMutation.isPending}
            />
          </View>
        </View>
      </SimpleModal>

      {/* Delete Confirmation */}
      {pendingDeleteKProfile ? (
        <View
          style={[
            settingsStyles.itemCard,
            { borderColor: controller.colors.error },
          ]}
        >
          <Text style={{ color: controller.colors.error, fontWeight: fontWeight.semibold }}>
            Delete K-profile?
          </Text>
          <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>
            This will remove the calibration data for {pendingDeleteKProfile.name || pendingDeleteKProfile.filament_id} on nozzle {pendingDeleteKProfile.nozzle_id}.
          </Text>
          <View style={settingsStyles.actions}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => actions.setPendingDeleteKProfile(null)} />
            <PrimaryButton
              label="Delete"
              variant="danger"
              onPress={() => void mutations.deleteKProfileMutation.mutateAsync(pendingDeleteKProfile)}
              loading={mutations.deleteKProfileMutation.isPending}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}
