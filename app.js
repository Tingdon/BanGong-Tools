/* 纯浏览器端生成：模板 DOCX 脱壳 → 替换段落/图片 → 重新打包
   依赖：JSZip（vendor/jszip.min.js）
   不联网、不上传，所有处理在本机完成。 */
(function (global) {
  'use strict';

  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';
  const MAX_W = 5266690;            // 母版图片框宽度 EMU（约 14.6cm）
  const TEMPLATE_URL = 'template.docx';

  let tplBuf = null;

  function isEl(n) { return n && n.nodeType === 1; }
  function kids(parent) {
    return Array.prototype.filter.call(parent.childNodes, function (n) {
      return isEl(n) && n.namespaceURI === NS_W && n.localName === 'p';
    });
  }
  function randId() {
    const h = '0123456789ABCDEF';
    let s = '';
    for (let i = 0; i < 8; i++) s += h[Math.floor(Math.random() * 16)];
    return s;
  }
  function resetIds(el) {
    try {
      el.setAttributeNS(NS_W14, 'w14:paraId', randId());
      el.setAttributeNS(NS_W14, 'w14:textId', randId());
    } catch (e) { /* 老模板没有 w14，忽略 */ }
  }

  function setParagraphText(p, text, dom) {
    const runs = Array.prototype.filter.call(p.childNodes, function (n) {
      return isEl(n) && n.namespaceURI === NS_W && n.localName === 'r';
    });
    let keeper = null;
    runs.forEach(function (r) {
      if (r.getElementsByTagNameNS(NS_WP, 'drawing').length) return; // 图片 run 保留
      if (!keeper) { keeper = r; return; }
      p.removeChild(r);
    });
    if (!keeper) return p;
    let t = null;
    for (const c of Array.prototype.slice.call(keeper.childNodes)) {
      if (isEl(c) && c.namespaceURI === NS_W && c.localName === 't') { t = c; break; }
    }
    if (!t) {
      t = dom.createElementNS(NS_W, 'w:t');
      keeper.appendChild(t);
    }
    t.textContent = text;
    t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    return p;
  }

  function safeName(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '') || '未命名';
  }

  async function loadTemplate() {
    if (tplBuf) return tplBuf;
    const res = await fetch(TEMPLATE_URL, { cache: 'force-cache' });
    if (!res.ok) throw new Error('模板加载失败（template.docx）');
    tplBuf = await res.arrayBuffer();
    return tplBuf;
  }

  /* 图片统一成 JPEG 字节 + 尺寸；JPEG 原样保留不重编码 */
  async function prepareImage(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const isJpeg = u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xD8;
    let bmp;
    try {
      bmp = await createImageBitmap(new Blob([buf], { type: file.type || 'image/jpeg' }));
    } catch (e) {
      throw new Error('图片无法识别：' + (file.name || '未命名'));
    }
    const w = bmp.width, h = bmp.height;
    let bytes;
    if (isJpeg) {
      bytes = u8;
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const blob = await new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', 0.95); });
      bytes = new Uint8Array(await blob.arrayBuffer());
    }
    if (bmp.close) bmp.close();
    return { bytes: bytes, w: w, h: h };
  }

  async function buildDocxBlob(opt) {
    const tpl = await loadTemplate();
    const zip = await JSZip.loadAsync(tpl);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('模板缺少 word/document.xml');
    const xml = await docFile.async('string');

    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    if (dom.getElementsByTagName('parsererror').length) throw new Error('模板 XML 解析失败');

    const body = dom.getElementsByTagNameNS(NS_W, 'body')[0];
    if (!body) throw new Error('模板缺少 w:body');
    const sect = Array.prototype.filter.call(body.childNodes, function (n) {
      return isEl(n) && n.namespaceURI === NS_W && n.localName === 'sectPr';
    })[0] || null;

    const ps = kids(body);
    if (ps.length < 14) throw new Error('模板段落结构异常（需要 ≥14 段）');
    const snap = ps.map(function (p) { return p.cloneNode(true); });
    ps.forEach(function (p) { body.removeChild(p); });

    function add(idx, text) {
      const el = snap[idx].cloneNode(true);
      resetIds(el);
      if (text !== undefined) setParagraphText(el, text, dom);
      if (sect) body.insertBefore(el, sect); else body.appendChild(el);
      return el;
    }

    add(0, opt.title);
    add(1);
    add(2);
    opt.paras.forEach(function (t, i) { add(i === 0 ? 3 : 4, t); });
    add(10);
    add(11);
    const picEl = add(12);
    opt.signs.forEach(function (s) { add(13, s); });
    add(19);

    /* 图片：按比例设定显示尺寸 */
    const cx = MAX_W;
    const cy = Math.round(cx * opt.imgH / opt.imgW);
    Array.prototype.slice.call(picEl.getElementsByTagName('*')).forEach(function (el) {
      const ln = el.localName;
      if (ln === 'extent' || ln === 'ext') {
        el.setAttribute('cx', String(cx));
        el.setAttribute('cy', String(cy));
      } else if (ln === 'srcRect') {
        el.parentNode.removeChild(el);
      }
    });


    /* 序列化回 document.xml */
    let out = new XMLSerializer().serializeToString(dom);
    if (!/^<\?xml/.test(out)) {
      out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
    }
    zip.file('word/document.xml', out);

    /* 替换媒体文件 */
    const mediaName = Object.keys(zip.files).filter(function (n) {
      return /^word\/media\/[^/]+\.(jpe?g|png)$/i.test(n);
    })[0];
    if (!mediaName) throw new Error('模板里没有图片位（word/media）');
    zip.file(mediaName, opt.imgBytes);


    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
  }

  async function buildPackageZip(docxBlob, photos, folder, docxName) {
    const z = new JSZip();
    z.file(folder + '/' + docxName, docxBlob);
    photos.forEach(function (p) { z.file(folder + '/活动照片/' + p.name, p.bytes); });
    return z.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
  }

  global.DocGen = {
    loadTemplate: loadTemplate,
    prepareImage: prepareImage,
    buildDocxBlob: buildDocxBlob,
    buildPackageZip: buildPackageZip,
    safeName: safeName
  };
})(window);
