export const ACCOUNT_LINK_SCOPES = ['worlds:read', 'worlds:write', 'worlds:publish', 'items:submit'];
/** Host opens verificationUri and shows userCode; passwords remain in Genvr's browser sign-in. */
export class GenvrAccountLink {
    apiUrl;
    fetcher;
    constructor(apiUrl, fetcher = (input, init) => globalThis.fetch(input, init)) {
        this.apiUrl = apiUrl;
        this.fetcher = fetcher;
        const url = new URL(apiUrl);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash)
            throw new Error('Account link endpoint requires HTTPS or local HTTP, without credentials.');
    }
    async #request(path, body) {
        const response = await this.fetcher(`${this.apiUrl.replace(/\/$/, '')}/v1/account-links/${path}`, {
            method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await response.json();
        return { response, data };
    }
    async start(clientName, scopes = ['worlds:read', 'worlds:write']) {
        const { response, data } = await this.#request('start', { clientName, scopes });
        if (!response.ok)
            throw new Error(data.message ?? 'Unable to start account link.');
        if (typeof data.deviceCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.deviceCode) || typeof data.userCode !== 'string' || !/^[A-F0-9]{6}-[A-F0-9]{6}$/.test(data.userCode) || typeof data.verificationUri !== 'string' || !Number.isFinite(data.expiresIn) || !(data.expiresIn > 0 && data.expiresIn <= 600) || !Number.isFinite(data.interval) || !(data.interval >= 5))
            throw new Error('Invalid account link response.');
        const verification = new URL(data.verificationUri);
        if (verification.username || verification.password || (verification.protocol !== 'https:' && !(verification.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(verification.hostname))))
            throw new Error('Unsafe account link page.');
        return data;
    }
    /** Poll no faster than request.interval seconds; pending is not an error or permission to publish. */
    async poll(request) {
        const { response, data } = await this.#request('token', { deviceCode: request.deviceCode });
        if (response.status === 400 && data.error === 'authorization_pending')
            return { status: 'pending' };
        if (!response.ok)
            throw new Error(data.error ?? data.message ?? 'Account link failed.');
        if (typeof data.accessToken !== 'string' || !data.accessToken.startsWith('gvr_link_') || data.tokenType !== 'Bearer' || !Array.isArray(data.scopes) || !data.scopes.every((s) => ACCOUNT_LINK_SCOPES.includes(s)) || typeof data.grantId !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)))
            throw new Error('Invalid linked account response.');
        return { status: 'linked', account: data };
    }
}
//# sourceMappingURL=account-link.js.map