import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { font, iconSize, radius, spacing, touchTarget } from './theme';
import { makeStyles, useColors } from './ThemeContext';

export interface SearchFieldProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  /** Leading icon; a magnifier by default. */
  icon?: IconName;
}

export const SearchField = forwardRef<TextInputInstance, SearchFieldProps>(function SearchField(
  { value, onChangeText, icon = 'search', onFocus, onBlur, ...inputProps },
  ref
) {
  const colors = useColors();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.focused]}>
      <Icon name={icon} size={iconSize.sm} color={colors.textFaint} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accentFg}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {value.length > 0 && (
        <IconButton
          icon="close-circle"
          label="Clear"
          size={iconSize.sm}
          color={colors.textDim}
          onPress={() => onChangeText('')}
        />
      )}
    </View>
  );
});

// A filled pill like the app's buttons, a step off the page; no outline until it's being typed in.
const useStyles = makeStyles((colors) => StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Fixed, so the clear button appearing can't make it taller.
    height: touchTarget + 4,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    // Always there, only its colour changes, so focusing never shifts the text.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  focused: {
    borderColor: colors.accentFg,
  },
  input: {
    ...font.body,
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
}));
