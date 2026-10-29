import { Ionicons } from '@expo/vector-icons';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TagRow as Tag } from '../../db/types';
import type { SongChip } from '../../library/songChips';
import { describeQuery } from '../../query/describe';
import type { Ref } from '../../query/refs';
import { buildQuery, EMPTY_DRAFT } from '../../query/types';
import { SongRow } from '../library/SongRow';
import { TagRow } from '../library/TagRow';
import { reduceMotion, timing } from '../motion';
import { Join } from '../play/PotDrag';
import { TagChip } from '../TagChip';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/** Fades and rises into place when it mounts, or each time its slide comes into view, `delay` ms after. */
function Appear({ active = true, delay = 0, children }: { active?: boolean; delay?: number; children: ReactNode }) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) timing(shown, { toValue: 1, duration: 260, delay, useNativeDriver: true }).start();
    else shown.setValue(0);
  }, [active, delay, shown]);
  const rise = shown.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] });
  return <Animated.View style={{ opacity: shown, transform: [{ translateY: rise }] }}>{children}</Animated.View>;
}

/**
 * How far along a slide's little story is: 0 when it's out of view, then up by
 * one every `stepMs` while it's in view, to `steps`. All at once with motion reduced.
 */
function useSteps(active: boolean, steps: number, stepMs: number): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    if (reduceMotion()) {
      setStep(steps);
      return;
    }
    const timer = setInterval(() => setStep((s) => (s >= steps ? s : s + 1)), stepMs);
    return () => clearInterval(timer);
  }, [active, steps, stepMs]);
  return step;
}

/** Example tags, as the database would hold them. */
const tag = (id: number, name: string, color: string, parent_id: number | null = null): Tag => ({
  id,
  name,
  color,
  parent_id,
  sort_order: 0,
  created_at: 0,
});

/** Slide 1: a song as the Library lists it, its tags arriving one by one. */
const SONG_CHIPS: SongChip[] = [
  { tag: tag(1, 'chill', 'teal'), prefix: [] },
  { tag: tag(2, 'night drive', 'indigo'), prefix: [] },
  { tag: tag(3, 'synth', 'pink'), prefix: [] },
];

export function SongWithTags({ active }: { active: boolean }) {
  const step = useSteps(active, SONG_CHIPS.length, 450);
  return (
    <View style={{ alignSelf: 'stretch' }} pointerEvents="none">
      <SongRow
        id={0}
        title="Midnight City"
        artist="M83"
        artworkUri={null}
        chips={SONG_CHIPS.slice(0, step)}
        onPress={() => {}}
      />
    </View>
  );
}

/** Slide 2: a tag with subtags, as folders, and a song's chip naming both. */
export function NestedTags({ active }: { active: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.stretch} pointerEvents="none">
      <TagRow name="kpop" color="pink" songCount={240} childCount={2} onPress={() => {}} />
      <Appear active={active} delay={150}>
        <View style={styles.indent}>
          <TagRow name="gen 4" color="purple" songCount={130} childCount={0} onPress={() => {}} />
          <TagRow name="gen 5" color="blue" songCount={90} childCount={0} onPress={() => {}} />
        </View>
      </Appear>
      <Appear active={active} delay={450}>
        <View style={styles.chipLine}>
          <TagChip name="gen 4" prefix={['kpop']} color="purple" />
        </View>
      </Appear>
    </View>
  );
}

/** Slide 3's tags, by id. */
const POT_TAGS = new Map(
  [tag(1, 'chill', 'teal'), tag(2, 'rain', 'cyan'), tag(3, 'kpop', 'pink'), tag(4, 'driving', 'orange'), tag(5, 'sad', 'gray')].map(
    (t) => [t.id, t]
  )
);
const POT_NAMES = new Map([...POT_TAGS].map(([id, t]) => [id, t.name]));
/** The mix filling up, a tile at a time: two tags, then two joined, then one kept out. */
const POT_STEPS = [
  { ...EMPTY_DRAFT, ingredients: [[1]] },
  { ...EMPTY_DRAFT, ingredients: [[1], [2]] },
  { ...EMPTY_DRAFT, ingredients: [[1], [2], [3, 4]] },
  { ...EMPTY_DRAFT, ingredients: [[1], [2], [3, 4]], exclude: [5] },
];
const TILE = 40;
const GAP = spacing.md;
const BADGE = 18;

/**
 * Slide 3: the pot filling up as it does on the Play tab, tiles and all, with
 * the mix's name above it worked out from what's in it, the way the player
 * names what it's shuffling: "chill + rain + kpop × driving, not sad".
 */
export function MiniPot({ active }: { active: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const step = useSteps(active, POT_STEPS.length, 700);
  const draft = step > 0 ? POT_STEPS[step - 1] : EMPTY_DRAFT;
  const row = width - spacing.lg * 2 - spacing.md * 2 - spacing.md * 2;
  const half = (row - GAP) / 2;
  // Every ref here is one of POT_TAGS' ids.
  const face = (id: Ref, joinedLeft = false, joinedRight = false) => {
    const t = POT_TAGS.get(id as number)!;
    return (
      <View
        style={[
          styles.share,
          { backgroundColor: colors.tag(t.color) },
          joinedLeft && styles.joinedLeft,
          joinedRight && styles.joinedRight,
        ]}
      >
        <Text style={styles.segmentText} numberOfLines={1}>
          {t.name}
        </Text>
      </View>
    );
  };
  return (
    <View style={styles.band}>
      <Text style={styles.potTitle} numberOfLines={1}>
        {step > 0 ? describeQuery(buildQuery(draft), POT_NAMES) : 'Your mix'}
      </Text>
      <View style={styles.recess}>
        <View style={styles.tiles}>
          {draft.ingredients.map((ids) => (
            <Appear key={ids.join('×')}>
              <View style={[styles.tile, { width: ids.length > 1 ? row : half }]}>
                {ids.map((id, i) => (
                  <Fragment key={id}>
                    {i > 0 && (
                      <View style={styles.times}>
                        <Join both size={18} color={colors.onRecess} />
                      </View>
                    )}
                    {face(id, i > 0, i < ids.length - 1)}
                  </Fragment>
                ))}
              </View>
            </Appear>
          ))}
          {draft.exclude.map((id) => (
            <Appear key={`not ${id}`}>
              <View style={[styles.tile, { width: half }]}>
                {face(id)}
                <View pointerEvents="none" style={styles.ring} />
                <View pointerEvents="none" style={styles.badge}>
                  <Ionicons name="remove" size={BADGE - 4} color={colors.bg} />
                </View>
              </View>
            </Appear>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Slide 4: the music files on the phone, as a big folder. */
export function MusicFolder() {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.folder}>
      <Ionicons name="folder" size={88} color={colors.accentFg} />
      <Ionicons name="musical-notes" size={30} color={colors.bg} style={styles.folderNotes} />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  stretch: {
    alignSelf: 'stretch',
  },
  indent: {
    marginLeft: spacing.xl,
  },
  chipLine: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  band: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.potBand,
  },
  potTitle: {
    ...font.label,
    color: colors.onPot,
  },
  recess: {
    minHeight: TILE * 2 + GAP + spacing.md * 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.potRecess,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    flexDirection: 'row',
    height: TILE,
  },
  share: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md - 2,
  },
  joinedLeft: {
    borderTopLeftRadius: radius.sm - 2,
    borderBottomLeftRadius: radius.sm - 2,
  },
  joinedRight: {
    borderTopRightRadius: radius.sm - 2,
    borderBottomRightRadius: radius.sm - 2,
  },
  times: {
    width: 18 + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    ...font.label,
    color: colors.onTag,
  },
  // The kept-out tile's ring and minus, as in the pot.
  ring: {
    position: 'absolute',
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: radius.md + 4,
    borderWidth: 2,
    borderColor: colors.exclude,
  },
  badge: {
    position: 'absolute',
    top: -BADGE / 3,
    right: -BADGE / 3,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.exclude,
  },
  folder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On the folder's face, a little below centre (its tab takes the top).
  folderNotes: {
    position: 'absolute',
    top: 36,
  },
}));
