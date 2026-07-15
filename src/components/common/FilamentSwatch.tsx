import { StyleSheet, View } from 'react-native';
import { borderRadius } from '../../theme/tokens';

interface FilamentSwatchProps {
  color: string;
  size?: number;
  borderColor?: string;
}

export function FilamentSwatch({ color, size = 24, borderColor = '#3f3f46' }: FilamentSwatchProps) {
  // Parse color — Bambu sends colors as hex without # prefix
  const normalizedColor = color.startsWith('#') ? color : `#${color.substring(0, 6)}`;

  return (
    <View
      style={[
        styles.swatch,
        {
          backgroundColor: normalizedColor,
          width: size,
          height: size,
          borderRadius: size / 4,
          borderColor,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  swatch: {
    borderWidth: 1,
  },
});
