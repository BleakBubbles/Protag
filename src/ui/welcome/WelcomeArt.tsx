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

/** Slide 2: a tag holding subtags, one of them open to show a song in it, whose chip names both. */
const NESTED_SONG: SongChip[] = [{ tag: tag(12, 'running', 'orange', 11), prefix: ['workout'] }];

export function NestedTags({ active }: { active: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.stretch} pointerEvents="none">
      <TagRow name="workout" color="red" songCount={86} childCount={2} onPress={() => {}} open />
      <Appear active={active} delay={150}>
        <View style={styles.indent}>
          <TagRow name="running" color="orange" songCount={42} childCount={0} onPress={() => {}} open />
          <Appear active={active} delay={400}>
            <View style={styles.indent}>
              <SongRow id={0} title="Eye of the Tiger" artist="Survivor" artworkUri={null} chips={NESTED_SONG} onPress={() => {}} />
            </View>
          </Appear>
          <TagRow name="lifting" color="yellow" songCount={31} childCount={0} onPress={() => {}} />
        </View>
      </Appear>
    </View>
  );
}

/** Slide 3's tags, by id. */
const POT_TAGS = new Map(
  [tag(1, 'chill', 'teal'), tag(2, 'rain', 'cyan'), tag(3, 'pop', 'pink'), tag(4, 'driving', 'orange'), tag(5, 'sad', 'gray')].map(
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
 * names what it's shuffling: "chill + rain + pop × driving, not sad".
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

/**
 * Slide 4: the music on the phone, as a folder drawn in a little depth: a
 * back with its tab, papers standing in it, and the front cover tipped open,
 * the whole thing turned slightly away. The papers are always light, like
 * paper; the folder is the band's teal, its front a shade lighter.
 */
export function MusicFolder() {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.folderStage}>
      <View style={styles.folder}>
        <View style={[styles.folderTab, { backgroundColor: colors.potBand }]} />
        <View style={[styles.folderBack, { backgroundColor: colors.potBand }]} />
        <View style={[styles.paper, styles.paperBack, { backgroundColor: colors.onPotDim }]} />
        <View style={[styles.paper, styles.paperFront, { backgroundColor: colors.onPot }]} />
        <View style={[styles.folderFront, { backgroundColor: colors.tag('teal') }]} />
      </View>
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
  // Turned a little away and tipped back, for depth.
  folderStage: {
    width: 180,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folder: {
    width: 150,
    height: 116,
    transform: [{ perspective: 600 }, { rotateY: '-24deg' }, { rotateX: '14deg' }],
  },
  folderTab: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 58,
    height: 22,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  folderBack: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    borderTopLeftRadius: 0,
  },
  paper: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 80,
    borderRadius: 6,
  },
  paperBack: {
    top: 6,
    transform: [{ rotate: '-4deg' }],
  },
  paperFront: {
    top: 14,
    transform: [{ rotate: '3deg' }],
  },
  // Hinged at the bottom and tipped towards you, so the papers show above it.
  folderFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
    borderRadius: 12,
    transformOrigin: 'bottom',
    transform: [{ perspective: 400 }, { rotateX: '-34deg' }],
  },
}));
