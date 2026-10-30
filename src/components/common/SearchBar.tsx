import { translateNative, useNativeLocale } from '@/i18n';
import { StyleSheet, View } from 'react-native';
import { SearchBar as AppSearchBar } from './AppUI';
import { spacing } from '@/theme/tokens';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = translateNative('native.a7c9b8f6f08b028e'),
}: SearchBarProps) {
  useNativeLocale();
  return (
    <View style={styles.container}>
      <AppSearchBar value={value} onChangeText={onChangeText} placeholder={placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
});
