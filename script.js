/* =========================================================
   Junior Game Lounge — site davranışları
   Fiyat, kapasite ve saatleri AYARLAR bölümünden değiştir.
   Yer ayırtma mantığı önceki sürümden alındı (gece 00–02 arası
   önceki iş günü sayılır, geçmiş saatler kapalı).
   Eski telefonlarda da çalışsın diye yeni sözdizimi (?. ?? 1_000
   catch {} gibi) kullanılmadı.
   ========================================================= */
(() => {
  // JS çalışıyor: seçiciler görünsün (bkz. .js-only / .nojs-only)
  document.documentElement.classList.add('js');
  // iOS Safari :active stillerini ancak bir touchstart dinleyicisi varsa uygular
  document.addEventListener('touchstart', function () {}, { passive: true });

  // ---------- AYARLAR ----------
  const SYSTEMS = {
    standart: { name: 'Standart', unit: 'kokpit',   cap: 3, prices: { 30: 120, 60: 200, 120: 380 } },
    pro:      { name: 'Pro',      unit: 'kokpit',   cap: 2, prices: { 30: 180, 60: 300, 120: 550 } },
    ps5:      { name: 'PS5',      unit: 'istasyon', cap: 2, prices: { 30: 60,  60: 100, 120: 180 } },
  };
  const OPEN = 9;    // 09:00
  const CLOSE = 26;  // 02:00 (ertesi gün) — 24'ten büyük = gece yarısından sonra
  const WA_NUMBER = '905467767998'; // 0546 776 79 98
  const DAYS_AHEAD = 7;
  const TIME_ZONE = 'Europe/Istanbul'; // salonun saati, ziyaretçinin telefonu değil

  // ---------- Yardımcılar ----------
  const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const DAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const clock = mins => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  const money = n => n.toLocaleString('tr-TR') + '\u00a0₺'; // sayı ile ₺ ayrı satıra düşmesin
  const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Türkiye saatiyle şu an (yıl, ay, gün, saat)
  let tzFmt = null;
  try {
    tzFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
    });
    if (typeof tzFmt.formatToParts !== 'function') tzFmt = null;
  } catch (e) { tzFmt = null; }

  function salonClock() {
    const now = new Date();
    if (tzFmt) {
      const p = {};
      tzFmt.formatToParts(now).forEach(x => { p[x.type] = x.value; });
      const y = Number(p.year), m = Number(p.month), d = Number(p.day), h = Number(p.hour);
      if (y && m && d && !isNaN(h)) return { y, m: m - 1, d, h: h % 24 };
    }
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), h: now.getHours() };
  }

  // Gece 00:00–02:00 arası hâlâ önceki günün mesaisidir.
  // day: içinde bulunulan iş günü, hour: o güne göre saat (01:30 → 25)
  function businessNow() {
    const t = salonClock();
    const day = new Date(t.y, t.m, t.d);
    let hour = t.h;
    if (hour < CLOSE - 24) { day.setDate(day.getDate() - 1); hour += 24; }
    return { day, hour };
  }

  $('#year').textContent = salonClock().y;

  // ---------- Açık / kapalı + saat ledleri ----------
  const ledItems = Array.prototype.slice.call(document.querySelectorAll('#leds li'));

  function updateStatus() {
    const h = businessNow().hour % 24;
    const isOpen = h >= OPEN || h < CLOSE - 24;
    const status = $('#status');
    const html = isOpen
      ? `Açık<span class="st-x"> · ${clock(CLOSE * 60)}'ye kadar</span>`
      : `Kapalı<span class="st-x"> · ${clock(OPEN * 60)}'da açılır</span>`;
    const st = $('#statusText');
    if (st.innerHTML !== html) st.innerHTML = html;
    status.classList.toggle('is-open', isOpen);
    status.classList.toggle('is-closed', !isOpen);
    setText($('#hoursNow'), isOpen
      ? `Şu an açığız, gece ${clock(CLOSE * 60)}'ye kadar buradayız.`
      : `Şu an kapalıyız. Sabah ${clock(OPEN * 60)}'da açıyoruz.`);
    ledItems.forEach((li, i) => li.classList.toggle('now', i === h));
  }

  // ---------- Yer ayırtma (bilet makinesi) ----------
  // Butonlar bir kez çizilir; seçim değişince sadece disabled / aria-pressed
  // güncellenir. Böylece klavye ve ekran okuyucu odağı yerinde kalır.
  const state = { sys: 'standart', count: 1, day: 0, h: null, dur: 60 };
  let days = [];
  const ticket = $('#ticket');
  const boxSys = $('#optSys');
  const boxDur = $('#optDur');
  const boxCount = $('#optCount');
  const boxDay = $('#optDay');
  const boxHour = $('#optHour');
  const say = $('#ticketSay');
  let announce = false; // ilk çizimde ekran okuyucuya bir şey söyleme

  function buildDays() {
    const start = businessNow().day;
    days = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    boxDay.innerHTML = '';
    days.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = i;
      boxDay.appendChild(b);
    });
    labelDays();
  }

  // "Bugün / Yarın" takvim tarihine göre yazılır (iş gününe göre değil).
  // Gece 00–02 arası ilk buton dünün iş günüdür: "Bu gece".
  function labelDays() {
    const t = salonClock();
    const today = key(new Date(t.y, t.m, t.d));
    const tomorrow = key(new Date(t.y, t.m, t.d + 1));
    boxDay.querySelectorAll('button').forEach((b, i) => {
      const d = days[i];
      const k = key(d);
      const rel = k === today ? 'Bugün' : k === tomorrow ? 'Yarın' : i === 0 ? 'Bu gece' : '';
      const html = `<span>${rel || DAYS[d.getDay()]}</span><b>${d.getDate()}</b>`;
      if (b.innerHTML !== html) b.innerHTML = html;
      // Görünen metinle başlar (sesli komut "Pzt 17" eşleşsin)
      b.setAttribute('aria-label', `${rel || DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}, ${DAYS_LONG[d.getDay()]}`);
    });
  }

  function buildHours() {
    for (let h = OPEN; h < CLOSE; h++) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = h; b.textContent = pad(h % 24);
      if (h >= 24) b.className = 'night';
      b.setAttribute('aria-label', clock(h * 60) + (h >= 24 ? ' gece' : ''));
      boxHour.appendChild(b);
    }
  }

  function hourOk(dayIndex, h, bn) {
    const span = Math.ceil(state.dur / 60);
    if (h + span > CLOSE) return false;
    if (key(days[dayIndex]) === key(bn.day) && h <= bn.hour) return false;
    return true;
  }
  function dayHasHours(i, bn) {
    for (let h = OPEN; h < CLOSE; h++) if (hourOk(i, h, bn)) return true;
    return false;
  }

  function setPressed(container, value) {
    container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
  }

  function printTicket() {
    if (reduced) return;
    ticket.classList.remove('is-print', 'is-nudge');
    void ticket.offsetWidth; // animasyonu baştan başlat
    ticket.classList.add('is-print');
  }

  // Sayı butonları sadece sistemin kapasitesi/birimi değişince yeniden çizilir
  let countSig = '';
  function renderCount() {
    const { cap, unit } = SYSTEMS[state.sys];
    if (state.count > cap) state.count = cap;
    const sig = cap + unit;
    if (sig !== countSig) {
      countSig = sig;
      setText($('#countLegend'), unit === 'istasyon' ? 'İstasyon sayısı' : 'Kokpit sayısı');
      boxCount.innerHTML = '';
      for (let n = 1; n <= cap; n++) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.v = n; b.textContent = n;
        b.setAttribute('aria-label', `${n} ${unit}`);
        boxCount.appendChild(b);
      }
    }
    setPressed(boxCount, state.count);
  }

  function renderTicket() {
    const sys = SYSTEMS[state.sys];
    const total = sys.prices[state.dur] * state.count;
    const send = $('#sendWa');
    const line = $('#ticketLine');
    setText($('#ticketTotal'), money(total));
    if (state.h === null) {
      setText(line, `${sys.name} · ${state.count} ${sys.unit} · saat seçilmedi`);
      send.setAttribute('aria-disabled', 'true');
      send.href = `https://wa.me/${WA_NUMBER}`;
      setText($('#sendLabel'), 'Önce saat seç');
    } else {
      const d = days[state.day];
      const dayText = `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${DAYS_LONG[d.getDay()]}${state.h >= 24 ? ' gecesi' : ''}`;
      const timeText = `${clock(state.h * 60)}–${clock(state.h * 60 + state.dur)}`;
      // Ekranda saat aralığı tirede bölünmesin (WhatsApp mesajı aynen kalır)
      setText(line, `${sys.name} · ${state.count} ${sys.unit} · ${dayText} ${timeText.replace('–', '\u2060–\u2060')}`);
      ticket.classList.remove('is-nudge');

      const who = $('#who').value.trim();
      const msg = [
        'Merhaba, Junior Game Lounge için randevu almak istiyorum:',
        `${sys.name} · ${state.count} ${sys.unit}`,
        `${dayText}, ${timeText}`,
        `Toplam: ${money(total)}`,
        who ? `İsim: ${who}` : '',
      ].filter(Boolean).join('\n');
      send.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
      send.setAttribute('aria-disabled', 'false');
      setText($('#sendLabel'), 'Randevu al');
    }
    // Ekran okuyucuya sadece bilet gerçekten değişince söyle (isim yazarken değil)
    if (announce) setText(say, `Randevu: ${line.textContent}. Toplam ${money(total)}.`);
  }

  // Odak bir seçenek butonundaysa ve o buton kaybolduysa / kapandıysa
  // aynı değere, yoksa en yakın açık butona geri koy.
  function nearestEnabled(btns, idx) {
    for (let k = 0; k < btns.length; k++) {
      const a = btns[idx + k], b = btns[idx - k];
      if (a && !a.disabled) return a;
      if (b && !b.disabled) return b;
    }
    return null;
  }

  function render(prep) {
    const a = document.activeElement;
    const box = a && a.parentElement && a.parentElement.classList.contains('opts') ? a.parentElement : null;
    const v = box ? a.dataset.v : null;
    const idx = box ? Array.prototype.indexOf.call(box.children, a) : -1;

    if (prep) prep();
    const bn = businessNow();
    if (!dayHasHours(state.day, bn)) {
      const i = days.findIndex((_, k) => dayHasHours(k, bn));
      if (i >= 0) state.day = i;
    }
    if (state.h !== null && !hourOk(state.day, state.h, bn)) state.h = null;

    setPressed(boxSys, state.sys);
    setPressed(boxDur, state.dur);
    renderCount();
    boxDay.querySelectorAll('button').forEach((b, i) => { b.disabled = !dayHasHours(i, bn); });
    setPressed(boxDay, state.day);
    boxHour.querySelectorAll('button').forEach(b => { b.disabled = !hourOk(state.day, Number(b.dataset.v), bn); });
    setPressed(boxHour, state.h);
    renderTicket();

    if (box && (document.activeElement !== a || a.disabled || !box.contains(a))) {
      const btns = Array.prototype.slice.call(box.querySelectorAll('button'));
      let t = btns.find(b => b.dataset.v === v && !b.disabled);
      if (!t) t = nearestEnabled(btns, Math.max(0, Math.min(idx, btns.length - 1)));
      if (t) t.focus({ preventScroll: true });
    }
  }

  const picked = (e, box) => {
    const b = e.target.closest('button');
    return b && box.contains(b) && !b.disabled ? b : null;
  };
  boxSys.addEventListener('click', e => {
    const b = picked(e, boxSys); if (!b) return;
    state.sys = b.dataset.v; render(); if (state.h !== null) printTicket();
  });
  boxDur.addEventListener('click', e => {
    const b = picked(e, boxDur); if (!b) return;
    state.dur = Number(b.dataset.v); render(); if (state.h !== null) printTicket();
  });
  boxCount.addEventListener('click', e => {
    const b = picked(e, boxCount); if (!b) return;
    state.count = Number(b.dataset.v); render(); if (state.h !== null) printTicket();
  });
  boxDay.addEventListener('click', e => {
    const b = picked(e, boxDay); if (!b) return;
    state.day = Number(b.dataset.v); state.h = null; render();
  });
  boxHour.addEventListener('click', e => {
    const b = picked(e, boxHour); if (!b) return;
    state.h = Number(b.dataset.v); render(); printTicket();
  });
  $('#who').addEventListener('input', renderTicket);
  $('#board').addEventListener('submit', e => {
    e.preventDefault();
    // iOS "done" tuşu: klavyeyi kapat, özet kartı görünsün
    const w = $('#who');
    if (document.activeElement === w) w.blur();
  });
  $('#sendWa').addEventListener('click', e => {
    if (e.currentTarget.getAttribute('aria-disabled') !== 'true') return;
    e.preventDefault();
    ticket.classList.remove('is-print', 'is-nudge');
    void ticket.offsetWidth;
    ticket.classList.add('is-nudge');
    const first = $('#optHour button:not(:disabled)');
    if (first) { first.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); first.focus({ preventScroll: true }); }
  });

  buildDays();
  buildHours();
  state.day = dayHasHours(0, businessNow()) ? 0 : 1;
  updateStatus();
  render();
  announce = true;

  // Saat ya da gün değişince (telefon kilitten açılınca da) günleri ve saatleri tazele.
  // Butonlar yerinde güncellenir, odak korunur.
  const stamp = () => { const bn = businessNow(); return key(bn.day) + '|' + bn.hour; };
  let lastStamp = stamp();
  function tick() {
    updateStatus();
    const s = stamp();
    if (s === lastStamp) return;
    lastStamp = s;
    if (key(businessNow().day) !== key(days[0])) {
      render(() => {
        const was = days[state.day];
        buildDays();
        const i = days.findIndex(d => key(d) === key(was));
        if (i >= 0) state.day = i; else { state.day = 0; state.h = null; }
      });
    } else {
      labelDays(); // gece yarısı geçince "Bugün / Yarın" kayar
      render();
    }
  }
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', tick);

  // ---------- Telefonda alt çubuk ----------
  // Çubuk sadece özet kartındaki "Randevu al" düğmesi ekrandayken çekilir.
  // Formun üst kısmını doldururken Ara / WhatsApp hâlâ elinin altında.
  if ('IntersectionObserver' in window) {
    const sendBtn = $('#sendWa');
    const root = document.documentElement;
    const barIo = new IntersectionObserver(entries => {
      entries.forEach(en => root.classList.toggle('send-on', en.isIntersecting));
    });
    if (sendBtn) barIo.observe(sendBtn);
    // Girişteki "Randevu al" ekrandayken de çubuk çekilir (iki aynı düğme olmasın).
    // Ayrı sınıf: iki gözlemci birbirinin durumunu silmesin.
    const heroCta = document.querySelector('.hero-cta');
    if (heroCta) new IntersectionObserver(es => es.forEach(en => root.classList.toggle('hero-on', en.isIntersecting))).observe(heroCta);
  }

  // ---------- Kaydırınca beliren parçalar ----------
  // İçerik baştan görünür; sadece ekranın altında kalanlar JS ile
  // gizlenip görününce yerine oturur. Hareket kapalıysa hiç dokunma.
  if (!reduced && 'IntersectionObserver' in window) {
    const items = Array.prototype.slice.call(document.querySelectorAll('.rv'));
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.remove('rv-wait');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const groups = new Map();
    items.forEach(el => {
      if (el.getBoundingClientRect().top < window.innerHeight) return; // ekrandakiler olduğu gibi kalsın
      const parent = el.parentElement;
      const n = groups.get(parent) || 0;
      groups.set(parent, n + 1);
      el.style.transitionDelay = `${Math.min(n, 4) * 90}ms`;
      el.classList.add('rv-wait');
      io.observe(el);
    });
    // Geçiş bittikten sonra gecikmeyi temizle (hover hızlı kalsın)
    document.addEventListener('transitionend', e => {
      if (e.target.classList && e.target.classList.contains('rv')) e.target.style.transitionDelay = '';
    });
  }
})();
