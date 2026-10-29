import { createContext, useContext } from 'react';

/** The app meta whose menu opened the screen (null outside an app): criteria read it as appMetaId. */
export const AppMetaContext = createContext<number | null>(null);

export const useAppMetaId = () => useContext(AppMetaContext);
