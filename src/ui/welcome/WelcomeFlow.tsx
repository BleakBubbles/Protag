import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notifyLibraryChanged } from '../../db/changes';
import { createTag } from '../../db/tags';
import { useLibraryScan } from '../../library/useLibraryScan';
import { openLibrary } from '../../navigation';
import { Button } from '../Button';
import { FilterChip } from '../FilterChip';
import { formatCount, plural } from '../format';
import { font, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';
import { MiniPot, MusicFolder, NestedTags, SongWithTags } from './WelcomeArt';

/** Tags most people would use somewhere, to start from on day one; none picked until tapped. */
const STARTER_TAGS = ['chill', 'workout', 'driving', 'focus', 'party', 'sleep', 'sad', 'happy'];

interface Slide {
  title: string;
  body: string;
  art: (active: boolean) => ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: 'Tags, not playlists',
    body: 'Give a song as many tags as fit it: a mood, a moment, a genre. One song can be in any number of them.',
    art: (active) => <SongWithTags active={active} />,
  },
  {
    title: 'Tags can hold tags',
    body: 'Sort tags inside others, like folders. A song in gen 4 is in kpop too, so shuffling kpop plays both.',
    art: (active) => <NestedTags active={active} />,
  },
  {
    title: 'Mix them into a shuffle',
    body: 'Put tags in the pot to shuffle them together. Join two for songs that are both, or keep one out.',
    art: (active) => <MiniPot active={active} />,
  },
  {
    title: 'Your music, your tags',
    body: 'ProTag plays the music files on this phone, and your tags stay on it too.',
    art: () => <MusicFolder />,
  },
];

export interface WelcomeFlowProps {
  /** Seen again from Settings, with a library already there: it ends with Done instead of finding music. */
  hasSongs: boolean;
  onClose: () => void;
}

/**
 * The welcome: four short slides on what ProTag is about, each pictured with
 * the app's own pieces, then (the first time) finding the music on the phone,
 * which is what it needs before anything else works, and a few starter tags to
 * pick from so the Tags tab isn't empty on day one. Skip leaves at any point;
 * Back goes back a slide. Over the whole app, on its own page colour.
 */
export function WelcomeFlow({ hasSongs, onClose }: WelcomeFlowProps) {
  const styles = useStyles();
  const colors = useColors();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const [step, setStep] = useState<'slides' | 'starter'>('slides');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const scan = useLibraryScan();
  const last = page === SLIDES.length - 1;

  const goTo = (next: number) => {
    pager.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  // Back goes back a slide; from the first (or the starter tags), it leaves. Above the navigator, so it's
  // the newest listener while shown and answers first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'slides' && page > 0) {
        pager.current?.scrollTo({ x: (page - 1) * width, animated: true });
        setPage(page - 1);
      } else onClose();
      return true;
    });
    return () => sub.remove();
  }, [step, page, width, onClose]);

  const findMusic = async () => {
    await scan.run();
  };
  // Found some: on to starter tags. Found none, or no access: said on the slide, with a way on.
  const found = scan.state.kind === 'done' ? scan.state.summary.found : 0;
  useEffect(() => {
    if (found > 0) setStep('starter');
  }, [found]);

  const finish = async () => {
    for (const name of picked) {
      // Already there (from a restored backup, say): fine, nothing to add.
      await createTag(db, name, null).catch(() => {});
    }
    if (picked.size > 0) notifyLibraryChanged();
    onClose();
    openLibrary();
  };

  // Its own status bar, over whatever the screen beneath set (the Play tab's light one, for its teal band).
  const statusBar = <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />;
  const top = (
    <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
      <Button label="Skip" icon="play-skip-forward" iconAfter variant="secondary" size="small" onPress={onClose} />
    </View>
  );

  if (step === 'starter') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
        {statusBar}
        {/* No Skip up top here: the button below already says it. */}
        <View style={styles.starter}>
          <Text style={styles.title}>Start with a few tags</Text>
          <Text style={styles.body}>
            {scan.state.kind === 'done' ? `Found ${plural(scan.state.summary.found, 'song')}. ` : ''}
            Tap any tags you'd use. You can rename them or make your own anytime.
          </Text>
          <View style={styles.starterChips}>
            {STARTER_TAGS.map((name) => (
              <FilterChip
                key={name}
                label={name}
                selected={picked.has(name)}
                onToggle={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
              />
            ))}
          </View>
        </View>
        <View style={styles.bottom}>
          <Button
            label={picked.size > 0 ? `Add ${plural(picked.size, 'tag')}` : 'Skip for now'}
            variant={picked.size > 0 ? 'primary' : 'secondary'}
            onPress={finish}
            style={styles.wide}
          />
        </View>
      </View>
    );
  }

  const scanning = scan.state.kind === 'scanning';
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.xl }]}>
      {statusBar}
      {top}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!scanning}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.art}>{slide.art(page === i)}</View>
            <View style={styles.words}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((slide, i) => (
            <View key={slide.title} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        {!last ? (
          <Button label="Next" icon="arrow-forward" iconAfter onPress={() => goTo(page + 1)} style={styles.wide} />
        ) : hasSongs ? (
          <Button label="Done" icon="checkmark" onPress={onClose} style={styles.wide} />
        ) : scanning ? (
          <View style={styles.progress}>
            <ActivityIndicator color={colors.accentFg} />
            <Text style={styles.progressText}>
              {scan.state.kind === 'scanning' && scan.state.progress
                ? `Reading your library… ${formatCount(scan.state.progress.scanned)} of ${formatCount(scan.state.progress.total)}`
                : 'Reading your library…'}
            </Text>
          </View>
        ) : scan.state.kind === 'denied' ? (
          <View style={styles.after}>
            <Text style={styles.note}>
              ProTag needs access to your music. It only reads audio files, never photos, videos or anything else.
            </Text>
            {scan.state.canAskAgain ? (
              <Button label="Allow access" onPress={findMusic} style={styles.wide} />
            ) : (
              <Button
                label="Open settings"
                icon="settings-outline"
                onPress={() => Linking.openSettings()}
                style={styles.wide}
              />
            )}
          </View>
        ) : scan.state.kind === 'done' || scan.state.kind === 'error' ? (
          <View style={styles.after}>
            <Text style={styles.note}>
              {scan.state.kind === 'error'
                ? "The scan didn't finish. You can try again from the Library."
                : 'No songs found on this phone yet. Add some, then scan again from the Library.'}
            </Text>
            <Button label="Done" onPress={onClose} style={styles.wide} />
          </View>
        ) : (
          <Button label="Find my music" icon="search" onPress={findMusic} style={styles.wide} />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
  },
  pager: {
    flex: 1,
  },
  slide: {
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  // One height for every slide's picture, so the words under it don't jump from slide to slide.
  art: {
    alignItems: 'center',
    height: 300,
    justifyContent: 'center',
  },
  words: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...font.title,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  bottom: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  // The main action spans the foot of the page, the same place on every slide.
  wide: {
    alignSelf: 'stretch',
  },
  after: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotOn: {
    backgroundColor: colors.accentFg,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  progressText: {
    ...font.label,
    color: colors.textDim,
  },
  note: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  starter: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  starterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
}));
