import { Centrifuge } from 'centrifuge';
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, type ChatMessage, type ChatSummary } from '../../lib/chatApi';

/**
 * How often the messenger asks for news: every 3 seconds, slower while the tab is hidden. With push
 * connected, the server says when a chat changed, and polling is only a safety net (PUSHED_EVERY),
 * or a quick recheck while someone is shown typing, since that ends without a push (TYPING_RECHECK).
 */
const EVERY = 3000;
const HIDDEN_EVERY = 15000;
const PUSHED_EVERY = 30000;
const TYPING_RECHECK = 5500;/** Typing pings at most this often; the server shows "typing" for 5 seconds after one. */
const TYPING_EVERY = 2500;

export interface OpenState {
  chatId: number;
  messages: ChatMessage[];
  more: boolean;
  typing: string[];
  read: Record<string, number>;
  /** Until the first answer for this chat arrives. */
  loading: boolean;
}

/** A soft two-note chime, made on the spot (no sound file). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.12;
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // No sound where audio is blocked; the badge still shows.
  }
}

/**
 * The messenger's state, kept fresh by polling: the chat list with unread counts, and for the
 * chat on screen its messages, who is typing and how far the others have read. It marks the open
 * chat read while it is seen, and chimes for messages from others the user isn't looking at.
 */
export function useMessenger({ userId, visible, sound }: { userId: number; visible: boolean; sound: boolean }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState<OpenState | null>(null);

  const openRef = useRef<OpenState | null>(null);
  openRef.current = open;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  // The newest message id seen per chat, to tell what is new since the last poll.
  const seen = useRef<Map<number, number> | null>(null);
  const readSent = useRef(new Map<number, number>());
  const typingSent = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  // A push came in while a poll was running: poll again right after it.
  const again = useRef(false);
  const pushedRef = useRef(false);
  // Polls now and starts the wait over (set by the polling loop).
  const restart = useRef<() => void>(() => undefined);

  const tick = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    const current = openRef.current;
    const after = current && !current.loading ? (current.messages.at(-1)?.id ?? 0) : 0;
    try {
      const res = await chatApi.poll(current?.chatId, after);
      setChats(res.chats);
      setUnread(res.unread);

      // A chime for news from others, unless it is in the chat being looked at.
      const before = seen.current;
      const now = new Map(res.chats.map((c) => [c.id, c.last?.id ?? 0]));
      if (before && soundRef.current) {
        const news = res.chats.some(
          (c) => c.last && c.last.user_id !== userId && c.last.kind === 'text' && c.last.id > (before.get(c.id) ?? 0) && !(visibleRef.current && !document.hidden && openRef.current?.chatId === c.id),
        );
        if (news) chime();
      }
      seen.current = now;

      const o = res.open;
      if (o && openRef.current?.chatId === o.chat_id) {
        setOpen((prev) => {
          if (!prev || prev.chatId !== o.chat_id) return prev;
          const have = new Set(prev.messages.map((m) => m.id));
          const messages = prev.loading ? o.messages : [...prev.messages, ...o.messages.filter((m) => !have.has(m.id))];
          return { ...prev, messages, more: prev.loading ? o.more : prev.more, typing: o.typing, read: o.read, loading: false };
        });
      }
    } catch {
      // Offline or signed out for a moment: the next round tries again.
    } finally {
      busy.current = false;
    }
    if (again.current) {
      again.current = false;
      void tick();
    }
  }, [userId]);

  // Push: one WebSocket per tab; each note ({chat}) means "fetch now". Without it (local, or the
  // socket down), polling carries on at full speed.
  useEffect(() => {
    let client: Centrifuge | null = null;
    let stopped = false;
    chatApi
      .realtime()
      .then((rt) => {
        if (stopped || !rt.url || !rt.token) return;
        client = new Centrifuge(rt.url, {
          token: rt.token,
          getToken: async () => {
            const next = await chatApi.realtime();
            if (!next.token) throw new Error('Chat push is off');
            return next.token;
          },
        });
        const pushing = (on: boolean) => {
          if (pushedRef.current === on) return;
          pushedRef.current = on;
          restart.current();
        };
        client.on('connected', () => pushing(true));
        client.on('disconnected', () => pushing(false));
        client.on('connecting', () => pushing(false));
        // The user's channel comes with the token, so its notes arrive as server-side publications.
        client.on('publication', () => restart.current());
        client.connect();
      })
      .catch(() => {
        // No push; polling covers it.
      });
    return () => {
      stopped = true;
      client?.disconnect();
      pushedRef.current = false;
    };
  }, []);

  // The polling loop: every 3 seconds, every 15 while the tab is hidden, at once when it shows again;
  // with push, every 30 seconds (5.5 while someone is shown typing).
  useEffect(() => {
    let stopped = false;
    const wait = () => {
      if (pushedRef.current) return openRef.current?.typing.length ? TYPING_RECHECK : PUSHED_EVERY;
      return document.hidden ? HIDDEN_EVERY : EVERY;
    };
    // Each start of the loop takes over; a poll still running from an older one doesn't schedule.
    let round = 0;
    const loop = async () => {
      const mine = ++round;
      await tick();
      if (!stopped && mine === round) timer.current = window.setTimeout(loop, wait());
    };
    void loop();
    restart.current = () => {
      window.clearTimeout(timer.current);
      if (!stopped) void loop();
    };
    const onShow = () => {
      if (!document.hidden) restart.current();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopped = true;
      window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [tick]);

  // The open chat counts as read while the panel shows it.
  const lastId = open?.messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!open || !visible || document.hidden || !lastId) return;
    if ((readSent.current.get(open.chatId) ?? 0) >= lastId) return;
    readSent.current.set(open.chatId, lastId);
    setChats((list) => list?.map((c) => (c.id === open.chatId ? { ...c, unread: 0 } : c)) ?? list);
    setUnread((n) => Math.max(0, n - (chats?.find((c) => c.id === open.chatId)?.unread ?? 0)));
    chatApi.read(open.chatId, lastId).catch(() => readSent.current.delete(open.chatId));
    // chats is read for the count only, so it is not a dependency.
  }, [open?.chatId, lastId, visible]);

  const openChat = useCallback(
    (chatId: number | null) => {
      setOpen(chatId ? { chatId, messages: [], more: false, typing: [], read: {}, loading: true } : null);
      if (chatId) {
        openRef.current = { chatId, messages: [], more: false, typing: [], read: {}, loading: true };
        void tick();
      }
    },
    [tick],
  );

  const send = useCallback(async (body: string) => {
    const current = openRef.current;
    if (!current) return;
    const message = await chatApi.send(current.chatId, body);
    typingSent.current = 0;
    setOpen((prev) => (prev && prev.chatId === message.chat_id && !prev.messages.some((m) => m.id === message.id) ? { ...prev, messages: [...prev.messages, message] } : prev));
    setChats((list) => {
      if (!list) return list;
      const chat = list.find((c) => c.id === message.chat_id);
      return chat ? [{ ...chat, last: message }, ...list.filter((c) => c !== chat)] : list;
    });
  }, []);

  const typing = useCallback(() => {
    const current = openRef.current;
    if (!current || Date.now() - typingSent.current < TYPING_EVERY) return;
    typingSent.current = Date.now();
    chatApi.typing(current.chatId).catch(() => {});
  }, []);

  const loadOlder = useCallback(async () => {
    const current = openRef.current;
    const first = current?.messages[0]?.id;
    if (!current || !first) return;
    const page = await chatApi.older(current.chatId, first);
    setOpen((prev) => (prev && prev.chatId === current.chatId ? { ...prev, messages: [...page.messages, ...prev.messages], more: page.more } : prev));
  }, []);

  /** A chat made or changed here (started, created, renamed, people added) shows at once. */
  const upsert = useCallback((chat: ChatSummary) => {
    setChats((list) => [chat, ...(list ?? []).filter((c) => c.id !== chat.id)]);
  }, []);

  const forget = useCallback((chatId: number) => {
    setChats((list) => list?.filter((c) => c.id !== chatId) ?? list);
    setOpen((prev) => (prev?.chatId === chatId ? null : prev));
  }, []);

  return { chats, unread, open, openChat, send, typing, loadOlder, upsert, forget, refresh: tick };
}
