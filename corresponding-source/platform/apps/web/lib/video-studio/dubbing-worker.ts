/// <reference lib="webworker" />
/** Speaks subtitle lines with a Piper voice (FILM-12b) off the page's main thread, so the editor stays responsive. */
import { TtsSession } from '@mintplex-labs/piper-tts-web';
import * as ort from 'onnxruntime-web';

type Request = { id: number; voiceId: string; texts: string[] };

const sessions = new Map<string, Promise<TtsSession>>();

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, voiceId, texts } = event.data;
  try {
    let session = sessions.get(voiceId);
    if (!session) {
      session = TtsSession.create({
        voiceId: voiceId as never,
        // The runtime files must match the onnxruntime-web build in our bundle (the package's default points at 1.18).
        wasmPaths: { ...TtsSession.WASM_LOCATIONS, onnxWasm: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/` },
        progress: (p: { loaded: number; total: number }) => postMessage({ id, kind: 'progress', loaded: p.loaded, total: p.total }),
      });
      session.catch(() => sessions.delete(voiceId));
      sessions.set(voiceId, session);
    }
    const ready = await session;
    for (const [i, text] of texts.entries()) {
      const wav = await (await ready.predict(text)).arrayBuffer();
      postMessage({ id, kind: 'line', index: i, wav }, [wav]);
    }
    postMessage({ id, kind: 'done' });
  } catch (error) {
    postMessage({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
