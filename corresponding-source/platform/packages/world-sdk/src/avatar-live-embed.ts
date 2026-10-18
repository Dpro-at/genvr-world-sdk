import { AvatarLiveDisplay } from '@genvr/assistant';
export const AVATAR_LIVE_LAYOUTS = [
  { id: 'large', name: 'Large screen', width: 960, height: 600 },
  { id: 'desktop', name: 'Desktop window', width: 720, height: 520 },
  { id: 'browser', name: 'Browser panel', width: 540, height: 420 },
  { id: 'compact', name: 'Compact window', width: 380, height: 360 },
  { id: 'banner', name: 'Website banner', width: 960, height: 260 },
  { id: 'circle', name: 'Circle widget', width: 480, height: 280 },
  { id: 'watch', name: 'Watch circle', width: 360, height: 220 },
] as const;
/** The host must serve this URL and authorize access to the project and its private libraries. */
export function avatarLiveEmbed(baseUrl: string, projectId: string, layout: string, display?: Partial<AvatarLiveDisplay>) {
  const preset = AVATAR_LIVE_LAYOUTS.find(row => row.id === layout);
  if (!preset) throw new Error('Unknown Avatar Live layout.');
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected a public HTTP URL without credentials.');
  if(display){const state=AvatarLiveDisplay.parse({...display,layout});for(const key of ['background','color','framing'] as const)url.searchParams.set(key,state[key]);if(state.media)url.searchParams.set('media',state.media);if(state.worldId)url.searchParams.set('worldId',state.worldId);if(state.worldSpot)url.searchParams.set('worldSpot',JSON.stringify(state.worldSpot));}
  url.searchParams.set('avatar-live', preset.id); url.searchParams.set('project', projectId);
  const escaped = url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return { id: `avatar-live-${preset.id}`, url: url.href, localOnly: Boolean(display?.media?.startsWith('blob:')) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), iframe: `<iframe title="Avatar Live" src="${escaped}" width="${preset.width}" height="${preset.height}" allow="autoplay" style="border:0;max-width:100%" loading="lazy"></iframe>` };
}
