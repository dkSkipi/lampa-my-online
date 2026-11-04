(function () {
  'use strict';
  if (window.lampa_my_online_v04) return;
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
  window.lampa_my_online_v04 = true;
  var busy = false;
  function restore() { if (L.Controller) L.Controller.toggle('full_start'); }
  function menu(title, items, callback) {
    L.Select.show({title:title,items:items,onSelect:function (item) {
      L.Select.hide();
      restore();
      try { callback(item); } catch (e) { notify('Мой онлайн: ошибка интерфейса — ' + e.message); }
    },onBack:function () { L.Select.hide(); restore(); }});
  }
  function request(route, callback, privateRequest) {
    if (busy) { notify('Запрос уже выполняется. Подождите.'); return; }
    busy = true;
    notify('Соединение с Render… При первом запросе подождите до 90 секунд.');
    var code=L.Storage ? L.Storage.get('my_online_access_code','') : '';
    $.ajax({url:API+route,dataType:'json',timeout:90000,cache:false,headers:privateRequest?{Authorization:'Bearer '+code}:{},
      success:function (data) {
        busy = false;
        if (!data || data.ok !== true || data.version !== '0.4.0') { notify('API_MISMATCH: обновите все файлы на Render до v0.4.0'); return; }
        try { callback(data); } catch (e) { notify('CLIENT_ERROR: '+e.message); }
      },error:function (xhr,status) {
        busy = false;
        if(xhr.responseJSON && xhr.responseJSON.error) { notify(xhr.responseJSON.error.code+': '+xhr.responseJSON.error.message); return; }
        var code = status === 'timeout' ? 'TIMEOUT' : status === 'parsererror' ? 'INVALID_JSON' : xhr.status ? 'HTTP_'+xhr.status : 'NETWORK';
        notify(code+': '+(xhr.status === 0 || status === 'timeout' ? 'Проверьте интернет и /health. Затем повторите запрос.' : 'Сервер не вернул ожидаемый ответ. Проверьте Render.')+' Адрес: '+API);
      }});
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
            var play={url:version.url,title:movie.title+' / '+translation.title};
            L.Player.play(play);
            if(L.Player.playlist) L.Player.playlist([play]);
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
    menu('Мой онлайн v0.4 • '+title,[
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
      if (root.find('.view--my-online-v04').length) return;
      var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
      if (!box.length) box = root.find('.view--torrent').parent().eq(0);
      if (!box.length) return;
      var btn = $('<div class="full-start__button selector view--my-online-v04"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
      btn.on('hover:enter',function () { try { open(e.data && e.data.movie || {}); } catch (err) { notify('MENU_ERROR: '+err.message); } });
      box.append(btn);
    } catch (err) { notify('BUTTON_ERROR: '+err.message); }
  }
  L.Listener.follow('full',add);
  notify('Мой онлайн v0.4.0 установлен');
})();
