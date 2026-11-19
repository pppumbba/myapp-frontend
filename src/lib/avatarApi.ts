import { api } from './api';
import type { User } from '../auth/AuthContext';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

/** Where a user's profile picture loads from (no token needed: the file name is random); null: show initials. */
export const avatarUrl = (user?: Pick<User, 'avatar'> | null): string | null => (user?.avatar ? `${BASE_URL}/avatars/${user.avatar}` : null);

export const avatarApi = {
  /** A PNG, JPG, WebP or GIF up to 5 MB as the signed-in user's picture; answers the user. */
  upload: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api<User>('/user/avatar', { method: 'POST', body: form });
  },
  remove: () => api<User>('/user/avatar', { method: 'DELETE' }),
};
