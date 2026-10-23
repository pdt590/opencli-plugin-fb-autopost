import { cli, Strategy } from '@jackwener/opencli/registry';
import { postClone } from './src/post-clone.js';

for (const site of ['linkedin', 'instagram', 'facebook']) {
  cli({
    site, name:'post-clone', access:'read',
    description:'Download image posts locally; skip video/reels and text-only posts. Reuse connected Browser Bridge; never launch Chrome.',
    domain:`www.${site}.com`, strategy:Strategy.UI, browser:true, defaultFormat:'json',
    args:[
      {name:'url',type:'string',positional:true,required:true,help:'Post, user, fanpage or company URL on this platform'},
      {name:'limit',type:'int',default:1,help:'Number of latest accessible posts from a page/profile (1-100)'},
      {name:'output',type:'string',default:'./downloads',help:'Local output directory'},
      {name:'timeout',type:'int',default:600,help:'Total command budget in seconds'},
    ],
    columns:['status','url','directory','media_count'],
    func:(first,second)=>postClone(site,first,second),
  });
}
