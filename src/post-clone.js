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
  const children=item.media_type===8 ? item.carousel_media || [] : item.carousel_media || [item];
  const expected=item.carousel_media_count || children.length;
  if (children.length<expected) warnings.push(`Instagram carousel exposes ${children.length} of ${expected} items; carousel is incomplete.`);
  const media = children.map(node=>{
    const type = node.media_type === 2 ? 'video' : 'image';
    const versions = type === 'video' ? node.video_versions : node.image_versions2?.candidates;
    const best = [...(versions || [])].sort((a,b)=>(b.width || 0)-(a.width || 0))[0];
    if (!best?.url) warnings.push(`No downloadable ${type} rendition exposed`);
    return {type,url:best?.url || ''};
  });
  return {url:location.href,text:item.caption?.text || '',author:item.user?.username || '',published_at:item.taken_at ? new Date(item.taken_at*1000).toISOString() : null,media,expected_media_count:expected,warnings};
}

// Runs in the selected task tab. Selectors follow OpenCLI's bundled site readers.
export function readDocument(site, mode) {
  if (/\/(login|checkpoint|challenge|accounts\/login)(\/|$)/.test(location.pathname) || document.querySelector('input[type="password"]')) throw new Error('Login or security challenge: sign in manually in this browser profile');
  if (site === 'facebook') {
    const messageSelector='[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"], [data-testid="post_message"], .userContent';
    const cardSelector='[aria-posinset], [role="article"]';
    const postId=value=>{
      try {
        const url=new URL(value,location.href);
        if (!['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname)) return null;
        return url.searchParams.get('story_fbid') || url.searchParams.get('fbid') || url.pathname.match(/\/(?:posts|reel|videos)\/([^/]+)/)?.[1] || null;
      } catch { return null; }
    };
    const cleanUrl=value=>{
      const url=new URL(value);
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('__') || ['ref','refid','mibextid'].includes(key)) url.searchParams.delete(key);
      url.hash='';
      return url.href;
    };
    const isParent=value=>!!postId(value) && /\/(?:posts\/|permalink\.php|story\.php)/.test(new URL(value).pathname);
    if (mode==='parent') {
      if (!/\/photo(?:\/|\.php$)/.test(location.pathname)) return null;
      const sidebar=document.querySelector('[role="complementary"]');
      const parent=[...(sidebar?.querySelectorAll('a[href]') || [])].find(a=>isParent(a.href));
      return parent ? cleanUrl(parent.href) : null;
    }
    if (mode==='photo') {
      const main=document.querySelector('[role="main"]');
      const images=[...(main?.querySelectorAll('img') || [])].filter(img=>img.naturalWidth>200 && img.naturalHeight>150);
      const image=images.sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)[0];
      const next=[...document.querySelectorAll('[role="button"]')].find(b=>/^(next photo|ảnh tiếp theo)$/i.test(b.getAttribute('aria-label') || ''));
      return {id:new URL(location.href).searchParams.get('fbid'),album:new URL(location.href).searchParams.get('set'),url:image?.currentSrc || image?.src || '',has_video:!!main?.querySelector('video'),next:!!next};
    }
    if (mode==='next-photo') {
      const next=[...document.querySelectorAll('[role="button"]')].find(b=>/^(next photo|ảnh tiếp theo)$/i.test(b.getAttribute('aria-label') || ''));
      if (next) next.click();
      return !!next;
    }
    const cards=[...document.querySelectorAll(cardSelector)].filter(card=>!card.parentElement?.closest(cardSelector));
    if (mode==='links') {
      // Header photos are valid photo permalinks too. Only discover links in feed cards.
      const urls=new Map();
      for (const card of cards) {
        const anchors=[...card.querySelectorAll('a[href]')];
        const parent=anchors.find(a=>isParent(a.href) && a.closest('[role="article"]')===card) ||
          anchors.find(a=>isParent(a.href) && !a.closest('[role="article"]'));
        if (parent) { urls.set(postId(parent.href),cleanUrl(parent.href)); continue; }
        for (const anchor of anchors) {
        if (anchor.closest('[role="article"]') && anchor.closest('[role="article"]')!==card && card.contains(anchor.closest('[role="article"]'))) continue;
        const id=postId(anchor.href);
        if (!id || /\/(?:reels?|videos?|watch)(\/|$)/i.test(new URL(anchor.href).pathname)) continue;
        const album=new URL(anchor.href).searchParams.get('set');
        const key=album?.startsWith('pcb.') ? album : id;
        if (!urls.has(key)) urls.set(key,cleanUrl(anchor.href));
        }
      }
      return [...urls.values()];
    }
    return (async()=>{
      const id=postId(location.href);
      // Relay page data contains full albums, including photos hidden behind the +N tile.
      // Match the requested story first; never collect photos from the whole document.
      const objects=[];
      const visit=(value,fn)=>{
        if (!value || typeof value!=='object') return;
        fn(value);
        for (const child of Object.values(value)) visit(child,fn);
      };
      for (const script of document.querySelectorAll('script[type="application/json"]')) {
        try { visit(JSON.parse(script.textContent),node=>objects.push(node)); } catch { /* Not all page scripts contain JSON. */ }
      }
      const ids=new Set(id?[id]:[]);
      const nodeMatches=node=>[node.url,node.permalink_url,node.comet_permalink_url].some(url=>url && ids.has(postId(url)));
      for (const node of objects) if (nodeMatches(node) && node.post_id) ids.add(String(node.post_id));
      const stories=objects.filter(node=>node.post_id && ids.has(String(node.post_id)) || nodeMatches(node));
      const originals=new Map();
      let expected=0, structuredVideo=false, albumToken=null;
      for (const story of stories) if (story.attachments) visit(story.attachments,node=>{
        if (node.all_subattachments?.count) expected=Math.max(expected,node.all_subattachments.count);
        if (node.mediaset_token?.startsWith('pcb.')) albumToken=node.mediaset_token;
        if (node.__typename==='Video') structuredVideo=true;
        if (node.__typename!=='Photo') return;
        const image=[node.viewer_image,node.image,node.large_share_image,node.photo_image].filter(x=>x?.uri).sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0];
        if (!image) return;
        const key=node.id || image.uri, area=(image.width||0)*(image.height||0);
        if (!originals.has(key) || area>originals.get(key).area) originals.set(key,{url:image.uri,type:'image',media_id:String(key),area});
      });
      const structuredText=stories.map(node=>node.message?.text).find(Boolean) || '';
      const structuredMedia=[...originals.values()].map(({area,...item})=>item);
      let root=cards.find(card=>[...card.querySelectorAll('a[href]')].some(a=>postId(a.href)===id && id));
      const photo=/\/photo(?:\/|\.php$)/.test(location.pathname) && !!id;
      // Facebook's photo viewer places the image in main and its caption in a sibling sidebar.
      const main=photo ? document.querySelector('[role="main"]') : null;
      const sidebar=photo ? document.querySelector('[role="complementary"]') : null;
      if (!root && photo && main?.querySelector('img') && sidebar) root=sidebar;
      if (!root && id && cards.length===1 && cards[0].querySelector(messageSelector) &&
          ![...cards[0].querySelectorAll('a[href]')].some(a=>postId(a.href))) root=cards[0];
      if (!root && !structuredMedia.length && !structuredText) throw new Error('No individual Facebook post found; refusing to extract profile or page images');
      const findBody=()=>{
        const message=root?.querySelector(messageSelector);
        if (message || root!==sidebar) return message;
        const candidates=[...sidebar.querySelectorAll('[dir="auto"]')].filter(el=>
          el.innerText.trim() && !el.closest('[role="article"], [role="button"], [role="heading"], [contenteditable="true"], a[href]') &&
          !el.querySelector('h1, h2, h3, time, [contenteditable="true"]')
        );
        return candidates.find(el=>el.querySelector('br') || [...el.querySelectorAll('[role="button"]')].some(b=>/^(see more|see less|xem thêm|ẩn bớt)$/i.test(b.innerText.trim()))) || candidates[0] || null;
      };
      let body=findBody();
      const more=()=>[...(body?.querySelectorAll('[role="button"], button') || [])].find(b=>/^(see more|xem thêm)$/i.test(b.innerText.trim()));
      const button=more();
      if (button) {
        const before=body.innerText;
        button.click();
        for (let attempt=0;attempt<20;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,100));
          body=findBody();
          if (body?.innerText!==before && !more()) break;
        }
      }
      let text=structuredText || body?.innerText?.trim() || '';
      if ([...(body?.querySelectorAll('[role="button"], button') || [])].some(b=>/^(see less|ẩn bớt)$/i.test(b.innerText.trim()))) text=text.replace(/\s*(see less|ẩn bớt)$/i,'');
      const media=[...structuredMedia];
      const mediaRoot=root===sidebar ? main : root;
      for (const img of structuredMedia.length ? [] : mediaRoot?.querySelectorAll('img') || []) {
        if (img.naturalWidth<=200 || img.naturalHeight<=150 || img.closest('svg, [role="comment"]')) continue;
        const article=img.closest('[role="article"]');
        if (article && article!==mediaRoot) continue;
        if (/profile picture|cover photo|ảnh đại diện|ảnh bìa/i.test(img.alt || '')) continue;
        const url=img.currentSrc || img.src;
        if (url && !media.some(m=>m.url===url)) media.push({type:'image',url});
      }
      const warnings=structuredMedia.length ? [] : ['Only images exposed by the loaded page are available; unloaded carousel images may be incomplete.'];
      if (expected>media.length) warnings.push(`Facebook album exposes ${media.length} of ${expected} images; album is incomplete.`);
      if (!text) warnings.push('Facebook post caption was not exposed by the loaded page.');
      if (more()) warnings.push('Facebook caption is still truncated after expanding See more.');
      return {url:location.href,text,media,expected_media_count:expected || media.length,album_url:albumToken && originals.size ? `https://www.facebook.com/photo/?fbid=${[...originals.keys()][0]}&set=${albumToken}` : null,has_video:structuredVideo || !!mediaRoot?.querySelector('video'),author:root?.querySelector('[data-ad-rendering-role="profile_name"]')?.innerText || stories.find(s=>s.actors?.[0]?.name)?.actors[0].name || '',published_at:root?.querySelector('time[datetime]')?.dateTime || null,warnings};
    })();
  }
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

export async function completeFacebookAlbum(page, post) {
  if (!post.album_url || !post.expected_media_count || post.media.length>=post.expected_media_count || post.has_video) return post;
  const album=new URL(post.album_url).searchParams.get('set');
  if (!album?.startsWith('pcb.')) return post;
  const evaluate=async mode=>unwrap(await page.evaluate(`(${readDocument.toString()})("facebook",${JSON.stringify(mode)})`));
  const photos=new Map();
  const warnings=(post.warnings || []).filter(w=>!/^Facebook album exposes /.test(w));
  let hasVideo=post.has_video || false;
  try {
    await page.goto(post.album_url,{waitUntil:'load',settleMs:1500});
    let previous=null;
    for (let index=0;index<Math.min(post.expected_media_count,100);index++) {
      let current;
      for (let attempt=0;attempt<30;attempt++) {
        current=await evaluate('photo');
        if (current?.album!==album || current?.has_video || current?.id && current.url && (!previous || current.id!==previous.id && current.url!==previous.url)) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if (!current || current.album!==album) break;
      if (current.has_video) {hasVideo=true;break;}
      if (!current.id || !current.url || photos.has(current.id)) break;
      photos.set(current.id,{type:'image',url:current.url});
      if (photos.size>=post.expected_media_count || !current.next) break;
      previous=current;
      if (!await evaluate('next-photo')) break;
    }
  } catch (error) {warnings.push(`Facebook album traversal failed: ${error.message}`);}
  let media=[...photos.values()];
  if (photos.size<post.expected_media_count) {
    const available=new Map(post.media.map(m=>[m.media_id || m.url,m]));
    for (const [id,item] of photos) available.set(id,item);
    media=[...available.values()];
    warnings.push(`Facebook album exposes ${media.length} of ${post.expected_media_count} images; album is incomplete.`);
  }
  return {...post,media,has_video:hasVideo,warnings};
}

export async function savePost(post, output, site, download = fetchMedia) {
  const reason = skipReason(post);
  if (reason) return skippedPost(post, reason);
  const key = createHash('sha256').update(post.url).digest('hex').slice(0,12);
  fs.mkdirSync(output,{recursive:true});
  const directory = fs.mkdtempSync(path.join(path.resolve(output), `${site}-${key}-`));
  const images=(post.media || []).filter(item=>item.type==='image');
  const media=new Array(images.length);
  let next=0;
  const worker=async()=>{
    while (next<images.length) {
      const index=next++, item=images[index];
      try {
        const {bytes,contentType}=await download(item.url);
        const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'}[contentType.split(';')[0]];
        if (!ext || !contentType.startsWith('image/')) throw new Error(`Unsupported image type ${contentType}`);
        const file=`${String(index+1).padStart(2,'0')}.${ext}`;
        fs.writeFileSync(path.join(directory,file),bytes,{flag:'wx'});
        media[index]={...item,file,bytes:bytes.length};
      } catch(error) { media[index]={...item,error:error.message}; }
    }
  };
  await Promise.all(Array.from({length:Math.min(4,images.length)},worker));
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
      if (posts.length>=source.limit) break;
      const reason=skipReason(post);
      if(reason) skipped.push({...skippedPost(post,reason),post_key:post.post_key});
      else posts.push(post);
    }
    if(feedPosts.size) urls.clear();
    const extractedUrls=new Set();
    for(const url of urls) {
      // Keep spare candidates for skipped posts, but stop navigating once enough qualify.
      if (posts.length>=source.limit) break;
      try {
        parseSource(site,url);
        if (isVideoUrl(url)) {skipped.push(skippedPost({url},'video-post')); continue;}
        await page.goto(url,{waitUntil:'load',settleMs:2000});
        let postUrl=url;
        if (site==='facebook' && /\/photo(?:\/|\.php$)/.test(new URL(url).pathname)) {
          const parent=await evaluate('parent');
          if (typeof parent==='string' && parseSource(site,parent).kind==='post') {
            postUrl=parent;
            if (extractedUrls.has(postUrl)) continue;
            await page.goto(postUrl,{waitUntil:'load',settleMs:2000});
          }
        }
        if (extractedUrls.has(postUrl)) continue;
        const shortcode=site==='instagram' ? new URL(url).pathname.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1] : null;
        let post=shortcode ? unwrap(await page.evaluate(`(${readInstagram.toString()})(${JSON.stringify(shortcode)})`)) : await evaluate('post');
        if (site==='facebook') post=await completeFacebookAlbum(page,post);
        if(!post || (!post.text && !post.media?.length)) throw new Error('Post content unavailable');
        post.url=postUrl;
        extractedUrls.add(postUrl);
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


