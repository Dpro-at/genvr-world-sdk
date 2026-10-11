/// <reference lib="webworker" />
/**
 * Speech to text and translation for subtitles (FILM-12), off the page's main thread. Free models only:
 * Whisper (OpenAI, Apache-2.0), Opus-MT (Helsinki-NLP, Apache-2.0), M2M100 (Meta, MIT), run with
 * transformers.js (Apache-2.0). They download once from Hugging Face and stay in the browser cache.
 */
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;

type Request =
  | { id: number; kind: 'transcribe'; audio: Float32Array; task: 'transcribe' | 'translate'; language: string | null }
  | { id: number; kind: 'translate'; texts: string[]; model: string; src?: string; tgt?: string };

type Progress = { status?: string; file?: string; progress?: number; loaded?: number; total?: number };

// One loaded pipeline per model, kept while the worker lives.
const loaded = new Map<string, Promise<unknown>>();
/**
 * 8-bit weights everywhere (small downloads). onnxruntime-web's extended graph optimisation breaks on these 8-bit
 * files ("TransposeDQWeightsForMatMulNBits Missing required scale"), so only the basic optimisations run.
 */
function load(task: 'automatic-speech-recognition' | 'translation', model: string, id: number) {
  let made = loaded.get(model);
  if (!made) {
    made = pipeline(task, model, {
      dtype: 'q8',
      session_options: { graphOptimizationLevel: 'basic' },
      progress_callback: (p: Progress) => {
        if (p.status === 'progress' && p.file) postMessage({ id, kind: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
      },
    });
    made.catch(() => loaded.delete(model));
    loaded.set(model, made);
  }
  return made;
}

const ASR = 'onnx-community/whisper-base';

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.kind === 'transcribe') {
      const asr = await load('automatic-speech-recognition', ASR, request.id) as (audio: Float32Array, options: object) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;
      const out = await asr(request.audio, {
        return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: request.task,
        ...(request.language ? { language: request.language } : {}),
      });
      const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, null] as [number, number | null], text: out.text }];
      postMessage({ id: request.id, kind: 'done', lines: chunks.map((c) => ({ start: c.timestamp[0], end: c.timestamp[1], text: c.text.trim() })) });
    } else {
      const translate = await load('translation', request.model, request.id) as (texts: string[], options: object) => Promise<{ translation_text: string }[]>;
      const texts: string[] = [];
      // A few lines at a time keeps memory low and lets progress show.
      for (let i = 0; i < request.texts.length; i += 8) {
        const out = await translate(request.texts.slice(i, i + 8), request.src && request.tgt ? { src_lang: request.src, tgt_lang: request.tgt } : {});
        texts.push(...out.map((o) => o.translation_text));
        postMessage({ id: request.id, kind: 'lines', done: texts.length, total: request.texts.length });
      }
      postMessage({ id: request.id, kind: 'done', texts });
    }
  } catch (error) {
    postMessage({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
