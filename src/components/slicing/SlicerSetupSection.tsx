import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { Box, Choice, Copy, Toggle } from './Controls';
import { TextField } from '@/components/common/AppUI';

import type { AppSettings } from '@/types/api';

export type SlicerSetupValues = Pick<
  AppSettings,
  | 'preferred_slicer'
  | 'use_slicer_api'
  | 'bambu_studio_api_url'
  | 'orcaslicer_api_url'
> & { slicer_stall_timeout_minutes?: number };
export function validateSlicerSetup(
  settings: SlicerSetupValues,
): string | null {
  if (!['bambu_studio', 'orcaslicer'].includes(settings.preferred_slicer))
    return translateNative('native.f9198911468e1ee7');
  if (!settings.use_slicer_api) return null;
  const url =
    settings.preferred_slicer === 'orcaslicer'
      ? settings.orcaslicer_api_url
      : settings.bambu_studio_api_url;
  if (url) {
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol))
        return translateNative('native.55c57c5fc3bc7ad9');
    } catch {
      return translateNative('native.d9726f0b6f76ae66');
    }
  }
  const timeout = settings.slicer_stall_timeout_minutes ?? 15;
  return !Number.isInteger(timeout) || timeout < 1 || timeout > 240
    ? translateNative('native.8179abd0e6938ab2')
    : null;
}
export function SlicerSetupSection({
  value,
  onChange,
  disabled = false,
}: {
  value: SlicerSetupValues;
  onChange: (patch: Partial<SlicerSetupValues>) => void;
  disabled?: boolean;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const text = (s: string) => t(`slicerSetup.${s}`, { defaultValue: s });
  const key =
    value.preferred_slicer === 'orcaslicer'
      ? 'orcaslicer_api_url'
      : 'bambu_studio_api_url';
  return (
    <Box>
      <Choice
        label={text('Preferred slicer')}
        value={value.preferred_slicer ?? 'bambu_studio'}
        disabled={disabled}
        onChange={v =>
          onChange({
            preferred_slicer: v as SlicerSetupValues['preferred_slicer'],
          })
        }
        options={[
          { value: 'bambu_studio', label: 'Bambu Studio' },
          { value: 'orcaslicer', label: 'OrcaSlicer' },
        ]}
      />
      {value.preferred_slicer === 'orcaslicer' && (
        <Copy>
          {text(
            'OrcaSlicer 2.3.2 / 2.4.0-dev have known CLI bugs affecting Bambu-authored 3MFs: #12426 (painted multi-extruder segfault) and #13386 (parameter-range validation rejection). Bambu Studio is recommended until fixed.',
          )}
        </Copy>
      )}
      <Toggle
        label={text('Use slicer API sidecar')}
        value={value.use_slicer_api}
        onChange={v => onChange({ use_slicer_api: v })}
        disabled={disabled}
      />
      {value.use_slicer_api && (
        <>
          <TextField
            label={text(
              value.preferred_slicer === 'orcaslicer'
                ? 'OrcaSlicer sidecar URL'
                : 'Bambu Studio sidecar URL',
            )}
            value={value[key] ?? ''}
            editable={!disabled}
            autoCapitalize="none"
            keyboardType="url"
            onChangeText={v => onChange({ [key]: v })}
          />
          <Copy>
            {text(
              'Leave blank to use server environment defaults. The inactive slicer URL is retained.',
            )}
          </Copy>
          <TextField
            label={text('Stall timeout minutes (1–240)')}
            value={String(value.slicer_stall_timeout_minutes ?? 15)}
            keyboardType="number-pad"
            editable={!disabled}
            onChangeText={v =>
              onChange({ slicer_stall_timeout_minutes: Number(v) })
            }
          />
          {validateSlicerSetup(value) && (
            <Copy>{text(validateSlicerSetup(value)!)}</Copy>
          )}
        </>
      )}
    </Box>
  );
}
