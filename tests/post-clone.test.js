import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect, vi } from 'vitest';
import { parseSource, savePost, postClone } from '../src/post-clone.js';

it('validates platform URLs, post kinds and positive limits', () => {
  expect(parseSource('instagram', 'https://www.instagram.com/p/ABC/', 5).kind).toBe('post');
  expect(parseSource('linkedin', 'https://www.linkedin.com/company/acme/', 3).kind).toBe('feed');
  expect(parseSource('facebook', 'https://www.facebook.com/a/posts/123', 1).kind).toBe('post');
  for (const url of ['https://facebook.com.evil.test/a', 'file:///tmp/x', 'https://x:pw@facebook.com/a']) expect(() => parseSource('facebook', url, 1)).toThrow();
  for (const limit of [0, -1, 1.5, 'oops']) expect(() => parseSource('facebook', 'https://facebook.com/a', limit)).toThrow();
});
it('writes local artifacts and reports failed media without claiming completion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-'));
  try {
    const row = await savePost({ url: 'https://facebook.com/a/posts/1', text: 'Hello', media: [{url:'https://cdn.test/a',type:'image'}, {url:'https://cdn.test/b',type:'image'}] }, dir, 'facebook', async url => {
      if (url.endsWith('/b')) throw new Error('HTTP 403');
      return {bytes:Buffer.from('image'), contentType:'image/jpeg'};
    });
    expect(row.status).toBe('partial');
    const meta = JSON.parse(fs.readFileSync(path.join(row.directory, 'metadata.json')));
    expect(meta.media[0].file).toMatch(/\.jpg$/);
    expect(meta.media[1].error).toContain('403');
    expect(fs.readFileSync(path.join(row.directory, 'post.md'), 'utf8')).toContain('Hello');
    const again = await savePost({url:meta.url,text:'Second',media:[{url:'blob:test',type:'image'}]},dir,'facebook');
    expect(again.directory).not.toBe(row.directory);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
it('closes only its owned tab on extraction failure', async () => {
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async()=>{throw new Error('blocked');})};
  await expect(postClone('facebook',page,{url:'https://facebook.com/a/posts/1'})).rejects.toThrow('blocked');
  expect(page.closeTab).toHaveBeenCalledWith('owned');
});

it('registers all three positional commands as read-only', async () => {
  vi.resetModules();
  const cli = vi.fn();
  vi.doMock('@jackwener/opencli/registry',()=>({cli,Strategy:{UI:'ui'}}));
  await import('../post-clone.js');
  expect(cli.mock.calls.map(([config])=>config.site)).toEqual(['linkedin','instagram','facebook']);
  for(const [config] of cli.mock.calls) {
    expect(config.name).toBe('post-clone');
    expect(config.access).toBe('read');
    expect(config.args.find(arg=>arg.name==='url').positional).toBe(true);
  }
});

it('downloads newest discovered posts, reports shortfall and cleans up', async () => {
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-flow-'));
  const links=['https://facebook.com/a/posts/1','https://facebook.com/a/posts/2'];
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"links"')) return links;
    if(script.startsWith('window.scroll')) return null;
    const url=page.goto.mock.lastCall[0];
    return {url,text:'Post '+url.slice(-1),published_at:url.endsWith('2')?'2026-10-23':'2026-10-22',media:[{url:'blob:test',type:'image'}],warnings:[]};
  })};
  vi.useFakeTimers();
  try {
    const pending=postClone('facebook',page,{url:'https://facebook.com/a',limit:3,output});
    await vi.runAllTimersAsync();
    const rows=await pending;
    expect(rows[0].url).toBe(links[1]);
    expect(rows[2]).toMatchObject({status:'partial',requested:3,downloaded:2});
    expect(page.closeTab).toHaveBeenCalledExactlyOnceWith('owned');
  } finally {vi.useRealTimers();fs.rmSync(output,{recursive:true,force:true});}
});

it('extracts Instagram carousel originals, caption and timestamp from media info', async () => {
  const {readInstagram}=await import('../src/post-clone.js');
  const originalFetch=globalThis.fetch;
  const originalLocation=globalThis.location;
  globalThis.location={href:'https://www.instagram.com/p/B/'};
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({status:'ok',items:[{code:'B',caption:{text:'Caption'},user:{username:'author'},taken_at:1000,carousel_media:[{media_type:1,image_versions2:{candidates:[{width:200,url:'https://cdn.test/small'},{width:1000,url:'https://cdn.test/large'}]}},{media_type:2,video_versions:[{width:1080,url:'https://cdn.test/movie'}]}]}]})}));
  globalThis.fetch=fetch;
  try {
    const post=await readInstagram('B');
    expect(fetch.mock.calls[0][0]).toContain('/media/1/info/');
    expect(post).toMatchObject({text:'Caption',author:'author',media:[{type:'image',url:'https://cdn.test/large'},{type:'video',url:'https://cdn.test/movie'}]});
    expect(post.warnings).toEqual([]);
  } finally {globalThis.fetch=originalFetch; if(originalLocation===undefined) delete globalThis.location; else globalThis.location=originalLocation;}
});

it('rejects HTML and blob media instead of writing fake media files', async () => {
  const {fetchMedia}=await import('../src/post-clone.js');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=vi.fn(async()=>({ok:true,headers:new Headers({'content-type':'text/html'})}));
  try {
    await expect(fetchMedia('https://cdn.test/login')).rejects.toThrow('Unexpected media type');
    await expect(fetchMedia('blob:https://facebook.com/video')).rejects.toThrow('blob/stream');
  } finally {globalThis.fetch=originalFetch;}
});

it('skips text-only posts without creating any output directory', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clone-skip-'));
  const output=path.join(root,'not-created');
  const download=vi.fn();
  try {
    const row=await savePost({url:'https://facebook.com/a/posts/1',text:'Text only',media:[]},output,'facebook',download);
    expect(row).toMatchObject({status:'skipped',reason:'no-media'});
    expect(fs.existsSync(output)).toBe(false);
    expect(download).not.toHaveBeenCalled();
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

it('returns skipped for a direct text-only post and closes its tab', async () => {
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async()=>({text:'Text only',media:[],warnings:[]}))};
  const rows=await postClone('facebook',page,{url:'https://facebook.com/a/posts/1'});
  expect(rows).toEqual([expect.objectContaining({status:'skipped',reason:'no-media'})]);
  expect(page.closeTab).toHaveBeenCalledExactlyOnceWith('owned');
});

it('does not count text-only posts toward the feed media limit', async () => {
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-media-limit-'));
  const links=['https://facebook.com/a/posts/1','https://facebook.com/a/posts/2','https://facebook.com/a/posts/3'];
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"links"')) return links;
    const url=page.goto.mock.lastCall[0];
    return {url,text:'Post',media:url.endsWith('2')?[{url:'blob:image',type:'image'}]:[],warnings:[]};
  })};
  try {
    const rows=await postClone('facebook',page,{url:'https://facebook.com/a',limit:1,output});
    expect(rows.filter(row=>row.status==='skipped')).toHaveLength(2);
    expect(rows.find(row=>row.directory).url).toBe(links[1]);
    expect(fs.readdirSync(output)).toHaveLength(1);
  } finally {fs.rmSync(output,{recursive:true,force:true});}
});

it('skips videos, reels and mixed carousels before creating files', async () => {
  const download=vi.fn();
  for(const post of [
    {url:'https://instagram.com/reel/ABC/',media:[{type:'image',url:'https://cdn.test/thumb'}]},
    {url:'https://facebook.com/a/posts/1',media:[{type:'image',url:'https://cdn.test/a'},{type:'video',url:'blob:movie'}]},
    {url:'https://linkedin.com/posts/1',media:[{type:'image',url:'https://cdn.test/thumb'}],has_video:true},
  ]) expect(await savePost(post,'./artifacts/must-not-create','facebook',download)).toMatchObject({status:'skipped',reason:'video-post'});
  expect(download).not.toHaveBeenCalled();
});

it('does not create a task tab for a direct reel', async () => {
  const page={goto:vi.fn(),newTab:vi.fn(),selectTab:vi.fn(),closeTab:vi.fn()};
  expect(await postClone('instagram',page,{url:'https://instagram.com/reel/ABC/'})).toEqual([expect.objectContaining({status:'skipped',reason:'video-post'})]);
  expect(page.newTab).not.toHaveBeenCalled();
});

it('reports session cleanup failure', async () => {
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(async()=>{throw new Error('tab close error');}),closeWindow:vi.fn(async()=>{throw new Error('session close error');}),evaluate:vi.fn(async()=>({text:'Only text',media:[]}))};
  await expect(postClone('facebook',page,{url:'https://facebook.com/a/posts/1'})).rejects.toThrow('cleanup');
  expect(page.closeWindow).toHaveBeenCalledOnce();
});



it('uses owned-tab cleanup and makes final session release idempotent', async () => {
  const original=process.env.OPENCLI_CLOSE_OWNED_TAB;
  const close=vi.fn(async()=>{expect(process.env.OPENCLI_CLOSE_OWNED_TAB).toBe('1');});
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),closeWindow:close,evaluate:vi.fn(async()=>({text:'Text',media:[]}))};
  await postClone('facebook',page,{url:'https://facebook.com/a/posts/1'});
  await page.closeWindow();
  expect(close).toHaveBeenCalledOnce();
  expect(page.closeTab).not.toHaveBeenCalled();
  expect(process.env.OPENCLI_CLOSE_OWNED_TAB).toBe(original);
});

it('distinguishes LinkedIn company feeds from individual permalinks', () => {
  for(const url of ['https://www.linkedin.com/company/linkedin/posts/','https://www.linkedin.com/company/linkedin/posts/?feedView=images']) expect(parseSource('linkedin',url).kind).toBe('feed');
  for(const url of ['https://www.linkedin.com/posts/linkedin_news-activity-1234567890123456789-abcd','https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/']) expect(parseSource('linkedin',url).kind).toBe('post');
});

it('reads LinkedIn cards separately without promoting company filter links to permalinks', async () => {
  const {readDocument}=await import('../src/post-clone.js');
  const previousDocument=globalThis.document, previousLocation=globalThis.location;
  const heading=(key,text,video)=>({textContent:'Feed post',closest:()=>({
    getAttribute:()=>key,
    querySelectorAll:selector=>selector==='a[href]'?[{href:'https://www.linkedin.com/company/linkedin/posts/?feedView=images'}]:[{naturalWidth:800,naturalHeight:600,src:'https://cdn.test/'+key,currentSrc:'https://cdn.test/'+key}],
    querySelector:selector=>selector.includes('expandable-text-box')?{innerText:text}:selector.includes('data-vjs-player')&&video?{}:null,
  })});
  globalThis.location={href:'https://www.linkedin.com/company/linkedin/posts/',pathname:'/company/linkedin/posts/'};
  globalThis.document={querySelector:()=>null,querySelectorAll:()=>[heading('one','First image',false),heading('two','Video',true)]};
  try {
    const cards=readDocument('linkedin','cards');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({text:'First image',post_key:'one',permalink:null,has_video:false,media:[{url:'https://cdn.test/one',type:'image'}]});
    expect(cards[1].has_video).toBe(true);
  } finally {
    if(previousDocument===undefined) delete globalThis.document; else globalThis.document=previousDocument;
    if(previousLocation===undefined) delete globalThis.location; else globalThis.location=previousLocation;
  }
});
