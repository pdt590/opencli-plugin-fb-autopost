import { afterEach, expect, it, vi } from 'vitest';
import { readDocument } from '../src/post-clone.js';

afterEach(() => vi.unstubAllGlobals());

function element({text='', attrs={}, children=[], parent=null, image=false, tag='div'}={}) {
  const node={innerText:text,textContent:text,parentElement:parent,children,
    getAttribute:key=>attrs[key] || null,
    matches:selector=>selector.split(',').some(s=>{
      s=s.trim();
      if(s==='a[href]') return !!attrs.href;
      if(s==='img') return image;
      if(s===tag) return true;
      const m=s.match(/^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
      return m && (!m[1] || m[1]===tag) && m[2] in attrs && (m[3]===undefined || attrs[m[2]]===m[3]);
    }),
    querySelectorAll(selector) {return children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);},
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;},
    closest(selector) {return this.matches(selector)?this:this.parentElement?.closest(selector) || null;},
    contains(other) {return other===this || children.some(c=>c.contains(other));},
  };
  if(attrs.href) node.href=attrs.href;
  if(image) Object.assign(node,{naturalWidth:1000,naturalHeight:800,src:attrs.src,currentSrc:attrs.src,alt:attrs.alt || ''});
  for(const child of children) child.parentElement=node;
  return node;
}
const link=href=>element({attrs:{href}});
function page(children,url='https://www.facebook.com/handsonai') {
  vi.stubGlobal('document',element({children}));
  vi.stubGlobal('location',new URL(url));
}

it('discovers photo links inside real feed cards, excluding header avatar and cover', async()=>{
  page([
    link('https://www.facebook.com/photo/?fbid=100'),
    link('https://www.facebook.com/photo/?fbid=101'),
    element({attrs:{'aria-posinset':'1'},children:[link('https://www.facebook.com/photo/?fbid=200&set=a.3')]}),
    element({attrs:{role:'article'},children:[link('https://www.facebook.com/handsonai/posts/300')]}),
  ]);
  expect(await readDocument('facebook','links')).toEqual([
    'https://www.facebook.com/photo/?fbid=200&set=a.3',
    'https://www.facebook.com/handsonai/posts/300',
  ]);
});

it('reads and expands a photo caption in complementary while taking media from main', async()=>{
  const caption=element({text:'Opening… See more',attrs:{dir:'auto'}});
  const button=element({text:'See more',attrs:{role:'button'}});
  button.click=()=>{caption.innerText='Opening\nFull caption ending See less'; caption.children.splice(0,caption.children.length,element({tag:'br'}),element({text:'See less',attrs:{role:'button'}}));};
  caption.children.push(button); button.parentElement=caption;
  page([
    element({attrs:{role:'main'},children:[element({image:true,attrs:{src:'https://cdn.test/post.jpg'}})]}),
    element({attrs:{role:'complementary'},children:[caption,element({text:'Comment text',attrs:{role:'article'}})]}),
  ],'https://www.facebook.com/photo/?fbid=200');
  expect(await readDocument('facebook','post')).toMatchObject({
    text:'Opening\nFull caption ending',media:[{type:'image',url:'https://cdn.test/post.jpg'}],
  });
});

it('reads a short photo caption without requiring a line break or See more', async()=>{
  page([
    element({attrs:{role:'main'},children:[element({image:true,attrs:{src:'https://cdn.test/post.jpg'}})]}),
    element({attrs:{role:'complementary'},children:[
      element({attrs:{href:'https://facebook.com/author'},children:[element({text:'Author',attrs:{dir:'auto'}})]}),
      element({text:'Short caption',attrs:{dir:'auto'}}),
      element({text:'Comment',attrs:{role:'article'},children:[element({text:'Unrelated comment',attrs:{dir:'auto'}})]}),
    ]}),
  ],'https://www.facebook.com/photo/?fbid=200');
  expect(await readDocument('facebook','post')).toMatchObject({text:'Short caption'});
});

it('keeps expanded Facebook text when structured data contains a shorter preview',async()=>{
  const body=element({text:'Opening… See more',attrs:{'data-ad-preview':'message'}});
  const button=element({text:'See more',attrs:{role:'button'}});
  button.click=()=>{
    body.innerText='Opening\nComplete caption ending';
    body.children.splice(0);
  };
  body.children.push(button);
  page([
    element({attrs:{role:'article'},children:[link('https://www.facebook.com/author/posts/200'),body]}),
    element({tag:'script',attrs:{type:'application/json'},text:JSON.stringify({post_id:'200',message:{text:'Opening…'}})}),
  ],'https://www.facebook.com/author/posts/200');
  expect(await readDocument('facebook','post')).toMatchObject({text:'Opening\nComplete caption ending'});
});

it('fails closed instead of downloading a profile main image as post content', async()=>{
  page([element({attrs:{role:'main'},children:[element({image:true,attrs:{src:'https://cdn.test/avatar.jpg'}})]})],
    'https://www.facebook.com/handsonai/posts/missing');
  await expect(Promise.resolve().then(()=>readDocument('facebook','post'))).rejects.toThrow(/post/i);
});

it('selects the matching post rather than the first suggested article', async()=>{
  const card=(id,text)=>element({attrs:{role:'article'},children:[
    link('https://www.facebook.com/handsonai/posts/'+id),
    element({text,attrs:{'data-ad-rendering-role':'story_message'}}),
    element({image:true,attrs:{src:'https://cdn.test/'+id+'.jpg'}}),
  ]});
  page([card('100','Suggested'),card('200','Requested caption')],'https://www.facebook.com/handsonai/posts/200');
  expect(await readDocument('facebook','post')).toMatchObject({text:'Requested caption',media:[{url:'https://cdn.test/200.jpg'}]});
});

it('rejects a lone suggested post whose permalink differs from the requested one', async()=>{
  page([element({attrs:{role:'article'},children:[
    link('https://www.facebook.com/handsonai/posts/100'),
    element({text:'Suggested caption',attrs:{'data-ad-rendering-role':'story_message'}}),
  ]})],'https://www.facebook.com/handsonai/posts/200');
  await expect(Promise.resolve().then(()=>readDocument('facebook','post'))).rejects.toThrow(/post/i);
});

it('groups a Facebook album as one feed post and prefers its parent permalink', async()=>{
  page([element({attrs:{'aria-posinset':'1'},children:[
    link('https://www.facebook.com/photo/?fbid=10&set=pcb.20'),
    link('https://www.facebook.com/photo/?fbid=11&set=pcb.20'),
    link('https://www.facebook.com/author/posts/pfbidAlbum'),
  ]})]);
  expect(await readDocument('facebook','links')).toEqual(['https://www.facebook.com/author/posts/pfbidAlbum']);
});

it('resolves View Post from an album photo without treating UI copy as its caption', async()=>{
  page([element({attrs:{role:'complementary'},children:[
    element({text:'This photo is from a post.',attrs:{dir:'auto'}}),
    link('https://www.facebook.com/author/posts/pfbidAlbum?__tn__=F'),
  ]})],'https://www.facebook.com/photo/?fbid=10&set=pcb.20');
  expect(await readDocument('facebook','parent')).toBe('https://www.facebook.com/author/posts/pfbidAlbum');
});

it('reads all seven original album images and the parent caption from matching page data', async()=>{
  const attachment={all_subattachments:{count:7,nodes:Array.from({length:7},(_,i)=>({media:{
    __typename:'Photo',id:String(i+1),image:{uri:'https://cdn.test/thumb-'+i,width:300,height:300},
    viewer_image:{uri:'https://cdn.test/original-'+i,width:1200,height:1600},
  }}))}};
  page([element({tag:'script',attrs:{type:'application/json'},text:JSON.stringify({data:[
    {__typename:'Story',post_id:'999',permalink_url:'https://www.facebook.com/other/posts/999',message:{text:'Unrelated'},attachments:[{media:{__typename:'Photo',id:'foreign',image:{uri:'https://cdn.test/foreign'}}}]},
    {__typename:'Story',post_id:'20',permalink_url:'https://www.facebook.com/author/posts/pfbidAlbum',attachments:[{styles:{attachment}}]},
    {post_id:'20',message:{text:'Full parent caption'},actors:[{name:'Author'}]},
  ]})})],'https://www.facebook.com/author/posts/pfbidAlbum');
  expect(await readDocument('facebook','post')).toMatchObject({text:'Full parent caption',media:Array.from({length:7},(_,i)=>({type:'image',url:'https://cdn.test/original-'+i})),expected_media_count:7});
});
