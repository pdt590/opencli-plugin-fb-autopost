import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { normalizeInvocation } from './post-flow.js';
import { closeTaskSession } from './task-session.js';

export function parseSource(site, value, limit = 1) {
  let url;
  try { url = new URL(value); } catch { throw new ArgumentError('A full source URL is required'); }
  if (!['facebook','linkedin','instagram'].includes(site) || !['https:','http:'].includes(url.protocol) || url.username || url.password || url.port || ![`${site}.com`,`www.${site}.com`,...(site === 'facebook' ? ['m.facebook.com'] : [])].includes(url.hostname)) throw new ArgumentError(`Expected a ${site}.com URL`);
  limit = Number(limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ArgumentError('--limit must be an integer from 1 to 100');
  const post = site === 'instagram' ? /\/(p|reel|tv)\/[^/]+/.test(url.pathname) : site === 'linkedin' ? /^(?:\/posts\/[^/]+-activity-\d+-[^/]+\/?|\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d+\/?)$/.test(decodeURIComponent(url.pathname)) : /\/(posts|videos|reel)\/|\/(permalink|story|photo)\.php$/.test(url.pathname) || url.searchParams.has('fbid');
  url.hash = '';
  if (!post) {
    if (site === 'linkedin' && !/^\/(in|company)\/[^/]+/.test(url.pathname)) throw new ArgumentError('Use a LinkedIn post, /in/user or /company/name URL');
    if (site === 'instagram' && !/^\/[^/]+\/?$/.test(url.pathname)) throw new ArgumentError('Use an Instagram post or user URL');
    if (site === 'facebook' && (url.pathname === '/' || /^\/(groups|login|watch|search)(\/|$)/.test(url.pathname))) throw new ArgumentError('Use a Facebook post, user or fanpage URL');
  }
  return {url:url.href, kind:post?'post':'feed', limit:post?1:limit};
}

const unwrap = value => value && typeof value === 'object' && 'data' in value ? value.data : value;

// Same media-info contract used by OpenCLI 2.0's Instagram download adapter.
export async function readInstagram(shortcode) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const char of shortcode) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid Instagram shortcode');
    id = id * 64n + BigInt(digit);
  }
  const response = await fetch(`https://www.instagram.com/api/v1/media/${id}/info/`, {
    credentials:'include', headers:{'Accept':'application/json','X-IG-App-ID':'936619743392459'},
  });
  if (!response.ok) throw new Error(`Instagram media metadata: HTTP ${response.status}`);
  const data = await response.json();
  const item = data.items?.[0];
  if (data.status !== 'ok' || item?.code !== shortcode) throw new Error(data.message || 'Instagram post inaccessible or metadata mismatch');
  const warnings = [];
  const media = (item.carousel_media || [item]).map(node=>{
    const type = node.media_type === 2 ? 'video' : 'image';
    const versions = type === 'video' ? node.video_versions : node.image_versions2?.candidates;
    const best = [...(versions || [])].sort((a,b)=>(b.width || 0)-(a.width || 0))[0];
    if (!best?.url) warnings.push(`No downloadable ${type} rendition exposed`);
    return {type,url:best?.url || ''};
  });
  return {url:location.href,text:item.caption?.text || '',author:item.user?.username || '',published_at:item.taken_at ? new Date(item.taken_at*1000).toISOString() : null,media,warnings};
}

// Runs in the selected task tab. Selectors follow OpenCLI's bundled site readers.
export function readDocument(site, mode) {
  if (/\/(login|checkpoint|challenge|accounts\/login)(\/|$)/.test(location.pathname) || document.querySelector('input[type="password"]')) throw new Error('Login or security challenge: sign in manually in this browser profile');
  const isPost = href => site === 'instagram' ? /\/(p|reel|tv)\/[^/]+/.test(href) : site === 'linkedin' ? /^(?:\/posts\/[^/]+-activity-\d+-[^/]+\/?|\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d+\/?)$/.test(decodeURIComponent(new URL(href).pathname)) : /\/(posts|videos|reel)\/|\/(permalink|story|photo)\.php|[?&]fbid=/.test(href);
  if(site==='linkedin' && mode==='cards') {
    return [...document.querySelectorAll('h2')].filter(h=>h.textContent.trim()==='Feed post').map(h=>{
      const root=h.closest('[componentkey]');
      if(!root) return null;
      const permalink=[...root.querySelectorAll('a[href]')].map(a=>a.href).find(isPost);
      const media=[...root.querySelectorAll('img')].filter(img=>img.naturalWidth>200 && img.naturalHeight>150 && !/company-logo|profile-displayphoto/.test(img.src)).map(img=>({type:'image',url:img.currentSrc || img.src}));
      return {url:permalink || location.href,permalink:permalink || null,post_key:root.getAttribute('componentkey'),text:root.querySelector('[data-testid="expandable-text-box"]')?.innerText || '',has_video:!!root.querySelector('video,[data-vjs-player]'),media,published_at:root.querySelector('time[datetime]')?.dateTime || null,warnings:permalink?[]:['Post extracted from an individual feed card; LinkedIn did not expose its permalink. Source URL points to the company feed.']};
    }).filter(Boolean);
  }
  if (mode === 'links') return [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href).filter(href=>{try {const url=new URL(href); return (url.hostname===site+'.com' || url.hostname.endsWith('.'+site+'.com')) && !/\/(reels?|videos?|watch|tv)(\/|$)/i.test(url.pathname) && isPost(href);} catch {return false;}}))];
  const roots = site === 'linkedin' ? '.feed-shared-update-v2, .update-components-update-v2' : site === 'instagram' ? 'article' : '[role="article"]';
  const root = document.querySelector(roots) || (site==='linkedin' ? [...document.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Feed post')?.closest('[componentkey]') : document.querySelector('main') || document.querySelector('[role="main"]'));
  if(site==='linkedin' && mode==='post' && !root) throw new Error('No individual LinkedIn post card found; refusing to extract the whole page');
  const meta = name => document.querySelector(`meta[property="${name}"]`)?.content || '';
  const body = root?.querySelector(site === 'linkedin' ? '.update-components-text, .feed-shared-update-v2__description, [data-testid="expandable-text-box"]' : site === 'facebook' ? '[data-ad-preview="message"], [data-ad-comet-preview="message"]' : 'h1');
  const text = body?.innerText || meta('og:description');
  const media=[];
  const add=(url,type)=>{if(url && !media.some(m=>m.url===url)) media.push({url,type});};
  for(const img of root?.querySelectorAll('img') || []) if(img.naturalWidth > 200 && img.naturalHeight > 150) add(img.currentSrc || img.src,'image');
  for(const video of root?.querySelectorAll('video') || []) add(video.currentSrc || video.querySelector('source')?.src || video.src,'video');
  if(!media.length) add(meta('og:image'),'image');
  add(meta('og:video') || meta('og:video:url'),'video');
  return {url:location.href, text, has_video:!!root?.querySelector('video') || !!meta('og:video') || !!meta('og:video:url'), author:meta('article:author'), published_at:document.querySelector('time[datetime]')?.dateTime || meta('article:published_time') || null, media, warnings:['Only images exposed by the loaded page are available; unloaded carousel images may be incomplete.']};
}

export async function fetchMedia(url) {
  const parsed = new URL(url);
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Media is a blob/stream or unsupported URL; no downloadable original exposed');
  const response = await fetch(url, {signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/^(image|video)\//.test(contentType)) throw new Error(`Unexpected media type: ${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Empty media response');
  return {bytes,contentType};
}

export async function savePost(post, output, site, download = fetchMedia) {
  const reason = skipReason(post);
  if (reason) return skippedPost(post, reason);
  const key = createHash('sha256').update(post.url).digest('hex').slice(0,12);
  fs.mkdirSync(output,{recursive:true});
  const directory = fs.mkdtempSync(path.join(path.resolve(output), `${site}-${key}-`));
  const media=[];
  for(const [index,item] of (post.media || []).filter(item=>item.type==='image').entries()) {
    try {
      const {bytes,contentType}=await download(item.url);
      const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'}[contentType.split(';')[0]];
      if (!ext || !contentType.startsWith('image/')) throw new Error(`Unsupported image type ${contentType}`);
      const file=`${String(index+1).padStart(2,'0')}.${ext}`;
      fs.writeFileSync(path.join(directory,file),bytes,{flag:'wx'});
      media.push({...item,file,bytes:bytes.length});
    } catch(error) { media.push({...item,error:error.message}); }
  }
  const status=media.some(m=>m.error) || post.warnings?.length ? 'partial' : 'downloaded';
  const metadata={...post,site,media,status,downloaded_at:new Date().toISOString()};
  fs.writeFileSync(path.join(directory,'metadata.json'),JSON.stringify(metadata,null,2));
  fs.writeFileSync(path.join(directory,'post.md'),`${post.text || ''}\n\nSource: ${post.url}\n\n${media.filter(m=>m.file).map(m=>m.type==='image'?`![image](${m.file})`:`[video](${m.file})`).join('\n')}\n`);
  return {status,url:post.url,directory,media_count:media.filter(m=>m.file).length,errors:media.filter(m=>m.error).map(m=>m.error),warnings:post.warnings || []};
}

function skipReason(post) {
  if (isVideoUrl(post.url) || post.has_video || post.media?.some(item=>item.type==='video')) return 'video-post';
  return post.media?.some(item => item.type==='image' && typeof item.url === 'string' && item.url.trim()) ? null : 'no-media';
}

function isVideoUrl(value) {
  return /\/(reels?|videos?|watch|tv)(\/|$)/i.test(new URL(value).pathname);
}

function skippedPost(post, reason='no-media') {
  return {status:'skipped',url:post.url,reason,media_count:0};
}

export async function postClone(site, first, second) {
  const {page,kwargs}=normalizeInvocation(first,second);
  const source=parseSource(site,kwargs.url,kwargs.limit ?? 1);
  if (source.kind==='post' && isVideoUrl(source.url)) {
    await closeTaskSession(page);
    return [skippedPost(source,'video-post')];
  }
  if(!page || ![page.newTab,page.selectTab,page.closeTab].every(f=>typeof f==='function')) throw new CommandExecutionError('OpenCLI 2.x Browser Bridge tab support required');
  const output=path.resolve(kwargs.output || './downloads');
  let owned;
  let failure;
  try {
    owned=await page.newTab();
    if(typeof owned!=='string' || !owned) throw new CommandExecutionError('No task tab identity returned');
    await page.selectTab(owned);
    let feedUrl=source.url;
    if(source.kind==='feed' && site==='linkedin') {
      const url=new URL(feedUrl);
      const handle=url.pathname.split('/').filter(Boolean).slice(0,2).join('/');
      url.pathname='/' + handle + (/^\/in\//.test(url.pathname)?'/recent-activity/all/':'/posts/');
      feedUrl=url.href;
    }
    await page.goto(feedUrl,{waitUntil:'load',settleMs:3000});
    const evaluate=async mode=>unwrap(await page.evaluate(`(${readDocument.toString()})(${JSON.stringify(site)},${JSON.stringify(mode)})`));
    const urls=new Set(source.kind==='post'?[source.url]:[]);
    const feedPosts=new Map();
    if(source.kind==='feed') {
      let stale=0;
      for(let round=0;round<30 && stale<3;round++) {
        const before=urls.size;
        if(site==='linkedin') {
          for(const post of await evaluate('cards')) feedPosts.set(post.post_key,post);
          if([...feedPosts.values()].filter(post=>!skipReason(post)).length>=source.limit) break;
        }
        for(const url of await evaluate('links')) {try {const parsed=parseSource(site,url); if(parsed.kind==='post') urls.add(parsed.url);} catch { /* Ignore unrelated links. */ }}
        if(urls.size>=source.limit*3) break;
        stale=before===urls.size?stale+1:0;
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }
    if(!urls.size && !feedPosts.size) throw new CommandExecutionError('No post links found. Verify login, source visibility and page layout.');
    const posts=[],failures=[],skipped=[];
    for(const post of feedPosts.values()) {
      const reason=skipReason(post);
      if(reason) skipped.push({...skippedPost(post,reason),post_key:post.post_key});
      else posts.push(post);
    }
    if(feedPosts.size) urls.clear();
    for(const url of urls) {
      try {
        parseSource(site,url);
        if (isVideoUrl(url)) {skipped.push(skippedPost({url},'video-post')); continue;}
        await page.goto(url,{waitUntil:'load',settleMs:2000});
        const shortcode=site==='instagram' ? new URL(url).pathname.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1] : null;
        const post=shortcode ? unwrap(await page.evaluate(`(${readInstagram.toString()})(${JSON.stringify(shortcode)})`)) : await evaluate('post');
        if(!post || (!post.text && !post.media?.length)) throw new Error('Post content unavailable');
        post.url=url;
        const reason=skipReason(post);
        if (reason) { skipped.push(skippedPost(post,reason)); continue; }
        posts.push(post);
      } catch(error) {failures.push({status:'failed',url,error:error.message});}
    }
    posts.sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0));
    const rows=[];
    for(const post of posts.slice(0,source.limit)) {
      if(source.kind==='feed') post.warnings.push('Latest among discovered posts only; pinned posts, missing timestamps and platform ranking can affect order.');
      rows.push(await savePost(post,output,site));
    }
    if (!rows.length && !skipped.length) throw new CommandExecutionError(failures.map(row=>`${row.url}: ${row.error}`).join('; ') || 'No posts downloaded');
    return [...rows,...skipped,...failures, ...(source.kind==='feed' && rows.length<source.limit ? [{status:'partial',requested:source.limit,downloaded:rows.length,warning:'Fewer accessible posts with media than requested'}]:[])];
  } catch(error) { failure=error; throw error; }
  finally {
    const errors=[];
    // Release the entire clone session lease, including its initial/extra managed tabs.
    // Browser Bridge preserves tabs that are not owned by this session.
    try {await closeTaskSession(page,owned);} catch(error) {errors.push(error.message);}
    if(errors.length) {
      const message=`Clone tab cleanup failed: ${errors.join('; ')}`;
      if(failure) failure.message+=` ${message}`;
      else throw new CommandExecutionError(message);
    }
  }
}


