import { describe, expect, it, vi } from 'vitest';
import { GenvrAccountLink, GenvrClient } from '../src/index.js';
describe('account link SDK', () => {
  it('preserves the browser-native fetch receiver', async () => {
    const mock = vi.spyOn(globalThis,'fetch').mockImplementation(function(this: unknown) {
      if(this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(JSON.stringify({deviceCode:'d'.repeat(43),userCode:'ABCDEF-123456',verificationUri:'https://genvr.net/account-link',expiresIn:600,interval:5})));
    });
    try { expect((await new GenvrAccountLink('https://api.genvr.net').start('Host')).interval).toBe(5); }
    finally { mock.mockRestore(); }
  });
  it('opens consent and polls without cookies, keeps publication separate', async () => {
    const calls: Array<{url:string;init:RequestInit | undefined}> = [];
    const token = 'gvr_link_'+'a'.repeat(43);
    const fetcher: typeof fetch = async (input,init) => {
      const url = String(input); calls.push({url,init});
      const value = url.endsWith('/start') ? {deviceCode:'d'.repeat(43),userCode:'ABCDEF-123456',verificationUri:'https://genvr.net/account-link?code=ABCDEF-123456',expiresIn:600,interval:5}
        : url.endsWith('/token') ? {accessToken:token,tokenType:'Bearer',expiresAt:new Date(Date.now()+1000).toISOString(),scopes:['worlds:read'],grantId:'grant'}
        : {id:'owner',name:'Owner'};
      return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
    };
    const link = new GenvrAccountLink('https://api.genvr.net',fetcher);
    const request = await link.start('My host',['worlds:read']);
    expect(request.verificationUri).not.toContain(request.deviceCode);
    expect((await link.poll(request)).status).toBe('linked');
    const client = GenvrClient.linked('https://api.genvr.net',token,fetcher);
    expect((await client.linkedIdentity()).id).toBe('owner');
    await client.disconnect();
    expect(calls.every(c=>c.init?.credentials==='omit')).toBe(true);
    expect(new Headers(calls[2]!.init?.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(calls.some(c=>c.url.endsWith('/publish'))).toBe(false);
  });
  it('distinguishes pending from refusal and rejects unsafe endpoints', async () => {
    const request = {deviceCode:'d'.repeat(43),userCode:'ABCDEF-123456',verificationUri:'https://genvr.net/account-link',expiresIn:600,interval:5};
    const link = new GenvrAccountLink('https://api.genvr.net',async()=>new Response(JSON.stringify({error:'authorization_pending'}),{status:400}));
    expect(await link.poll(request)).toEqual({status:'pending'});
    const denied = new GenvrAccountLink('https://api.genvr.net',async()=>new Response(JSON.stringify({error:'access_denied'}),{status:400}));
    await expect(denied.poll(request)).rejects.toThrow('access_denied');
    expect(()=>new GenvrAccountLink('http://evil.example')).toThrow();
    expect(()=>GenvrClient.linked('https://api.genvr.net','bad')).toThrow();
  });
});
