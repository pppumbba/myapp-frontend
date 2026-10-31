import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, DotsVertical, Edit05, LogOut01, MessageChatCircle, SearchLg, Send01, Users01, UsersPlus, VolumeMax, VolumeX, XClose } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { Avatar } from '@/components/base/avatar/avatar';
import { Button } from '@/components/base/buttons/button';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import { useAuth, type User } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { chatApi, type ChatMessage, type ChatSummary, type Person } from '../../lib/chatApi';
import { initials } from '../../lib/initials';
import { useMessenger, type OpenState } from './useMessenger';
import { panelPlace, useChatPosition } from './useChatPosition';
import { t } from '@/i18n';

type View = { kind: 'list' } | { kind: 'chat' } | { kind: 'group'; addTo?: ChatSummary };

const iconButton =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Today: the time; this week: the weekday; older: the date. */
function when(iso: string) {
  const d = new Date(iso);
  const days = (new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000;
  if (days < 1) return time(iso);
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dayLabel(iso: string) {
  const days = (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000;
  if (days < 1) return t('Today');
  if (days < 2) return t('Yesterday');
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function ChatAvatar({ chat, size = 'sm' }: { chat: ChatSummary; size?: 'xs' | 'sm' | 'md' }) {
  return chat.type === 'group' ? <Avatar size={size} placeholderIcon={Users01} alt={chat.name} /> : <Avatar size={size} initials={initials(chat.name)} alt={chat.name} />;
}

function typingLine(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return t('{name} is typing…', { name: names[0] });
  return t('{names} are typing…', { names: names.join(', ') });
}

/**
 * The messenger: a round button (bottom right to start with) showing the unread count, opening a
 * chat panel beside it. The button, or the panel by its header, can be dragged anywhere; the place
 * is remembered. Direct chats and groups, people and message search, typing and seen marks, and a
 * chime for news. It polls; see useMessenger.
 */
export function Messenger() {
  const { user, updateUser } = useAuth();
  if (!user) return null;
  return <MessengerFor user={user} updateUser={updateUser} />;
}

function MessengerFor({ user, updateUser }: { user: User; updateUser: (u: User) => void }) {
  const [isOpen, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const sound = user.preferences?.chat_sound !== false;
  const m = useMessenger({ userId: user.id, visible: isOpen && view.kind === 'chat', sound });
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { spot, view: screen, dragging, startDrag, wasDragged } = useChatPosition();

  const current = m.open ? m.chats?.find((c) => c.id === m.open?.chatId) : undefined;

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const show = (chatId: number) => {
    m.openChat(chatId);
    setView({ kind: 'chat' });
  };
  const back = () => {
    m.openChat(null);
    setView({ kind: 'list' });
  };

  async function toggleSound() {
    try {
      updateUser(await api<User>('/user/preferences', { method: 'PUT', body: JSON.stringify({ chat_sound: !sound }), notify: false }));
    } catch {
      // Left as it was; the button shows the saved state.
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && panel.current?.contains(document.activeElement)) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const count = m.unread > 99 ? '99+' : m.unread;

  // The panel moves with the button when dragged by a header ([data-drag-handle]), but not from its buttons or fields.
  const dragFromHeader = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle]') && !target.closest('button, a, input, textarea, [role="button"], [role="menuitem"]')) startDrag(e);
  };

  return (
    <>
      {isOpen && (
        <div
          ref={panel}
          role="dialog"
          aria-label={t('Messages')}
          onPointerDown={dragFromHeader}
          style={panelPlace(spot, screen)}
          className={cx(
            'fixed z-40 flex flex-col overflow-hidden rounded-xl bg-primary shadow-xl ring-1 ring-secondary_alt animate-in fade-in duration-150 motion-reduce:animate-none',
            dragging && 'select-none',
          )}
        >
          {view.kind === 'list' && (
            <ChatList
              chats={m.chats}
              userId={user.id}
              sound={sound}
              onSound={toggleSound}
              onClose={close}
              onOpen={show}
              onNewGroup={() => setView({ kind: 'group' })}
              onStarted={(chat) => {
                m.upsert(chat);
                show(chat.id);
              }}
            />
          )}
          {view.kind === 'chat' && m.open && (
            <Conversation
              chat={current}
              open={m.open}
              userId={user.id}
              onBack={back}
              onClose={close}
              onSend={m.send}
              onTyping={m.typing}
              onOlder={m.loadOlder}
              onChanged={m.upsert}
              onAdd={(chat) => setView({ kind: 'group', addTo: chat })}
              onLeft={(chatId) => {
                m.forget(chatId);
                setView({ kind: 'list' });
              }}
            />
          )}
          {view.kind === 'group' && (
            <GroupForm
              addTo={view.addTo}
              onBack={() => (view.addTo ? setView({ kind: 'chat' }) : setView({ kind: 'list' }))}
              onDone={(chat) => {
                m.upsert(chat);
                show(chat.id);
              }}
            />
          )}
        </div>
      )}

      {/* A plain button: a press that moves becomes a drag, and the click after it is ignored. */}
      <button
        ref={launcher}
        type="button"
        aria-label={m.unread ? t('Messages, {count} unread', { count: m.unread }) : t('Messages')}
        aria-expanded={isOpen}
        title={t('Drag to move')}
        onPointerDown={startDrag}
        onClick={() => {
          if (wasDragged()) return;
          if (isOpen) close();
          else setOpen(true);
        }}
        style={{ right: spot.x, bottom: spot.y }}
        className={cx(
          'fixed z-40 flex size-12 touch-none items-center justify-center rounded-full bg-brand-solid text-white shadow-lg outline-focus-ring transition-transform duration-100 ease-out select-none hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none',
          dragging ? 'scale-105 cursor-grabbing' : 'cursor-pointer active:scale-95',
        )}
      >
        {isOpen ? <XClose className="size-6" aria-hidden="true" /> : <MessageChatCircle className="size-6" aria-hidden="true" />}
        {!isOpen && m.unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error-solid px-1 text-xs font-semibold text-white tabular-nums ring-2 ring-bg-primary" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
    </>
  );
}

function PanelHeader({ title, sub, onBack, children }: { title: React.ReactNode; sub?: React.ReactNode; onBack?: () => void; children?: React.ReactNode }) {
  return (
    <div data-drag-handle className="flex shrink-0 cursor-grab touch-none items-center gap-2 border-b border-secondary px-3 py-2.5 active:cursor-grabbing">
      {onBack && (
        <AriaButton aria-label={t('Back')} onPress={onBack} className={iconButton}>
          <ArrowLeft className="size-4" />
        </AriaButton>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-primary">{title}</div>
        {sub && <div className="truncate text-xs text-tertiary">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/** Waits a moment after typing stops before searching. */
function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ChatList({
  chats,
  userId,
  sound,
  onSound,
  onClose,
  onOpen,
  onNewGroup,
  onStarted,
}: {
  chats: ChatSummary[] | null;
  userId: number;
  sound: boolean;
  onSound: () => void;
  onClose: () => void;
  onOpen: (chatId: number) => void;
  onNewGroup: () => void;
  onStarted: (chat: ChatSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [people, setPeople] = useState<Person[]>([]);
  const [found, setFound] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!q) {
      setPeople([]);
      setFound([]);
      return;
    }
    let stale = false;
    chatApi.people(q).then((r) => !stale && setPeople(r), () => {});
    if (q.length >= 2) chatApi.search(q).then((r) => !stale && setFound(r), () => {});
    else setFound([]);
    return () => {
      stale = true;
    };
  }, [q]);

  const lower = q.toLowerCase();
  const shown = useMemo(() => (chats ?? []).filter((c) => !lower || c.name.toLowerCase().includes(lower)), [chats, lower]);
  const chatName = (id: number) => chats?.find((c) => c.id === id)?.name ?? '';

  async function start(person: Person) {
    onStarted(await chatApi.direct(person.id));
  }

  return (
    <>
      <PanelHeader title={t('Messages')}>
        <AriaButton aria-label={sound ? t('Turn message sound off') : t('Turn message sound on')} onPress={onSound} className={iconButton}>
          {sound ? <VolumeMax className="size-4" /> : <VolumeX className="size-4" />}
        </AriaButton>
        <AriaButton aria-label={t('New group')} onPress={onNewGroup} className={iconButton}>
          <UsersPlus className="size-4" />
        </AriaButton>
        <AriaButton aria-label={t('Close messages')} onPress={onClose} className={iconButton}>
          <XClose className="size-4" />
        </AriaButton>
      </PanelHeader>
      <div className="shrink-0 px-3 pt-3 pb-2">
        <Input size="sm" icon={SearchLg} aria-label={t('Search people and messages')} placeholder={t('Search people and messages')} value={query} onChange={setQuery} autoFocus />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {chats === null ? (
          <div className="space-y-2 p-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <>
            {q && shown.length > 0 && <SectionLabel>{t('Chats')}</SectionLabel>}
            <ul>
              {shown.map((chat) => (
                <li key={chat.id}>
                  <ChatRow chat={chat} userId={userId} onOpen={() => onOpen(chat.id)} />
                </li>
              ))}
            </ul>
            {!q && chats.length === 0 && <p className="px-3 py-8 text-center text-sm text-tertiary">{t('No chats yet. Search for someone to start one.')}</p>}
            {q && people.length > 0 && (
              <>
                <SectionLabel>{t('People')}</SectionLabel>
                <ul>
                  {people.map((p) => (
                    <li key={p.id}>
                      <AriaButton onPress={() => void start(p)} className={rowLook}>
                        <Avatar size="sm" initials={initials(p.name)} alt={p.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-primary">{p.name}</span>
                          <span className="block truncate text-xs text-tertiary">{p.email}</span>
                        </span>
                      </AriaButton>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {q && found.length > 0 && (
              <>
                <SectionLabel>{t('Messages')}</SectionLabel>
                <ul>
                  {found.map((msg) => (
                    <li key={msg.id}>
                      <AriaButton onPress={() => onOpen(msg.chat_id)} className={rowLook}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-primary">{chatName(msg.chat_id)}</span>
                            <span className="shrink-0 text-xs text-quaternary">{when(msg.created_at)}</span>
                          </span>
                          <span className="block truncate text-xs text-tertiary">
                            {msg.user_id === userId ? t('You') : msg.user_name}: {msg.body}
                          </span>
                        </span>
                      </AriaButton>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {q && shown.length === 0 && people.length === 0 && found.length === 0 && <p className="px-3 py-8 text-center text-sm text-tertiary">{t('Nothing found.')}</p>}
          </>
        )}
      </div>
    </>
  );
}

const rowLook =
  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pt-3 pb-1 text-xs font-semibold text-quaternary">{children}</p>;
}

function ChatRow({ chat, userId, onOpen }: { chat: ChatSummary; userId: number; onOpen: () => void }) {
  const last = chat.last;
  const preview = chat.typing.length
    ? typingLine(chat.typing)
    : !last
      ? t('No messages yet')
      : last.kind === 'system'
        ? last.body
        : last.user_id === userId
          ? `${t('You')}: ${last.body}`
          : chat.type === 'group'
            ? `${last.user_name}: ${last.body}`
            : last.body;
  return (
    <AriaButton onPress={onOpen} className={rowLook}>
      <ChatAvatar chat={chat} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx('truncate text-sm text-primary', chat.unread ? 'font-semibold' : 'font-medium')}>{chat.name}</span>
          {last && <span className="shrink-0 text-xs text-quaternary">{when(last.created_at)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cx('truncate text-xs', chat.typing.length ? 'text-brand-secondary' : chat.unread ? 'font-medium text-secondary' : 'text-tertiary')}>{preview}</span>
          {chat.unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-solid px-1.5 text-xs font-semibold text-white tabular-nums">
              <span className="sr-only">{t('{count} unread', { count: chat.unread })}</span>
              <span aria-hidden="true">{chat.unread > 99 ? '99+' : chat.unread}</span>
            </span>
          )}
        </span>
      </span>
    </AriaButton>
  );
}

function Conversation({
  chat,
  open,
  userId,
  onBack,
  onClose,
  onSend,
  onTyping,
  onOlder,
  onChanged,
  onAdd,
  onLeft,
}: {
  chat?: ChatSummary;
  open: OpenState;
  userId: number;
  onBack: () => void;
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
  onTyping: () => void;
  onOlder: () => Promise<void>;
  onChanged: (chat: ChatSummary) => void;
  onAdd: (chat: ChatSummary) => void;
  onLeft: (chatId: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'view' | 'rename' | 'leave'>('view');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastCount = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);

  // Stays at the newest message unless the user has scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const grew = open.messages.length > lastCount.current;
    const mine = open.messages.at(-1)?.user_id === userId;
    if (grew && (atBottom.current || mine || lastCount.current === 0)) el.scrollTop = el.scrollHeight;
    lastCount.current = open.messages.length;
  }, [open.messages, open.typing.length, userId]);

  useEffect(() => {
    input.current?.focus();
  }, [open.chatId]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setDraft('');
      atBottom.current = true;
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!chat || !name.trim()) return;
    setError(null);
    try {
      onChanged(await chatApi.rename(chat.id, name.trim()));
      setMode('view');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('This could not be saved.'));
    }
  }

  async function leave() {
    if (!chat) return;
    await chatApi.leave(chat.id);
    onLeft(chat.id);
  }

  // "Seen" under the user's own last message: by the other person, or by whom in a group.
  const mineLast = [...open.messages].reverse().find((msg) => msg.user_id === userId && msg.kind === 'text');
  const seenBy = mineLast && chat ? chat.members.filter((p) => p.id !== userId && (open.read[p.id] ?? 0) >= mineLast.id).map((p) => p.name) : [];
  const seenText = !seenBy.length ? '' : chat?.type === 'direct' ? t('Seen') : t('Seen by {names}', { names: seenBy.join(', ') });

  const sub = open.typing.length ? <span className="text-brand-secondary">{typingLine(open.typing)}</span> : chat?.type === 'group' ? t('{count} members', { count: chat.members.length }) : null;

  return (
    <>
      {mode === 'rename' ? (
        <form onSubmit={rename} className="flex shrink-0 items-center gap-2 border-b border-secondary px-3 py-2">
          <Input size="sm" aria-label={t('Group name')} value={name} onChange={setName} autoFocus className="flex-1" isInvalid={!!error} hint={error ?? undefined} maxLength={80} />
          <AriaButton type="submit" aria-label={t('Save name')} className={iconButton}>
            <Check className="size-4" />
          </AriaButton>
          <AriaButton aria-label={t('Cancel')} onPress={() => setMode('view')} className={iconButton}>
            <XClose className="size-4" />
          </AriaButton>
        </form>
      ) : mode === 'leave' ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-secondary px-3 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-secondary">{t('Leave this group?')}</p>
          <Button size="sm" color="secondary" onPress={() => setMode('view')}>
            {t('Cancel')}
          </Button>
          <Button size="sm" color="primary-destructive" onPress={() => void leave()}>
            {t('Leave')}
          </Button>
        </div>
      ) : (
        <PanelHeader title={chat?.name ?? '…'} sub={sub} onBack={onBack}>
          {chat?.type === 'group' && (
            <Dropdown.Root>
              <AriaButton aria-label={t('Group options')} className={iconButton}>
                <DotsVertical className="size-4" />
              </AriaButton>
              <Dropdown.Popover placement="bottom end" className="w-48">
                <Dropdown.Menu
                  aria-label={t('Group options')}
                  onAction={(key) => {
                    if (key === 'add') onAdd(chat);
                    if (key === 'rename') {
                      setName(chat.name);
                      setError(null);
                      setMode('rename');
                    }
                    if (key === 'leave') setMode('leave');
                  }}
                >
                  <Dropdown.Item id="add" icon={UsersPlus} label={t('Add people')} />
                  <Dropdown.Item id="rename" icon={Edit05} label={t('Rename')} />
                  <Dropdown.Item id="leave" icon={LogOut01} label={t('Leave group')} />
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.Root>
          )}
          <AriaButton aria-label={t('Close messages')} onPress={onClose} className={iconButton}>
            <XClose className="size-4" />
          </AriaButton>
        </PanelHeader>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {open.loading ? (
          <div className="space-y-3">
            <div className="h-9 w-2/3 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none" />
            <div className="ml-auto h-9 w-1/2 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none" />
          </div>
        ) : (
          <>
            {open.more && (
              <div className="mb-3 flex justify-center">
                <Button size="sm" color="link-gray" onPress={() => void onOlder()}>
                  {t('Load earlier messages')}
                </Button>
              </div>
            )}
            {open.messages.length === 0 && <p className="py-8 text-center text-sm text-tertiary">{t('Say hello to start the chat.')}</p>}
            <Messages messages={open.messages} userId={userId} group={chat?.type === 'group'} seenId={seenText ? mineLast?.id : undefined} seenText={seenText} />
            {open.typing.length > 0 && (
              <div className="mt-2 flex items-center gap-2" aria-label={typingLine(open.typing)}>
                <span className="flex gap-1 rounded-2xl bg-secondary px-3 py-2.5" aria-hidden="true">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-quaternary motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-secondary px-3 py-2.5">
        <textarea
          ref={input}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={onKeyDown}
          aria-label={t('Message')}
          placeholder={t('Write a message')}
          maxLength={5000}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg bg-primary px-3 py-2 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset field-sizing-content placeholder:text-placeholder focus:ring-2 focus:ring-brand"
        />
        <AriaButton
          type="submit"
          aria-label={t('Send')}
          isDisabled={!draft.trim() || sending}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white outline-focus-ring transition duration-100 ease-linear hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-disabled disabled:text-fg-disabled"
        >
          <Send01 className="size-4" />
        </AriaButton>
      </form>
    </>
  );
}

/** The messages with day lines between days, the sender's name over each run in a group, and the time under each run. */
function Messages({ messages, userId, group, seenId, seenText }: { messages: ChatMessage[]; userId: number; group: boolean; seenId?: number; seenText: string }) {
  return (
    <ol className="flex flex-col">
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
        const day = newDay ? (
          <li className="my-3 text-center text-xs font-medium text-quaternary" aria-hidden={false}>
            {dayLabel(msg.created_at)}
          </li>
        ) : null;
        if (msg.kind === 'system') {
          return (
            <FragmentLi key={msg.id} day={day}>
              <li className="my-2 text-center text-xs text-tertiary">{msg.body}</li>
            </FragmentLi>
          );
        }
        const mine = msg.user_id === userId;
        // A run: messages from the same person within five minutes on the same day.
        const sameRun = (a?: ChatMessage, b?: ChatMessage) =>
          !!a && !!b && a.kind === 'text' && b.kind === 'text' && a.user_id === b.user_id && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < 300000 && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
        const first = !sameRun(prev, msg);
        const last = !sameRun(msg, next);
        return (
          <FragmentLi key={msg.id} day={day}>
            <li className={cx('flex flex-col', mine ? 'items-end' : 'items-start', first ? 'mt-2' : 'mt-0.5')}>
              {group && !mine && first && <span className="mb-0.5 px-1 text-xs font-medium text-tertiary">{msg.user_name}</span>}
              <p
                title={new Date(msg.created_at).toLocaleString()}
                className={cx(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
                  mine ? 'bg-brand-solid text-white' : 'bg-secondary text-primary',
                  mine ? !last && 'rounded-br-md' : !last && 'rounded-bl-md',
                  mine ? !first && 'rounded-tr-md' : !first && 'rounded-tl-md',
                )}
              >
                {msg.body}
              </p>
              {(last || msg.id === seenId) && (
                <span className="mt-0.5 px-1 text-xs text-quaternary">
                  {time(msg.created_at)}
                  {msg.id === seenId && <span className="ml-2">{seenText}</span>}
                </span>
              )}
            </li>
          </FragmentLi>
        );
      })}
    </ol>
  );
}

function FragmentLi({ day, children }: { day: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {day}
      {children}
    </>
  );
}

/** A new group (name and people) or people added to a group. */
function GroupForm({ addTo, onBack, onDone }: { addTo?: ChatSummary; onBack: () => void; onDone: (chat: ChatSummary) => void }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inGroup = new Set(addTo?.members.map((p) => p.id) ?? []);

  useEffect(() => {
    let stale = false;
    chatApi.people(q).then((r) => !stale && setPeople(r), () => {});
    return () => {
      stale = true;
    };
  }, [q]);

  const toggle = (p: Person) => setPicked((list) => (list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id) : [...list, p]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked.length || (!addTo && !name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const ids = picked.map((p) => p.id);
      onDone(addTo ? await chatApi.add(addTo.id, ids) : await chatApi.group(name.trim(), ids));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('This could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={addTo ? t('Add people to {name}', { name: addTo.name }) : t('New group')} onBack={onBack} />
      <div className="shrink-0 space-y-3 px-3 pt-3">
        {!addTo && <Input size="sm" label={t('Group name')} value={name} onChange={setName} maxLength={80} autoFocus isRequired />}
        <Input size="sm" icon={SearchLg} aria-label={t('Search people')} placeholder={t('Search people')} value={query} onChange={setQuery} autoFocus={!!addTo} />
        {picked.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('Picked')}>
            {picked.map((p) => (
              <li key={p.id}>
                <AriaButton onPress={() => toggle(p)} aria-label={t('Remove {name}', { name: p.name })} className="flex items-center gap-1 rounded-full bg-brand-primary py-0.5 pr-1.5 pl-2 text-xs font-medium text-brand-secondary outline-focus-ring focus-visible:outline-2">
                  {p.name}
                  <XClose className="size-3" aria-hidden="true" />
                </AriaButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-1.5" aria-label={t('People')}>
        {people.map((p) => {
          const already = inGroup.has(p.id);
          const on = picked.some((x) => x.id === p.id);
          return (
            <li key={p.id}>
              <AriaButton onPress={() => !already && toggle(p)} isDisabled={already} aria-pressed={on} className={cx(rowLook, already && 'opacity-60')}>
                <Avatar size="sm" initials={initials(p.name)} alt={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary">{p.name}</span>
                  <span className="block truncate text-xs text-tertiary">{already ? t('Already in the group') : p.email}</span>
                </span>
                <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset', on ? 'bg-brand-solid text-white ring-brand-solid' : 'ring-primary')} aria-hidden="true">
                  {on && <Check className="size-3.5" />}
                </span>
              </AriaButton>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 space-y-2 border-t border-secondary px-3 py-2.5">
        {error && <p className="text-sm text-error-primary">{error}</p>}
        <Button type="submit" size="sm" className="w-full" isLoading={busy} isDisabled={!picked.length || (!addTo && !name.trim())}>
          {addTo ? t('Add {count}', { count: picked.length }) : t('Create group')}
        </Button>
      </div>
    </form>
  );
}
