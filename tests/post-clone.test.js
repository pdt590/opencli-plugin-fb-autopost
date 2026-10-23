import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect, vi } from 'vitest';
import { parseSource, savePost, postClone, completeFacebookAlbum } from '../src/post-clone.js';

it.each(['facebook','instagram','linkedin'])('stops opening %s posts once the requested media limit is met', async site=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-stop-limit-'));
  const feed=site==='linkedin'?'https://linkedin.com/company/a/':`https://${site}.com/a`;
  const feedUrl=site==='linkedin'?'https://linkedin.com/company/a/posts/':feed;
  const links=Array.from({length:9},(_,i)=>site==='linkedin'?`https://linkedin.com/posts/a-activity-${i+1}-abcd`:site==='instagram'?`https://instagram.com/p/POST${i}/`:'https://facebook.com/a/posts/'+(i+1));
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"cards"')) return [];
    if(script.includes('"links"')) return links;
    return {text:'Caption',media:[{type:'image',url:'blob:test'}],warnings:[]};
  })};
  try {
    const rows=await postClone(site,page,{url:feed,limit:2,output});
    expect(rows.filter(row=>row.directory)).toHaveLength(2);
    expect(page.goto.mock.calls.map(([url])=>url)).toEqual([feedUrl,links[0],links[1]]);
  } finally {fs.rmSync(output,{recursive:true,force:true});}
});

it('stops processing LinkedIn feed cards after enough eligible posts', async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-card-limit-'));
  const cards=Array.from({length:5},(_,i)=>({post_key:String(i),url:`https://linkedin.com/posts/a-activity-${i+1}-abcd`,text:'Caption',media:i<2?[{type:'image',url:'blob:test'}]:[],warnings:[]}));
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async()=>cards)};
  try {
    const rows=await postClone('linkedin',page,{url:'https://linkedin.com/company/a/',limit:2,output});
    expect(rows).toHaveLength(2);
    expect(rows.every(row=>row.directory)).toBe(true);
    expect(page.goto).toHaveBeenCalledTimes(1);
  } finally {fs.rmSync(output,{recursive:true,force:true});}
});

it('completes a seven-photo Facebook album beyond the five preview tiles', async()=>{
  let index=0;
  const page={goto:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"next-photo"')) {index++;return true;}
    return {id:String(index),album:'pcb.20',url:'https://cdn.test/'+index,next:index<6};
  })};
  const result=await completeFacebookAlbum(page,{url:'https://facebook.com/author/posts/20',text:'Parent caption',album_url:'https://facebook.com/photo/?fbid=0&set=pcb.20',expected_media_count:7,media:[{type:'image',url:'https://cdn.test/preview'}],warnings:['Facebook album exposes 5 of 7 images; album is incomplete.']});
  expect(result).toMatchObject({text:'Parent caption',warnings:[],media:Array.from({length:7},(_,i)=>({type:'image',url:'https://cdn.test/'+i}))});
});

it('stops at the album boundary and reports an incomplete album', async()=>{
  let index=0;
  const page={goto:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"next-photo"')) {index++;return true;}
    return {id:String(index),album:index===0?'pcb.20':'pcb.OTHER',url:'https://cdn.test/'+index,next:true};
  })};
  const result=await completeFacebookAlbum(page,{url:'https://facebook.com/author/posts/20',text:'Caption',album_url:'https://facebook.com/photo/?fbid=0&set=pcb.20',expected_media_count:7,media:[],warnings:[]});
  expect(result.media).toEqual([{type:'image',url:'https://cdn.test/0'}]);
  expect(result.warnings.join(' ')).toMatch(/incomplete/i);
});

it('downloads carousel images concurrently with a bound and preserves numbering despite out-of-order completion', async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-parallel-'));
  let active=0,peak=0;
  const download=async url=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,url.endsWith('/0')?20:1));
    active--;
    if(url.endsWith('/2')) throw new Error('HTTP 403');
    return {bytes:Buffer.from(url),contentType:'image/jpeg'};
  };
  try {
    const result=await savePost({url:'https://instagram.com/p/album/',text:'Caption',media:Array.from({length:7},(_,i)=>({type:'image',url:'https://cdn.test/'+i}))},output,'instagram',download);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result).toMatchObject({status:'partial',media_count:6});
    const metadata=JSON.parse(fs.readFileSync(path.join(result.directory,'metadata.json')));
    expect(metadata.media.map(m=>m.file || m.error)).toEqual(['01.jpg','02.jpg','HTTP 403','04.jpg','05.jpg','06.jpg','07.jpg']);
    expect(fs.readFileSync(path.join(result.directory,'01.jpg'),'utf8')).toBe('https://cdn.test/0');
  } finally {fs.rmSync(output,{recursive:true,force:true});}
});

it('follows an album photo to its parent post before extracting its caption', async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'clone-parent-'));
  const parent='https://www.facebook.com/author/posts/pfbidAlbum';
  const page={goto:vi.fn(),newTab:vi.fn(async()=>'owned'),selectTab:vi.fn(),closeTab:vi.fn(),evaluate:vi.fn(async script=>{
    if(script.includes('"parent"')) return parent;
    return {text:page.goto.mock.lastCall[0]===parent?'Parent caption':'This photo is from a post.',media:[{type:'image',url:'blob:test'}],warnings:[]};
  })};
  try {
    const rows=await postClone('facebook',page,{url:'https://www.facebook.com/photo/?fbid=10&set=pcb.20',output});
    expect(rows[0].url).toBe(parent);
    const metadata=JSON.parse(fs.readFileSync(path.join(rows[0].directory,'metadata.json')));
    expect(metadata.text).toBe('Parent caption');
  } finally {fs.rmSync(output,{recursive:true,force:true});}
});

it('extracts a 13-image Instagram carousel with its full caption and original order', async()=>{
  const {readInstagram}=await import('../src/post-clone.js');
  const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
  globalThis.location={href:'https://www.instagram.com/p/DeZz8gDmnX3/'};
  globalThis.fetch=async()=>({ok:true,json:async()=>({status:'ok',items:[{code:'DeZz8gDmnX3',media_type:8,carousel_media_count:13,caption:{text:'Call a model.\nFull caption #LearnAI'},carousel_media:Array.from({length:13},(_,i)=>({media_type:1,image_versions2:{candidates:[{width:100,url:'https://cdn.test/thumb-'+i},{width:1080,url:'https://cdn.test/full-'+i}]}}))}]})});
  try {
    const post=await readInstagram('DeZz8gDmnX3');
    expect(post).toMatchObject({text:'Call a model.\nFull caption #LearnAI',media:Array.from({length:13},(_,i)=>({type:'image',url:'https://cdn.test/full-'+i})),expected_media_count:13,warnings:[]});
  } finally {globalThis.fetch=originalFetch;if(originalLocation===undefined) delete globalThis.location;else globalThis.location=originalLocation;}
});

it('reports incomplete Instagram carousel metadata instead of claiming all images were found', async()=>{
  const {readInstagram}=await import('../src/post-clone.js');
  const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
  globalThis.location={href:'https://www.instagram.com/p/B/'};
  globalThis.fetch=async()=>({ok:true,json:async()=>({status:'ok',items:[{code:'B',media_type:8,carousel_media_count:13,carousel_media:[{media_type:1,image_versions2:{candidates:[{width:1080,url:'https://cdn.test/one'}]}}]}]})});
  try {
    const post=await readInstagram('B');
    expect(post.media).toHaveLength(1);
    expect(post.warnings.join(' ')).toMatch(/1 of 13/);
  } finally {globalThis.fetch=originalFetch;if(originalLocation===undefined) delete globalThis.location;else globalThis.location=originalLocation;}
});

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
    expect(rows.filter(row=>row.status==='skipped')).toHaveLength(1);
    expect(page.goto.mock.calls.map(([url])=>url)).toEqual(['https://facebook.com/a',links[0],links[1]]);
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
