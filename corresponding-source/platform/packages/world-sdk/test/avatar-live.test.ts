import { describe, expect, it, vi } from 'vitest';
import { AvatarPresentation } from '../src/avatar-presentation';
import { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from '../src/avatar-live-embed';
import { StudioShareRequest } from '../src/studio-sharing';
import { WorldSession } from '../src/session';
describe('Avatar Live and sharing',()=>{
 it('changes layout through the assistant executor without mutating the saved world',async()=>{
  const controller=new AvatarPresentation(()=>null), session=WorldSession.create();
  const before=session.serialize();session.attachPresentation(controller.execute);
  const result=await session.tool('present_avatar',{event:{kind:'display',open:true,layout:'watch',framing:'bust'}});
  expect(result.ok).toBe(true);expect(controller.snapshot().display).toMatchObject({open:true,layout:'watch',framing:'bust',background:'office'});
  controller.execute({kind:'display',background:'studio'});expect(controller.snapshot().display).toMatchObject({open:true,layout:'watch',framing:'bust',background:'studio'});
  expect(session.serialize()).toBe(before);
  expect(controller.execute({kind:'display',layout:'unknown'})).toMatch(/Invalid/);
  expect(controller.execute({kind:'display',background:'image'})).toMatch(/media/);
  expect(controller.snapshot().display.background).toBe('studio');
  controller.execute({kind:'display',open:false});expect(controller.snapshot().display.open).toBe(false);controller.dispose();
 });
 it('keeps a selected world viewpoint in assistant display state and embed links',()=>{
  const controller=new AvatarPresentation(()=>null),worldSpot={position:{x:2,y:3,z:4},target:{x:0,y:1,z:0},player:{x:2,y:0,z:4}};
  expect(controller.execute({kind:'display',open:true,background:'world',worldId:'saved-world',worldSpot})).toBeNull();
  controller.execute({kind:'display',layout:'banner'});expect(controller.snapshot().display.worldSpot).toEqual(worldSpot);
  const url=new URL(avatarLiveEmbed('http://localhost:3038/','p','banner',controller.snapshot().display).url);
  expect(url.searchParams.get('worldId')).toBe('saved-world');expect(JSON.parse(url.searchParams.get('worldSpot')!)).toEqual(worldSpot);
  expect(controller.execute({kind:'display',worldSpot:{...worldSpot,position:{x:NaN,y:0,z:0}}})).toMatch(/Invalid/);controller.dispose();
 });
 it('retains uploaded backgrounds across closing the viewer and releases them on disposal',()=>{
  const controller=new AvatarPresentation(()=>null),revoke=vi.spyOn(URL,'revokeObjectURL');
  const url=controller.localMedia(new Blob(['image'],{type:'image/png'}));controller.execute({kind:'display',open:true,background:'image',media:url});
  controller.execute({kind:'display',open:false});expect(revoke).not.toHaveBeenCalled();
  controller.execute({kind:'display',open:true});expect(controller.snapshot().display.media).toBe(url);controller.dispose();expect(revoke).toHaveBeenCalledWith(url);revoke.mockRestore();
 });
 it('generates distinct embeddable presets without treating loopback as a public link',()=>{
  const ids=new Set(AVATAR_LIVE_LAYOUTS.map(row=>avatarLiveEmbed('http://127.0.0.1:3038/','private-project',row.id).id));
  expect(ids.size).toBe(7);
  const result=avatarLiveEmbed('https://studio.example/view','project with space','banner');
  expect(result.localOnly).toBe(false);expect(result.url).toContain('avatar-live=banner');expect(result.iframe).toContain('&amp;');expect(result.iframe).toContain('width="960"');
  expect(avatarLiveEmbed('http://localhost:3038/','p','circle').localOnly).toBe(true);
  expect(()=>avatarLiveEmbed('javascript:alert(1)','p','watch')).toThrow();
  expect(()=>avatarLiveEmbed('https://name:password@example.com','p','watch')).toThrow();
 });
 it('requires a real invite list and keeps password outside the generated URL',()=>{
  const request={projectId:'p',surface:'world',access:'invite',guests:[],allowJoining:true};
  expect(StudioShareRequest.safeParse(request).success).toBe(false);
  expect(StudioShareRequest.parse({...request,guests:['person'],password:'test-pass'}).password).toBe('test-pass');
 });
});
