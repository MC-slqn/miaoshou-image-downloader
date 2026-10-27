const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = path.join(__dirname, '..', 'miaoshou-image-downloader.user.js');
const output = path.join(__dirname, '..', 'test-results');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#306edd"/><text x="90" y="400" fill="white" font-size="70">Product image</text></svg>';
const requests = [];
const card = (prefix,n) => `<div class="product-picture-item"><div class="product-picture-item-img"><img src="/${prefix}-${n}.svg" alt="${prefix}-${n}"></div><div class="operate-btn-group"><img src="/toolbar-${n}.svg"></div></div>`;
const gallery = (label,prefix,count,attr='') => `<div class="product-picture-list" ${attr}><div class="product-pucture-header"><span><span>* ${label}</span><span>（当前 ${count} 张，已选 ${count} 张）</span></span><div class="operation-bar"><img src="/translate-icon.svg"></div></div><div class="picture-draggable-list">${Array.from({length:count},(_,i)=>card(prefix,i+1)).join('')}<div class="add-image-box"><img src="/add.svg"></div></div></div>`;
const html = `<!doctype html><meta charset="utf-8"><title>商品测试</title><style>body{font-family:system-ui;margin:20px}img{width:70px;height:70px}.product-picture-item{display:inline-block}.operate-btn-group{display:none}.tinymce-container{width:900px;height:430px}.tox-edit-area{width:700px;float:left}.tox-edit-area iframe{width:690px;height:300px}.thumbnail-box{float:right;width:150px}.product-pucture-header{height:30px}</style>
<header><img src="/logo.svg"></header><aside><img src="/avatar.svg"></aside>
<div class="collection-items"><img src="/list-product.svg"></div>
<main id="edit-dialog"><h2>编辑商品</h2><div id="main-gallery">${gallery('产品图片','main',5)}</div>
${gallery('尺码表','size-chart',2)}${gallery('SKU图片','sku',3)}
<div class="notes-form-item"><label>产品描述</label><div class="tinymce-container"><div class="tox-toolbar"><img src="/editor-toolbar.svg"></div><div class="tox-edit-area"><iframe id="description-frame" src="/editor"></iframe></div><div class="thumbnail-box"><div class="picture-draggable-list">${Array.from({length:10},(_,i)=>card('thumbnail',i+1)).join('')}</div></div></div></div>
<section class="source-data-layout"><h3>产品描述</h3><img src="/source-description.svg"></section>
<section><h3>产品资质</h3><img src="/certificate.svg"></section></main>
<div style="display:none">${gallery('产品图片','hidden-main',3)}<div class="notes-form-item"><div class="tinymce-container"><img src="/hidden-desc.svg"></div></div></div>`;
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname; requests.push(pathname);
  res.setHeader('Connection','close');
  if(pathname.endsWith('.svg')) {res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(svg);return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  if(pathname === '/editor') {res.end(`<body id="tinymce" class="mce-content-body" contenteditable="true">${Array.from({length:10},(_,i)=>`<p><img src="/detail-${i+1}.svg" alt="detail-${i+1}" width="800"></p>`).join('')}</body>`);return;}
  res.end(html);
});

(async()=>{
  await fs.mkdir(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
  try {
    const page = await browser.newPage({acceptDownloads:true,viewport:{width:1360,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/tiktok/collect_box/items`);
    await page.evaluate(async()=>{
      const attach=Element.prototype.attachShadow;
      Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.id==='page-image-saver-host')window.testUI=root;return root;};
      window.testRoot=await navigator.storage.getDirectory();
      window.showDirectoryPicker=async()=>window.testRoot;
      window.GM_registerMenuCommand=()=>{};
      window.savedRequests=[];
      window.GM_xmlhttpRequest=opts=>{
        window.savedRequests.push(opts.url);const controller=new AbortController();
        fetch(opts.url,{signal:controller.signal}).then(async r=>opts.onload({status:r.status,response:await r.blob()})).catch(()=>opts.onerror());
        return{abort:()=>controller.abort()};
      };
    });
    await page.addScriptTag({path:source});
    const click=id=>page.evaluate(id=>window.testUI.getElementById(id).click(),id);
    const text=id=>page.evaluate(id=>window.testUI.getElementById(id).textContent,id);
    const value=(id,v)=>page.evaluate(({id,v})=>{const el=window.testUI.getElementById(id);el.value=v;el.dispatchEvent(new Event('input'));},{id,v});
    const scan=async()=>{await click('rescan');await page.waitForFunction(()=>!window.testUI.getElementById('rescan').disabled);};
    const done=()=>page.waitForFunction(()=>window.testUI.getElementById('stop').hidden);
    const names=()=>page.evaluate(()=>[...window.testUI.querySelectorAll('.name')].map(n=>n.textContent));
    assert.equal(await page.evaluate(()=>getComputedStyle(window.testUI.getElementById('launcher')).bottom),'76px');
    await click('launcher');
    assert.match(await text('scope-info'),/产品图片 5 张 · 产品描述 10 张 · 合计 15 张/);
    assert.deepEqual(await page.evaluate(()=>[...window.testUI.querySelectorAll('.image-section h3')].map(el=>el.textContent)),['产品图片','产品描述']);
    assert.deepEqual(await names(),[...Array.from({length:5},(_,i)=>`main-${i+1}`),...Array.from({length:10},(_,i)=>`detail-${i+1}`)]);
    await value('search','产品图片');assert.equal((await names()).length,5);
    await value('search','产品描述');assert.equal((await names()).length,10);
    await value('search','');
    // Per-section bulk actions must not change the other category.
    await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品图片"] button').click());
    assert.match(await text('count'),/已选 5 张/);
    await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品描述"] button').click());
    assert.match(await text('count'),/已选 15 张/);
    await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品图片"] .section-actions button:last-child').click());
    assert.match(await text('count'),/已选 10 张/);
    await click('none');
    await page.evaluate(()=>{const boxes=window.testUI.querySelectorAll('.card input');for(const index of [0,5])boxes[index].click();});
    await value('folder','范围验证');await click('save');await done();
    assert.match(await text('status'),/成功 2 张，失败 0 张/);
    assert.deepEqual(await page.evaluate(()=>window.savedRequests.map(u=>new URL(u).pathname)),['/main-1.svg','/detail-1.svg']);
    const savedTree=await page.evaluate(async()=>{
      const folder=await window.testRoot.getDirectoryHandle('范围验证');const result={};
      for await(const [group,dir] of folder.entries()) {
        if(dir.kind!=='directory')throw new Error('Unexpected file at the outer folder');
        result[group]=[];for await(const [name,file]of dir.entries())result[group].push([name,(await file.getFile()).size]);
      }
      return result;
    });
    assert.deepEqual(Object.keys(savedTree).sort(),['产品图片','产品描述']);
    assert.equal(savedTree['产品图片'][0][0],'0001_main-1.svg');
    assert.equal(savedTree['产品描述'][0][0],'0001_detail-1.svg');
    assert(savedTree['产品图片'][0][1]>0 && savedTree['产品描述'][0][1]>0);
    await click('all');
    await page.screenshot({path:path.join(output,'panel.png')});
    const zipEvent=page.waitForEvent('download');await click('zip');
    const download=await zipEvent;await download.saveAs(path.join(output,'selected-regions.zip'));await done();
    assert.match(await text('status'),/15 张成功，0 张失败/);
    // A modal can switch products without changing location.href.
    const before=await page.evaluate(()=>window.savedRequests.length);
    await page.evaluate(()=>{const image=document.querySelector('#main-gallery .product-picture-item-img img');image.src='/new-product.svg';});
    await page.waitForFunction(()=>document.querySelector('#main-gallery .product-picture-item-img img').complete);
    await click('save');
    assert.match(await text('status'),/商品或图片已变化/);
    assert.match(await text('count'),/已选 0 张/);
    assert.equal(await page.evaluate(()=>window.savedRequests.length),before);
    // The same URL in two sections stays independently selectable and saveable.
    await page.evaluate(()=>{const doc=document.getElementById('description-frame').contentDocument;doc.querySelector('img').src='/new-product.svg';});
    await scan();assert.match(await text('scope-info'),/产品图片 5 张 · 产品描述 10 张 · 合计 15 张/);
    await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品图片"] .card input').click());
    assert.equal(await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品描述"] .card input').checked),false);
    await value('folder','单区验证');await click('save');await done();
    const emptyCount=await page.evaluate(async()=>{
      const outer=await window.testRoot.getDirectoryHandle('单区验证');const inner=await outer.getDirectoryHandle('产品描述');let n=0;for await(const entry of inner.entries())n++;return n;
    });
    assert.equal(emptyCount,0,'unselected category still has an empty subfolder');
    const singleZipEvent=page.waitForEvent('download');await click('zip');
    const singleZip=await singleZipEvent;await singleZip.saveAs(path.join(output,'single-category.zip'));await done();
    await page.evaluate(()=>window.testUI.querySelector('.image-section[data-group="产品描述"] .card input').click());
    await value('folder','共同图片验证');await click('save');await done();
    const sharedFiles=await page.evaluate(async()=>{
      const outer=await window.testRoot.getDirectoryHandle('共同图片验证');const names=[];
      for(const group of ['产品图片','产品描述']) {const inner=await outer.getDirectoryHandle(group);for await(const [name]of inner.entries())names.push(group+'/'+name);}
      return names;
    });
    assert.deepEqual(sharedFiles,['产品图片/0001_new-product.svg','产品描述/0001_new-product.svg']);
    // No editor body: read only the known description thumbnail rail.
    await page.evaluate(()=>document.getElementById('description-frame').remove());await scan();
    assert.match(await text('scope-info'),/合计 15 张/);
    assert((await names()).includes('thumbnail-10'));
    assert.match(await text('status'),/使用描述侧栏图片/);
    // A missing section is not replaced by any other image source.
    await page.evaluate(()=>document.querySelector('.notes-form-item').remove());await scan();
    assert.match(await text('scope-info'),/产品图片 5 张 · 产品描述 0 张/);
    await page.evaluate(()=>document.getElementById('main-gallery').remove());await scan();
    assert.equal((await names()).length,0);
    assert.match(await text('status'),/未找到“产品图片”/);
    // Duplicate live edit windows fail closed instead of mixing two products.
    await page.evaluate(markup=>{const el=document.createElement('div');el.innerHTML=markup+markup;document.body.append(el);},gallery('产品图片','ambiguous',1));
    await scan();assert.equal((await names()).length,0);assert.match(await text('status'),/多个商品编辑区域/);
    assert.deepEqual(errors,[]);
    const result={browser:await browser.version(),passed:['two separately selectable UI sections','per-section select/clear','5 product images + 10 description images','exclude unrelated and hidden images','prefer editor body over thumbnail duplicates','group search','selected-only filesystem save in two subfolders','independent numbering starts at 0001','ZIP of 15 allowed images','unselected category retains empty folder','same-URL product change invalidates selection','shared URL saved independently in both groups','description thumbnail fallback','missing/ambiguous sections fail closed','button remains 76px from bottom']};
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
