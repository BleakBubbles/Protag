import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { TagRow } from '../library/TagRow';
import { timing } from '../motion';
import { Artwork } from '../player/Artwork';
import { TagChip } from '../TagChip';
import { font, iconSize, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/** Fades and rises into place each time its slide comes into view, `delay` ms after it does. */
function Appear({ active, delay = 0, children }: { active: boolean; delay?: number; children: ReactNode }) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) timing(shown, { toValue: 1, duration: 260, delay, useNativeDriver: true }).start();
    else shown.setValue(0);
  }, [active, delay, shown]);
  const rise = shown.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] });
  return <Animated.View style={{ opacity: shown, transform: [{ translateY: rise }] }}>{children}</Animated.View>;
}

/** Slide 1: one song, several tags landing on it. */
export function SongWithTags({ active }: { active: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.song}>
        <Artwork uri={null} size={56} />
        <View style={styles.songText}>
          <Text style={styles.songTitle}>Midnight City</Text>
          <Text style={styles.songArtist}>M83</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {[
          { name: 'chill', color: 'teal' },
          { name: 'night drive', color: 'indigo' },
          { name: 'synth', color: 'pink' },
        ].map((tag, i) => (
          <Appear key={tag.name} active={active} delay={200 + i * 180}>
            <TagChip name={tag.name} color={tag.color} />
          </Appear>
        ))}
      </View>
    </View>
  );
}

/** Slide 2: a tag with subtags, as folders, and a song's chip naming both. */
export function NestedTags({ active }: { active: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.card} pointerEvents="none">
      <TagRow name="kpop" color="pink" songCount={240} childCount={2} onPress={() => {}} />
      <Appear active={active} delay={150}>
        <View style={styles.indent}>
          <TagRow name="gen 4" color="purple" songCount={130} childCount={0} onPress={() => {}} />
          <TagRow name="gen 5" color="blue" songCount={90} childCount={0} onPress={() => {}} />
        </View>
      </Appear>
      <Appear active={active} delay={450}>
        <View style={styles.chips}>
          <TagChip name="gen 4" prefix={['kpop']} color="purple" />
        </View>
      </Appear>
    </View>
  );
}

/** Slide 3: the pot with a mix in it: tags side by side, two joined, one kept out. */
export function MiniPot({ active }: { active: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const pill = (name: string, color: string) => (
    <View style={[styles.pill, { backgroundColor: colors.tag(color) }]}>
      <Text style={styles.pillText}>{name}</Text>
    </View>
  );
  return (
    <View style={styles.band}>
      <View style={styles.recess}>
        <Appear active={active} delay={100}>
          <View style={styles.potRow}>
            {pill('chill', 'teal')}
            {pill('rain', 'cyan')}
            <Text style={styles.potNote}>each adds songs</Text>
          </View>
        </Appear>
        <Appear active={active} delay={350}>
          <View style={styles.potRow}>
            <View style={styles.joined}>
              {pill('kpop', 'pink')}
              <Ionicons name="close" size={iconSize.sm - 4} color={colors.onRecess} />
              {pill('driving', 'orange')}
            </View>
            <Text style={styles.potNote}>both at once</Text>
          </View>
        </Appear>
        <Appear active={active} delay={600}>
          <View style={styles.potRow}>
            <View style={styles.keptOut}>
              {pill('sad', 'gray')}
              <Ionicons name="remove-circle" size={iconSize.sm} color={colors.exclude} />
            </View>
            <Text style={styles.potNote}>kept out</Text>
          </View>
        </Appear>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  song: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
  },
  songText: {
    gap: 2,
  },
  songTitle: {
    ...font.listTitle,
    color: colors.text,
  },
  songArtist: {
    ...font.caption,
    color: colors.textDim,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  indent: {
    marginLeft: spacing.xl,
  },
  band: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.potBand,
  },
  recess: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.potRecess,
  },
  potRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  potNote: {
    ...font.caption,
    color: colors.onRecess,
    marginLeft: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  pillText: {
    ...font.label,
    color: colors.onTag,
  },
  joined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keptOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    opacity: 0.85,
  },
}));
