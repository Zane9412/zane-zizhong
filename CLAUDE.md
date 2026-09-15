# CLAUDE.md — 字重 (zizhong)

本文件为 Claude Code 在此仓库工作时提供指导。

## 项目概述

把一段文字的词频与情感可视化成落进玻璃样本瓶里的矿物沉积。纯前端单页应用，零框架、零第三方运行时依赖，全部跑在浏览器本地，不调用任何 AI 接口、不依赖服务器。线上地址：https://zane9412.github.io/zane-zizhong/

## 架构：逻辑与渲染严格分离

```
src/analyze.js    纯逻辑：分词、情感词典、重量计算、配色映射——不碰 DOM，可单测
src/app.js        Canvas 渲染、下落堆叠物理模拟、交互与 DOM 绑定
test/analyze.test.js   针对 analyze.js 的单元测试
```

这个切分是故意的：`analyze.js` 里任何函数都不应该引用 `document`/`window`/Canvas API，保持可以脱离浏览器环境单测；渲染和交互相关的东西一律放 `app.js`。新增功能时先想清楚这条线要不要破坏。

## 关键实现，改动前要知道

- **分词**：用浏览器原生 `Intl.Segmenter` 做中英文混合分词，不要引入外部分词库——这是"零依赖"这个卖点的一部分。
- **情感词典**：`analyze.js` 里手工整理的约 150 个词，评分 -2 到 +2，纯词典查表，没有接 NLP 模型/API。
- **堆叠物理是自研的"skyline 打包"算法**：先把整批词一次性排布好落点（哪一列、落多深），再按顺序真正下落——不是每个词落地时才实时算位置。这是为了避免"好几个词同时抢同一个位置"，改堆叠逻辑时不要退化成朴素的逐个碰撞检测。

## 测试

```bash
npm test    # Node 内置测试跑器，零依赖，只测 src/analyze.js
```

`app.js` 的 Canvas 渲染/交互部分没有自动化测试覆盖，改动后要手动在浏览器里验证。

## 部署

push 到 `main` 由 GitHub Pages 自动发布（仓库设置里 `build_type: legacy`，直接从 `main` 分支根目录发布），**没有 `.github/workflows`，不需要任何 CI 配置**——这个仓库不需要为部署新增 workflow 文件。

## 本地运行

```bash
npx serve .   # 或任意静态服务器；直接双击打开 index.html 在部分浏览器下 <script type="module"> 可能不生效
```
