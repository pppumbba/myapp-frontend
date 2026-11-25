import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryApi, type MetaLibrary } from '../../lib/libraryApi';

/**
 * The user's Starred, Recent and Shared with me lists, and starring. A star shows at once and
 * goes back if saving it fails.
 */
export function useMetaLibrary() {
  const [library, setLibrary] = useState<MetaLibrary | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(
    () =>
      libraryApi.get().then(
        (l) => {
          setLibrary(l);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const starred = useMemo(() => new Set(library?.starred.map((e) => e.meta_id) ?? []), [library]);

  const toggleStar = useCallback(
    async (metaId: number) => {
      const on = !starred.has(metaId);
      const before = library;
      setLibrary((l) => l && { ...l, starred: on ? [{ meta_id: metaId, at: new Date().toISOString() }, ...l.starred] : l.starred.filter((e) => e.meta_id !== metaId) });
      try {
        await (on ? libraryApi.star(metaId) : libraryApi.unstar(metaId));
      } catch {
        setLibrary(before);
      }
    },
    [library, starred],
  );

  return { library, failed, starred, toggleStar, reload };
}
