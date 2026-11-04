(function () {
  'use strict';
  if (window.lampa_my_online_v05) return;
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
  window.lampa_my_online_v05 = true;
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
        if (!data || data.ok !== true || data.version !== '0.5.0') { notify('API_MISMATCH: обновите все файлы на Render до v0.5.0'); failed(); return; }
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
  function launchMovie(movie, translation, items, preferred) {
    var quality=qualities(items),keys=Object.keys(quality);
    if(!keys.length) { notify('NO_PLAYABLE_STREAMS'); return; }
    var active=translation;
    var play={url:preferred || quality[keys[0]],quality:quality,title:movie.title+' / '+translation.title};
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
          request('/api/rezka/stream?translator='+encodeURIComponent(t.id),function (result) {
            if(!current()) return;
            var next=qualities(result.items),labels=Object.keys(next);
            if(!labels.length) { restoreTracks(); notify('NO_PLAYABLE_STREAMS: оставлена прежняя озвучка'); return; }
            var selected=Object.prototype.hasOwnProperty.call(next,oldKey)?oldKey:labels[0];
            active={id:t.id,title:t.name};
            play.quality=next;
            play.title=movie.title+' / '+t.name;
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
  function rezkaMovie() {
    request('/api/rezka/movie',function (data) {
      var movie=data.movie;
      var options=(movie.translations || []).map(function (t) { return {title:t.name,id:t.id}; });
      if(!options.length) { notify('Озвучки не найдены'); return; }
      menu(movie.title+' • выберите озвучку',options,function (translation) {
        request('/api/rezka/stream?translator='+encodeURIComponent(translation.id),function (result) {
          menu(movie.title+' • качество',result.items,function (version) {
            launchMovie(movie,translation,result.items,version.url);
          });
        },true);
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
    menu('Мой онлайн v0.5 • '+title,[
      {title:'Rezka: Гладиатор (1986) — проверка фильма',action:'movie'},
      {title:'Ввести код доступа к серверу',action:'code'},
      {title:'Проверить источники фильма',action:'search'},
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
      else if (item.action === 'search') request('/api/search?q='+encodeURIComponent(title.slice(0,200)),function () { notify('Источники для «'+title+'» не подключены. Выберите «Запустить тестовый ролик». Rezka не подключена.'); });
      else notify('Экспериментальная проверка фильма «Гладиатор» (1986). Поиск других фильмов и сериалы пока не подключены.');
    });
  }
  function add(e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    try {
      var root = e.object.activity.render();
      if (root.find('.view--my-online-v05').length) return;
      var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
      if (!box.length) box = root.find('.view--torrent').parent().eq(0);
      if (!box.length) return;
      var btn = $('<div class="full-start__button selector view--my-online-v05"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
      btn.on('hover:enter',function () { try { open(e.data && e.data.movie || {}); } catch (err) { notify('MENU_ERROR: '+err.message); } });
      box.append(btn);
    } catch (err) { notify('BUTTON_ERROR: '+err.message); }
  }
  L.Listener.follow('full',add);
  notify('Мой онлайн v0.5.0 установлен');
})();
