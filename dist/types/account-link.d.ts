export declare const ACCOUNT_LINK_SCOPES: readonly ["worlds:read", "worlds:write", "worlds:publish", "items:submit"];
export type AccountLinkScope = typeof ACCOUNT_LINK_SCOPES[number];
export interface AccountLinkRequest {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
}
export interface LinkedAccount {
    accessToken: string;
    tokenType: 'Bearer';
    expiresAt: string;
    scopes: AccountLinkScope[];
    grantId: string;
}
export type AccountLinkPoll = {
    status: 'pending';
} | {
    status: 'linked';
    account: LinkedAccount;
};
/** Host opens verificationUri and shows userCode; passwords remain in Genvr's browser sign-in. */
export declare class GenvrAccountLink {
    #private;
    readonly apiUrl: string;
    readonly fetcher: typeof fetch;
    constructor(apiUrl: string, fetcher?: typeof fetch);
    start(clientName: string, scopes?: AccountLinkScope[]): Promise<AccountLinkRequest>;
    /** Poll no faster than request.interval seconds; pending is not an error or permission to publish. */
    poll(request: AccountLinkRequest): Promise<AccountLinkPoll>;
}
