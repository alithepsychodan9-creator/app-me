/* لوحة المالك — الحماية الحقيقية في قاعدة البيانات (Supabase RLS)، وهذه الواجهة للتعامل معها فقط */
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = t => (typeof toast === 'function' ? toast(t) : alert(t));
  const money = n => Number(n).toLocaleString('en-US') + ' ' + (typeof SETTINGS !== 'undefined' ? SETTINGS.currency : '');
  let tab = 'products', data = { products: [], orders: [], settings: {} }, editing = null, pendingImage = '', origImage = '', lastBlob = null;
  let bulk = null; /* { phase: 'pick' | 'run' | 'review', drafts: [], notes: [] } */

  const mapP = r => ({ id: +r.id, name: r.name, cat: r.cat, price: +r.price, desc: r.descr || '', image: r.image || '', available: r.available !== false });
  const mapS = r => ({ whatsapp: r.whatsapp, instagram: r.instagram, currency: r.currency, heroTitle: r.hero_title, heroText: r.hero_text });

  /* ---------- الذكاء الاصطناعي (Gemini المجاني) — المفتاح يُحفظ على جهاز المالك فقط ---------- */
  const AIK = 'ahmed_misk_ai', DEFAULT_MODEL = 'gemini-3.1-flash-lite';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('تعذر قراءة الصورة')); r.readAsDataURL(b); });
  const ai = {
    get() { try { return JSON.parse(localStorage.getItem(AIK) || 'null') || {}; } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem(AIK, JSON.stringify(o)); } catch (e) {} },
    on() { return !!this.get().key; },
    async call(parts, schema, onWait) {
      const cfg = this.get(), model = String(cfg.model || DEFAULT_MODEL).trim();
      const body = { contents: [{ parts }], generationConfig: Object.assign({ temperature: 0.3 }, schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}) };
      for (let t = 0; ; t++) {
        let r;
        try {
          r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify(body) });
        } catch (e) { const x = new Error('تعذر الوصول لخدمة Gemini (قد تكون محجوبة بشبكتك أو لا يوجد إنترنت)'); x.fatal = true; throw x; }
        let d = null; try { d = await r.json(); } catch (e) {}
        if (r.ok) return d;
        const m = (d && d.error && d.error.message) || ('خطأ ' + r.status);
        if (r.status === 429 && t < 3) { if (onWait) onWait('انتظار حد الاستخدام المجاني...'); await sleep(20000); continue; }
        const x = new Error(r.status === 429 ? 'وصلت للحد المجاني (بالدقيقة أو اليوم)، حاول لاحقاً'
          : r.status === 404 ? 'اسم الموديل غير صحيح، غيّره من إعدادات الذكاء الاصطناعي'
          : (r.status === 401 || r.status === 403 || /api key/i.test(m)) ? 'المفتاح غير صالح أو الخدمة غير متاحة بمنطقتك' : m);
        x.fatal = r.status === 429 || r.status === 401 || r.status === 403 || r.status === 404 || /api key/i.test(m);
        throw x;
      }
    },
    async ping() { await this.call([{ text: 'اكتب كلمة واحدة: تم' }]); },
    async describe(blob, cats, onWait) {
      const data = await toB64(blob);
      const prompt = 'أنت مساعد لمحل مجوهرات عراقي. انظر للصورة وأعطني بيانات المنتج بالعربية:\n' +
        '- name: اسم قصير وجذاب (حتى 50 حرفاً) مثل «خاتم سوليتير ذهب».\n' +
        '- cat: قسم المنتج. استخدم أحد الأقسام الموجودة إن كان مناسباً: ' + (cats.join('، ') || 'لا توجد أقسام بعد') + '. وإلا اقترح اسم قسم جديد قصير (كلمة أو كلمتين).\n' +
        '- desc: وصف جميل من جملة أو جملتين (حتى 200 حرف).\n' +
        'لا تذكر السعر ولا الوزن ولا العيار ولا نوع الأحجار إلا إذا كان واضحاً جداً في الصورة، ولا تخترع معلومات.';
      const schema = { type: 'OBJECT', properties: { name: { type: 'STRING' }, cat: { type: 'STRING' }, desc: { type: 'STRING' } }, required: ['name', 'cat', 'desc'] };
      const d = await this.call([{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data } }], schema, onWait);
      const parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
      let j; try { j = JSON.parse((parts || []).map(p => p.text || '').join('')); } catch (e) { throw new Error('رد غير مفهوم من الذكاء الاصطناعي'); }
      return { name: String(j.name || '').trim().slice(0, 100), cat: String(j.cat || '').trim().slice(0, 40), desc: String(j.desc || '').trim().slice(0, 300) };
    }
  };
  function aiCfgHTML() {
    const c = ai.get();
    return `<details class="o-ai" ${ai.on() ? '' : 'open'}><summary>✨ ربط الذكاء الاصطناعي (مجاني)</summary>
      <div class="o-note">١) افتح <b dir="ltr">aistudio.google.com/apikey</b> وسجّل بحساب Google، ثم <b>Create API key</b> وانسخ المفتاح.<br>٢) الصقه هنا واضغط حفظ. المفتاح يبقى على جوالك فقط.<br>تنبيه: الخدمة المجانية من Google قد تستخدم الصور المرسلة لتحسين منتجاتها.</div>
      <label class="o-field">مفتاح Gemini<input id="aiKey" type="password" dir="ltr" autocomplete="off" value="${E(c.key || '')}"></label>
      <label class="o-field">اسم الموديل<input id="aiModel" dir="ltr" value="${E(c.model || DEFAULT_MODEL)}"></label>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="o-btn gold sm" id="aiSave">حفظ</button><button type="button" class="o-btn ghost sm" id="aiTest">تجربة الاتصال</button></div>
      <div class="o-ok" id="aiMsg"></div></details>`;
  }
  function bindAiCfg(done) {
    const msg = $o('aiMsg');
    const store = () => {
      const key = $o('aiKey').value.trim();
      if (key && !/^[\w-]{20,}$/.test(key)) { msg.textContent = 'المفتاح غير صحيح'; return false; }
      ai.set({ key, model: $o('aiModel').value.trim() || DEFAULT_MODEL }); return true;
    };
    $o('aiSave').onclick = () => { if (store()) { msg.textContent = ai.on() ? 'تم الحفظ ✓' : 'تم حذف المفتاح'; if (done) done(); } };
    $o('aiTest').onclick = async () => {
      if (!store() || !ai.on()) { msg.textContent = msg.textContent || 'الصق المفتاح أولاً'; return; }
      msg.textContent = 'جاري التجربة...';
      try { await ai.ping(); msg.textContent = 'الاتصال يعمل ✓'; if (done) done(); } catch (e) { msg.textContent = e.message; }
    };
  }

  /* أي طلب يرجع 401/403 يعني انتهت الجلسة أو الحساب ليس المالك */
  async function guard(fn) {
    try { return await fn(); }
    catch (e) {
      if (e.status === 401 || e.status === 403) { await SB.logout(); closePanel(); openLogin(); say('سجّل الدخول من جديد'); }
      throw e;
    }
  }

  /* ---------- نافذة الدخول ---------- */
  const back = document.createElement('div');
  back.className = 'o-back';
  back.innerHTML = `
    <form class="o-box" id="oLogin" autocomplete="on">
      <h2>دخول المالك</h2>
      <div class="sub">هذه المنطقة خاصة بصاحب المحل فقط</div>
      <label class="o-field">البريد الإلكتروني<input id="oUser" name="email" type="email" autocomplete="username" required dir="ltr"></label>
      <label class="o-field">كلمة المرور<input id="oPass" name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
      <div class="o-err" id="oErr"></div>
      <button class="o-btn gold full" id="oGo" type="submit">دخول</button>
      <button class="o-btn ghost full" id="oCancel" type="button" style="margin-top:8px">إلغاء</button>
    </form>`;
  document.body.appendChild(back);
  const $o = id => document.getElementById(id);

  function openLogin() { $o('oErr').textContent = ''; $o('oPass').value = ''; back.classList.add('open'); setTimeout(() => $o('oUser').focus(), 50); }
  function closeLogin() { back.classList.remove('open'); }
  $o('oCancel').onclick = closeLogin;
  back.addEventListener('mousedown', e => { if (e.target === back) closeLogin(); });
  $o('oLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $o('oGo'); b.disabled = true; $o('oErr').textContent = '';
    try {
      await SB.login($o('oUser').value, $o('oPass').value);
      const ok = await SB.rpc('is_owner');
      if (ok !== true) { await SB.logout(); throw new Error('هذا الحساب ليس حساب المالك'); }
      $o('oPass').value = ''; closeLogin(); openPanel();
    } catch (err) { $o('oErr').textContent = err.message; }
    b.disabled = false;
  });

  /* ---------- زر المالك ---------- */
  document.getElementById('ownerBtn').addEventListener('click', () => {
    if (typeof ONLINE !== 'undefined' && !ONLINE) return say('اربط قاعدة البيانات أولاً (ملف config.js)');
    SB.loggedIn() ? openPanel() : openLogin();
  });

  /* ---------- اللوحة ---------- */
  const panel = document.createElement('div');
  panel.id = 'oPanel';
  panel.innerHTML = `
    <div class="o-top"><h2>👑 لوحة المالك</h2>
      <div style="display:flex;gap:6px"><button class="o-btn" id="oView">عرض الموقع</button><button class="o-btn" id="oOut">خروج</button></div></div>
    <div class="o-tabs" id="oTabs"></div>
    <div class="o-body" id="oBody"></div>`;
  document.body.appendChild(panel);

  function closePanel() { panel.classList.remove('open'); document.body.style.overflow = ''; }
  $o('oView').onclick = closePanel;
  $o('oOut').onclick = async () => { await SB.logout(); closePanel(); say('تم تسجيل الخروج'); };

  async function openPanel() {
    panel.classList.add('open'); document.body.style.overflow = 'hidden';
    editing = null;
    try {
      const [s, p, o] = await guard(() => Promise.all([
        SB.get('settings?id=eq.1&select=*'), SB.get('products?select=*&order=id.desc'), SB.get('orders?select=*&order=id.desc&limit=300')]));
      data.settings = mapS(s[0]); data.products = p.map(mapP); data.orders = o;
    } catch (e) { say(e.message); return; }
    render();
  }

  const TABS = [['products', 'المنتجات'], ['orders', 'الطلبات'], ['settings', 'إعدادات الموقع'], ['account', 'حساب المالك']];
  function render() {
    const fresh = data.orders.filter(o => o.status === 'new').length;
    $o('oTabs').innerHTML = TABS.map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}${k === 'orders' && fresh ? `<i>${fresh}</i>` : ''}</button>`).join('');
    $o('oTabs').querySelectorAll('button').forEach(b => b.onclick = () => {
      if (bulk && bulk.phase === 'run') return say('انتظر انتهاء رفع الصور');
      if (bulk && !leaveBulk()) return;
      tab = b.dataset.t; editing = null; render();
    });
    ({ products: viewProducts, orders: viewOrders, settings: viewSettings, account: viewAccount })[tab]();
  }
  async function refreshStore() { if (typeof loadStore === 'function') await loadStore(); }

  /* --- المنتجات --- */
  function viewProducts() {
    if (bulk) return viewBulk();
    if (editing !== null) return viewProductForm();
    const list = data.products;
    $o('oBody').innerHTML = `
      <div class="o-bar"><b>${list.length} منتج</b><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="o-btn ghost" id="oBulk">🖼️ صور بالجملة</button><button class="o-btn gold" id="oAdd">＋ إضافة منتج</button></div></div>
      ${list.map(p => `
        <div class="o-row">
          <div class="th">${p.image ? `<img src="${E(SB.img(p.image))}" alt="">` : '💎'}</div>
          <div class="tx"><b>${E(p.name)}</b><small>${E(p.cat)} · ${money(p.price)}</small>
            <span class="o-tag ${p.available === false ? 'off' : 'on'}">${p.available === false ? 'نفد' : 'متوفر'}</span></div>
          <div class="act"><button class="o-btn ghost sm" data-e="${+p.id}">تعديل</button><button class="o-btn danger sm" data-d="${+p.id}">حذف</button></div>
        </div>`).join('') || '<div class="o-empty">لا توجد منتجات بعد. اضغط «إضافة منتج».</div>'}`;
    $o('oAdd').onclick = () => { editing = 0; pendingImage = ''; origImage = ''; lastBlob = null; render(); };
    $o('oBulk').onclick = () => { bulk = { phase: 'pick', drafts: [], notes: [] }; render(); };
    $o('oBody').querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      editing = +b.dataset.e; lastBlob = null; origImage = pendingImage = (data.products.find(p => p.id === editing) || {}).image || ''; render();
    });
    $o('oBody').querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
      const p = data.products.find(x => x.id === +b.dataset.d);
      if (!confirm('حذف «' + p.name + '» نهائياً؟')) return;
      try {
        await guard(() => SB.del('products?id=eq.' + p.id));
        SB.removeImage(p.image);
        data.products = data.products.filter(x => x.id !== p.id); render(); refreshStore(); say('تم الحذف');
      } catch (e) { say(e.message); }
    });
  }

  function viewProductForm() {
    const p = editing ? data.products.find(x => x.id === editing) : { name: '', cat: '', price: '', desc: '', available: true };
    const cats = [...new Set(data.products.map(x => x.cat))];
    $o('oBody').innerHTML = `
      <form class="o-form" id="pForm">
        <h3 style="margin-top:14px">${editing ? 'تعديل منتج' : 'منتج جديد'}</h3>
        <div class="o-prev"><div class="th" id="pPrev">${pendingImage ? `<img src="${E(SB.img(pendingImage))}" alt="">` : '💎'}</div>
          <div><input type="file" id="pFile" accept="image/*" hidden>
            <button type="button" class="o-btn ghost sm" id="pPick">اختيار صورة</button>
            <button type="button" class="o-btn danger sm" id="pClr">إزالة</button>
            ${ai.on() ? '<button type="button" class="o-btn gold sm" id="pAi" style="margin-top:6px">✨ تعبئة بالذكاء الاصطناعي</button>' : ''}
            <div class="o-ok" id="pUp"></div></div></div>
        <label class="o-field">اسم المنتج<input id="pName" maxlength="100" required value="${E(p.name)}"></label>
        <label class="o-field">القسم<input id="pCat" list="pCats" maxlength="40" required value="${E(p.cat)}" placeholder="مثال: خواتم">
          <datalist id="pCats">${cats.map(c => `<option value="${E(c)}">`).join('')}</datalist></label>
        <label class="o-field">السعر<input id="pPrice" type="number" min="0" step="1" inputmode="numeric" required value="${E(p.price)}"></label>
        <label class="o-field">وصف (اختياري)<textarea id="pDesc" rows="2" maxlength="300">${E(p.desc || '')}</textarea></label>
        <label class="o-chk"><input type="checkbox" id="pAv" ${p.available === false ? '' : 'checked'}> متوفر للبيع</label>
        <div class="o-err" id="pErr"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="o-btn gold" type="submit" id="pSave">حفظ</button><button type="button" class="o-btn ghost" id="pBack">رجوع</button></div>
      </form>`;
    const discardNew = () => { if (pendingImage && pendingImage !== origImage) SB.removeImage(pendingImage); };
    $o('pBack').onclick = () => { discardNew(); editing = null; render(); };
    $o('pPick').onclick = () => $o('pFile').click();
    $o('pClr').onclick = () => { discardNew(); pendingImage = ''; lastBlob = null; $o('pPrev').innerHTML = '💎'; };
    if ($o('pAi')) $o('pAi').onclick = async () => {
      if (!pendingImage) return ($o('pErr').textContent = 'اختر صورة أولاً');
      $o('pErr').textContent = ''; $o('pUp').textContent = 'الذكاء الاصطناعي يحلل الصورة...'; $o('pAi').disabled = true;
      try {
        const src = lastBlob || await (await fetch(SB.img(pendingImage))).blob();
        const r = await ai.describe(await shrink(src, 640), [...new Set(data.products.map(x => x.cat))], m => ($o('pUp').textContent = m));
        if (!$o('pName').value.trim()) $o('pName').value = r.name;
        if (!$o('pCat').value.trim()) $o('pCat').value = r.cat;
        if (!$o('pDesc').value.trim()) $o('pDesc').value = r.desc;
        $o('pUp').textContent = 'تمت التعبئة ✓ راجعها قبل الحفظ';
      } catch (err) { $o('pUp').textContent = ''; $o('pErr').textContent = err.message; }
      $o('pAi').disabled = false;
    };
    $o('pFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $o('pUp').textContent = 'جاري رفع الصورة...'; $o('pErr').textContent = '';
      try {
        const blob = await shrink(f, 1100);
        const name = await guard(() => SB.upload(blob));
        lastBlob = blob;
        discardNew(); pendingImage = name; $o('pPrev').innerHTML = `<img src="${E(SB.img(name))}" alt="">`; $o('pUp').textContent = 'تم رفع الصورة ✓';
      } catch (err) { $o('pUp').textContent = ''; $o('pErr').textContent = err.message; }
    };
    $o('pForm').onsubmit = async e => {
      e.preventDefault(); $o('pErr').textContent = '';
      const price = Math.round(Number($o('pPrice').value));
      if (!(price >= 0)) return ($o('pErr').textContent = 'السعر غير صحيح');
      $o('pSave').disabled = true;
      const body = { name: $o('pName').value.trim(), cat: $o('pCat').value.trim(), price, descr: $o('pDesc').value.trim(), image: pendingImage, available: $o('pAv').checked };
      try {
        const r = await guard(() => editing ? SB.patch('products?id=eq.' + editing, body) : SB.post('products', body));
        if (!r || !r[0]) throw new Error('تعذر الحفظ، تحقق من صلاحيتك');
        const saved = mapP(r[0]);
        if (editing && origImage && origImage !== saved.image) SB.removeImage(origImage);
        if (editing) data.products = data.products.map(x => x.id === editing ? saved : x); else data.products.unshift(saved);
        origImage = pendingImage; editing = null; render(); refreshStore(); say('تم الحفظ ✓');
      } catch (err) { $o('pErr').textContent = err.message; $o('pSave').disabled = false; }
    };
  }

  /* --- إضافة صور بالجملة --- */
  const MAX_BULK = 60;
  function leaveBulk() {
    const n = bulk ? bulk.drafts.length : 0;
    if (n && !confirm('عندك ' + n + ' صورة لم تُنشر بعد. إلغاؤها؟')) return false;
    if (bulk) bulk.drafts.forEach(d => SB.removeImage(d.image));
    bulk = null; return true;
  }
  function viewBulk() {
    if (bulk.phase === 'run') return;
    if (bulk.phase === 'review') return viewBulkReview();
    $o('oBody').innerHTML = `
      <div class="o-form" style="padding-top:14px"><h3>إضافة صور بالجملة</h3>
        <div class="o-note">اختر حتى ${MAX_BULK} صورة من الاستوديو مرة وحدة (اضغط مطولاً على أول صورة ثم حدد الباقي). بعدها تراجع الأسماء وتضيف الأسعار وتنشر الكل.</div>
        <input type="file" id="bFiles" accept="image/*" multiple hidden>
        <label class="o-chk"><input type="checkbox" id="bAi" ${ai.on() ? 'checked' : 'disabled'}> ✨ تعبئة الاسم والقسم والوصف بالذكاء الاصطناعي ${ai.on() ? '' : '(اربطه من الأسفل أول)'}</label>
        <button class="o-btn gold full" id="bPick">📷 اختيار الصور من الاستوديو</button>
        <div class="o-err" id="bErr"></div>
        <div style="margin-top:14px">${aiCfgHTML()}</div>
        <button class="o-btn ghost full" id="bBack">رجوع</button></div>`;
    bindAiCfg(() => viewBulk());
    $o('bBack').onclick = () => { bulk = null; render(); };
    $o('bPick').onclick = () => $o('bFiles').click();
    $o('bFiles').onchange = e => {
      let files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
      if (!files.length) return;
      if (files.length > MAX_BULK) { $o('bErr').textContent = 'تم أخذ أول ' + MAX_BULK + ' صورة فقط، كرر العملية للباقي'; files = files.slice(0, MAX_BULK); }
      runBulk(files, ai.on() && $o('bAi').checked);
    };
  }

  async function runBulk(files, useAI) {
    bulk.phase = 'run'; bulk.drafts = []; bulk.notes = [];
    const drafts = bulk.drafts, cats = [...new Set(data.products.map(x => x.cat))];
    let up = 0, aid = 0, stop = false, aiFatal = '', waitMsg = '';
    const total = files.length;
    $o('oBody').innerHTML = `<div class="o-form" style="padding-top:14px"><h3>جاري المعالجة...</h3>
      <div class="o-bar2"><i id="bBar"></i></div><div class="o-ok" id="bStat" style="margin-top:10px"></div>
      <div class="o-note">لا تغلق الصفحة حتى ينتهي. ${useAI ? 'الذكاء الاصطناعي يحلل صورة بعد صورة لأن الخدمة المجانية لها حد بالدقيقة.' : ''}</div>
      <button class="o-btn danger full" id="bStop">إيقاف وعرض ما تم رفعه</button></div>`;
    $o('bStop').onclick = () => { stop = true; };
    const stat = () => {
      const bar = $o('bBar'), st = $o('bStat'); if (!bar || !st) return;
      const done = up + (useAI ? aid : 0), all = total * (useAI ? 2 : 1);
      bar.style.width = Math.round(done / all * 100) + '%';
      st.textContent = 'رفع الصور: ' + up + '/' + total + (useAI ? ' · تحليل الذكاء الاصطناعي: ' + aid + '/' + total : '') + (waitMsg ? ' · ' + waitMsg : '');
    };
    const aiQ = []; let aiRun = false;
    async function pump() {
      if (aiRun) return; aiRun = true;
      while (aiQ.length && !stop) {
        const d = aiQ.shift();
        if (!aiFatal) {
          try { const r = await ai.describe(d.blob, cats, m => { waitMsg = m; stat(); }); waitMsg = ''; d.name = r.name; d.cat = r.cat; d.desc = r.desc; if (r.cat && !cats.includes(r.cat)) cats.push(r.cat); }
          catch (e) { waitMsg = ''; if (e.fatal) aiFatal = e.message; }
        }
        d.blob = null; aid++; stat();
      }
      aiRun = false;
    }
    let idx = 0;
    async function worker() {
      while (idx < files.length && !stop) {
        const f = files[idx++], d = { image: '', name: '', cat: '', desc: '', price: '', blob: null };
        try {
          const blob = await shrink(f, 1100);
          d.image = await guard(() => SB.upload(blob));
          drafts.push(d);
          if (useAI && !aiFatal) { d.blob = await shrink(blob, 640); aiQ.push(d); pump(); } else aid++;
        } catch (e) { bulk.notes.push((f.name || 'صورة') + ': ' + e.message); aid++; if (e.status === 401 || e.status === 403) stop = true; }
        up++; stat();
      }
    }
    stat();
    await Promise.all([worker(), worker(), worker()]);
    while (aiRun || (aiQ.length && !stop)) await sleep(250);
    if (aiFatal) bulk.notes.push('الذكاء الاصطناعي توقف: ' + aiFatal + ' — عبّي الباقي يدوياً.');
    bulk.drafts.forEach(d => { d.blob = null; });
    if (!drafts.length) { bulk.phase = 'pick'; if (tab === 'products') render(); say(bulk.notes[0] || 'ما انرفعت أي صورة'); return; }
    bulk.phase = 'review'; if (tab === 'products') render();
  }

  function viewBulkReview() {
    const ds = bulk.drafts, cats = [...new Set(data.products.map(x => x.cat).concat(ds.map(d => d.cat).filter(Boolean)))];
    $o('oBody').innerHTML = `
      <div class="o-bar"><b>${ds.length} منتج للمراجعة</b><button class="o-btn danger sm" id="bCancel">إلغاء الكل</button></div>
      ${bulk.notes.map(n => `<div class="o-note">${E(n)}</div>`).join('')}
      <div class="o-note">راجع كل بطاقة وحط السعر. وتكدر تعبّي الفارغ دفعة وحدة:</div>
      <div class="o-bulkbar">
        <input id="bAllPrice" type="number" min="0" inputmode="numeric" placeholder="سعر لكل الفارغ">
        <button class="o-btn ghost sm" id="bApplyPrice">تطبيق</button>
        <input id="bAllCat" list="bCats" maxlength="40" placeholder="قسم لكل الفارغ">
        <button class="o-btn ghost sm" id="bApplyCat">تطبيق</button></div>
      <datalist id="bCats">${cats.map(c => `<option value="${E(c)}">`).join('')}</datalist>
      <div id="bList">${ds.map((d, i) => `
        <div class="o-draft" data-i="${i}">
          <div class="th"><img src="${E(SB.img(d.image))}" alt=""></div>
          <div class="f">
            <input data-f="name" maxlength="100" placeholder="اسم المنتج" value="${E(d.name)}">
            <div class="two"><input data-f="cat" list="bCats" maxlength="40" placeholder="القسم" value="${E(d.cat)}"><input data-f="price" type="number" min="0" inputmode="numeric" placeholder="السعر" value="${E(d.price)}"></div>
            <textarea data-f="desc" rows="2" maxlength="300" placeholder="وصف (اختياري)">${E(d.desc)}</textarea></div>
          <button class="o-btn danger sm" data-x="${i}" aria-label="حذف">✕</button>
        </div>`).join('')}</div>
      <label class="o-chk"><input type="checkbox" id="bAv" checked> متوفرة للبيع</label>
      <div class="o-err" id="bErr"></div>
      <button class="o-btn gold full" id="bPublish">نشر المنتجات</button>`;
    const L = $o('bList');
    L.addEventListener('input', e => { const t = e.target, row = t.closest('.o-draft'); if (!row || !t.dataset.f) return; bulk.drafts[+row.dataset.i][t.dataset.f] = t.value; row.classList.remove('bad'); });
    L.addEventListener('click', e => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      const i = +x.dataset.x; SB.removeImage(bulk.drafts[i].image); bulk.drafts.splice(i, 1);
      if (!bulk.drafts.length) { bulk.phase = 'pick'; } render();
    });
    $o('bCancel').onclick = () => { if (leaveBulk()) render(); };
    $o('bApplyPrice').onclick = () => { const v = $o('bAllPrice').value; if (v === '') return; bulk.drafts.forEach(d => { if (d.price === '') d.price = v; }); viewBulkReview(); };
    $o('bApplyCat').onclick = () => { const v = $o('bAllCat').value.trim(); if (!v) return; bulk.drafts.forEach(d => { if (!d.cat.trim()) d.cat = v.slice(0, 40); }); viewBulkReview(); };
    $o('bPublish').onclick = async () => {
      $o('bErr').textContent = '';
      const ok = [], rows = L.querySelectorAll('.o-draft');
      bulk.drafts.forEach((d, i) => {
        const price = d.price === '' ? NaN : Math.round(Number(d.price)), good = d.name.trim() && d.cat.trim() && price >= 0;
        if (good) ok.push({ d, row: { name: d.name.trim().slice(0, 100), cat: d.cat.trim().slice(0, 40), price, descr: d.desc.trim().slice(0, 300), image: d.image, available: $o('bAv').checked } });
        else rows[i].classList.add('bad');
      });
      if (!ok.length) return ($o('bErr').textContent = 'أكمل الاسم والقسم والسعر للبطاقات المظلّلة');
      $o('bPublish').disabled = true; $o('bPublish').textContent = 'جاري النشر...';
      const saved = [];
      try {
        for (let i = 0; i < ok.length; i += 40) {
          const r = await guard(() => SB.post('products', ok.slice(i, i + 40).map(x => x.row)));
          if (!r || r.length !== Math.min(40, ok.length - i)) throw new Error('تعذر الحفظ، تحقق من صلاحيتك');
          r.forEach(x => saved.push(mapP(x)));
        }
      } catch (err) { $o('bErr').textContent = err.message + (saved.length ? ' (نُشر ' + saved.length + ' فقط)' : ''); }
      if (saved.length) {
        const done = new Set(ok.slice(0, saved.length).map(x => x.d));
        data.products = saved.reverse().concat(data.products);
        bulk.drafts = bulk.drafts.filter(d => !done.has(d)); refreshStore();
        say('تم نشر ' + saved.length + ' منتج ✓');
        if (!bulk.drafts.length) { bulk = null; return render(); }
        bulk.notes = []; return viewBulkReview();
      }
      $o('bPublish').disabled = false; $o('bPublish').textContent = 'نشر المنتجات';
    };
  }

  function shrink(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('تعذر معالجة الصورة')), 'image/jpeg', 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('الملف ليس صورة')); };
      img.src = url;
    });
  }

  /* --- الطلبات --- */
  const ST = { new: 'جديد', processing: 'قيد التجهيز', done: 'تم التسليم', cancelled: 'ملغي' };
  function viewOrders() {
    const l = data.orders;
    $o('oBody').innerHTML = (l.map(o => {
      const ph = String(o.phone).replace(/\D/g, '');
      const items = Array.isArray(o.items) ? o.items : [];
      return `<div class="o-order">
        <header><b>طلب #${+o.id}</b><small>${E(new Date(o.created_at).toLocaleString('ar-IQ'))}</small></header>
        <div class="meta">👤 ${E(o.name)}<br>📞 <a href="tel:${E(ph)}">${E(o.phone)}</a> · <a target="_blank" rel="noopener" href="https://wa.me/${E(ph)}">واتساب</a><br>📍 ${E(o.address)}</div>
        <ul>${items.map(i => `<li>${E(i.name)} × ${+i.qty} — ${money(i.price * i.qty)}</li>`).join('')}</ul>
        <div class="o-total">المجموع: ${money(o.total)}</div>
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
          <select data-s="${+o.id}">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <button class="o-btn danger sm" data-od="${+o.id}">حذف</button></div></div>`;
    }).join('')) || '<div class="o-empty">لا توجد طلبات بعد.</div>';
    $o('oBody').querySelectorAll('[data-s]').forEach(s => s.onchange = async () => {
      try { await guard(() => SB.patch('orders?id=eq.' + s.dataset.s, { status: s.value })); data.orders.find(o => o.id === +s.dataset.s).status = s.value; render(); say('تم تحديث الحالة'); }
      catch (e) { say(e.message); }
    });
    $o('oBody').querySelectorAll('[data-od]').forEach(b => b.onclick = async () => {
      if (!confirm('حذف هذا الطلب؟')) return;
      try { await guard(() => SB.del('orders?id=eq.' + b.dataset.od)); data.orders = data.orders.filter(o => o.id !== +b.dataset.od); render(); }
      catch (e) { say(e.message); }
    });
  }

  /* --- الإعدادات --- */
  function viewSettings() {
    const s = data.settings;
    $o('oBody').innerHTML = `
      <form class="o-form" id="sForm"><h3 style="margin-top:14px">إعدادات الموقع</h3>
        <label class="o-field">رقم الواتساب (صيغة دولية بدون + مثل 9647701234567)<input id="sWa" inputmode="numeric" dir="ltr" value="${E(s.whatsapp)}"></label>
        <label class="o-field">حساب الانستغرام (بدون @)<input id="sIg" dir="ltr" value="${E(s.instagram)}"></label>
        <label class="o-field">العملة<input id="sCur" maxlength="10" value="${E(s.currency)}"></label>
        <label class="o-field">العنوان الرئيسي<input id="sT" maxlength="80" value="${E(s.heroTitle)}"></label>
        <label class="o-field">النص تحت العنوان<textarea id="sD" rows="2" maxlength="300">${E(s.heroText)}</textarea></label>
        <div class="o-err" id="sErr"></div>
        <button class="o-btn gold full" type="submit">حفظ الإعدادات</button></form>
      <div class="o-form" style="margin-top:14px;padding-top:14px">${aiCfgHTML()}</div>`;
    bindAiCfg();
    $o('sForm').onsubmit = async e => {
      e.preventDefault(); $o('sErr').textContent = '';
      const wa = $o('sWa').value.replace(/\D/g, ''), ig = $o('sIg').value.trim().replace(/^@/, '');
      if (wa.length < 8 || wa.length > 15) return ($o('sErr').textContent = 'رقم الواتساب غير صحيح (صيغة دولية بدون +)');
      if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) return ($o('sErr').textContent = 'اسم حساب الانستغرام غير صحيح');
      try {
        const r = await guard(() => SB.patch('settings?id=eq.1', { whatsapp: wa, instagram: ig, currency: $o('sCur').value.trim() || 'د.ع', hero_title: $o('sT').value.trim(), hero_text: $o('sD').value.trim() }));
        if (!r || !r[0]) throw new Error('تعذر الحفظ، تحقق من صلاحيتك');
        data.settings = mapS(r[0]); refreshStore(); say('تم حفظ الإعدادات ✓');
      } catch (err) { $o('sErr').textContent = err.message; }
    };
  }

  /* --- الحساب --- */
  function viewAccount() {
    $o('oBody').innerHTML = `
      <form class="o-form" id="aForm"><h3 style="margin-top:14px">حساب المالك</h3>
        <div class="o-note">البريد المسجّل: <b dir="ltr">${E(SB.email())}</b><br>استخدم كلمة مرور قوية (8 أحرف أو أكثر) ولا تشاركها مع أحد.</div>
        <label class="o-field">كلمة المرور الحالية<input id="aC" type="password" autocomplete="current-password" required dir="ltr"></label>
        <label class="o-field">كلمة المرور الجديدة<input id="aN" type="password" autocomplete="new-password" minlength="8" required dir="ltr"></label>
        <div class="o-err" id="aErr"></div>
        <button class="o-btn gold full" type="submit">تغيير كلمة المرور</button></form>`;
    $o('aForm').onsubmit = async e => {
      e.preventDefault(); $o('aErr').textContent = '';
      try {
        await SB.login(SB.email(), $o('aC').value);
        await SB.changePassword($o('aN').value);
        $o('aForm').reset(); say('تم تغيير كلمة المرور ✓');
      } catch (err) { $o('aErr').textContent = err.message; }
    };
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
})();
