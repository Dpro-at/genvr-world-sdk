import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, Square, Volume2, X } from 'lucide-react';
import { SpeechMouth } from '@genvr/runtime';
import type { MouthShape } from '@genvr/contracts';
export interface AvatarSpeechPlayback {
  load(input: {
    data: string;
    target: string;
    duration: number;
    text?: string;
  }): Promise<void>;
  control(command: string, value?: number): Promise<unknown>;
  snapshot(): {
    playing: boolean;
    currentTime: number;
    duration: number;
    mouth: MouthShape;
    level: number;
  };
}
type Clip = {
  buffer: AudioBuffer;
  target: string;
  url: string;
  peaks: number[];
  shape: SpeechMouth;
  offset: number;
  startedAt: number;
  playing: boolean;
  rate: number;
};
const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function AvatarSpeechPlayer({
  register,
  mouth,
  recording,
  portal,
}: {
  register: (controller: AvatarSpeechPlayback | null) => void;
  mouth: (target: string, shape: MouthShape) => void;
  recording: (stream: MediaStream | null) => void;
  portal?: HTMLElement | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    context = useRef<AudioContext | null>(null),
    analyser = useRef<AnalyserNode | null>(null),
    gain = useRef<GainNode | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    clip = useRef<Clip | null>(null),
    controllerRef = useRef<AvatarSpeechPlayback | null>(null);
  const callbacks = useRef({ mouth, recording });
  callbacks.current = { mouth, recording };
  const shape = useRef<MouthShape>('X'),
    level = useRef(0),
    serial = useRef(0);
  const [visible, setVisible] = useState(false),
    [title, setTitle] = useState(''),
    [error, setError] = useState(''),
    [rate, setRate] = useState('1'),
    [volume, setVolume] = useState(1),
    [display, setDisplay] = useState({ time: 0, duration: 0, playing: false });
  useEffect(() => {
    let mouthActive = false;
    let alive = true,
      lastPaint = 0;
    const position = () => {
      const current = clip.current;
      return current
        ? Math.min(
            current.buffer.duration,
            current.offset +
              (current.playing && context.current
                ? (context.current.currentTime - current.startedAt) *
                  current.rate
                : 0),
          )
        : 0;
    };
    const rest = () => {
      if (clip.current && mouthActive)
        callbacks.current.mouth(clip.current.target, 'X');
      mouthActive = false;
      shape.current = 'X';
      level.current = 0;
    };
    const pause = () => {
      const current = clip.current;
      if (current) {
        current.offset = position();
        current.playing = false;
      }
      const old = source.current;
      source.current = null;
      old?.stop();
      old?.disconnect();
      rest();
    };
    const play = async () => {
      const current = clip.current;
      if (!current || !context.current || !analyser.current)
        throw new Error('No speech is loaded.');
      await context.current.resume();
      if (context.current.state !== 'running')
        throw new Error('Click Play to enable audio.');
      pause();
      if (current.offset >= current.buffer.duration) current.offset = 0;
      const next = context.current.createBufferSource();
      next.buffer = current.buffer;
      next.playbackRate.value = current.rate;
      next.connect(analyser.current);
      source.current = next;
      current.startedAt = context.current.currentTime;
      current.playing = true;
      current.shape = new SpeechMouth();
      current.shape.speak(
        { duration: current.buffer.duration, cues: [] },
        0,
        analyser.current,
      );
      next.onended = () => {
        if (source.current !== next) return;
        source.current = null;
        next.disconnect();
        current.offset = current.buffer.duration;
        current.playing = false;
        rest();
      };
      next.start(0, current.offset);
      setVisible(true);
    };
    const controller: AvatarSpeechPlayback = {
      async load(input) {
        const request = ++serial.current;
        context.current ??= new AudioContext();
        await context.current.resume();
        const bytes = Uint8Array.from(atob(input.data), (char) =>
            char.charCodeAt(0),
          ),
          buffer = await context.current.decodeAudioData(bytes.buffer);
        if (!alive || request !== serial.current)
          throw new Error('Speech was replaced.');
        pause();
        if (clip.current) URL.revokeObjectURL(clip.current.url);
        if (!analyser.current) {
          analyser.current = context.current.createAnalyser();
          analyser.current.fftSize = 256;
          gain.current = context.current.createGain();
          gain.current.gain.value = 1;
          analyser.current.connect(gain.current);
          gain.current.connect(context.current.destination);
          const tap = context.current.createMediaStreamDestination();
          gain.current.connect(tap);
          callbacks.current.recording(tap.stream);
        }
        const samples = buffer.getChannelData(0),
          step = Math.max(1, Math.ceil(samples.length / 180)),
          peaks: number[] = [];
        for (let i = 0; i < samples.length; i += step) {
          let peak = 0;
          for (let j = i; j < Math.min(i + step, samples.length); j++)
            peak = Math.max(peak, Math.abs(samples[j]!));
          peaks.push(peak);
        }
        clip.current = {
          buffer,
          target: input.target,
          url: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })),
          peaks,
          shape: new SpeechMouth(),
          offset: 0,
          startedAt: 0,
          playing: false,
          rate: Number(rateRef.current),
        };
        setTitle(input.text ?? 'Avatar speech');
        setError('');
        setVisible(true);
        await play();
      },
      async control(command, value) {
        const current = clip.current;
        if (!current) throw new Error('No speech is loaded.');
        if (command === 'play') await play();
        else if (command === 'pause') pause();
        else if (command === 'stop') {
          pause();
          current.offset = 0;
        } else if (command === 'seek') {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > current.buffer.duration
          )
            throw new Error('Seek must be inside the recording.');
          const playing = current.playing;
          pause();
          current.offset = value;
          if (playing) await play();
        } else if (command === 'rate') {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0.5 ||
            value > 2
          )
            throw new Error('Playback speed must be between 0.5 and 2.');
          const playing = current.playing;
          pause();
          current.rate = value;
          setRate(String(value));
          if (playing) await play();
        } else if (command === 'volume') {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1
          )
            throw new Error('Volume must be between 0 and 1.');
          if (gain.current) gain.current.gain.value = value;
          setVolume(value);
        } else throw new Error('Unknown speech playback command.');
        return controller.snapshot();
      },
      snapshot() {
        return {
          playing: clip.current?.playing ?? false,
          currentTime: position(),
          duration: clip.current?.buffer.duration ?? 0,
          mouth: shape.current,
          level: level.current,
        };
      },
    };
    register(controller);
    controllerRef.current = controller;
    let frame = 0;
    const samples = new Float32Array(256);
    const draw = (now: number) => {
      const current = clip.current,
        at = position(),
        view = canvas.current?.getContext('2d');
      if (current?.playing) {
        mouthActive = true;
        shape.current = current.shape.shapeAt(at);
        callbacks.current.mouth(current.target, shape.current);
        analyser.current?.getFloatTimeDomainData(samples);
        level.current = Math.sqrt(
          samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
        );
      } else rest();
      if (view && current) {
        const w = view.canvas.width,
          h = view.canvas.height;
        view.clearRect(0, 0, w, h);
        const progress = at / current.buffer.duration;
        current.peaks.forEach((peak, i) => {
          view.fillStyle =
            i / current.peaks.length < progress ? '#00A8CD' : '#7b8390';
          const bar = Math.max(2, peak * (h - 6));
          view.fillRect(
            (i * w) / current.peaks.length,
            (h - bar) / 2,
            Math.max(1, w / current.peaks.length - 1),
            bar,
          );
        });
        view.fillStyle = '#00A8CD';
        view.fillRect(0, h - 3, Math.min(1, level.current * 3) * w, 3);
      }
      if (current && now - lastPaint > 100) {
        lastPaint = now;
        setDisplay({
          time: at,
          duration: current.buffer.duration,
          playing: current.playing,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      alive = false;
      serial.current++;
      cancelAnimationFrame(frame);
      pause();
      register(null);
      controllerRef.current = null;
      if (clip.current) URL.revokeObjectURL(clip.current.url);
      callbacks.current.recording(null);
      void context.current?.close();
    };
  }, [register]);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const control = (command: string, value?: number) =>
    void controllerRef.current
      ?.control(command, value)
      .catch((error) => setError(error.message));
  const panel = (
    <section
      aria-label="Avatar speech player"
      hidden={!visible}
      className={
        portal
          ? 'rounded-lg border border-ink/10 bg-surface p-2 text-ink'
          : 'pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(420px,90%)] -translate-x-1/2 rounded-xl border border-ink/15 bg-surface/95 p-3 text-ink shadow-xl'
      }
    >
      <div className="flex items-center gap-2">
        <Volume2 className="size-4 shrink-0" />
        <p dir="auto" className="min-w-0 flex-1 truncate text-xs">
          {title}
        </p>
        <button
          aria-label="Close speech player"
          onClick={() => {
            control('pause');
            setVisible(false);
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <canvas
        ref={canvas}
        width={720}
        height={66}
        aria-label="Speech waveform and live audio level"
        className="my-2 h-10 w-full"
      />
      <div className="flex items-center gap-2">
        <button
          aria-label={
            display.playing ? 'Pause avatar speech' : 'Play avatar speech'
          }
          onClick={() => control(display.playing ? 'pause' : 'play')}
        >
          {display.playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>
        <button aria-label="Stop avatar speech" onClick={() => control('stop')}>
          <Square className="size-3" />
        </button>
        <span className="whitespace-nowrap text-[10px] tabular-nums">
          {stamp(display.time)} / {stamp(display.duration)}
        </span>
        <input
          aria-label="Speech position"
          type="range"
          min="0"
          max={display.duration || 1}
          step="0.01"
          value={display.time}
          className="min-w-0 flex-1 accent-cyan-500"
          onChange={(e) => control('seek', Number(e.target.value))}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label>
          Speed{' '}
          <select
            aria-label="Speech playback speed"
            className="rounded border border-ink/15 bg-paper"
            value={rate}
            onChange={(e) => control('rate', Number(e.target.value))}
          >
            {['0.5', '0.75', '1', '1.25', '1.5', '2'].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <Volume2 className="size-3" />
        <input
          aria-label="Speech volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          className="w-16 accent-cyan-500"
          onChange={(e) => control('volume', Number(e.target.value))}
        />
        <button
          className="ml-auto flex items-center gap-1"
          onClick={() => {
            if (!clip.current) return;
            const link = document.createElement('a');
            link.href = clip.current.url;
            link.download = 'avatar-speech.wav';
            link.click();
          }}
        >
          <Download className="size-3" />
          WAV
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
  return portal ? createPortal(panel, portal) : panel;
}
