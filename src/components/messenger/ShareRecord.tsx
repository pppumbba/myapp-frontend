import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, SearchLg, Users01 } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { Avatar } from '@/components/base/avatar/avatar';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { Modal } from '../Modal';
import { Alert } from '../ui';
import { ApiError } from '../../lib/api';
import { chatApi, type ChatSummary, type Person, type SharedRecord } from '../../lib/chatApi';
import { initials } from '../../lib/initials';
import { t } from '@/i18n';

type Target = { chat: ChatSummary } | { person: Person };

const rowLook =
  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2';

/** Sends a grid row into a chat (one of the user's, or a new direct one with a person) as a record card, with an optional note. */
export function ShareRecord({ record, onClose }: { record: SharedRecord; onClose: () => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 250);
  const [people, setPeople] = useState<Person[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatApi.poll().then((r) => setChats(r.chats), () => setChats([]));
  }, []);

  useEffect(() => {
    if (!q) {
      setPeople([]);
      return;
    }
    let stale = false;
    chatApi.people(q).then((r) => !stale && setPeople(r), () => {});
    return () => {
      stale = true;
    };
  }, [q]);

  const lower = q.toLowerCase();
  const shownChats = useMemo(() => (chats ?? []).filter((c) => !lower || c.name.toLowerCase().includes(lower)), [chats, lower]);
  // People who already have a direct chat show as that chat.
  const direct = new Set((chats ?? []).filter((c) => c.type === 'direct').flatMap((c) => c.members.map((m) => m.id)));
  const shownPeople = people.filter((p) => !direct.has(p.id));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!target || sending) return;
    setSending(true);
    setError(null);
    try {
      const chatId = 'chat' in target ? target.chat.id : (await chatApi.direct(target.person.id)).id;
      await chatApi.send(chatId, note.trim(), record);
      chatApi.show(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The record could not be shared.'));
      setSending(false);
    }
  }

  const picked = (key: string) => !!target && ('chat' in target ? `c${target.chat.id}` : `p${target.person.id}`) === key;
  const option = (key: string, avatar: React.ReactNode, name: string, sub: string | undefined, pick: Target) => (
    <li key={key}>
      <AriaButton onPress={() => setTarget(pick)} aria-pressed={picked(key)} className={cx(rowLook, picked(key) && 'bg-brand-primary_alt')}>
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">{name}</span>
          {sub && <span className="block truncate text-xs text-tertiary">{sub}</span>}
        </span>
        {picked(key) && <Check className="size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />}
      </AriaButton>
    </li>
  );

  return (
    <Modal title={t('Share to chat')} description={record.title} onClose={onClose} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input size="sm" icon={SearchLg} aria-label={t('Search chats and people')} placeholder={t('Search chats and people')} value={query} onChange={setQuery} autoFocus />
        <ul className="-mx-2 max-h-64 min-h-24 overflow-y-auto" aria-label={t('Send to')}>
          {chats === null ? (
            [0, 1, 2].map((i) => <li key={i} className="mx-2 mb-2 h-10 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />)
          ) : (
            <>
              {shownChats.map((c) =>
                option(
                  `c${c.id}`,
                  c.type === 'group' ? <Avatar size="sm" placeholderIcon={Users01} alt={c.name} /> : <Avatar size="sm" initials={initials(c.name)} alt={c.name} />,
                  c.name,
                  c.type === 'group' ? t('{count} people', { count: c.members.length }) : undefined,
                  { chat: c },
                ),
              )}
              {shownPeople.map((p) => option(`p${p.id}`, <Avatar size="sm" initials={initials(p.name)} alt={p.name} />, p.name, p.email, { person: p }))}
              {!shownChats.length && !shownPeople.length && (
                <li className="px-2 py-6 text-center text-sm text-tertiary">{q ? t('No chats or people match') : t('No chats yet. Search for a person.')}</li>
              )}
            </>
          )}
        </ul>
        <TextArea aria-label={t('Note')} placeholder={t('Add a note (optional)')} value={note} onChange={setNote} rows={2} />
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Button size="md" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" size="md" isDisabled={!target} isLoading={sending} showTextWhileLoading>
            {t('Send')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
