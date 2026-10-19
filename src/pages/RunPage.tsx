import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RunMeta } from '../render/AppView';
import { clearRenderCache } from '../render/definitions';

/** /run/:id — the meta as its users would see it. */
export default function RunPage() {
  const { id } = useParams();
  // Start each run from fresh definitions, so changes made in the builder show up.
  useState(clearRenderCache);
  return <RunMeta key={id} metaId={Number(id)} />;
}
