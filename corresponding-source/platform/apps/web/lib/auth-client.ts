import { createAuthClient } from 'better-auth/react';
import { API_URL } from './api';

/** Better Auth client talking to the API at /api/auth. */
export const authClient = createAuthClient({ baseURL: API_URL });
