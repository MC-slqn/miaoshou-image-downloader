// ==UserScript==
// @name         网页图片下载器 · 一页一文件夹
// @namespace    local.page-image-saver
// @version      1.2.0
// @license      MIT
// @homepageURL  https://github.com/MC-slqn/miaoshou-image-downloader
// @supportURL   https://github.com/MC-slqn/miaoshou-image-downloader/issues
// @downloadURL  https://raw.githubusercontent.com/MC-slqn/miaoshou-image-downloader/main/miaoshou-image-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/MC-slqn/miaoshou-image-downloader/main/miaoshou-image-downloader.user.js
// @description  妙手 TikTok 采集箱专用：产品图片、产品描述分区勾选，并保存到网页总文件夹下的两个子文件夹。
// @match        https://erp.91miaoshou.com/tiktok/collect_box/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('page-image-saver-host')) return;

  const state = {
    images: [], selected: new Set(), root: null, busy: false, cancelled: false,
    abort: null, pageURL: '', pageTitle: '', scanning: false, zipURL: null,
    scopeFingerprint: '', scopeContainers: [],
  };
  const canPick = window.isSecureContext && typeof window.showDirectoryPicker === 'function';
  const GROUPS = ['产品图片', '产品描述'];
  const host = document.createElement('div');
  host.id = 'page-image-saver-host';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
  const ui = host.attachShadow({ mode: 'closed' });
  ui.innerHTML = `
    <style>
      :host { color-scheme:light; }
      * { box-sizing:border-box; }
      button,input { font:inherit; }
      button { cursor:pointer; border:1px solid #cdd5df; border-radius:8px; padding:8px 12px; background:#fff; color:#263347; }
      button:hover { background:#f0f5fa; }
      button:disabled { opacity:.45; cursor:default; }
      button:focus-visible,input:focus-visible,a:focus-visible { outline:3px solid #64a9ff; outline-offset:2px; }
      .primary { color:#fff; background:#1769dc; border-color:#1769dc; }
      .primary:hover { background:#145bbf; }
      #launcher { pointer-events:auto; position:fixed; right:22px; bottom:76px; font:14px/1.4 system-ui,sans-serif; box-shadow:0 3px 18px #0003; padding:12px 16px; }
      #backdrop { pointer-events:auto; position:fixed; inset:0; background:#10182880; display:flex; align-items:center; justify-content:center; padding:18px; font:14px/1.5 system-ui,'Microsoft YaHei',sans-serif; color:#223047; }
      [hidden] { display:none!important; }
      #panel { width:1200px; max-width:100%; height:min(900px,94vh); display:flex; flex-direction:column; background:#f6f8fb; border-radius:16px; box-shadow:0 20px 70px #0004; overflow:hidden; }
      header { background:#fff; padding:18px 22px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #e0e6ee; gap:12px; }
      h2 { margin:0; font-size:20px; } p { margin:5px 0 0; }
      .muted { color:#627188; font-size:12px; }
      #settings { padding:14px 22px 12px; display:grid; gap:10px; }
      .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      input[type=text],input[type=search] { min-width:100px; flex:1; border:1px solid #ccd5e2; border-radius:7px; background:#fff; color:#223047; padding:8px 10px; }
      #folder { min-width:180px; } #root-name { overflow-wrap:anywhere; }
      #grid { flex:1; min-height:100px; overflow:hidden; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; padding:8px 22px 18px; }
      .image-section { min-width:0; min-height:0; display:flex; flex-direction:column; border:1px solid #dbe3ed; border-radius:12px; background:#fff; overflow:hidden; }
      .section-head { flex:none; padding:12px; border-bottom:1px solid #e1e7ef; background:#eef5ff; }
      .image-section:last-child .section-head { background:#edf8f4; }
      .section-head h3 { margin:0 0 4px; font-size:17px; }
      .section-actions { display:flex; gap:7px; margin-top:9px; flex-wrap:wrap; }
      .section-actions button { padding:5px 9px; font-size:12px; }
      .group-grid { flex:1; min-height:0; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); grid-auto-rows:max-content; align-content:start; gap:10px; padding:12px; }
      .card { display:flex; flex-direction:column; position:relative; border:2px solid #e2e7ee; background:#fff; border-radius:10px; overflow:hidden; cursor:pointer; min-width:0; }
      .card:has(input:checked) { border-color:#1769dc; background:#eef5ff; }
      .card input { position:absolute; top:9px; left:9px; width:19px; height:19px; accent-color:#1769dc; z-index:1; }
      .thumb { flex:none; height:124px; display:flex; align-items:center; justify-content:center; background:repeating-conic-gradient(#eee 0% 25%,#fafafa 0% 50%) 50%/16px 16px; }
      .thumb img { width:100%; height:100%; object-fit:contain; }
      .caption { flex:none; padding:8px; } .name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; }
      .meta { color:#6b7890; font-size:11px; margin-top:3px; }
      .empty { grid-column:1/-1; padding:35px 12px; text-align:center; color:#6b7890; }
      footer { background:#fff; border-top:1px solid #dfe5ed; padding:12px 22px 16px; }
      #status { min-height:23px; overflow-wrap:anywhere; white-space:pre-wrap; }
      progress { width:100%; height:7px; accent-color:#1769dc; margin:8px 0; }
      #logs { margin-top:7px; max-height:100px; overflow:auto; font-size:12px; color:#a12828; white-space:pre-wrap; overflow-wrap:anywhere; }
      #zip-link { color:#1769dc; margin-left:6px; }
      @media(max-width:700px) { #settings,header,footer { padding:12px; } #grid { padding:8px 12px; grid-template-columns:1fr; grid-auto-rows:340px; overflow:auto; } .group-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } #backdrop { padding:6px; } h2 { font-size:17px; } .thumb { height:100px; } }
    </style>
    <button id="launcher" class="primary" title="打开图片选择面板">↓ 下载图片</button>
    <div id="backdrop" hidden>
      <section id="panel" role="dialog" aria-modal="true" aria-labelledby="heading">
        <header><div><h2 id="heading">妙手商品图片下载器</h2><p class="muted">产品图片 / 产品描述 · 分区选择，分类保存</p></div><button id="close" aria-label="关闭面板">关闭</button></header>
        <div id="settings">
          <div class="row"><button id="choose">选择总文件夹</button><span id="root-name" class="muted">尚未选择；也可以在下载时选择</span></div>
          <label class="row">网页总文件夹 <input id="folder" type="text" maxlength="100" aria-label="网页文件夹名称"></label>
          <div class="row"><button id="rescan">重新扫描</button><input id="search" type="search" placeholder="搜索名称、网址，或输入“产品图片 / 产品描述”" aria-label="搜索图片"></div>
          <div class="row"><button id="all">全选当前结果</button><button id="none">全部取消</button><button id="invert">反选当前结果</button><span id="count" class="muted"></span></div>
          <div id="scope-info" class="muted">采集范围固定：产品图片、产品描述。请先打开一个商品的编辑窗口。</div>
          <div class="muted">保存结构：网页总文件夹 / 产品图片、产品描述。两个分区独立勾选、独立编号。切换商品后请重新扫描。</div>
        </div>
        <div id="grid"></div>
        <footer><div id="status" role="status" aria-live="polite">请选择图片。</div><progress id="progress" max="1" value="0" hidden></progress>
          <div class="row"><button id="save" class="primary">保存到文件夹</button><button id="zip">打包下载 ZIP</button><button id="stop" hidden>停止</button><a id="zip-link" hidden>再次下载 ZIP</a></div>
          <div id="logs" hidden></div>
        </footer>
      </section>
    </div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => ui.getElementById(id);
  const status = (text) => { $('status').textContent = text; };

  function cleanName(text, max = 80) {
    let value = String(text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
    value = Array.from(value).slice(0, max).join('').replace(/[. ]+$/g, '');
    if (!value || /^\.+$/.test(value)) value = '未命名';
    if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(value)) value = '_' + value;
    return value;
  }

  function hash(text) {
    let h = 0x811c9dc5;
    for (const c of new TextEncoder().encode(text)) h = Math.imul(h ^ c, 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function defaultFolder(url, title) {
    return `${cleanName(title || location.hostname, 56)}_${hash(url)}`;
  }

  function imageURL(raw, base) {
    if (!raw || !String(raw).trim()) return null;
    try {
      const u = new URL(String(raw).trim(), base);
      if (/^https?:$/.test(u.protocol) || u.protocol === 'blob:' || /^data:image\//i.test(u.href)) return u.href;
    } catch { /* Invalid or non-image URL. */ }
    return null;
  }

  function bestSrcset(value) {
    if (!value) return '';
    // Preserve commas inside a URL (including data URLs); consume descriptors separately.
    const candidates = [];
    let rest = value.trim();
    while (rest) {
      rest = rest.replace(/^[\s,]+/, '');
      const match = rest.match(/^(\S+)/);
      if (!match) break;
      let url = match[1]; rest = rest.slice(url.length);
      if (url.endsWith(',')) { candidates.push({ url: url.replace(/,+$/, ''), size: 1 }); continue; }
      const comma = rest.indexOf(',');
      const descriptor = comma < 0 ? rest : rest.slice(0, comma);
      rest = comma < 0 ? '' : rest.slice(comma + 1);
      candidates.push({ url, size: Number(descriptor.trim().match(/^([\d.]+)[wx]$/)?.[1] || 1) });
    }
    return candidates.sort((a, b) => b.size - a.size)[0]?.url || '';
  }

  function urlLabel(url) {
    try {
      if (/^(data|blob):/.test(url)) return '内嵌图片';
      return decodeURIComponent(new URL(url).pathname.split('/').pop()) || '图片';
    } catch { return '图片'; }
  }

  function directImageLink(value) {
    try { return /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?|heic|heif)$/i.test(new URL(value).pathname); }
    catch { return false; }
  }

  function collectRoots(root, roots = []) {
    roots.push(root);
    for (const el of root.querySelectorAll('*')) {
      if (el === host) continue;
      if (el.shadowRoot) collectRoots(el.shadowRoot, roots);
      if (el.tagName === 'IFRAME') {
        try { if (el.contentDocument?.documentElement) collectRoots(el.contentDocument, roots); }
        catch { /* Cross-origin frames are inaccessible. */ }
      }
    }
    return roots;
  }

  function isRendered(element) {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const view = element.ownerDocument.defaultView;
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    try { if (view.frameElement && !isRendered(view.frameElement)) return false; }
    catch { return false; }
    return true;
  }

  // These are the site's component boundaries, verified from its public frontend
  // bundles. Never fall back to document-wide images if the markup changes.
  function targetScopes() {
    const galleries = new Set(), descriptions = new Set();
    for (const root of collectRoots(document)) {
      for (const gallery of root.querySelectorAll('.product-picture-list')) {
        if (!isRendered(gallery)) continue;
        const header = gallery.querySelector('.product-pucture-header');
        const label = (header?.firstElementChild?.textContent || '').replace(/\s/g, '');
        if (/^[*＊]?产品图片(?:[（(:：]|$)/.test(label)) galleries.add(gallery);
      }
      for (const field of root.querySelectorAll('.notes-form-item')) {
        if (!isRendered(field)) continue;
        for (const editor of field.querySelectorAll('.tinymce-container')) {
          if (isRendered(editor)) descriptions.add(editor);
        }
      }
    }
    if (galleries.size > 1 || descriptions.size > 1) {
      throw new Error('检测到多个商品编辑区域，请仅保留一个商品编辑窗口后重新扫描。');
    }
    const scopes = [], messages = [], containers = [...galleries, ...descriptions];
    for (const gallery of galleries) {
      // The add-image tile, picture toolbar and any popover previews are excluded.
      const list = gallery.querySelector('.picture-draggable-list');
      if (list) scopes.push({ root:list, group:'产品图片', selector:'.product-picture-item-img img, img.product-picture-item-img' });
      else messages.push('产品图片列表尚未加载');
    }
    if (!galleries.size) messages.push('未找到“产品图片”栏目');
    for (const editor of descriptions) {
      let bodyFound = false;
      for (const frame of editor.querySelectorAll('.tox-edit-area iframe, iframe.tox-edit-area__iframe')) {
        try {
          const body = frame.contentDocument?.body;
          if (body) {
            scopes.push({ root:body, group:'产品描述', selector:'img' });
            bodyFound = true;
          }
        } catch { /* Only a same-origin editor can be inspected. */ }
      }
      if (!bodyFound) {
        for (const body of editor.querySelectorAll('[contenteditable="true"].mce-content-body')) {
          scopes.push({ root:body, group:'产品描述', selector:'img' }); bodyFound = true;
        }
      }
      if (!bodyFound) {
        const thumbnails = editor.querySelector('.thumbnail-box .picture-draggable-list');
        if (thumbnails) {
          scopes.push({ root:thumbnails, group:'产品描述', selector:'.product-picture-item-img img, img.product-picture-item-img' });
          messages.push('描述编辑器暂不可读，使用描述侧栏图片');
        } else messages.push('产品描述编辑器尚未加载或不可访问');
      }
    }
    if (!descriptions.size) messages.push('未找到“产品描述”栏目');
    return { scopes, messages, containers };
  }

  function readScopeSnapshot() {
    const targets = targetScopes();
    const found = new Map();
    for (const scope of targets.scopes) {
      for (const img of scope.root.querySelectorAll(scope.selector)) {
        // Select only the actual card image; never icon images in its toolbar.
        if (img.closest('.operate-btn-group, .operation-bar, .add-image-box, .tox-toolbar')) continue;
        const link = img.closest('a[href]')?.href;
        const raws = [link && directImageLink(link) ? link : '',
          ...['data-original', 'data-full', 'data-large', 'data-actualsrc', 'data-src', 'data-lazy-src'].map(k => img.getAttribute(k)),
          bestSrcset(img.getAttribute('data-srcset')) || bestSrcset(img.getAttribute('srcset')),
          img.currentSrc, img.getAttribute('src'), img.getAttribute('data-mce-src')];
        const base = img.baseURI && !/^(about|data):/.test(img.baseURI) ? img.baseURI : location.href;
        const urls = [...new Set(raws.map(raw => imageURL(raw, base)).filter(Boolean))];
        if (!urls.length) continue;
        // Deduplicate within each category, but retain a separate selectable copy
        // when the same URL belongs to both product photos and the description.
        const key = JSON.stringify([scope.group, urls[0]]), existing = found.get(key);
        if (existing) {
          if (!existing.groups.includes(scope.group)) existing.groups.push(scope.group);
          existing.urls = [...new Set([...existing.urls, ...urls])];
          continue;
        }
        found.set(key, { key, urls, groups:[scope.group], label:img.alt || img.title || urlLabel(urls[0]),
          preview:imageURL(img.currentSrc || img.src, base) || urls[0],
          width:img.naturalWidth || 0, height:img.naturalHeight || 0 });
      }
    }
    const images = [...found.values()];
    return { ...targets, images, fingerprint:JSON.stringify(images.map(item => [item.urls, item.groups])) };
  }

  async function scan() {
    if (state.busy || state.scanning) return;
    state.scanning = true; $('rescan').disabled = true;
    status('正在扫描产品图片和产品描述…');
    try {
      const url = location.href;
      if (url !== state.pageURL) {
        state.selected.clear(); state.images = []; $('search').value = '';
        state.pageURL = url; state.pageTitle = document.title;
        $('folder').value = defaultFolder(url, state.pageTitle);
      }
      const snapshot = readScopeSnapshot();
      state.images = snapshot.images;
      state.scopeFingerprint = snapshot.fingerprint;
      state.scopeContainers = snapshot.containers;
      // A different product may reuse the same URL and DOM. Drop stale results.
      const keys = new Set(state.images.map(item => item.key));
      state.selected = new Set([...state.selected].filter(key => keys.has(key)));
      const mainCount = state.images.filter(item => item.groups.includes('产品图片')).length;
      const descCount = state.images.filter(item => item.groups.includes('产品描述')).length;
      $('scope-info').textContent = `产品图片 ${mainCount} 张 · 产品描述 ${descCount} 张 · 合计 ${state.images.length} 张（区内去重）`;
      render();
      status(snapshot.messages.length ? snapshot.messages.join('；') + '。仅显示已识别区域中的图片。' : `已限定两个栏目，找到 ${state.images.length} 张图片。勾选后保存。`);
    } catch (error) {
      state.images = []; state.selected.clear(); state.scopeFingerprint = ''; state.scopeContainers = [];
      $('scope-info').textContent = '采集范围未确认，没有采集其他区域。'; render();
      status(`扫描失败：${error.message}`);
    }
    finally { state.scanning = false; $('rescan').disabled = false; }
  }

  function visibleImages() {
    const query = $('search').value.trim().toLowerCase();
    return state.images.filter(item => !query || `${item.groups.join(' ')} ${item.label} ${item.key}`.toLowerCase().includes(query));
  }

  function updateCount() {
    $('count').textContent = `共 ${state.images.length} 张 · 当前 ${visibleImages().length} 张 · 已选 ${state.selected.size} 张`;
    for (const section of $('grid').querySelectorAll('.image-section')) {
      const group = section.dataset.group;
      const items = state.images.filter(item => item.groups.includes(group));
      const shown = visibleImages().filter(item => item.groups.includes(group));
      section.querySelector('.section-count').textContent = `共 ${items.length} 张 · 当前 ${shown.length} 张 · 已选 ${items.filter(item => state.selected.has(item.key)).length} 张`;
    }
    $('save').disabled = state.busy || !state.selected.size || !canPick;
    $('zip').disabled = state.busy || !state.selected.size;
  }

  function render() {
    const scrollPositions = new Map([...$('grid').querySelectorAll('.image-section')].map(section => [section.dataset.group, section.querySelector('.group-grid').scrollTop]));
    const fragment = document.createDocumentFragment();
    for (const group of GROUPS) {
      const section = document.createElement('section'); section.className = 'image-section'; section.dataset.group = group; section.setAttribute('aria-label', group);
      const head = document.createElement('div'); head.className = 'section-head';
      const heading = document.createElement('h3'); heading.textContent = group;
      const count = document.createElement('div'); count.className = 'section-count muted';
      const actions = document.createElement('div'); actions.className = 'section-actions';
      const select = document.createElement('button'); select.textContent = '全选本区结果'; select.disabled = state.busy;
      select.addEventListener('click', () => { visibleImages().filter(item => item.groups.includes(group)).forEach(item => state.selected.add(item.key)); render(); });
      const clear = document.createElement('button'); clear.textContent = '取消本区'; clear.disabled = state.busy;
      clear.addEventListener('click', () => { state.images.filter(item => item.groups.includes(group)).forEach(item => state.selected.delete(item.key)); render(); });
      actions.append(select, clear); head.append(heading, count, actions);
      const grid = document.createElement('div'); grid.className = 'group-grid';
      for (const item of visibleImages().filter(item => item.groups.includes(group))) {
        const label = document.createElement('label'); label.className = 'card'; label.title = item.urls[0];
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(item.key); checkbox.disabled = state.busy;
        checkbox.setAttribute('aria-label', `选择 ${group} ${item.label}`);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) state.selected.add(item.key); else state.selected.delete(item.key);
          updateCount();
        });
        const thumb = document.createElement('div'); thumb.className = 'thumb';
        const img = document.createElement('img'); img.loading = 'lazy'; img.alt = item.label; img.src = item.preview;
        // A broken preview doesn't prevent downloading through the extension.
        img.addEventListener('error', () => { img.alt = '预览不可用，仍可尝试下载'; }, { once: true });
        thumb.append(img);
        const caption = document.createElement('div'); caption.className = 'caption';
        const name = document.createElement('div'); name.className = 'name'; name.textContent = item.label;
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.textContent = item.groups.join(' / ') + (item.width && item.height ? ` · ${item.width} × ${item.height}` : '');
        caption.append(name, meta); label.append(checkbox, thumb, caption); grid.append(label);
      }
      if (!grid.childNodes.length) {
        const empty = document.createElement('div'); empty.className = 'empty';
        empty.textContent = $('search').value.trim() ? '本区没有匹配搜索条件的图片。' : `未找到${group}。请等待商品编辑区域加载后重新扫描。`;
        grid.append(empty);
      }
      section.append(head, grid); fragment.append(section);
    }
    $('grid').replaceChildren(fragment);
    for (const section of $('grid').querySelectorAll('.image-section')) section.querySelector('.group-grid').scrollTop = scrollPositions.get(section.dataset.group) || 0;
    updateCount();
  }

  function setBusy(value) {
    state.busy = value;
    for (const id of ['choose','folder','rescan','all','none','invert','search']) $(id).disabled = value;
    if (!canPick) $('choose').disabled = true;
    for (const control of $('grid').querySelectorAll('input,button')) control.disabled = value;
    $('stop').hidden = !value; $('progress').hidden = !value; updateCount();
  }

  async function chooseRoot() {
    const handle = await window.showDirectoryPicker({ id: 'page-image-saver', mode: 'readwrite', startIn: 'pictures' });
    state.root = handle;
    $('root-name').textContent = `总文件夹：${handle.name}（当前标签页内记住）`;
    return handle;
  }

  function requestBlob(url) {
    return new Promise((resolve, reject) => {
      let done = false;
      let abortTransport = () => {};
      let timer;
      const finish = (fn, value) => {
        if (done) return;
        done = true; clearTimeout(timer); state.abort = null; fn(value);
      };
      state.abort = () => { finish(reject, new Error('已停止')); abortTransport(); };
      timer = setTimeout(() => { finish(reject, new Error('下载超时（45 秒）')); abortTransport(); }, 45000);
      if (/^(blob|data):/.test(url)) {
        const controller = new AbortController(); abortTransport = () => controller.abort();
        fetch(url, { signal: controller.signal }).then(async response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          finish(resolve, await response.blob());
        }).catch(error => finish(reject, error));
        return;
      }
      try {
        if (typeof GM_xmlhttpRequest !== 'function') throw new Error('请通过油猴或暴力猴运行此脚本');
        const request = GM_xmlhttpRequest({
          method: 'GET', url, responseType: 'blob', timeout: 45000,
          onload(response) {
            if (response.status < 200 || response.status >= 300) { finish(reject, new Error(`HTTP ${response.status}`)); return; }
            const blob = response.response;
            if (!blob || typeof blob.arrayBuffer !== 'function') { finish(reject, new Error('未收到图片数据')); return; }
            finish(resolve, blob);
          },
          onerror: () => finish(reject, new Error('请求失败，请检查网络或脚本的跨域访问授权')),
          ontimeout: () => finish(reject, new Error('下载超时（45 秒）')),
          onabort: () => finish(reject, new Error('请求已取消')),
        });
        abortTransport = () => request?.abort();
      } catch (error) { finish(reject, error); }
    });
  }

  async function imageExtension(blob) {
    if (!blob.size) throw new Error('收到空文件');
    const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    const ascii = new TextDecoder().decode(bytes);
    if (bytes[0] === 0x89 && ascii.slice(1,4) === 'PNG') return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (/^GIF8[79]a/.test(ascii)) return 'gif';
    if (ascii.startsWith('RIFF') && ascii.slice(8,12) === 'WEBP') return 'webp';
    if (ascii.startsWith('BM')) return 'bmp';
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'ico';
    if (ascii.startsWith('II*\0') || ascii.startsWith('MM\0*')) return 'tiff';
    if (ascii.slice(4,8) === 'ftyp') {
      if (/avif|avis/.test(ascii.slice(8,64))) return 'avif';
      if (/heic|heix|hevc|hevx/.test(ascii.slice(8,64))) return 'heic';
      if (/mif1|msf1/.test(ascii.slice(8,64))) return 'heif';
    }
    const mime = (blob.type || '').split(';')[0].toLowerCase();
    if (/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(ascii) || mime === 'text/html' || mime === 'application/json') throw new Error('服务器返回了网页或错误信息，不是图片');
    if (mime === 'image/svg+xml' || /<svg[\s>]/i.test(ascii)) {
      const xml = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
      if (xml.documentElement.localName === 'svg' && !xml.querySelector('parsererror')) return 'svg';
      throw new Error('SVG 内容无效');
    }
    throw new Error('无法识别图片内容，可能是登录页或防盗链响应');
  }

  async function fetchImage(item) {
    let lastError;
    for (const url of item.urls) {
      if (state.cancelled) throw new Error('已停止');
      try {
        const blob = await requestBlob(url);
        const extension = await imageExtension(blob);
        return { blob, extension, url };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('没有可用图片地址');
  }

  async function uniqueFile(directory, filename) {
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0,dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : '';
    for (let n = 0; n < 10000; n++) {
      const candidate = n ? `${stem} (${n})${ext}` : filename;
      try { await directory.getFileHandle(candidate); }
      catch (error) {
        if (error.name === 'NotFoundError') return { handle: await directory.getFileHandle(candidate, { create: true }), name: candidate };
        if (error.name === 'TypeMismatchError') continue;
        throw error;
      }
    }
    throw new Error('同名文件过多，请更换网页文件夹名称');
  }

  async function writeFile(directory, filename, blob) {
    const file = await uniqueFile(directory, filename);
    let writable;
    try {
      writable = await file.handle.createWritable(); await writable.write(blob); await writable.close();
      return file.name;
    } catch (error) {
      try { await writable?.abort(); } catch { /* Already closed. */ }
      throw error;
    }
  }

  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let k=0;k<8;k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  async function crc32(blob) {
    let crc = 0xffffffff, processed = 0;
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        if (state.cancelled) throw new Error('已停止');
        for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        processed += value.length;
        if (processed >= 4*1024*1024) {
          processed = 0;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } finally { reader.releaseLock(); }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ZIP STORE with UTF-8 filenames; images are already compressed. No CDN dependency.
  async function makeZip(entries) {
    if (entries.length > 65535) throw new Error('ZIP 文件数量超过限制');
    const localParts = [], centralParts = []; let offset = 0, centralSize = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((Math.max(1980, Math.min(2107, now.getFullYear())) - 1980) << 9) | ((now.getMonth()+1) << 5) | now.getDate();
    for (const entry of entries) {
      const name = new TextEncoder().encode(entry.name);
      if (name.length > 65535 || entry.blob.size > 0xffffffff) throw new Error('ZIP 文件过大，请改用保存到文件夹');
      const crc = await crc32(entry.blob);
      const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true);
      l.setUint16(10,time,true); l.setUint16(12,date,true); l.setUint32(14,crc,true);
      l.setUint32(18,entry.blob.size,true); l.setUint32(22,entry.blob.size,true); l.setUint16(26,name.length,true); local.set(name,30);
      const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true);
      c.setUint16(12,time,true); c.setUint16(14,date,true); c.setUint32(16,crc,true);
      c.setUint32(20,entry.blob.size,true); c.setUint32(24,entry.blob.size,true); c.setUint16(28,name.length,true);
      if (entry.directory) c.setUint32(38,0x10,true);
      c.setUint32(42,offset,true); central.set(name,46);
      localParts.push(local,entry.blob); centralParts.push(central);
      offset += local.length + entry.blob.size; centralSize += central.length;
      if (offset + centralSize > 0xffffffff) throw new Error('ZIP 超过 4 GB，请改用保存到文件夹');
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true);
    e.setUint32(12,centralSize,true); e.setUint32(16,offset,true);
    return new Blob([...localParts,...centralParts,end], { type:'application/zip' });
  }

  async function download(mode) {
    if (state.busy || state.scanning) return;
    if (location.href !== state.pageURL) { await scan(); status('网页地址已变化，已重新扫描，请重新选择图片。'); return; }
    try {
      const current = readScopeSnapshot();
      if (current.fingerprint !== state.scopeFingerprint || current.containers.length !== state.scopeContainers.length || current.containers.some((node,i) => node !== state.scopeContainers[i])) {
        state.selected.clear(); await scan();
        status('商品或图片已变化，已更新列表，请重新勾选后下载。'); return;
      }
    } catch (error) { state.selected.clear(); await scan(); return; }
    const items = state.images.filter(item => state.selected.has(item.key));
    if (!items.length) { status('请先勾选图片。'); return; }
    const folder = cleanName($('folder').value || defaultFolder(state.pageURL, state.pageTitle),100);
    $('folder').value = folder;
    state.cancelled = false; setBusy(true);
    $('progress').max = items.length; $('progress').value = 0;
    $('logs').textContent = ''; $('logs').hidden = true; $('zip-link').hidden = true;
    let successes = 0, failures = 0, attempted = 0, directory;
    const directories = new Map(), groupIndices = new Map(GROUPS.map(group => [group,0]));
    // Explicit directory records keep both subfolders even if only one is selected.
    const entries = GROUPS.map(group => ({ name:`${folder}/${group}/`, blob:new Blob([]), directory:true })), errors = []; let zipBytes = 0;
    try {
      if (mode === 'folder') {
        if (!canPick) throw new Error('此页面不能直接选择文件夹，请使用 ZIP');
        // Invoke permission UI before any network work, while the click is active.
        const root = state.root || await chooseRoot();
        if (state.root && typeof root.requestPermission === 'function' && await root.requestPermission({ mode:'readwrite' }) !== 'granted') throw new Error('未取得写入权限，请点击“选择总文件夹”重新授权');
        if (state.cancelled) throw new Error('已停止');
        directory = await root.getDirectoryHandle(folder, { create: true });
        for (const group of GROUPS) directories.set(group, await directory.getDirectoryHandle(group, { create:true }));
      }
      for (let i=0;i<items.length;i++) {
        if (state.cancelled) break;
        const group = items[i].groups[0];
        const groupIndex = groupIndices.get(group) + 1; groupIndices.set(group, groupIndex);
        status(`正在${mode === 'folder' ? '保存' : '准备'} ${i+1}/${items.length} · ${group}：${items[i].label}`);
        try {
          const result = await fetchImage(items[i]);
          if (state.cancelled) break;
          let base = urlLabel(result.url).replace(/\.[a-z0-9]{1,6}$/i, '');
          base = cleanName(base,64);
          const filename = `${String(groupIndex).padStart(4,'0')}_${base}.${result.extension}`;
          if (mode === 'folder') await writeFile(directories.get(group), filename, result.blob);
          else {
            if (zipBytes + result.blob.size > 512*1024*1024) throw new Error('ZIP 已达到 512 MB 内存保护上限，请分批下载或保存到文件夹');
            entries.push({ name:`${folder}/${group}/${filename}`, blob:result.blob }); zipBytes += result.blob.size;
          }
          successes++;
        } catch (error) {
          if (state.cancelled) break;
          failures++;
          const message = `${i+1}. ${group} / ${items[i].label}：${error.message}`;
          errors.push(message); $('logs').hidden = false; $('logs').textContent = errors.join('\n');
        }
        attempted++; $('progress').value = i+1;
      }
      if (mode === 'zip' && successes && !state.cancelled) {
        status(`正在打包 ${successes} 张图片…`);
        const zip = await makeZip(entries);
        if (state.cancelled) throw new Error('已停止');
        if (state.zipURL) URL.revokeObjectURL(state.zipURL);
        state.zipURL = URL.createObjectURL(zip);
        const link = $('zip-link'); link.href = state.zipURL; link.download = folder + '.zip'; link.hidden = false; link.click();
      }
      if (state.cancelled) {
        status(mode === 'folder' ? `已停止。已保存 ${successes} 张，失败 ${failures} 张，未完成 ${items.length-attempted} 张。` : '已停止，未生成 ZIP；可以重新勾选后打包。');
      } else if (mode === 'folder') {
        status(`完成：成功 ${successes} 张，失败 ${failures} 张。位置：${state.root.name}/${folder}`);
      } else {
        status(successes ? `ZIP 已生成（${successes} 张成功，${failures} 张失败）。请查看浏览器下载；如未开始，可点击“再次下载 ZIP”。` : `没有图片可打包，失败 ${failures} 张。`);
      }
    } catch (error) {
      status(state.cancelled ? (mode === 'zip' ? '已停止，未生成 ZIP。' : `已停止，已保存 ${successes} 张。`) : error.name === 'AbortError' ? '已取消文件夹选择。' : `操作失败：${error.message}`);
    } finally { state.abort = null; setBusy(false); }
  }

  let lastFocus = null;
  async function open() {
    lastFocus = document.activeElement;
    $('backdrop').hidden = false; $('launcher').hidden = true; $('close').focus();
    if (!state.busy) await scan();
  }
  function close() {
    $('backdrop').hidden = true; $('launcher').hidden = false;
    if (lastFocus?.isConnected) lastFocus.focus();
  }
  $('launcher').addEventListener('click', open);
  $('close').addEventListener('click', close);
  $('rescan').addEventListener('click', scan);
  $('search').addEventListener('input', render);
  $('all').addEventListener('click', () => { visibleImages().forEach(item => state.selected.add(item.key)); render(); });
  $('none').addEventListener('click', () => { state.selected.clear(); render(); });
  $('invert').addEventListener('click', () => { visibleImages().forEach(item => state.selected.has(item.key) ? state.selected.delete(item.key) : state.selected.add(item.key)); render(); });
  $('choose').addEventListener('click', async () => {
    try { await chooseRoot(); status('文件夹已选择，勾选图片后点击“保存到文件夹”。'); }
    catch (error) { status(error.name === 'AbortError' ? '已取消文件夹选择。' : `无法选择文件夹：${error.message}。可使用 ZIP 下载。`); }
  });
  $('save').addEventListener('click', () => download('folder'));
  $('zip').addEventListener('click', () => download('zip'));
  $('stop').addEventListener('click', () => { state.cancelled = true; state.abort?.(); status('正在停止…'); });
  ui.addEventListener('keydown', event => {
    if ($('backdrop').hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const nodes = [...$('panel').querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(el => !el.hidden && el.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && ui.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && ui.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  if (!canPick) {
    $('choose').disabled = true;
    $('root-name').textContent = '当前页面不支持直接选择文件夹。请使用 ZIP，解压后每个网页仍是独立文件夹。';
  }
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开网页图片下载器', open);
  updateCount();
})();
