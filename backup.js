(function(root,factory){if(typeof module==='object' && module.exports) module.exports=factory();else root.MyOnlineBackup=factory();})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var KEYS=['my_online_watch_v1','my_online_card_links_v1','my_online_preferences_v1'];
  var LIMIT=2097152;
  function object(v){return v && typeof v==='object' && !Array.isArray(v);}
  function bad(){throw new Error('Неверный формат резервной копии');}
  function id(v){return typeof v==='string' && /^\d{1,12}$/.test(v);}
  function number(v,max){return typeof v==='number' && isFinite(v) && v>=0 && v<=max;}
  function stamp(v){return number(v,100000000000000)?v:0;}
  function safeText(v,max){return typeof v==='string' && v.length<=max && !/[\u0000-\u001f]/.test(v) && !/https?:\/\//i.test(v);}
  function newest(values,limit){var out={};Object.keys(values).sort(function(a,b){return stamp(values[b].updated)-stamp(values[a].updated);}).slice(0,limit).forEach(function(k){out[k]=values[k];});return out;}
  function sanitize(data){
    if(!object(data)) bad();
    var watch={},links={},preferences={};
    if(object(data.watch)) Object.keys(data.watch).slice(0,1000).forEach(function(video){
      var r=data.watch[video];if(!id(video) || !object(r)) return;
      var season=r.season===null || r.season===undefined?null:r.season,episode=r.episode===null || r.episode===undefined?null:r.episode;
      if(!id(r.translation) || season!==null && (!number(season,1000) || season<1 || season%1) || episode!==null && (!number(episode,10000) || episode<1 || episode%1) || (season===null)!==(episode===null)) return;
      var episodes={};
      if(object(r.episodes)) Object.keys(r.episodes).slice(0,1000).forEach(function(key){
        if(key!=='movie' && !/^(?:[1-9]\d{0,2}|1000):(?:[1-9]\d{0,3}|10000)$/.test(key)) return;
        var e=r.episodes[key];if(!object(e) || !number(e.time,864000) || !number(e.duration,864000) || !e.duration || e.time>e.duration) return;
        episodes[key]={time:e.time,duration:e.duration,percent:Math.round(e.time/e.duration*100),watched:e.time/e.duration>=0.95,updated:stamp(e.updated)};
      });
      watch[video]={translation:r.translation,season:season,episode:episode,updated:stamp(r.updated),episodes:newest(episodes,100)};
    });
    if(object(data.links)) Object.keys(data.links).slice(0,1000).forEach(function(key){
      var r=data.links[key];
      if(key==='__proto__' || key==='constructor' || key==='prototype' || !safeText(key,500) || key.indexOf(':')<0 || !object(r) || !id(r.video) || !safeText(r.query,200) || !r.query.trim()) return;
      links[key]={video:r.video,query:r.query.trim(),updated:stamp(r.updated)};
    });
    if(object(data.preferences)) {
      if(safeText(data.preferences.voice,100)) preferences.voice=data.preferences.voice;
      if(['авто','360p','480p','720p','1080p','2160p'].indexOf(data.preferences.quality)>=0) preferences.quality=data.preferences.quality;
    }
    return {watch:newest(watch,100),links:newest(links,100),preferences:preferences};
  }
  function parse(input){
    if(typeof input==='string'){if(input.length>LIMIT) throw new Error('Копия больше 2 МБ');try{input=JSON.parse(input);}catch(_){bad();}}
    if(!object(input) || input.format!=='lampa-my-online-backup' || input.schemaVersion!==1 || !object(input.data)) bad();
    return {format:'lampa-my-online-backup',schemaVersion:1,createdAt:safeText(input.createdAt,40)?input.createdAt:'',data:sanitize(input.data)};
  }
  function create(storage){return parse({format:'lampa-my-online-backup',schemaVersion:1,createdAt:new Date().toISOString(),data:{watch:storage.get(KEYS[0],{}),links:storage.get(KEYS[1],{}),preferences:storage.get(KEYS[2],{})}});}
  function summary(backup){var b=parse(backup),episodes=0;Object.keys(b.data.watch).forEach(function(k){episodes+=Object.keys(b.data.watch[k].episodes).length;});return {videos:Object.keys(b.data.watch).length,episodes:episodes,links:Object.keys(b.data.links).length};}
  function merged(current,incoming){
    var out=sanitize(current),next=sanitize(incoming);
    Object.keys(next.watch).forEach(function(id){
      var a=out.watch[id],b=next.watch[id];if(!a){out.watch[id]=b;return;}
      var episodes={};Object.keys(a.episodes).forEach(function(k){episodes[k]=a.episodes[k];});
      Object.keys(b.episodes).forEach(function(k){if(!episodes[k] || b.episodes[k].updated>=episodes[k].updated) episodes[k]=b.episodes[k];});
      var last=b.updated>=a.updated?b:a;
      out.watch[id]={translation:last.translation,season:last.season,episode:last.episode,updated:last.updated,episodes:newest(episodes,100)};
    });
    Object.keys(next.links).forEach(function(k){if(!out.links[k] || next.links[k].updated>=out.links[k].updated) out.links[k]=next.links[k];});
    Object.keys(next.preferences).forEach(function(k){out.preferences[k]=next.preferences[k];});
    return sanitize(out);
  }
  function apply(storage,input,mode){
    var backup=parse(input);if(mode!=='merge' && mode!=='replace') throw new Error('Выберите способ восстановления');
    var old=KEYS.map(function(k){return storage.get(k,{});});
    var data=mode==='merge'?merged({watch:old[0],links:old[1],preferences:old[2]},backup.data):backup.data;
    try{storage.set(KEYS[0],data.watch);storage.set(KEYS[1],data.links);storage.set(KEYS[2],data.preferences);}
    catch(error){var failed=false;KEYS.forEach(function(k,i){try{storage.set(k,old[i]);}catch(_){failed=true;}});throw new Error(failed?'Не удалось завершить восстановление и откат. Проверьте память устройства.':'Не удалось сохранить копию. Исходные данные восстановлены.');}
    return summary({format:backup.format,schemaVersion:1,data:data});
  }
  return {parse:parse,create:create,summary:summary,apply:apply,limit:LIMIT};
});
