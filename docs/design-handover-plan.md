# Modernist 双语站 — 实施记录

来源：`design_handoff_yonder_site` 交接包（Claude Design）
状态：**一期已实施**（首页 / 案例库 / 案例详情，中英双语，共 22 个页面）

---

## 已锁定的决策

| # | 决定 |
| --- | --- |
| 10.1 | 旧站页面（services / insights / about / news / events）只从 footer 进入，nav 保持六项 |
| 10.2 | Stats band 照设计稿发布 |
| 10.3 | 案例库手风琴同时只展开一行 |
| 10.4 | 采用构建步骤（`tools/build.mjs`） |
| 10.5 | 旧 `cases/index.html` 与 `cases/viewer.html` 原样保留，功能不变 |
| 10.6 | 根目录 `/` 按浏览器语言分流 |
| 10.7 | 其余 30 多个页面暂时只有英文 |
| 10.8 | 联系表单进入新设计（见下） |

---

## 目录结构

```
content/                  内容源，改文案改这里
  cases.json              九个案例，中英双语（案例库文案与详情页文案分开存放）
  ui.en.json ui.zh.json   界面文案
  home.en.json home.zh.json  首页文案
tools/
  build.mjs               生成器：零依赖，node tools/build.mjs
  templates/              chrome / home / library / detail
assets/design/
  modernist.css           设计系统 token（逐字搬运，只删掉了 @import，字体改由 <link> 加载）
  site.css                项目样式：accent 覆盖、hv1–hv6、全部页面组件
  locale.css              中文排版差异，作用域 :root[lang^="zh"]
  site.js                 头部隐藏 / 筛选 / 手风琴 / 表单
en/ zh/                   生成产物，已提交
index.html                语言分流页（生成产物）
```

**改完内容或模板后必须重新运行 `node tools/build.mjs`。** `en/`、`zh/`、`index.html`、`sitemap.xml` 都是生成产物，不要手改。

生成器带校验：任一案例缺字段、decisions 不是 3 条、specs 不是 3 条，或 `cases/library/<slug>/index.html` 不存在，构建直接失败。

---

## 关键实现说明

**两套 CSS 完全隔离。** 新页面不加载 `assets/styles.css`，旧页面不加载 `assets/design/*`。二者的 `body` / `a` / `h1–h3` 与 `.card` / `.card-title` / `.card-body` 定义冲突，同页加载必然出问题。

**SPA 隔离。** `assets/main.js` 会拦截同源链接、只取对方 `.page-content` 塞进旧壳。已给旧站所有指向 `/`、`/en/`、`/zh/` 的链接（共 122 处，29 个文件 + header partial）加上 `data-no-spa`。**新增此类链接时必须一并加上。**

**案例路径。** 交接包里 `SITE = '../cases/'`，仓库实际是 `cases/library/<slug>/index.html`，生成器已统一改写。

**语言切换是链接不是 JS。** `/en/x` 与 `/zh/x` 成对，互相 `hreflang`，canonical 各指自己。

**中文排版是设计决策。** `locale.css` 里的取消 uppercase、tracking 收紧、line-height 1.85、字重 700、`margin-left: 0`、measure 约 0.6×，都来自交接包的规定，不是翻译差异。

---

## 相对交接包的改动（均为实施期设计决定）

1. **首页案例标题可点进详情页。** 原型里四行是静态的。只有标题成为链接，版式未变。
2. **案例库与详情页用完整 footer**，不是原型的单行 footer——10.1 定了旧站页面只从 footer 进入，就不能在这两类页面上砍掉它。
3. **Footer「资源」栏多一项 Newsroom**，同样出于 10.1。「托管运维」指向 `services/index.html`（没有对应的独立页面）。
4. **联系表单只在首页的 accent 区块里**，案例库与详情页保持交接包原样的邮箱／电话／地址三栏。表单沿用旧站的 Netlify 表单名 `contact` 和同一套字段（`first_name` / `last_name` / `email` / `message`），两处提交进同一个收件箱。表单样式按系统走：无圆角、无阴影、2px 下划线输入框、反色提交按钮。
5. **案例库与详情页也套用中文排版规则。** 原型这两页没做中文差异（只有首页做了），这是原型的缺口，不是设计意图。
6. **语言切换的激活态用 `--color-text`／`--color-neutral-600`**，按 README 的规格，而非原型 JS 里的 accent-700／neutral-500。

---

## 上线前必须处理

1. **摄影全部是 Unsplash 占位图，必须换成有授权的图。** 保持 `.grayscale`，不上色。
2. **字体目前从 Google Fonts 加载，生产环境应自托管**，Noto Sans SC 必须子集化（全量数 MB）。
3. **Stats band 的四个数字**（180+ / 92% / 6 wks / 12 cities）在仓库里核不到出处。已按 10.2 照发，但发布前值得再核一次。

## 后续

- 二期：根目录分流上线后观察，必要时把 `cases/index.html` 收敛到新案例库。
- 三期：其余 30 多页迁入 `/en/` 并换用 Modernist；中文覆盖范围按 10.7 再议。
- 交接包 README 的 open item 1（详情页字阶未做独立一轮）目前沿用首页字阶，待设计定稿后在 `site.css` 的 `.yt-detail-*` 与 `locale.css` 对应段调整。
