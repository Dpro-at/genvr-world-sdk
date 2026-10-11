/**
 * Registers the sea-life generators and their shared materials (SEALIFE-01). Called once when the runtime entry
 * loads (`runtime/src/index.ts`), like the generators registered at the end of `runtime/src/generators.ts`;
 * calling it again only replaces the same entries.
 */
export declare function registerSeaLife(): void;
