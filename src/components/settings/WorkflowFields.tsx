import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { TextField } from '@/components/common/AppUI';
import { useTheme } from '@/theme';

import { settingsStyles } from './shared';
import { SettingsSearchAnchor } from './SettingsSearchFocus';

export function WorkflowNumberField({
  label,
  value,
  min,
  max,
  onChange,
  integer = true,
  onClear,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  integer?: boolean;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  useNativeLocale();
  const [text, setText] = useState(String(value));
  const { colors } = useTheme();
  const { t } = useTranslation();
  useEffect(() => setText(String(value)), [value]);
  const valid =
    text.trim() === ''
      ? !!onClear
      : Number.isFinite(Number(text)) &&
        Number(text) >= min &&
        Number(text) <= max &&
        (!integer || Number.isInteger(Number(text)));
  return (
    <SettingsSearchAnchor label={label}>
      <View>
        <TextField
          label={label}
          accessibilityLabel={label}
          value={text}
          editable={!disabled}
          placeholder={placeholder}
          keyboardType={integer ? 'number-pad' : 'decimal-pad'}
          onChangeText={next => {
            if (disabled) return;
            setText(next);
            if (!next.trim()) {
              onClear?.();
            } else {
              const number = Number(next);
              if (
                Number.isFinite(number) &&
                number >= min &&
                number <= max &&
                (!integer || Number.isInteger(number))
              )
                onChange(number);
            }
          }}
          onBlur={() => {
            if (!valid) setText(String(value));
          }}
        />
        {!valid ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[settingsStyles.helper, { color: colors.error }]}
          >
            {t('workflow.validRange', {
              defaultValue:
                'Enter a value between {{min}} and {{max}}. Invalid edits are not saved.',
              min,
              max,
            })}
          </Text>
        ) : null}
      </View>
    </SettingsSearchAnchor>
  );
}
