import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing, touchTarget } from './theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{segment.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
  },
  selected: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    ...font.label,
    color: colors.textDim,
  },
  labelSelected: {
    color: colors.text,
  },
});
