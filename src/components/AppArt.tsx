import { useState } from 'react';
import type { Meta } from '../lib/metaApi';
import { appImageUrl, type AppImageKind } from '../lib/appImageApi';
import { cx } from '@/utils/cx';
import { LogoMark } from './AppShell';

/**
 * An app's icon or cover: its own upload (image_path / cover_path), or else the Wand mark (white
 * on the brand colour as an icon, brand-coloured on a soft brand background as a cover). A
 * picture that fails to load shows the mark too.
 */
export function AppImage({ app, variant, className }: { app: Partial<Pick<Meta, 'image_path' | 'cover_path'>>; variant: AppImageKind; className?: string }) {
  const url = appImageUrl(app, variant);
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) {
    return (
      <span className={cx('block overflow-hidden', className)} aria-hidden="true">
        <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(url)} />
      </span>
    );
  }
  return (
    <span className={cx('flex items-center justify-center overflow-hidden', variant === 'icon' ? 'bg-brand-solid' : 'bg-brand-primary', className)} aria-hidden="true">
      {variant === 'icon' ? <LogoMark size={16} className="translate-x-px translate-y-px text-white" /> : <LogoMark size={44} />}
    </span>
  );
}
