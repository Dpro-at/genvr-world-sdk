import { AvatarLiveDisplay } from './vendor/assistant/index.js';
export declare const AVATAR_LIVE_LAYOUTS: readonly [{
    readonly id: "large";
    readonly name: "Large screen";
    readonly width: 960;
    readonly height: 600;
}, {
    readonly id: "desktop";
    readonly name: "Desktop window";
    readonly width: 720;
    readonly height: 520;
}, {
    readonly id: "browser";
    readonly name: "Browser panel";
    readonly width: 540;
    readonly height: 420;
}, {
    readonly id: "compact";
    readonly name: "Compact window";
    readonly width: 380;
    readonly height: 360;
}, {
    readonly id: "banner";
    readonly name: "Website banner";
    readonly width: 960;
    readonly height: 260;
}, {
    readonly id: "circle";
    readonly name: "Circle widget";
    readonly width: 480;
    readonly height: 280;
}, {
    readonly id: "watch";
    readonly name: "Watch circle";
    readonly width: 360;
    readonly height: 220;
}];
/** The host must serve this URL and authorize access to the project and its private libraries. */
export declare function avatarLiveEmbed(baseUrl: string, projectId: string, layout: string, display?: Partial<AvatarLiveDisplay>): {
    id: string;
    url: string;
    localOnly: boolean;
    iframe: string;
};
