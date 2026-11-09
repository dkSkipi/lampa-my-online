(function () {
  'use strict';
  if (window.lampa_my_online_v0101) return;
  var API = "__API_ORIGIN__";
  var script = document.currentScript;
  if (!API || API === '__API_ORIGIN__') {
    var link = document.createElement('a');
    link.href = script && script.src || '';
    API = link.protocol && link.host ? link.protocol + '//' + link.host : '';
  }
  var L = window.Lampa, $ = window.jQuery;
  function notify(text) { if (L && L.Noty) L.Noty.show(text); }
  if (!L || !$ || !L.Listener || !L.Select || !L.Player) { notify('Мой онлайн: несовместимая версия Lampa'); return; }
  window.lampa_my_online_v0101 = true;
  var busy = false;
  var playbackSession=null;
  var recoveryWarning=null,selectOwner=null;
  if(L.Select.listener && L.Select.listener.follow) L.Select.listener.follow('preshow',function(event){selectOwner=event && event.active && event.active.my_online_recovery_owner || null;});
  function cancelRecoveryWarning() {
    var warning=recoveryWarning;if(!warning) return;
    recoveryWarning=null;
    if(typeof clearTimeout==='function' && warning.timer) clearTimeout(warning.timer);
    warning.play.my_online_error_shown=false;
    if(warning.visible && selectOwner===warning && L.Select.listener) {
      L.Select.hide();selectOwner=null;if(L.Controller) L.Controller.toggle('player');
    }
  }
  function playerElement() {try{return L.PlayerVideo && L.PlayerVideo.video?L.PlayerVideo.video():null;}catch(_){return null;}}
  var watchKey='my_online_watch_v1';
  function stored(key,fallback) {try {return L.Storage?L.Storage.get(key,fallback):fallback;}catch(_){return fallback;}}
  function prefs() {var p=stored('my_online_preferences_v1',{});return p && typeof p==='object'?p:{};}
  function setPrefs(p) {if(L.Storage && L.Storage.set) L.Storage.set('my_online_preferences_v1',p);}
  function progress(movie,selection) {
    var saved=watched(movie),key=selection?selection.season+':'+selection.episode:'movie';
    return saved.episodes && saved.episodes[key] || {};
  }
  function watched(movie) {
    if(!L.Storage || !movie.id) return {};
    var values=L.Storage.get(watchKey,{});
    return values && typeof values==='object' && values[movie.id] && typeof values[movie.id]==='object'?values[movie.id]:{};
  }
  function remember(play,position,makeLast) {
    var state=play && play.my_online_watch;
    if(!state || !state.video || !L.Storage || !L.Storage.set) return;
    try {
      var values=L.Storage.get(watchKey,{});
      if(!values || typeof values!=='object' || Array.isArray(values)) values={};
      var saved=values[state.video];if(!saved || typeof saved!=='object') saved={};
      if(makeLast!==false) {saved.translation=state.translation;saved.season=state.season || null;saved.episode=state.episode || null;}
      saved.updated=Date.now();
      if(position && isFinite(position.time) && isFinite(position.duration) && position.duration>0) {
        var episodeKey=state.season?state.season+':'+state.episode:'movie';
        if(!saved.episodes || typeof saved.episodes!=='object') saved.episodes={};
        var time=Math.max(0,Math.min(position.time,position.duration)),percent=Math.min(100,Math.round(time/position.duration*100));
        saved.episodes[episodeKey]={time:time,duration:position.duration,percent:percent,watched:time/position.duration>=0.95,updated:Date.now()};
        var episodeKeys=Object.keys(saved.episodes).sort(function(a,b){return (saved.episodes[b].updated || 0)-(saved.episodes[a].updated || 0);});
        episodeKeys.slice(100).forEach(function(key){delete saved.episodes[key];});
      }
      values[state.video]=saved;
      var keys=Object.keys(values).sort(function (a,b) {return (values[b] && values[b].updated || 0)-(values[a] && values[a].updated || 0);});
      keys.slice(100).forEach(function (key) {delete values[key];});
      L.Storage.set(watchKey,values);
    } catch (_) {notify('Не удалось сохранить выбор на устройстве');}
  }
  if(L.Player.listener && L.Player.listener.follow) L.Player.listener.follow('start',function (event) {
    cancelRecoveryWarning();
    var play=event && (event.data || event);
    if(play && play.my_online_preferred) {play.url=play.my_online_preferred;if(L.PlayerPanel && L.PlayerPanel.quality) L.PlayerPanel.quality(play.quality,play.url);}
    remember(play);
  });
  if(L.PlayerVideo && L.PlayerVideo.listener && L.PlayerVideo.listener.follow) {
    L.PlayerVideo.listener.follow('canplay',cancelRecoveryWarning);
    L.PlayerVideo.listener.follow('loadeddata',cancelRecoveryWarning);
    L.PlayerVideo.listener.follow('destroy',cancelRecoveryWarning);
    if(L.Player.listener && L.Player.listener.follow) L.Player.listener.follow('close',cancelRecoveryWarning);
    L.PlayerVideo.listener.follow('timeupdate',function () {
      if(recoveryWarning) {
        var media=playerElement();
        if(media && !media.error && !media.seeking && Number(media.currentTime)>recoveryWarning.time+0.05) cancelRecoveryWarning();
      }
      var play=L.Player.playdata && L.Player.playdata();
      if(!play || !play.my_online_watch || !play.timeline || Date.now()-(play.my_online_saved_at || 0)<5000) return;
      if(play.timeline.continued===false || play.timeline.waiting_for_user) return;
      play.my_online_saved_at=Date.now();remember(play,{time:play.timeline.time,duration:play.timeline.duration},false);
    });
    L.PlayerVideo.listener.follow('ended',function () {
      var play=L.Player.playdata && L.Player.playdata();
      if(play && play.my_online_watch && play.timeline && play.timeline.duration) remember(play,{time:play.timeline.duration,duration:play.timeline.duration},false);
    });
    L.PlayerVideo.listener.follow('error',function (event) {
      // HLS also emits recoverable errors while loading/seeking/switching URLs.
      if(!event || event.fatal!==true) return;
      var play=L.Player.playdata && L.Player.playdata();
      if(!play || !play.my_online_recover || play.my_online_error_shown) return;
      var media=playerElement();
      if(media && media.error && media.error.code===1) return; // intentionally aborted old source
      play.my_online_error_shown=true;
      var warning={play:play,url:play.url,media:media,time:media?Number(media.currentTime) || 0:0,visible:false};
      recoveryWarning=warning;
      function show() {
        if(recoveryWarning!==warning) return;
        var current=playerElement();
        if(L.Player.playdata()!==play || play.url!==warning.url || L.Player.opened && !L.Player.opened() || current!==warning.media) {cancelRecoveryWarning();return;}
        if(play.timeline && play.timeline.waiting_for_user || L.Select.opened && L.Select.opened()) {cancelRecoveryWarning();return;}
        if(current && (current.error && current.error.code===1 || !current.error && (current.seeking || Number(current.currentTime)>warning.time+0.05 || current.readyState>=3))) {cancelRecoveryWarning();return;}
        warning.visible=true;selectOwner=warning;
        L.Select.show({my_online_recovery_owner:warning,title:'Видео не удалось воспроизвести',items:[{title:'Обновить ссылку и повторить',retry:true},{title:'Закрыть плеер'}],onSelect:function(item){cancelRecoveryWarning();L.Select.hide();if(item.retry) play.my_online_recover();else if(L.Player.close) L.Player.close();},onBack:function(){cancelRecoveryWarning();L.Select.hide();if(L.Controller) L.Controller.toggle('player');}});
      }
      if(typeof setTimeout==='function') warning.timer=setTimeout(show,media && !media.error && media.readyState<2?8000:2000);
    });
  }
  function restore() { if (L.Controller) L.Controller.toggle('full_start'); }
  function menu(title, items, callback,backController) {
    function back() {if(backController && L.Controller) L.Controller.toggle(backController);else restore();}
    L.Select.show({title:title,items:items,onSelect:function (item) {
      L.Select.hide();
      back();
      try { callback(item); } catch (e) { notify('Мой онлайн: ошибка интерфейса — ' + e.message); }
    },onBack:function () { L.Select.hide(); back(); }});
  }
  function request(route, callback, privateRequest, onFail) {
    function failed() { if(onFail) onFail(); }
    if (busy) { notify('Запрос уже выполняется. Подождите.'); failed(); return; }
    busy = true;
    var attempt=0;
    notify('Загрузка… Первый запрос может занять до 90 секунд.');
    var code=L.Storage ? L.Storage.get('my_online_access_code','') : '';
    function send() {$.ajax({url:API+route,dataType:'json',timeout:90000,cache:false,headers:privateRequest?{Authorization:'Bearer '+code}:{},
      success:function (data) {
        busy = false;
        if (!data || data.ok !== true || data.apiVersion!==1 && data.version !== '0.10.1') { notify('API_MISMATCH: обновите сервер и перезапустите Lampa'); failed(); return; }
        try { callback(data); } catch (e) { notify('CLIENT_ERROR: '+e.message); failed(); }
      },error:function (xhr,status) {
        var errorCode=xhr.responseJSON && xhr.responseJSON.error && xhr.responseJSON.error.code;
        if(attempt<1 && typeof setTimeout==='function' && (errorCode==='NETWORK' || errorCode==='WAIT_AND_RETRY' || !errorCode && (status==='timeout' || xhr.status===0))) {
          attempt++;notify('Связь прервалась. Повторяю запрос…');setTimeout(send,2500);return;
        }
        busy = false;
        failed();
        if(xhr.responseJSON && xhr.responseJSON.error) { notify(xhr.responseJSON.error.code+': '+xhr.responseJSON.error.message); return; }
        var code = status === 'timeout' ? 'TIMEOUT' : status === 'parsererror' ? 'INVALID_JSON' : xhr.status ? 'HTTP_'+xhr.status : 'NETWORK';
        notify(code+': '+(xhr.status === 0 || status === 'timeout' ? 'Проверьте интернет и /health. Затем повторите запрос.' : 'Сервер не вернул ожидаемый ответ. Проверьте Render.')+' Адрес: '+API);
      }});}
    send();
  }
  function qualities(items) {
    var result={};
    (items || []).forEach(function (v) {
      if(!/^https:\/\//i.test(v.url || '')) return;
      var key=String(v.quality || 'Авто')+' / '+String(v.format || 'Видео');
      if(!Object.prototype.hasOwnProperty.call(result,key)) result[key]=v.url;
    });
    return result;
  }
  function preferredKey(quality,current) {
    if(current && Object.prototype.hasOwnProperty.call(quality,current)) return current;
    var keys=Object.keys(quality),wanted=parseInt(prefs().quality,10);
    if(!wanted) return keys[0];
    keys.sort(function(a,b){return parseInt(b,10)-parseInt(a,10);});
    return keys.filter(function(key){return parseInt(key,10)<=wanted;})[0] || keys[keys.length-1];
  }
  function videoQuery(movie) {return movie && movie.id?'&video='+encodeURIComponent(movie.id):'';}
  function streamRoute(id,selection,movie) {
    return '/api/rezka/stream?translator='+encodeURIComponent(id)+(selection?'&season='+selection.season+'&episode='+selection.episode:'')+videoQuery(movie);
  }
  function makePlay(movie, translation, items, preferred, selection, target, onVoice) {
    var quality=qualities(items),keys=Object.keys(quality);
    if(!keys.length) { notify('NO_PLAYABLE_STREAMS'); return; }
    var active=translation;
    var displayTitle=movie.title+(selection?' • S'+selection.season+' E'+selection.episode:'');
    var play=target || {};
    play.url=preferred || quality[preferredKey(quality)];play.quality=quality;play.title=displayTitle+' / '+translation.title;play.launch_player='inner';
    if(parseInt(prefs().quality,10)) play.my_online_preferred=play.url;
    play.season=selection?selection.season:undefined;play.episode=selection?selection.episode:undefined;
    play.my_online_watch={video:movie.id,translation:translation.id,season:play.season,episode:play.episode};
    var savedProgress=progress(movie,selection),resumeTime=savedProgress.watched?0:Number(savedProgress.time) || 0;
    play.timeline={time:resumeTime,duration:Number(savedProgress.duration) || 0,percent:resumeTime?Math.min(89,Number(savedProgress.percent) || 0):0,handler:function(percent,time,duration){remember(play,{time:time,duration:duration},false);}};
    var panel=L.PlayerPanel;
    var canSwitch=panel && panel.quality && panel.setTracks && panel.listener && panel.listener.send && L.Player.playdata;
    function current() { return L.Player.playdata()===play && (!L.Player.opened || L.Player.opened()); }
    play.my_online_recover=function () {
      if(!current()) return;
      remember(play,{time:play.timeline.time,duration:play.timeline.duration},false);
      var requestedUrl=play.url;
      var oldKey=Object.keys(play.quality || {}).filter(function(key){return play.quality[key]===play.url;})[0];
      request(streamRoute(active.id,selection,movie)+'&refresh=1',function(data){
        if(!current() || play.url!==requestedUrl) return;
        var next=qualities(data.items),selected=preferredKey(next,oldKey);
        if(!selected || !panel || !panel.quality || !panel.listener) {notify('Не удалось обновить видео');return;}
        play.quality=next;play.my_online_error_shown=false;if(play.my_online_preferred) play.my_online_preferred=next[selected];
        panel.quality(next,next[selected]);panel.listener.send('quality',{name:selected,url:next[selected]});
      },true);
    };
    function tracks() {
      return (movie.translations || []).map(function (t) {
        return {name:t.name,selected:t.id===active.id,enabled:t.id===active.id,onSelect:function () {
          if(t.id===active.id) return;
          var oldQuality=play.quality || {};
          var oldKey=Object.keys(oldQuality).filter(function (key) { return oldQuality[key]===play.url; })[0];
          function restoreTracks() { if(current()) { play.voiceovers=tracks(); panel.setTracks(play.voiceovers); } }
          request(streamRoute(t.id,selection,movie),function (result) {
            if(!current()) return;
            var next=qualities(result.items),labels=Object.keys(next);
            if(!labels.length) { restoreTracks(); notify('NO_PLAYABLE_STREAMS: оставлена прежняя озвучка'); return; }
            var selected=Object.prototype.hasOwnProperty.call(next,oldKey)?oldKey:labels[0];
            active={id:t.id,title:t.name};
            play.quality=next;
            if(play.my_online_preferred) play.my_online_preferred=next[selected];
            play.title=displayTitle+' / '+t.name;
            play.voiceovers=tracks();
            panel.quality(next,next[selected]);
            panel.setTracks(play.voiceovers);
            // Lampa handles this event as a URL change with saved playback position.
            panel.listener.send('quality',{name:selected,url:next[selected]});
            play.my_online_watch.translation=t.id;
            remember(play);
            if(onVoice) onVoice({id:t.id,title:t.name});
            notify('Озвучка: '+t.name);
          },true,restoreTracks);
        }};
      });
    }
    if(canSwitch) play.voiceovers=tracks();
    return play;
  }
  function launchMovie(movie, translation, items, preferred, selection, episodeItems) {
    if(playbackSession) playbackSession.closed=true;
    var session={closed:false,active:null,translation:translation,episodes:episodeItems || []};
    playbackSession=session;
    function active() {return !session.closed && playbackSession===session && session.active && (!L.Player.opened || L.Player.opened()) && (!L.Player.playdata || L.Player.playdata()===session.active);}
    function changedVoice(next) {
      session.translation=next;
      if(!selection) return;
      request('/api/rezka/episodes?translator='+encodeURIComponent(next.id)+videoQuery(movie),function (result) {
        if(!active() || session.translation.id!==next.id) return;
        session.episodes=result.items || [];installPlaylist();
      },true);
    }
    function configure(target,voice,streams,episode) {
      var result=makePlay(movie,voice,streams,null,episode,target,changedVoice);
      if(!result) return null;
      result.callback=function () {
        session.active=result;
        var id=result.my_online_watch.translation;
        var translation=(movie.translations || []).filter(function (t) {return t.id===id;})[0];
        session.translation={id:id,title:translation?translation.name:voice.title};
        remember(result);installPlaylist();
      };
      return result;
    }
    var play=configure({},translation,items,selection);
    if(!play) return;
    function installPlaylist() {
      if(!L.Player.playlist) return;
      if(!selection || !session.episodes.length || !L.Player.close) {L.Player.playlist([session.active]);return;}
      var seen={},list=[];
      session.episodes.slice().sort(function (a,b) {return a.season-b.season || a.episode-b.episode;}).forEach(function (episode) {
        var key=episode.season+':'+episode.episode;if(seen[key]) return;seen[key]=true;
        if(episode.season===session.active.season && episode.episode===session.active.episode) {list.push(session.active);return;}
        var entry={title:movie.title+' • S'+episode.season+' E'+episode.episode,season:episode.season,episode:episode.episode,launch_player:'inner'};
        entry.url=function (done) {
          if(!active()) return;
          var previous=session.active,voice=session.translation;
          function stillActive() {return active() && session.active===previous;}
          function failed() {
            if(!stillActive()) return;
            // Lampa has no error callback for a lazy playlist URL. Closing resets
            // its loading lock; never call done with a missing or wrong episode.
            session.closed=true;
            if(L.Player.close) L.Player.close();
            menu('Серия не загрузилась',[{title:'Повторить',retry:true},{title:'Вернуться к карточке'}],function(item){
              if(!item.retry || playbackSession!==session) return;
              request(streamRoute(voice.id,episode,movie)+'&refresh=1',function(data){if(playbackSession===session) launchMovie(movie,voice,data.items,null,episode,session.episodes);},true);
            });
          }
          request(streamRoute(voice.id,episode,movie),function (data) {
            if(!stillActive()) return;
            if(!configure(entry,voice,data.items,episode)) {failed();return;}
            session.active=entry;
            done();
          },true,failed);
        };
        list.push(entry);
      });
      if(list.indexOf(session.active)<0) list.unshift(session.active);
      L.Player.playlist(list);
    }
    session.active=play;
    L.Player.play(play);
    remember(play);installPlaylist();
    if(!play.voiceovers) notify('Качество доступно в плеере. Для озвучки в этой версии Lampa используйте начальное меню.');
  }
  function editCode(backController) {
    if(!L.Input || !L.Input.edit || !L.Storage) { notify('В этой версии Lampa нет ввода кода доступа'); return; }
    L.Input.edit({title:'Код доступа MY_ONLINE_TOKEN (не пароль Rezka)',value:'',nosave:true,free:true},function (value) {
      value=String(value || '').trim();
      if(value) { L.Storage.set('my_online_access_code',value); notify('Код доступа сохранён на этом устройстве'); }
      if(backController && L.Controller) L.Controller.toggle(backController);else restore();
    });
  }
  var backupBusy=false;
  function backupLibrary() {if(!window.MyOnlineBackup) throw new Error('Обновите все файлы сервера и перезапустите Lampa');return window.MyOnlineBackup;}
  function exportBackup() {
    var play=L.Player.playdata && L.Player.playdata();
    if(play && play.my_online_watch && play.timeline) remember(play,{time:play.timeline.time,duration:play.timeline.duration},false);
    return backupLibrary().create(L.Storage);
  }
  function confirmBackup(input,controller) {
    try {
      if(L.Player.opened && L.Player.opened()) {notify('Закройте видео перед восстановлением');return;}
      var backup=backupLibrary().parse(input),count=backupLibrary().summary(backup);
      menu('Копия: видео '+count.videos+', записей прогресса '+count.episodes,[
        {title:'Объединить с текущей историей',mode:'merge',subtitle:'Более новые позиции сохранятся; предпочтения возьмутся из копии'},
        {title:'Заменить историю и предпочтения',mode:'replace'},
        {title:'Отмена'}
      ],function(item){
        if(!item.mode) return;
        menu(item.mode==='replace'?'Заменить текущие данные этой копией?':'Восстановить данные из копии?',[
          {title:'Восстановить',yes:true},{title:'Отмена'}
        ],function(answer){
          if(!answer.yes) return;
          if(L.Player.opened && L.Player.opened()) {notify('Закройте видео перед восстановлением');return;}
          try {backupLibrary().apply(L.Storage,backup,item.mode);notify('Копия восстановлена. Откройте карточку заново.');}catch(error){notify(error.message);}
        },controller);
      },controller);
    } catch(error){notify(error.message);}
  }
  function backupTransfer(method,backup,done) {
    if(backupBusy) {notify('Перенос копии уже выполняется');return;}
    backupBusy=true;
    var code=stored('my_online_access_code','');
    $.ajax({url:API+'/api/backup',type:method,dataType:'json',contentType:'application/json',timeout:30000,cache:false,headers:{Authorization:'Bearer '+code},data:backup?JSON.stringify(backup):undefined,
      success:function(data){backupBusy=false;if(data && data.ok) {try{done(data);}catch(error){notify(error.message);}}else notify('Сервер не вернул резервную копию');},
      error:function(xhr){backupBusy=false;notify(xhr.responseJSON && xhr.responseJSON.error?xhr.responseJSON.error.message:'Перенос не выполнен. Проверьте связь и повторите.');}});
  }
  function saveBackupFile() {
    try {
      if(!window.Blob || !window.URL || !window.URL.createObjectURL) {notify('Сохранение файла недоступно. Используйте перенос через браузер.');return;}
      var url=window.URL.createObjectURL(new window.Blob([JSON.stringify(exportBackup(),null,2)],{type:'application/json;charset=utf-8'}));
      var link=document.createElement('a');link.href=url;link.download='my-online-backup-'+new Date().toISOString().slice(0,10)+'.json';link.style.display='none';document.body.appendChild(link);link.click();document.body.removeChild(link);
      if(typeof setTimeout==='function') setTimeout(function(){window.URL.revokeObjectURL(url);},60000);
      notify('Запрошено сохранение файла. Проверьте загрузки устройства.');
    } catch(error){notify(error.message || 'Не удалось сохранить файл. Используйте перенос через браузер.');}
  }
  function openBackupFile(controller) {
    try {
      if(!window.FileReader) {notify('Выбор файла недоступен. Используйте перенос через браузер.');return;}
      var input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.style.display='none';document.body.appendChild(input);
      function remove(){if(input.parentNode) input.parentNode.removeChild(input);}
      input.addEventListener('cancel',remove);
      input.addEventListener('change',function(){
        var file=input.files && input.files[0];remove();if(!file) return;
        if(file.size>backupLibrary().limit) {notify('Файл больше 2 МБ');return;}
        var reader=new window.FileReader();reader.onload=function(){confirmBackup(reader.result,controller);};reader.onerror=function(){notify('Не удалось прочитать файл');};reader.readAsText(file);
      });input.click();
    } catch(error){notify(error.message || 'Не удалось открыть файл. Используйте перенос через браузер.');}
  }
  function backupMenu(controller) {
    menu('Резервная копия',[
      {title:'Подготовить для браузера (для ТВ)',action:'send',subtitle:'Временно передать копию вашему Render-серверу на пять минут'},
      {title:'Получить из браузера',action:'receive'},
      {title:'Сохранить файл на этом устройстве',action:'file'},
      {title:'Восстановить из файла на этом устройстве',action:'open'}
    ],function(item){
      if(item.action==='file') saveBackupFile();
      else if(item.action==='open') openBackupFile(controller);
      else if(item.action==='receive') backupTransfer('GET',null,function(data){confirmBackup(data.backup,controller);});
      else if(item.action==='send') {
        menu('Передать историю вашему серверу на пять минут?', [{title:'Подготовить копию',yes:true},{title:'Отмена'}],function(answer){
          if(!answer.yes) return;
          try {backupTransfer('POST',exportBackup(),function(){notify('Копия готова на пять минут. На компьютере или телефоне откройте '+API+'/backup');});}catch(error){notify(error.message);}
        },controller);
      }
    },controller);
  }
  function settings() {
    var controller=L.Controller && L.Controller.enabled?L.Controller.enabled().name:'full_start',p=prefs();
    menu('Мой онлайн • настройки',[
      {title:'Предпочитаемая озвучка: '+label(p.voice || 'не выбрана'),action:'voice'},
      {title:'Качество по умолчанию: '+label(p.quality || 'авто'),action:'quality'},
      {title:'Резервная копия',action:'backup'},
      {title:'Код доступа',action:'code'}
    ],function(item){
      if(item.action==='code') {editCode(controller);return;}
      if(item.action==='backup') {backupMenu(controller);return;}
      if(item.action==='voice') {
        if(!L.Input || !L.Input.edit) {notify('Ввод недоступен в этой версии Lampa');return;}
        L.Input.edit({title:'Студия озвучки или часть названия; пусто — без предпочтения',value:p.voice || '',nosave:true,free:true},function(value){p.voice=String(value || '').trim().slice(0,100);setPrefs(p);if(L.Controller) L.Controller.toggle(controller);});
      } else menu('Качество',['авто','360p','480p','720p','1080p','2160p'].map(function(q){return {title:q,value:q,selected:q===(p.quality || 'авто')};}),function(q){p.quality=q.value;setPrefs(p);},controller);
    },controller);
  }
  if(L.SettingsApi && L.SettingsApi.addComponent && L.SettingsApi.addParam) {
    L.SettingsApi.addComponent({component:'my_online',name:'Мой онлайн',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>'});
    L.SettingsApi.addParam({component:'my_online',param:{name:'my_online_options',type:'button'},field:{name:'Параметры просмотра',description:'Озвучка, качество, резервная копия и код доступа'},onChange:settings});
  }
  function rezkaMovie(videoId,continueNow) {
    request('/api/rezka/movie'+(videoId?'?video='+encodeURIComponent(videoId):''),function (data) {
      var movie=data.movie;
      var saved=watched(movie);
      var favourite=String(prefs().voice || '').toLowerCase();
      var chosen=saved.translation || ((movie.translations || []).filter(function(t){return favourite && t.name.toLowerCase().indexOf(favourite)>=0;})[0] || {}).id;
      var options=(movie.translations || []).map(function (t) { return {title:t.name,id:t.id,selected:t.id===chosen}; });
      if(!options.length) { notify('Озвучки не найдены'); return; }
      var previous=options.filter(function (t) {return t.id===saved.translation;})[0];
      if(movie.type==='series' && previous && saved.season && saved.episode) {
        options.forEach(function (t) {t.selected=false;});
        options.unshift({title:'Продолжить: S'+saved.season+' E'+saved.episode+' / '+previous.title,id:previous.id,resume:true,selected:true});
      }
      function choose(choice) {
        var translation=choice.resume?previous:choice;
        function load(selection,episodes) {
          request(streamRoute(translation.id,selection,movie),function (result) { launchMovie(movie,translation,result.items,null,selection,episodes); },true);
        }
        if(movie.type!=='series') { load(); return; }
        request('/api/rezka/episodes?translator='+encodeURIComponent(translation.id)+videoQuery(movie),function (result) {
          if(choice.resume) {
            var continued=(result.items || []).filter(function (e) {return e.season===saved.season && e.episode===saved.episode;})[0];
            if(continued && progress(movie,continued).watched) {
              var ordered=result.items.slice().sort(function(a,b){return a.season-b.season || a.episode-b.episode;});
              continued=ordered[ordered.indexOf(continued)+1];
            }
            if(continued) {load({season:continued.season,episode:continued.episode},result.items);return;}
            notify('Сохранённая серия недоступна. Выберите другую.');
          }
          var seasons=[];
          (result.items || []).forEach(function (e) { if(!seasons.some(function (s) { return s.season===e.season; })) seasons.push({title:'Сезон '+e.season,season:e.season,selected:e.season===saved.season}); });
          if(!seasons.length) { notify('EPISODES_NOT_RECOGNIZED'); return; }
          menu(movie.title+' • сезон',seasons,function (season) {
            var episodes=result.items.filter(function (e) { return e.season===season.season; }).map(function (e) {var p=progress(movie,e);return {title:(p.watched?'✓ ':p.time>0?'▶ ':'')+(e.title || 'Серия '+e.episode)+(p.time>0 && !p.watched?' • '+p.percent+'%':''),season:e.season,episode:e.episode,selected:e.season===saved.season && e.episode===saved.episode};});
            menu(movie.title+' • сезон '+season.season,episodes,function (episode) {load({season:episode.season,episode:episode.episode},result.items);});
          });
        },true);
      }
      var quick=options.filter(function(option){return option.resume;})[0] || previous;
      var preferredVoice=options.filter(function(option){return !option.resume && option.id===chosen;})[0];
      if(continueNow && quick) choose(quick);
      else if(!saved.translation && favourite && preferredVoice) choose(preferredVoice);
      else menu(movie.title+' • озвучка',options,choose);
    },true);
  }
  function cardKey(card) {return String(card.source || 'tmdb')+':'+String(card.media_type || (card.first_air_date?'tv':'movie'))+':'+String(card.id || (card.title || card.name || '')+':'+(card.release_date || card.first_air_date || ''));}
  function cardLink(card) {var links=stored('my_online_card_links_v1',{});return links && typeof links==='object'?links[cardKey(card)]:null;}
  function linkCard(card,item,query) {
    if(!L.Storage || !L.Storage.set) return;
    var links=stored('my_online_card_links_v1',{});if(!links || typeof links!=='object' || Array.isArray(links)) links={};
    links[cardKey(card)]={video:item.video,query:query,updated:Date.now()};
    Object.keys(links).sort(function(a,b){return (links[b].updated || 0)-(links[a].updated || 0);}).slice(100).forEach(function(key){delete links[key];});
    L.Storage.set('my_online_card_links_v1',links);
  }
  function resumeCard(card) {
    var link=cardLink(card);if(!link) {searchMovie(card);return;}
    request('/api/rezka/search?q='+encodeURIComponent(link.query),function(data){
      if((data.items || []).some(function(item){return item.id===link.video;})) rezkaMovie(link.video,true);
      else {notify('Сохранённый результат не найден. Выберите совпадение заново.');searchMovie(card,link.query);}
    },true);
  }
  function label(value) {return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function editSearch(card,value) {
    if(!L.Input || !L.Input.edit) {notify('В этой версии Lampa нет ввода названия');return;}
    L.Input.edit({title:'Поиск на Rezka',value:value || '',nosave:true,free:true},function (query) {
      restore();query=String(query || '').trim();if(query) searchMovie(card,query);
    });
  }
  function searchMovie(card,query) {
    query=String(query || card.title || card.name || card.original_title || card.original_name || '').trim();
    if(!query) {editSearch(card,'');return;}
    request('/api/rezka/search?q='+encodeURIComponent(query.slice(0,200)),function (data) {
      var year=String(card.release_date || card.first_air_date || card.year || '').slice(0,4);
      var type=card.media_type || (card.first_air_date?'series':'movie');if(type==='tv') type='series';
      var items=(data.items || []).slice();
      function rank(item) {return (year && item.year===year?2:0)+(item.type===type?1:0);}
      items.sort(function (a,b) {return rank(b)-rank(a);});
      var options=items.map(function (item) {
        var kind=item.type==='series'?'сериал':item.type==='animation'?'анимация':'фильм';
        return {title:label(item.title)+(item.year?' ('+label(item.year)+')':'')+' • '+kind,subtitle:label(item.description),video:item.id};
      });
      options.push({title:'Ввести другое название',edit:true});
      var original=card.original_title || card.original_name;
      if(original && original!==query) options.push({title:'Искать: '+label(original),query:original});
      menu(items.length?'Rezka • результаты поиска':'Совпадений нет • '+label(query),options,function (item) {
        if(item.video) {linkCard(card,item,query);rezkaMovie(item.video);}
        else if(item.edit) editSearch(card,query);
        else if(item.query) searchMovie(card,item.query);
      });
    },true);
  }
  function open(movie) {
    var title = movie.title || movie.name || movie.original_title || 'Фильм';
    menu('Мой онлайн • '+title,[
      {title:'Найти на Rezka: '+label(title),action:'search'},
      {title:'Поиск по другому названию',action:'query'},
      {title:'Настройки',action:'settings'}
    ],function (item) {
      if(item.action === 'settings') settings();
      else if(item.action==='search') searchMovie(movie,title);
      else if(item.action==='query') editSearch(movie,title);
    });
  }
  function add(e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    try {
      var root = e.object.activity.render();
      if (root.find('.view--my-online-v0101').length) return;
      var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
      if (!box.length) box = root.find('.view--torrent').parent().eq(0);
      if (!box.length) return;
      var btn = $('<div class="full-start__button selector view--my-online-v0101"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
      btn.on('hover:enter',function () { try { open(e.data && e.data.movie || {}); } catch (err) { notify('MENU_ERROR: '+err.message); } });
      if(box.prepend) box.prepend(btn);else box.append(btn);
      var card=e.data && e.data.movie || {},link=cardLink(card);
      if(link && watched({id:link.video}).translation) {
        var resume=$('<div class="full-start__button selector view--my-online-resume"><span>Продолжить онлайн</span></div>');
        resume.on('hover:enter',function(){resumeCard(card);});if(btn.after) btn.after(resume);else box.append(resume);
      }
    } catch (err) { notify('BUTTON_ERROR: '+err.message); }
  }
  L.Listener.follow('full',add);
  notify('Мой онлайн v0.10.1 установлен');
})();
