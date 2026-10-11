/** Visual resources that need a real engine picture instead of a nonvisual type icon. */
export declare const CATALOG_PICTURE_IDS: string[];
/** Offline thumbnail page uses one renderer serially; Marketplace serves only the saved images. */
export declare function renderCatalogPictures(onPicture: (id: string, url: string) => void, ids?: readonly string[]): Promise<void>;
