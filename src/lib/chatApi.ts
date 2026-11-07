import { api } from './api';

export interface ChatMessage {
  id: number;
  chat_id: number;
  user_id: number | null;
  user_name: string | null;
  /** system: a line the messenger wrote (joined, left, renamed); record: a shared grid row (data), the body its note. */
  kind: 'text' | 'system' | 'record';
  body: string;
  data?: SharedRecord | null;
  created_at: string;
}

/** A grid row shared into a chat: the values as the sender saw them, and where to open it (/run/{meta_id}?row={record_id}). */
export interface SharedRecord {
  meta_id: number;
  record_id: string;
  title: string;
  fields: { label: string; value: string }[];
}

export interface ChatSummary {
  id: number;
  type: 'direct' | 'group';
  /** A direct chat is named after the other person. */
  name: string;
  members: { id: number; name: string }[];
  last: ChatMessage | null;
  unread: number;
  /** Names of the others typing now. */
  typing: string[];
}

export interface OpenChat {
  chat_id: number;
  messages: ChatMessage[];
  /** Older messages exist before the first one given (only on the first load). */
  more: boolean;
  typing: string[];
  /** user id → the last message id they have read. */
  read: Record<string, number>;
}

export interface ChatPoll {
  unread: number;
  chats: ChatSummary[];
  open: OpenChat | null;
}

export interface Person {
  id: number;
  name: string;
  email: string;
}

export const SHOW_CHAT = 'messenger:show';

/** Where chat changes are pushed from (Centrifugo), or url null when the server only answers polls. */
export interface ChatRealtime {
  url: string | null;
  token?: string;
  expires_at?: number;
}

const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** The messenger's backend (ChatController). Clients poll; writes here show no toast and keep cached screens (see api.ts). */
export const chatApi = {
  poll: (open?: number | null, after = 0) => api<ChatPoll>(`/chats/poll${open ? `?open=${open}&after=${after}` : ''}`, { notify: false }),
  realtime: () => api<ChatRealtime>('/chats/realtime', { notify: false }),
  older: (chatId: number, before: number) => api<{ messages: ChatMessage[]; more: boolean }>(`/chats/${chatId}/messages?before=${before}`),
  direct: (userId: number) => post<ChatSummary>('/chats/direct', { user_id: userId }),
  group: (name: string, userIds: number[]) => post<ChatSummary>('/chats', { name, user_ids: userIds }),
  rename: (chatId: number, name: string) => api<ChatSummary>(`/chats/${chatId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  add: (chatId: number, userIds: number[]) => post<ChatSummary>(`/chats/${chatId}/members`, { user_ids: userIds }),
  leave: (chatId: number) => api<{ left: boolean }>(`/chats/${chatId}/members/me`, { method: 'DELETE' }),
  send: (chatId: number, body: string, record?: SharedRecord) => post<ChatMessage>(`/chats/${chatId}/messages`, record ? { body, record } : { body }),
  read: (chatId: number, messageId: number) => api(`/chats/${chatId}/read`, { method: 'POST', body: JSON.stringify({ message_id: messageId }), notify: false }),
  typing: (chatId: number) => api(`/chats/${chatId}/typing`, { method: 'POST', notify: false }),
  /** The messenger opens on this chat (after sharing a record into it from elsewhere). */
  show: (chatId: number) => window.dispatchEvent(new CustomEvent<number>(SHOW_CHAT, { detail: chatId })),
  people: (q: string) => api<Person[]>(`/chats/people?q=${encodeURIComponent(q)}`),
  search: (q: string) => api<ChatMessage[]>(`/chats/search?q=${encodeURIComponent(q)}`),
};
