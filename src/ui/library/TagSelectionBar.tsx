import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { deleteTag, getTagsDeletionImpact, listTags, reparentTag } from '../../db/tags';
import { buildTagIndex } from '../../library/tagTree';
import { openAddSongs } from '../../navigation';
import { ChoiceDialog } from '../ChoiceDialog';
import { plural } from '../format';
import type { Selection } from '../hooks/useSelection';
import { useLibraryQuery } from '../hooks/useLibraryQuery';
import type { MenuAction } from '../PopupMenu';
import { SelectionBar, type SelectionAction } from './SelectionBar';

/**
 * What can be done to selected tags, in the bar along the bottom:
 *
 * - Add songs, with one tag selected: its song picker.
 * - Move to…: under another tag, or the top level; with several, gathering
 *   them in one go ("gen 4" and "gen 5" under kpop).
 * - Delete, after saying what goes with them.
 *
 * Each ends the selection.
 */
export function TagSelectionBar({ selection }: { selection: Selection }) {
  const db = useSQLiteContext();
  const { data: index } = useLibraryQuery(async (db) => buildTagIndex(await listTags(db)), []);
  const [moving, setMoving] = useState(false);
  const { selected, clear } = selection;

  const done = () => {
    clear();
    notifyLibraryChanged();
  };

  const moveTo = async (parentId: number | null) => {
    const failed: string[] = [];
    for (const id of selected) {
      try {
        await reparentTag(db, id, parentId);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    done();
    if (failed.length > 0) Alert.alert(`Couldn't move ${plural(failed.length, 'tag')}`, failed.join('\n'));
  };

  const confirmDelete = async () => {
    const impact = await getTagsDeletionImpact(db, selected);
    const one = selected.length === 1 ? index?.byId.get(selected[0]) : undefined;
    const parts = [
      impact.subtags > 0 ? `${one ? 'its' : 'their'} ${plural(impact.subtags, 'subtag')}` : null,
      impact.songs > 0 ? `removes ${one ? 'it' : 'them'} from ${plural(impact.songs, 'song')}` : null,
    ].filter(Boolean);
    Alert.alert(
      one ? `Delete "${one.name}"?` : `Delete ${plural(selected.length, 'tag')}?`,
      `${parts.length > 0 ? `This deletes ${parts.join(' and ')}. ` : ''}The songs themselves stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selected) await deleteTag(db, id);
            done();
          },
        },
      ]
    );
  };

  // Anywhere but inside one of the tags being moved; a place they're all in already is greyed.
  const targets: MenuAction[] = [];
  if (index && selected.length > 0) {
    const parents = new Set(selected.map((id) => index.byId.get(id)?.parent_id ?? null));
    const allIn = (parentId: number | null) => parents.size === 1 && parents.has(parentId);
    const inside = new Set(selected.flatMap((id) => [id, ...index.descendantIds(id)]));
    targets.push({ label: 'Top level', disabled: allIn(null), onPress: () => moveTo(null) });
    for (const tag of index.all()) {
      if (inside.has(tag.id)) continue;
      targets.push({ label: index.label(tag.id), disabled: allIn(tag.id), onPress: () => moveTo(tag.id) });
    }
  }

  const actions: SelectionAction[] = [
    ...(selected.length === 1
      ? [
          {
            label: 'Add songs',
            icon: 'add' as const,
            onPress: () => {
              const [id] = selected;
              clear();
              openAddSongs(id);
            },
          },
        ]
      : []),
    { label: 'Move to…', icon: 'move-to', onPress: () => setMoving(true) },
    { label: 'Delete', icon: 'delete', destructive: true, onPress: confirmDelete },
  ];

  return (
    <>
      <SelectionBar disabled={selected.length === 0} actions={actions} />
      <ChoiceDialog
        visible={moving}
        title={selected.length === 1 ? `Move "${index?.byId.get(selected[0])?.name ?? ''}" to` : `Move ${plural(selected.length, 'tag')} to`}
        choices={targets}
        onClose={() => setMoving(false)}
      />
    </>
  );
}
