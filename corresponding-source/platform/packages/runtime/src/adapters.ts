/**
 * Device adapter interfaces (docs/INPUT-AND-DEVICES.md). The runtime talks only to these, so new
 * hardware (headsets, glasses, cameras) is added as one adapter. Input adapters live in input.ts.
 */

/** How the world is shown: phone/desktop screen now; WebXR immersive VR and AR later. */
export interface DisplayAdapter {
  readonly kind: 'screen' | 'xr-vr' | 'xr-ar';
  /** Starts presenting; for XR this requests a session from a user gesture. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Where real-world images come from: phone camera, headset camera, or a fixed live stream (later). */
export interface CaptureAdapter {
  readonly kind: 'phone-camera' | 'headset-camera' | 'live-stream';
  available(): Promise<boolean>;
  /** Frames or a media stream, depending on the source. */
  open(): Promise<MediaStream>;
  close(): void;
}

export const screenDisplay: DisplayAdapter = {
  kind: 'screen',
  start: async () => {},
  stop: async () => {},
};
