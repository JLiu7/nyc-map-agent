/** One id per page visit, sent as x-session-id so the server's traces group into one conversation. */
export const SESSION_ID: string = crypto.randomUUID();
