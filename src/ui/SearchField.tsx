import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

export interface SearchFieldProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  /** Leading icon; a magnifier by default. */
  icon?: IconName;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, icon = 'search', ...inputProps },
  ref
) {
  return (
    <View style={styles.field}>
      <Icon name={icon} size={iconSize.sm} color={colors.textFaint} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accentFg}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
        {...inputProps}
      />
      {value.length > 0 && (
        <IconButton
          icon="close-circle"
          label="Clear"
          size={iconSize.sm}
          color={colors.textFaint}
          onPress={() => onChangeText('')}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingLeft: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    ...font.body,
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
});
