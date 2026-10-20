import type { TagQuery } from './types';

/** Where a node sits, so we only add parentheses where they change meaning. */
type Position = 'top' | 'and' | 'or' | 'not';

/**
 * Render a query as a short human label, e.g. "kpop × chill + lofi, not sad":
 * × for songs that have both (an ingredient of combined tags), + for either
 * (separate ingredients), the way the Shuffle tab's pot shows them.
 *
 * The player shows this so it's always obvious *why* a given set of songs is
 * playing — which is the whole point of shuffling by query instead of by list.
 */
export function describeQuery(query: TagQuery, tagNames: Map<number, string>): string {
  return render(query, tagNames, 'top') || 'Everything';
}

function render(query: TagQuery, names: Map<number, string>, position: Position): string {
  switch (query.type) {
    case 'all':
      return 'Everything';

    case 'untagged':
      return 'untagged songs';

    case 'tag': {
      const name = names.get(query.tagId) ?? 'deleted tag';
      return query.includeDescendants ? name : `${name} only`;
    }

    case 'not':
      return `not ${render(query.child, names, 'not')}`;

    case 'and':
    case 'or': {
      if (query.children.length === 0) {
        return query.type === 'and' ? 'Everything' : 'nothing';
      }
      if (query.children.length === 1) {
        return render(query.children[0], names, position);
      }

      // "a AND b, not c" reads better than "a AND b AND not c", so negations are
      // pulled out of an AND chain and appended as a trailing clause.
      const positives = query.children.filter((c) => c.type !== 'not');
      const negatives = query.children.filter(
        (c): c is Extract<TagQuery, { type: 'not' }> => c.type === 'not'
      );

      if (query.type === 'and' && negatives.length > 0 && positives.length > 0) {
        // A lone positive owns the whole head, so "a + b, not c" needs no parentheses.
        const head = positives
          .map((c) => render(c, names, positives.length === 1 ? 'top' : 'and'))
          .filter((t) => t !== 'Everything')
          .join(' × ');
        const tail = negatives.map((c) => render(c.child, names, 'not')).join(' or ');
        return `${head || 'Everything'}, not ${tail}`;
      }

      const joiner = query.type === 'and' ? ' × ' : ' + ';
      const body = query.children.map((c) => render(c, names, query.type)).join(joiner);

      // × binds tighter than +, like times and plus, so only an either-chain
      // inside a both-chain (or under "not") needs parentheses.
      const needsParens = position === 'not' || (query.type === 'or' && position === 'and');
      return needsParens ? `(${body})` : body;
    }
  }
}
