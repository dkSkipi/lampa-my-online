(function () {
  'use strict';
  if (window.lampa_my_online_v07) return;
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
  window.lampa_my_online_v07 = true;
  var busy = false;
  function restore() { if (L.Controller) L.Controller.toggle('full_start'); }
  function menu(title, items, callback) {
    L.Select.show({title:title,items:items,onSelect:function (item) {
      L.Select.hide();
      restore();
      try { callback(item); } catch (e) { notify('Мой онлайн: ошибка интерфейса — ' + e.message); }
    },onBack:function () { L.Select.hide(); restore(); }});
  }
  function request(route, callback, privateRequest, onFail) {
    function failed() { if(onFail) onFail(); }
    if (busy) { notify('Запрос уже выполняется. Подождите.'); failed(); return; }
    busy = true;
    notify('Соединение с Render… При первом запросе подождите до 90 секунд.');
    var code=L.Storage ? L.Storage.get('my_online_access_code','') : '';
    $.ajax({url:API+route,dataType:'json',timeout:90000,cache:false,headers:privateRequest?{Authorization:'Bearer '+code}:{},
      success:function (data) {
        busy = false;
        if (!data || data.ok !== true || data.version !== '0.7.0') { notify('API_MISMATCH: обновите все файлы на Render до v0.7.0'); failed(); return; }
        try { callback(data); } catch (e) { notify('CLIENT_ERROR: '+e.message); failed(); }
      },error:function (xhr,status) {
        busy = false;
        failed();
        if(xhr.responseJSON && xhr.responseJSON.error) { notify(xhr.responseJSON.error.code+': '+xhr.responseJSON.error.message); return; }
        var code = status === 'timeout' ? 'TIMEOUT' : status === 'parsererror' ? 'INVALID_JSON' : xhr.status ? 'HTTP_'+xhr.status : 'NETWORK';
        notify(code+': '+(xhr.status === 0 || status === 'timeout' ? 'Проверьте интернет и /health. Затем повторите запрос.' : 'Сервер не вернул ожидаемый ответ. Проверьте Render.')+' Адрес: '+API);
      }});
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
  function videoQuery(movie) {return movie && movie.id?'&video='+encodeURIComponent(movie.id):'';}
  function streamRoute(id,selection,movie) {
    return '/api/rezka/stream?translator='+encodeURIComponent(id)+(selection?'&season='+selection.season+'&episode='+selection.episode:'')+videoQuery(movie);
  }
  function launchMovie(movie, translation, items, preferred, selection) {
    var quality=qualities(items),keys=Object.keys(quality);
    if(!keys.length) { notify('NO_PLAYABLE_STREAMS'); return; }
    var active=translation;
    var displayTitle=movie.title+(selection?' • S'+selection.season+' E'+selection.episode:'');
    var play={url:preferred || quality[keys[0]],quality:quality,title:displayTitle+' / '+translation.title,launch_player:'inner'};
    var panel=L.PlayerPanel;
    var canSwitch=panel && panel.quality && panel.setTracks && panel.listener && panel.listener.send && L.Player.playdata;
    function current() { return L.Player.playdata()===play && (!L.Player.opened || L.Player.opened()); }
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
            play.title=displayTitle+' / '+t.name;
            play.voiceovers=tracks();
            panel.quality(next,next[selected]);
            panel.setTracks(play.voiceovers);
            // Lampa handles this event as a URL change with saved playback position.
            panel.listener.send('quality',{name:selected,url:next[selected]});
            notify('Озвучка: '+t.name);
          },true,restoreTracks);
        }};
      });
    }
    if(canSwitch) play.voiceovers=tracks();
    L.Player.play(play);
    if(L.Player.playlist) L.Player.playlist([play]);
    if(!canSwitch) notify('Качество доступно в плеере. Для озвучки в этой версии Lampa используйте начальное меню.');
  }
  function editCode() {
    if(!L.Input || !L.Input.edit || !L.Storage) { notify('В этой версии Lampa нет ввода кода доступа'); return; }
    L.Input.edit({title:'Код доступа MY_ONLINE_TOKEN (не пароль Rezka)',value:'',nosave:true,free:true},function (value) {
      value=String(value || '').trim();
      if(value) { L.Storage.set('my_online_access_code',value); notify('Код доступа сохранён на этом устройстве'); }
      restore();
    });
  }
  function rezkaMovie(videoId) {
    request('/api/rezka/movie'+(videoId?'?video='+encodeURIComponent(videoId):''),function (data) {
      var movie=data.movie;
      var options=(movie.translations || []).map(function (t) { return {title:t.name,id:t.id}; });
      if(!options.length) { notify('Озвучки не найдены'); return; }
      menu(movie.title+' • выберите озвучку',options,function (translation) {
        function load(selection) {
          request(streamRoute(translation.id,selection,movie),function (result) { launchMovie(movie,translation,result.items,null,selection); },true);
        }
        if(movie.type!=='series') { load(); return; }
        request('/api/rezka/episodes?translator='+encodeURIComponent(translation.id)+videoQuery(movie),function (result) {
          var seasons=[];
          (result.items || []).forEach(function (e) { if(!seasons.some(function (s) { return s.season===e.season; })) seasons.push({title:'Сезон '+e.season,season:e.season}); });
          if(!seasons.length) { notify('EPISODES_NOT_RECOGNIZED'); return; }
          menu(movie.title+' • сезон',seasons,function (season) {
            var episodes=result.items.filter(function (e) { return e.season===season.season; }).map(function (e) {return {title:e.title || 'Серия '+e.episode,season:e.season,episode:e.episode};});
            menu(movie.title+' • сезон '+season.season,episodes,function (episode) {load({season:episode.season,episode:episode.episode});});
          });
        },true);
      });
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
        if(item.video) rezkaMovie(item.video);
        else if(item.edit) editSearch(card,query);
        else if(item.query) searchMovie(card,item.query);
      });
    },true);
  }
  function playDemo(data) {
    var items = [];
    (data.items || []).forEach(function (item) {
      (item.versions || []).forEach(function (v) { if (/^https:\/\//i.test(v.url || '')) items.push({title:item.title+' / '+v.name,url:v.url}); });
    });
    if (!items.length) { notify('EMPTY_DEMO: тестовый ролик отсутствует'); return; }
    menu('Тест плеера • это не выбранный фильм',items,function (item) {
      if (!L.Player.play) { notify('PLAYER_UNAVAILABLE'); return; }
      L.Player.play({url:item.url,title:item.title});
      if (L.Player.playlist) L.Player.playlist([{url:item.url,title:item.title}]);
    });
  }
  function open(movie) {
    var title = movie.title || movie.name || movie.original_title || 'Фильм';
    menu('Мой онлайн v0.7 • '+title,[
      {title:'Найти на Rezka: '+label(title),action:'search'},
      {title:'Поиск по другому названию',action:'query'},
      {title:'Rezka: запустить проверочный фильм',action:'movie'},
      {title:'Ввести код доступа к серверу',action:'code'},
      {title:'Запустить тестовый ролик',action:'demo'},
      {title:'Диагностика соединения',action:'health'},
      {title:'Проверить вход на Rezka',action:'rezka'},
      {title:'О подключении Rezka',action:'about'}
    ],function (item) {
      if (item.action === 'demo') request('/api/demo',playDemo);
      else if(item.action === 'movie') rezkaMovie();
      else if(item.action === 'code') editCode();
      else if (item.action === 'rezka') request('/api/rezka/status',function (d) { notify('Rezka • '+d.rezka.code+' • '+d.rezka.message); });
      else if (item.action === 'health') request('/health',function (d) { notify('OK • сервер '+d.version+' • Rezka: '+(d.rezkaConnected?'ссылка получена':'экспериментальный режим')+' • '+API); });
      else if(item.action==='search') searchMovie(movie,title);
      else if(item.action==='query') editSearch(movie,title);
      else notify('Поиск использует название карточки. Выберите совпадение, озвучку и серию. Проверочный адрес Render оставлен для диагностики.');
    });
  }
  function add(e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    try {
      var root = e.object.activity.render();
      if (root.find('.view--my-online-v07').length) return;
      var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
      if (!box.length) box = root.find('.view--torrent').parent().eq(0);
      if (!box.length) return;
      var btn = $('<div class="full-start__button selector view--my-online-v07"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
      btn.on('hover:enter',function () { try { open(e.data && e.data.movie || {}); } catch (err) { notify('MENU_ERROR: '+err.message); } });
      box.append(btn);
    } catch (err) { notify('BUTTON_ERROR: '+err.message); }
  }
  L.Listener.follow('full',add);
  notify('Мой онлайн v0.7.0 установлен');
})();
