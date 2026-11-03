(function () {
  'use strict';
  if (!window.Lampa || window.lampa_my_online_v01) return;
  window.lampa_my_online_v01 = true;

  // Server injects its own URL into /plugin.js at response time.
  var API_URL = '__API_ORIGIN__'.replace(/\/$/, '');

  var L = window.Lampa;
  if (!L.Listener || !L.Component || !L.Player || !window.jQuery) return;
  var $ = window.jQuery;
  function notify(s) { if (L.Noty && L.Noty.show) L.Noty.show(s); }
  function query(q, done, fail) {
    // No cookies/passwords or Rezka requests are involved in v0.1.
    $.ajax({
      url: API_URL + '/api/search', data: { q: q }, dataType: 'json', timeout: 20000,
      success: done, error: function (_xhr, status) { fail(status); }
    });
  }
  function Component(object) {
    var movie = object.movie || {};
    var title = movie.title || movie.name || movie.original_title || 'Фильм';
    var html = $('<div class="my-online-list"></div>');
    var scroll = new L.Scroll({mask: true, over: true});
    var last = null;
    var alive = true;
    var self = this;

    function reset() { html.empty(); }
    function entry(text, hint, fn) {
      var el = $('<div class="selector" style="padding:1em 1.3em;margin:.5em 1.4em;background:rgba(255,255,255,.09);border-radius:.5em"><div style="font-size:1.2em"></div><div style="opacity:.65;margin-top:.25em"></div></div>');
      el.children().eq(0).text(text);
      el.children().eq(1).text(hint || '');
      el.on('hover:enter', fn);
      el.on('hover:focus', function () { last = el[0]; scroll.update(el, true); });
      html.append(el);
    }
    function message(text) {
      reset();
      html.append($('<div style="padding:2em"></div>').text(text));
      scroll.append(html);
      if (self.activity) self.activity.loader(false);
      self.start();
    }
    this.create = function () {
      this.activity.loader(true);
      query(title, function (data) {
        if (!alive) return;
        reset();
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!items.length) return message('Пока нет источников для «' + title + '». В версии 0.1 подключён только тестовый каталог Big Buck Bunny.');
        items.forEach(function (item) {
          (item.versions || []).forEach(function (version) {
            if (!/^https:\/\//i.test(version.url || '')) return;
            entry(item.title + ' — ' + (version.name || 'Оригинал'), version.quality || 'Авто', function () {
              var play = {url: version.url, title: item.title};
              L.Player.play(play);
              L.Player.playlist([play]);
            });
          });
        });
        scroll.append(html);
        self.activity.loader(false);
        self.start();
      }, function (error) {
        if (alive) message('Нет соединения с сервером (' + error + '). Проверь адрес Render и /health.');
      });
      return this.render();
    };
    this.render = function () { return scroll.render(); };
    this.start = function () {
      if (!this.activity || L.Activity.active().activity !== this.activity) return;
      L.Controller.add('content', {
        toggle: function () { L.Controller.collectionSet(scroll.render()); L.Controller.collectionFocus(last || false, scroll.render()); },
        left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else L.Controller.toggle('menu'); },
        right: function () { Navigator.move('right'); },
        up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else L.Controller.toggle('head'); },
        down: function () { Navigator.move('down'); },
        back: function () { L.Activity.backward(); }
      });
      L.Controller.toggle('content');
    };
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () { alive = false; scroll.destroy(); html.remove(); };
  }

  L.Component.add('my_online_starter', Component);
  L.Listener.follow('full', function (e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    var root = e.object.activity.render();
    if (root.find('.view--my-online-starter').length) return;
    var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
    if (!box.length) box = root.find('.view--torrent').parent();
    if (!box.length) return;
    var btn = $('<div class="full-start__button selector view--my-online-starter"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
    btn.on('hover:enter', function () {
      L.Activity.push({url: '', title: 'Мой онлайн', component: 'my_online_starter', movie: (e.data && e.data.movie) || {}, page: 1});
    });
    box.append(btn);
  });
  notify('Мой онлайн v0.1 установлен');
})();
