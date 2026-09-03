# 设计交接落地方案 — Modernist 双语站

来源：`design_handoff_yonder_site` 交接包（Claude Design）
对照：本仓库当前 `main` 分支实测
状态：**方案，未改动任何代码**

在线版（排版更清楚）：https://claude.ai/code/artifact/7250010f-ea28-4c80-8db3-9a35d1b7d3f2

---

## 结论

**先只做交接稿的三个页面，落在 `/en/` 与 `/zh/` 下，其余 30 多个页面这一期完全不动。**

两套设计系统无法共存于同一张样式表——实测 `body` / `a` / `h1–h3` 全局选择器，以及
`.card` / `.card-title` / `.card-body` 三个类名，在两边都有定义且取值不同。全站改版是第三期的事。

---

## 01 差距与碰撞点

### 设计系统层面

| 维度 | 现有站点 | 交接稿（Modernist） |
| --- | --- | --- |
| 标题字体 | Inter 700/800 | Archivo 800（中文 Noto Sans SC 700） |
| 主色 | `#f4c500` 黄 | `#a8503f` 砖红 |
| 底色 | `#f7f6f2` / 白 | `#f3f2f2` |
| 圆角 | 有 | 全站 0，无例外 |
| 阴影 | `0 12px 30px` | 任何面上都不用 |
| 分隔线 | 1px `#e5e7eb` | 2px `--color-divider`，不得减细 |
| 响应式 | 断点 + 媒体查询 | 零媒体查询，全靠 `clamp()` + `flex-wrap` |
| 语言 | 48 页全英文，无中文 | 全双语，中英排版规则不同 |

### 实测碰撞点

1. **两套 CSS 不能同页加载** — 全局选择器与三个类名重名取值不同。→ 新页面不引 `assets/styles.css`。
2. **`assets/main.js` 是全站 SPA，会劫持指向新页面的链接** — 它拦截同源 `<a>`，只取对方 `.page-content` 塞进当前壳，再注入 header/footer partial。新页面自带 nav 和 footer，会变成「旧壳 + 新内容」。→ 跨系统链接加 `data-no-spa`，新页面不加载 `main.js`。
3. **案例路径差一层** — `data.js` 的 `SITE = '../cases/'` 指向 `cases/<slug>/index.html`，仓库实际是 `cases/library/<slug>/index.html`。九个 slug 与仓库完全对得上。→ 生成器统一改写。
4. **`/en/index.html` 已被占用** — 目前是「Global Site」占位页，已在 sitemap 中。→ 直接替换，URL 不变，不产生 404。
5. **旧案例库与新案例库重叠** — `cases/index.html` + `cases/viewer.html` 覆盖同一批九个案例。→ 见待确认 10.5。
6. **不要移植 `render.js`** — README 明确要求。`{{ }}` / `<sc-if>` 在生成器里退化成字符串替换与条件分支。

---

## 02 URL 与语言结构

原型用 hash（`#/cn`）切语言，必须换掉：hash 不可索引，`hreflang` 无从声明。

```
/                          → 分流到 /en/（见 10.6）
/en/index.html             首页
/en/cases/index.html       案例库
/en/cases/<slug>.html      案例详情 × 9
/zh/index.html
/zh/cases/index.html
/zh/cases/<slug>.html      案例详情 × 9

根目录 30+ 个旧页面保持原位，第三期再并入 /en/
```

合计 **22 个新页面**。语言切换是指向对方 URL 的普通 `<a>`，不是 JS；同时写 `localStorage` 供根目录分流使用。

**取舍：** 一期结束后站内两个语言体系并存——三个新页面双语，其余 30 多页只有英文。中文用户从 `/zh/` 点「服务」会掉进英文页。这是分期的代价，需在导航上处理（见 10.1）。

---

## 03 页面怎么生成

22 个页面手写不可维护。建议加一个**无依赖的 Node 生成器**，产物提交进仓库——Netlify 和 `python -m http.server` 都零配置照跑，部署方式不变。

```
content/cases.json        data.js 的 LIB_CASES + DET_CASES 合并，逐字搬运
content/ui.en.json        界面文案（LIB_COPY / DET_COPY / 首页文案）
content/ui.zh.json
tools/templates/          home.html / library.html / detail.html
tools/build.mjs           纯 Node，零 npm 依赖
```

运行时仍是 0 依赖静态站，Node 只在本地或 CI 跑一次。

**备选**（不要构建步骤）：手写 6 页 + `case.html?slug=` 客户端路由。但详情页不可索引，等于放弃分路径方案的全部收益；若走这条，语言方案也应退回 localStorage 切换，两个决定配套。

---

## 04 CSS 分层与隔离

```
assets/design/modernist.css   逐字搬运，只改 @import 为自托管字体
assets/design/site.css        项目覆盖：accent 重调 + hv1–hv6 悬停类
assets/design/locale.css      新增：中英排版差异
```

隔离方式推荐 **A：新页面完全不引 `assets/styles.css`**。新页面自带 header/footer，不复用旧 chrome。
（B：全表加 `.yt-m` 作用域前缀 — 工作量大易漏。C：`@layer` — 旧表无分层基础，收益有限。）

### locale.css 承载的是设计决策，不是翻译

| 属性 | 英文 | 中文 `:root[lang^="zh"]` |
| --- | --- | --- |
| text-transform | uppercase | 不使用 |
| letter-spacing | 0.14em | 0.08em 或 0 |
| 正文 line-height | 1.65 | 1.85 |
| 标题字重 | 800 | 700 |
| 标题 margin-left | −0.04em ~ −0.05em | 0，齐平 |
| 正文测量宽度 | 52–56ch | 约 0.6×，即 30–34ch |
| 标题字体 | Archivo | 'Noto Sans SC', Archivo |

数字统一 `font-feature-settings: 'tnum' 1`。焦点态统一 `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`。

---

## 05 三个页面的落地清单

**首页** — Header（sticky，滚动下隐上现，transform + 260ms）· Hero（eyebrow + 三行 h1 + 两个下划线按钮）· Selected work（四行：序号 / 4:3 黑白缩略图 / 文本 / 砖红上边框指标块）· Stats band（待定，见 10.2）· Capabilities（四格，gap 为 0，靠上边框分隔）· Method（左三步 + 右 4:5 黑白图）· Insights（三张 card）· Contact banner（全站唯一一处砖红铺满）· Footer。

Selected work 段末的免责声明（概念项目、非客户委托；数字描述设计系统而非商业结果）**必须保留**——这是事实声明，不是装饰文案。

**案例库** — 页头 + 筛选 chips（单选，同步 `?tag=`）+ 九行手风琴（课题 / 三条决策 / 结果 / 详情链接）。行悬停填 `--color-neutral-200`。

**案例详情** — 返回链接 · meta · hero 级 h1 · brief 两段 · facts 四项 · 三条决策 · outcome · specs 三格 · 下一个案例。README 明说详情页排版尚未做过独立一轮（open item 1），这一版先沿用首页字阶。

---

## 06 脚本与交互

- `nav.js` — 头部滚动隐藏。现有 `main.js` 里已有同款逻辑（rAF 节流 + 5px 阈值），比原型那份更稳，沿用它。
- `library.js` — 筛选（写入 `?tag=`，刷新可复现）+ 行手风琴。
- 语言切换**不写 JS**，改成链接。

> **最容易踩的坑：** 从旧页面（footer、导航）指向新页面的每一个链接都要加 `data-no-spa`，否则 `main.js` 会把新页面塞进旧壳。建议在验收清单里单列一项，逐个链接点过。

---

## 07 内容与素材

- **文案逐字搬运。** README 要求两种语言均为独立撰写，不得重写、缩写、改语气，不得机翻。建议加校验：每个案例中英两侧各 3 条 decisions、字段齐全，缺一即构建失败。
- **摄影全是 Unsplash 占位**，上线前必须全部替换为有授权的图。保持 `.grayscale`，不上色、不加色调。
- **字体自托管。** Archivo 400/500/600/800 + Noto Sans SC 400/500/700。中文字体必须子集化。
- **图标**用文字箭头（`↓` `→`）设 Archivo 800。不引 Font Awesome。
- **Logo** 没有，品牌就是 Archivo 800 的 `Yonder.` 字标。

---

## 08 SEO 与站点地图

- 每页 `canonical` 指向自身语言版本，不要都指向英文。
- 三条 `hreflang`：`en-NZ` / `zh-Hans` / `x-default` → `/en/`。
- `og:locale` 分别为 `en_NZ` 与 `zh_CN`。
- `sitemap.xml` 现有 46 条，新增 21 条（22 减去已存在的 `/en/index.html`），并给成对页面补 `xhtml:link` 互指。
- `<html lang>` 目前 48 页全是 `en`；中文页面必须是 `zh-CN`——`locale.css` 的作用域选择器依赖它，写错样式整体不生效。

---

## 09 分期

| 期 | 内容 | 备注 |
| --- | --- | --- |
| 一期 | 生成器 + 内容 JSON + CSS 分层 + 22 个页面 + SPA 隔离 + sitemap | 旧站完全不动，可独立验收、可回滚。工作量大头是内容搬运与校验，不是写样式 |
| 二期 | 收编 `cases/index.html` 与 `cases/viewer.html`，接根目录语言分流，全站导航指向新案例库 | 依赖 10.5、10.6 的结论 |
| 三期 | 其余 30 多页迁入 `/en/` 并换用 Modernist；中文版是否覆盖见 10.7 | 范围最大，建议一期验收后再评估 |

三期工时差一个量级，不建议合并交付——一期跑通前，三期的很多决定没有依据。

---

## 10 待确认

前四条会直接改变一期产出，建议动手前定下；后四条可在一期进行中确认。

| # | 问题 | 影响 |
| --- | --- | --- |
| 10.1 | 新导航只有六个入口，旧站 Services / Insights / About / News / Events 会失去主导航。接受（降为 footer 入口）还是在 nav 加项？ | 首页与 footer 结构 |
| 10.2 | Stats band 上不上？「180+ / 92% / 6 wks / 12 cities」无法核实，README 自己也标了要与客户确认 | 首页一整段 |
| 10.3 | 案例库手风琴：多行同时展开还是互斥？原型是各行独立，README 标注改动前需与设计师确认 | library.js 状态模型 |
| 10.4 | 要不要构建步骤？推荐要。不要的话详情页需退回客户端路由，语言方案也得配套回退 | 整体架构 |
| 10.5 | 旧 `cases/index.html` 与 `cases/viewer.html`：保留、301、还是删除？viewer 的 iframe 预览新设计里没有对应物 | 二期 + sitemap |
| 10.6 | 根目录 `/` 按什么分流？仓库目前无 `netlify.toml` / `_redirects`，服务端分流需新增配置文件 | 是否加部署配置 |
| 10.7 | 中文版覆盖到哪？只做三个页面，还是三期补齐 30 多页 | 三期范围 |
| 10.8 | 联系表单怎么办？新 contact banner 只有邮箱/电话/地址，无表单位置；现有 `contact/index.html` 接了 Netlify 表单 | 是否需要设计师补稿 |
