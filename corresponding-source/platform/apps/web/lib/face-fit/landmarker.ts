import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { measureFace, type FaceMeasures, type PhotoProblem } from './measure';

/**
 * The MediaPipe Face Landmarker (Apache-2.0; Face Mesh V2 model card: AR entertainment, no recognition or
 * identification), loaded only when a face is read and served from this site (public/mediapipe): a picture is read
 * in this browser and never sent anywhere. The library's own usage logger (it posted to odml.pa.googleapis.com every
 * minute) is switched off by patches/@mediapipe__tasks-vision@1.1.0.patch; the version is pinned for that patch.
 */
let loading: Promise<FaceLandmarker> | null = null;

export function faceLandmarker(): Promise<FaceLandmarker> {
  loading ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' },
      runningMode: 'IMAGE',
      numFaces: 2,
    });
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Reads one face from a picture: its measures, or why the picture does not work. */
export async function readFace(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
): Promise<{ measures: FaceMeasures } | { problem: PhotoProblem }> {
  const model = await faceLandmarker();
  const result = model.detect(image);
  if (result.faceLandmarks.length === 0) return { problem: 'no-face' };
  if (result.faceLandmarks.length > 1) return { problem: 'many-faces' };
  return measureFace(result.faceLandmarks[0]!, image.width, image.height);
}

/** What to tell the person when a picture does not work (the photo rules, owner note 86). */
export const PHOTO_PROBLEM_TEXT: Record<PhotoProblem, string> = {
  'no-face': 'No face found. Use a clear photo of one face from the front.',
  'many-faces': 'More than one face. Use a photo with only your face.',
  turned: 'The face is turned. Look straight into the camera.',
  tilted: 'The head is tilted. Hold your head straight.',
  small: 'The face is too small. Come closer so the face fills most of the photo.',
};
