import type { StudioFilming } from '../../../lib/use-studio-filming';

/** Records the planned take (cues play, the camera moves by itself); `replace` re-records that shot. */
export function record(filming: StudioFilming, replace?: string) {
  if (!replace && filming.studio.mode === 'gameplay') filming.reset();
  filming.studio.setPreviewing(false);
  const [width, height] = filming.output.size.split('x').map(Number);
  void filming.take('video', filming.output.seconds, width!, height!, true, replace, filming.studio.plan);
}
