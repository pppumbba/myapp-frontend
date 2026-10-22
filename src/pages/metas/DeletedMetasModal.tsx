import { useEffect, useState } from 'react';
import { ClockRewind } from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { versionApi, type MetaVersion } from '../../lib/versionApi';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { when } from './VersionsPanel';

/** Metas that were deleted, each restorable from its newest version (saved when it was deleted). */
export function DeletedMetasModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState<MetaVersion[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    versionApi.deleted().then(setDeleted, (err) => setError(err instanceof ApiError ? err.message : 'The deleted metas could not be loaded.'));
  }, []);

  async function restore(v: MetaVersion) {
    setBusy(v.id);
    setError(null);
    try {
      await versionApi.restore(v.id);
      navigate(`/metas/${v.meta_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The meta could not be restored.');
      setBusy(null);
    }
  }

  return (
    <Modal title="Deleted metas" description="A meta is saved as a version when it is deleted, so it can come back with its fields, actions and settings." onClose={onClose}>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!deleted ? (
        <div className="h-24 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      ) : deleted.length === 0 ? (
        <p className="text-sm text-tertiary">No deleted metas.</p>
      ) : (
        <ul className="divide-y divide-secondary">
          {deleted.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{v.name}</p>
                <p className="text-xs text-quaternary">
                  {v.code} · version {v.version_no} · {when(v.created_at)}
                  {v.creator && ` · ${v.creator.name}`}
                </p>
              </div>
              <Button size="sm" color="secondary" iconLeading={ClockRewind} isLoading={busy === v.id} showTextWhileLoading isDisabled={busy !== null && busy !== v.id} onPress={() => restore(v)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
