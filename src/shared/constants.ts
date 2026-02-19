export const IPC_EVENTS = {
    AUTH_CLOSE_SSO: 'auth:close-sso',
    AUTH_OPEN_SSO: 'auth:open-sso',
    AUTH_SSO_CLOSED: 'auth:sso-closed',
    AUTH_SSO_REAUTH_SUCCESS: 'auth:sso-reauth-success',
    AUTH_SSO_SESSION_EXPIRED: 'auth:sso-session-expired',
};

export const SSO_FLOW_IDS = {
    ADD_SERVER: 'add-server',
    REAUTH: 'reauth',
};

export const HEADERS = {
    NAVIDROME_AUTHORIZATION: 'x-nd-authorization',
};

export const API_RESPONSE_KEYS = {
    SUBSONIC_RESPONSE: 'subsonic-response',
};

export const TIMEOUTS = {
    SSO_WINDOW_CLOSE: 120000, // 2 minutes
};
