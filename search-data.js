'use strict';
const BASE='https://rezka.si';
function text(value) {
  return value.replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0 && n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}
function attributes(tag) {
  const values={};for(const m of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) values[m[1].toLowerCase()]=m[3];return values;
}
function cardURL(value) {
  let url;try {url=new URL(value,BASE);}catch(_){return null;}
  const match=url.pathname.match(/^\/(films|series|cartoons|animation)\/[a-z0-9-]+\/(\d{1,12})-[a-z0-9-]+\.html$/i);
  if(url.origin!==BASE || url.username || url.password || url.search || url.hash || !match) return null;
  return {id:match[2],path:url.pathname,type:match[1]==='series'?'series':match[1]==='films'?'movie':'animation'};
}
// Track div depth rather than stopping at the first nested closing div.
function blocks(html,className) {
  const result=[],stack=[];let count=0;
  for(const m of html.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)) {
    if(++count>100000) throw new Error('SEARCH_FORMAT_UNKNOWN');
    if(/^<\//.test(m[0])) {
      const start=stack.pop();if(start && start.selected) result.push(html.slice(start.at,m.index+m[0].length));
    } else {const a=attributes(m[0]);stack.push({at:m.index,selected:(a.class || '').split(/\s+/).includes(className)});}
  }
  return result;
}
function parseSearch(html) {
  if(/<form\b[^>]*id=["']loginForm["']/i.test(html)) throw new Error('SESSION_EXPIRED');
  if(/<title>\s*(?:Just a moment|DDoS-Guard)/i.test(html) || html.includes('challenges.cloudflare.com')) throw new Error('BLOCKED');
  const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const items=[];
  const cards=blocks(clean,'b-content__inline_item');
  for(const card of cards) {
    const body=blocks(card,'b-content__inline_item-link')[0];if(!body) continue;
    const link=body.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);if(!link) continue;
    const info=cardURL(attributes(link[1]).href || '');if(!info || items.some(i=>i.id===info.id)) continue;
    const title=text(link[2]).slice(0,200);if(!title) continue;
    const detail=text(body.slice((link.index || 0)+link[0].length)).slice(0,250);
    const year=(detail.match(/\b(?:19|20)\d{2}\b/) || [])[0] || '';
    items.push({...info,title,year,description:detail});if(items.length>=40) break;
  }
  if(cards.length && !items.length) throw new Error('SEARCH_FORMAT_UNKNOWN');
  if(!cards.length && !/b-content__inline_items|b-search|search-results|По вашему запросу|ничего не найден|не дал результатов/i.test(clean)) throw new Error('SEARCH_FORMAT_UNKNOWN');
  return items;
}
function searchPath(query, cursor='') {
  if (!cursor) return '/search/?'+new URLSearchParams({do:'search',subaction:'search',q:query});
  const url=new URL(cursor,BASE);
  if (cursor.length>1500 || url.origin!==BASE || url.username || url.password || url.hash ||
      !/^\/search\/(?:page\/\d{1,4}\/)?$/.test(url.pathname) || url.searchParams.get('q')!==query) throw new Error('INVALID_QUERY');
  return url.pathname+url.search;
}
function nextSearch(html, query, currentPath) {
  const current=new URL(currentPath,BASE);
  const page=Number(current.searchParams.get('search_start') || current.searchParams.get('page') || (current.pathname.match(/page\/(\d+)/) || [])[1] || 1);
  const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  for (const match of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs=attributes(match[1]),caption=text(match[2]);
    if(!attrs.href) continue;
    if (!(attrs.rel || '').split(/\s+/).includes('next') && !/^(?:далее|следующая|впер[её]д|next|→|»)$/i.test(caption) && caption!==String(page+1)) continue;
    try {
      const candidate=searchPath(query,(attrs.href || '').replace(/&amp;/g,'&'));
      if(candidate!==currentPath) return candidate;
    } catch (_) {}
  }
  return null;
}
module.exports={parseSearch,cardURL,searchPath,nextSearch};
