import { afterEach, expect, it, vi } from 'vitest';
import { parseSource, readDocument } from '../src/post-clone.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('accepts LinkedIn showcase feeds',()=>{
  expect(parseSource('linkedin','https://www.linkedin.com/showcase/ai-for-jobss/posts/?feedView=all',3)).toMatchObject({kind:'feed',limit:3});
});

function linkedin({ stuck=false, card=false }={}) {
  let expanded=false;
  const button={innerText:'… more',getAttribute:()=>null,click:vi.fn(()=>{
    if (!stuck) setTimeout(()=>{ expanded=true; }, 20);
  })};
  const body=()=>({innerText:expanded?'Opening\nComplete ending\n… less':'Opening\n… more',
    querySelectorAll:()=>expanded?[{innerText:'… less',getAttribute:()=>null}]:[button]});
  const root={getAttribute:()=> 'card-1',
    querySelector:selector=>/text|description/.test(selector)?body():null,
    querySelectorAll:selector=>selector==='img'?[{naturalWidth:800,naturalHeight:600,src:'https://cdn.test/post.jpg'}]:selector==='a[href]' || selector==='video'?[]:expanded?[]:[button]};
  vi.stubGlobal('location',new URL('https://www.linkedin.com/feed/update/urn:li:activity:123/'));
  vi.stubGlobal('document',{
    querySelector:selector=>selector.includes('update-v2')?root:null,
    querySelectorAll:selector=>selector==='h2'?[{textContent:'Feed post',closest:()=>root}]:[],
  });
  return {button, read:async()=>card?(await readDocument('linkedin','cards'))[0]:await readDocument('linkedin','post')};
}

it.each([false,true])('expands LinkedIn caption and waits for replaced text (feed card=%s)',async card=>{
  const {read,button}=linkedin({card});
  const post=await read();
  expect(button.click).toHaveBeenCalledTimes(1);
  expect(post.text).toBe('Opening\nComplete ending');
  expect(post.warnings.join(' ')).not.toMatch(/truncated/);
});

it('reports a LinkedIn caption that stays collapsed',async()=>{
  vi.useFakeTimers();
  const {read}=linkedin({stuck:true});
  const pending=read();
  await vi.advanceTimersByTimeAsync(3000);
  const post=await pending;
  expect(post.warnings.join(' ')).toMatch(/truncated/);
});

