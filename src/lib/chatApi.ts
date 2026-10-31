import { api } from './api';

export interface ChatMessage {
  id: number;
  chat_id: number;
  user_id: number | null;
  user_name: string | null;
  /** system: a line the messenger wrote (joined, left, renamed). */
  kind: 'text' | 'system';
  body: string;
  created_at: string;
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

const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** The messenger's backend (ChatController). Clients poll; writes here show no toast and keep cached screens (see api.ts). */
export const chatApi = {
  poll: (open?: number | null, after = 0) => api<ChatPoll>(`/chats/poll${open ? `?open=${open}&after=${after}` : ''}`, { notify: false }),
  older: (chatId: number, before: number) => api<{ messages: ChatMessage[]; more: boolean }>(`/chats/${chatId}/messages?before=${before}`),
  direct: (userId: number) => post<ChatSummary>('/chats/direct', { user_id: userId }),
  group: (name: string, userIds: number[]) => post<ChatSummary>('/chats', { name, user_ids: userIds }),
  rename: (chatId: number, name: string) => api<ChatSummary>(`/chats/${chatId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  add: (chatId: number, userIds: number[]) => post<ChatSummary>(`/chats/${chatId}/members`, { user_ids: userIds }),
  leave: (chatId: number) => api<{ left: boolean }>(`/chats/${chatId}/members/me`, { method: 'DELETE' }),
  send: (chatId: number, body: string) => post<ChatMessage>(`/chats/${chatId}/messages`, { body }),
  read: (chatId: number, messageId: number) => api(`/chats/${chatId}/read`, { method: 'POST', body: JSON.stringify({ message_id: messageId }), notify: false }),
  typing: (chatId: number) => api(`/chats/${chatId}/typing`, { method: 'POST', notify: false }),
  people: (q: string) => api<Person[]>(`/chats/people?q=${encodeURIComponent(q)}`),
  search: (q: string) => api<ChatMessage[]>(`/chats/search?q=${encodeURIComponent(q)}`),
};
