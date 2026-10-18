import { z } from 'zod';
export declare const USER_AVATAR_BYTES: number;
export declare const UserAvatarMetadata: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        character: "character";
        motion: "motion";
    }>;
    name: z.ZodString;
    originalFile: z.ZodString;
    sha256: z.ZodString;
    importedAt: z.ZodString;
    source: z.ZodLiteral<"user-import">;
    provider: z.ZodLiteral<"mixamo">;
    sourcePage: z.ZodLiteral<"https://www.mixamo.com/">;
    bundled: z.ZodLiteral<false>;
    thumbnail: z.ZodOptional<z.ZodString>;
    height: z.ZodOptional<z.ZodNumber>;
    joints: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        parent: z.ZodNullable<z.ZodString>;
        at: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    }, z.core.$strip>>>;
    duration: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type UserAvatarMetadata = z.infer<typeof UserAvatarMetadata>;
export interface UserAvatarAsset {
    metadata: UserAvatarMetadata;
    data: ArrayBuffer;
}
export interface UserAvatarStorage {
    list(): Promise<UserAvatarMetadata[]>;
    get(id: string): Promise<UserAvatarAsset | null>;
    put(asset: UserAvatarAsset): Promise<void>;
    remove(id: string): Promise<void>;
    assignment(projectId: string, target: string): Promise<string | null>;
    assign(projectId: string, target: string, assetId: string | null): Promise<void>;
    subscribe?(listener: () => void): () => void;
    close(): void;
}
/** User files stay in a separate database and never enter world snapshots or package assets. */
export declare function browserUserAvatarStorage(scope: string, factory?: IDBFactory): UserAvatarStorage;
export declare function avatarDigest(bytes: ArrayBuffer): Promise<string>;
