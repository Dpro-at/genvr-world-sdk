import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createLocalVoice } from '../local-voice.mjs';
function sample() {
  const data = Buffer.alloc(44 + 16000 * 2 * 4);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24);
  data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  return data;
}
async function done(service, job) {
  while (job.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 5));
    job = await service.call({ action: 'job', jobId: job.id });
  }
  return job;
}
describe('private local voice service', () => {
  it('requires authorized valid audio; installs, persists assignment and sends real worker audio to the selected session', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'genvr-voice-test-'));
    const heard = [];
    const service = createLocalVoice({
      directory,
      run: async (args) => {
        if (args.action === 'install') return { installed: true };
        expect(args.language).toBe('ar');
        expect((await readFile(args.reference)).equals(sample())).toBe(true);
        await writeFile(args.output, sample());
        return { duration: 4 };
      },
      generated: async (audio, session) => {
        heard.push({ audio, session });
        return { started: true };
      },
    });
    try {
      await expect(
        service.call({
          action: 'clone',
          name: 'Test',
          audio: sample().toString('base64'),
        }),
      ).rejects.toThrow('authorized');
      await expect(
        service.call({
          action: 'clone',
          name: 'Test',
          audio: 'bad',
          consent: true,
        }),
      ).rejects.toThrow();
      const voice = await service.call({
        action: 'clone',
        name: 'My sample',
        audio: sample().toString('base64'),
        consent: true,
      });
      expect(
        (await stat(resolve(directory, voice.id + '.wav'))).mode & 0o777,
      ).toBe(0o600);
      await service.call({
        action: 'assign',
        projectId: 'project',
        target: 'self',
        voiceId: voice.id,
      });
      expect(
        (await service.call({ action: 'voices' })).assignments['project:self'],
      ).toBe(voice.id);
      expect(
        (await done(service, await service.call({ action: 'install' }))).status,
      ).toBe('done');
      expect(
        (await service.call({ action: 'models' })).models[0].installed,
      ).toBe(true);
      const result = await done(
        service,
        await service.call({
          action: 'speak',
          projectId: 'project',
          language: 'ar',
          text: 'مرحبا',
          sessionId: 'selected-tab',
        }),
      );
      expect(result.status).toBe('done');
      expect(heard[0].session).toBe('selected-tab');
      expect(heard[0].audio.target).toBe('self');
      await expect(
        service.call({
          action: 'speak',
          voiceId: voice.id,
          language: 'invalid',
          text: 'Hello',
        }),
      ).rejects.toThrow('Language');
      await expect(
        service.call({
          action: 'speak',
          voiceId: '../../outside',
          text: 'Hello',
        }),
      ).rejects.toThrow('ID');
      await expect(
        service.call({ action: 'install', model: 'arbitrary-remote-model' }),
      ).rejects.toThrow('Unknown');
    } finally {
      service.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('serializes expensive jobs until the worker completes', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'genvr-voice-test-'));
    let finish;
    const service = createLocalVoice({
      directory,
      run: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    try {
      const job = await service.call({ action: 'install' });
      await expect(service.call({ action: 'install' })).rejects.toThrow(
        'already running',
      );
      for (let i = 0; i < 100 && !finish; i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      finish({ installed: true });
      expect((await done(service, job)).status).toBe('done');
    } finally {
      service.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
it('prepares matching text previews for all 23 languages and replays the cache without inference', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'genvr-voice-previews-')),
    generated = [];
  let inference = 0;
  const service = createLocalVoice({
    directory,
    run: async (request) => {
      if (request.action === 'install') return { installed: true };
      await writeFile(request.output, sample());
      if (request.action === 'generate') {
        inference++;
        expect(request.text).toBeTruthy();
      }
      return { duration: 4 };
    },
    generated: async (audio) => {
      generated.push(audio);
      return { started: true };
    },
  });
  try {
    await done(service, await service.call({ action: 'install' }));
    const prepared = await done(
      service,
      await service.call({ action: 'prepare_previews' }),
    );
    expect(prepared.status).toBe('done');
    expect(prepared.result.errors).toEqual([]);
    expect(prepared.result.previews).toHaveLength(23);
    expect(
      new Set(prepared.result.previews.map((row) => row.language)).size,
    ).toBe(23);
    expect(inference).toBe(23);
    expect(generated).toHaveLength(0);
    const first = await service.call({
      action: 'preview_demo',
      demoId: 'english-demo',
      target: 'self',
    });
    expect(first.status).toBe('done');
    await service.call({
      action: 'preview_demo',
      demoId: 'english-demo',
      target: 'self',
    });
    expect(inference).toBe(23);
    expect(generated[0].text).toBe(
      prepared.result.previews.find((row) => row.language === 'en').text,
    );
    await expect(
      service.call({ action: 'demo', demoId: 'https://other.invalid/private' }),
    ).rejects.toThrow('Unknown');
  } finally {
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('removes only installed model state while preserving named voices and generated audio', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'genvr-voice-remove-'));
  const service = createLocalVoice({
    directory,
    run: async (request) =>
      request.action === 'remove'
        ? { removed: true, voicesPreserved: true }
        : { installed: true },
  });
  try {
    await done(service, await service.call({ action: 'install' }));
    const voice = await service.call({
      action: 'clone',
      name: 'Keep my voice',
      consent: true,
      audio: sample().toString('base64'),
    });
    await expect(service.call({ action: 'remove' })).rejects.toThrow('Confirm');
    expect(
      (
        await done(
          service,
          await service.call({ action: 'remove', confirm: true }),
        )
      ).status,
    ).toBe('done');
    expect((await service.call({ action: 'models' })).models[0].installed).toBe(
      false,
    );
    expect((await service.call({ action: 'voices' })).voices[0].name).toBe(
      'Keep my voice',
    );
    expect((await stat(resolve(directory, voice.id + '.wav'))).size).toBe(
      sample().length,
    );
    expect(
      (await done(service, await service.call({ action: 'install' }))).status,
    ).toBe('done');
  } finally {
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('designs a typed language preview, saves only on request, keeps assignment separate and exports metadata', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'genvr-design-test-'));
  const sent = [];
  const service = createLocalVoice({ directory, run: async args => {
    if (args.action === 'install') return { installed: true };
    expect(args.action).toBe('design');
    expect(args.voiceType).toBe('child');
    expect(args.language).toBe('ar');
    expect(args.model).toBe('voice-design-4bit');
    await writeFile(args.output, sample());
    return { duration: 4 };
  }, generated: async audio => { sent.push(audio); } });
  try {
    await done(service, await service.call({ action: 'install' }));
    await done(service, await service.call({ action: 'install', model: 'voice-design-4bit' }));
    await expect(service.call({ action: 'design', text: 'Hello', voiceType: 'invalid' })).rejects.toThrow('Choose');
    const job = await done(service, await service.call({ action: 'design', language: 'ar', voiceType: 'child', text: 'مرحبا بكم في عالمنا', description: 'Friendly animation' }));
    expect(job.status).toBe('done');
    expect(sent).toHaveLength(1);
    expect((await service.call({ action: 'voices' })).voices).toHaveLength(0);
    await expect(service.call({ action: 'save_design', audioId: 'missing', name: 'Bad' })).rejects.toThrow('preview');
    const voice = await service.call({ action: 'save_design', audioId: job.result.id, name: 'Little explorer' });
    expect(voice).toMatchObject({ name: 'Little explorer', language: 'ar', voiceType: 'child', sourceModel: 'voice-design-4bit', model: 'chatterbox-multilingual-v3' });
    expect((await service.call({ action: 'voices' })).assignments).toEqual({});
    await service.call({ action: 'assign', projectId: 'scene', voiceId: voice.id });
    expect((await service.call({ action: 'voices' })).assignments['scene:self']).toBe(voice.id);
    const exported = await service.call({ action: 'export_voice', voiceId: voice.id });
    expect(exported.metadata.voiceType).toBe('child');
    expect(Buffer.from(exported.data, 'base64').includes(Buffer.from('Little explorer'))).toBe(true);
    expect(exported.filename).toBe('Little-explorer.wav');
    service.close();
    const restored = createLocalVoice({ directory });
    expect((await restored.call({ action: 'voices' })).voices[0].voiceType).toBe('child');
    restored.close();
  } finally { service.close(); await rm(directory, { recursive: true, force: true }); }
});
