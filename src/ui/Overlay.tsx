import { createContext, Fragment, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Place = (key: number, node: ReactNode | null) => void;

const Context = createContext<Place | null>(null);
let nextKey = 0;

/**
 * Where `Overlay`s are drawn: over everything inside it, the tabs and the
 * player included. Cheaper to open than a `Modal`, which builds Android a whole
 * new window each time; this draws in the app's own.
 */
export function OverlayHost({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<ReadonlyMap<number, ReactNode>>(new Map());
  const place = useCallback<Place>((key, node) => {
    setLayers((prev) => {
      const next = new Map(prev);
      if (node === null) next.delete(key);
      else next.set(key, node);
      return next;
    });
  }, []);
  return (
    <Context.Provider value={place}>
      {/* While a layer's up, a screen reader stays in it, as it would in a Modal. */}
      <View style={styles.app} importantForAccessibility={layers.size > 0 ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {[...layers].map(([key, node]) => (
        <Fragment key={key}>{node}</Fragment>
      ))}
    </Context.Provider>
  );
}

/**
 * Draws its children at the `OverlayHost`, over the app, rather than where it
 * sits. They render there, so only contexts from above the host reach them.
 */
export function Overlay({ children }: { children: ReactNode }) {
  const place = useContext(Context);
  if (!place) throw new Error('Overlay needs an OverlayHost above it');
  const key = useRef(nextKey++).current;
  useLayoutEffect(() => place(key, children));
  useLayoutEffect(() => () => place(key, null), [place, key]);
  return null;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
