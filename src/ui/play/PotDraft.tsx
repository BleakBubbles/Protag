import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { EMPTY_DRAFT, type QueryDraft } from '../../query/types';

type PotDraftState = [QueryDraft, Dispatch<SetStateAction<QueryDraft>>];

const PotDraftContext = createContext<PotDraftState | null>(null);

/**
 * What's in the Shuffle tab's pot, above the navigator: the pages it opens
 * (every artist or album to pick from, the songs it would play) change and
 * read the same pot.
 */
export function PotDraftProvider({ children }: { children: ReactNode }) {
  const state = useState<QueryDraft>(EMPTY_DRAFT);
  return <PotDraftContext.Provider value={state}>{children}</PotDraftContext.Provider>;
}

export function usePotDraft(): PotDraftState {
  const state = useContext(PotDraftContext);
  if (!state) throw new Error('usePotDraft needs a PotDraftProvider');
  return state;
}
