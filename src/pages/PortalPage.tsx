import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { RunMeta } from '../render/AppView';
import { clearRenderCache } from '../render/definitions';
import { t } from '@/i18n';

/** /portal/:id — a public meta (e.g. an app) for anyone, signed in or not. */
export default function PortalPage() {
  const { id } = useParams();
  const { loading } = useAuth();
  useState(clearRenderCache);
  // Wait for who the visitor is, so the menu shows what they may open.
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-tertiary">{t("Loading…")}</div>;
  return <RunMeta key={id} metaId={Number(id)} portal />;
}
