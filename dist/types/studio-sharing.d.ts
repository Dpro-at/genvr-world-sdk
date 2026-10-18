import type { StudioShareRequest } from './vendor/contracts/index.js';
export { StudioShareRequest } from './vendor/contracts/index.js';
export interface StudioShareResult {
    url: string;
    id: string;
}
/** Server-owned authorization. Passwords are never saved in SDK project or share URLs. */
export interface StudioSharing {
    create(request: StudioShareRequest): Promise<StudioShareResult>;
}
