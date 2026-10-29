import { useEffect, useState } from 'react';
import { documentApi } from '../lib/documentApi';

/** Uploaded layout images as blob URLs, loaded once each (they need the token). */
const assets = new Map<string, Promise<string>>();

export function useDocumentAsset(metaId: number, src: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return setUrl(null);
    const key = `${metaId}/${src}`;
    if (!assets.has(key)) assets.set(key, documentApi.asset(metaId, src).catch(() => ''));
    let live = true;
    assets.get(key)!.then((u) => live && setUrl(u || null));
    return () => {
      live = false;
    };
  }, [metaId, src]);
  return url;
}
