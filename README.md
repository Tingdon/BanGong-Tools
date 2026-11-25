# 图文排版生成器（静态版）

丢图片、填标题正文、署名直接粘贴 → 一键生成和模板一模一样的 DOCX，并把照片一起打包成 ZIP。

**纯静态**：没有后端、没有数据库、不上传任何图片，全部在浏览器里完成。

---

## 用法

1. 左侧拖入照片（可点选、可 Ctrl+V 粘贴截图），拖缩略图排序；**最后一张**会插进文档正文末尾，其余照片打进 `活动照片/`。
2. 填标题（`|` 会自动换成空格，因为 Windows 文件名不允许）、日期前缀。
3. 正文一行一段，自动首行缩进两字符。
4. 署名：把公众号末尾那几行**整段粘进署名框**即可——横排连成一行、带不带冒号、空格/竖线/顿号分隔都能自动断成多行；「出品」默认丢掉。
5. 点「生成文档」→ 下载 ZIP 包或仅 DOCX。

生成结构：

```
20261106标题……/
  ├ 标题…….docx          ← 标题 + 正文 + 末图 + 署名
  └ 活动照片/
      ├ IMG-20261106-01.jpg
      └ IMG-20261106-02.jpg
```

## 水印

**网站水印（布局的一部分，默认开启）**

1. 整页斜向平铺的浅红字「26级工业机器人三班苗兴旺制作」，`pointer-events:none`，不挡任何操作；
2. 页头右上角一枚圆角徽标，同一句话；
3. 页脚末尾也署同一句。

改文字/颜色/疏密：

```js
// index.html → boot()
paintWatermark('26级工业机器人三班苗兴旺制作');
```
```css
/* style.css 末尾 */
.wm span{ font-size:13px; color:rgba(198,47,47,.075); }  /* 深浅 */
.wm{ gap:118px 46px; }                                    /* 疏密 */
```

> 生成的 DOCX **不带任何水印**，与母版完全一致。

## 排版怎么来的

不重画版式，而是**拿母版 docx 当模板**（`template.docx`）：

- 浏览器加载模板 → JSZip 解包
- 读 `word/document.xml`，克隆几段「样板段落」的 XML（标题 / 正文 / 图片 / 署名）
- 只替换文字、替换 `word/media` 里的图片字节、按原图比例改 `wp:extent`
- 重新打包成 docx

所以字体字号、行距、缩进、页面设置 100% 继承母版：标题黑体 16pt 加粗左对齐，正文微软雅黑 12pt 首行缩进 2 字符，署名微软雅黑 10pt 右对齐固定行距。

想换版式：直接替换 `template.docx` 即可，要求里面至少有「标题段、正文段、1 张图片、署名段」。

## 本地预览

```bash
python -m http.server 8800
# 打开 http://127.0.0.1:8800/
```

> 直接双击 `index.html`（`file://`）会失败：浏览器不允许 `file://` 下 fetch 本地 docx。

## 部署

- **Cloudflare Pages**：连本仓库 → Framework preset `None` → Build command 留空 → Build output directory `/`
- **GitHub Pages**：Settings → Pages → Source `Deploy from a branch` → `main` / `(root)`（已带 `.nojekyll`）
- **Cloudflare Workers（静态资源）**：用上级目录的 `wrangler.toml`，`npx wrangler deploy`

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 页面与交互（含署名解析） |
| `style.css` | 样式 |
| `app.js` | 生成核心：模板脱壳 → 改 XML → 重打包 |
| `template.docx` | 母版，12.6 KB（已把示例图换成占位图，生成时会替换成你的照片） |
| `vendor/jszip.min.js` | JSZip 3.10.1（本地自带，不走 CDN） |
| `_headers` | Cloudflare 响应头（缓存策略） |
| `.nojekyll` | GitHub Pages 跳过 Jekyll |
| `robots.txt` | 禁止搜索引擎收录 |

## 图片处理

- JPG：**原样字节写入**，不重编码、不压缩。
- PNG / WEBP / BMP：canvas 转 JPEG（质量 0.95）。
- 文档里只嵌「末图」原图，其余照片留在 `活动照片/` 里。
