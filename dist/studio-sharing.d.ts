import type { StudioShareRequest } from '@genvr/contracts';
export { StudioShareRequest } from '@genvr/contracts';
export interface StudioShareResult {
    url: string;
    id: string;
}
/** Server-owned authorization. Passwords are never saved in SDK project or share URLs. */
export interface StudioSharing {
    create(request: StudioShareRequest): Promise<StudioShareResult>;
}
