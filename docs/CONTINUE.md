# 继续发布 BreakLock

截至 2026-10-26：本地移植、集成适配、许可证和物料已完成；1GP 尚未创建游戏，所有远程 ID 为空，云服务未启用。不要把此状态理解为已经上线。

## 已有作者授权

- 在 ~/projects/breaklock-aiwanna 独立开发，上传到 illidan53 的公开 GitHub 仓库。
- 使用当前 AI 工具已授权的 1GP 账号。
- 接入多语言、云存档、排行榜。
- 游戏上架包含“开源移植”标签。
- 只上架游戏，不发社区首发帖（announcement:false）。

## 当前阻碍

用户已重启 onegp，用户级包配置已固定到 v0.14.0；但此会话 get_publisher_info 仍返回 v0.11.0。网站完整提示词要求实际运行至少 v0.12.1，因此尚未调用 prepare_game/publish_game，也没有 updateId、gameId、gameSlug 或榜单 ID。需要重开 AI 工具或新对话刷新工具连接。不要重复授权，也不要绕过 MCP 上传。

## 继续顺序

1. 读取 docs/1gp-publish-prompt.txt（从官方网站保存的完整接入提示词）和当前实际 MCP 版本。若 AUTH_REQUIRED 才调用 connect_platform，请作者本人授权。
2. 针对此项目调用一次 prepare_game：static、output_directory:"dist"、features={multilingual:true,cloudSaves:true,leaderboards:true,announcement:false}。保存并复用 updateId。新游戏推荐本地静态上传；GitHub 仓库用于公开源码。没有选过 GitHub 托管渠道。
3. 确认代码与 dist 一致。npm ci --ignore-scripts / npm test / npm run test:build / npm run build。只上传 dist，保留其中 LICENSE、NOTICE 和 licenses/；不上传 source map、node_modules、源码、凭证或1gp-kit。
4. 如需先发布获取真实 ID，首次静态发布后以真实 gameId/gameSlug 配置 src/platform/config.js。ID 缺失时必须保持请求关闭。
5. 通过 get_game_integrations 读取游戏专属指南；configure_cloud_saves(schemaVersion:1)；按 1gp-kit/publication.json 创建/复用 challenge-4、challenge-5、challenge-6 三榜并填写 boardIds。不要猜 ID。榜单 asc/count/1..10，只收新开挑战局获胜的尝试次数，恢复局不参榜。保存身份与排行榜身份使用各自的官方协议。
6. 上传 dist/i18n/zh.json 作为中文原文，加 en/ja/ko/es 完整译文，保留其他既有语言。运行时 bootstrap 已实现先读 ?lang=，再请求公开 /i18n/<slug>/<locale>.json；失败回退本地。若登记 keys 来源，用 i18n/zh.json，保留返回设置并逐项审查候选。
7. 按 1gp-kit/game.json / publication.json 补全 puzzle 分类、开源移植等标签、五语言名称与简介、封面和四张真实截图。cover.png/cover-base.png 为自制几何封面，不能当实机截图。截图来自浏览器真实试玩，已查看。尚未录视频；现有浏览器工具未提供录制能力。
8. 以同一 updateId 部署最终配置产物，wait_for_publish 到 ready。验证真实游戏页面、中英日韩西语言、云存档保存/恢复/冲突、挑战成绩提交/同局去重，及鼠标/触屏完整折线路径。将真实结果写入验证记录和README，推送配置到同一GitHub仓库。
9. announcement:false，不发社区首发帖。不要虚构发布成功，不把本地mock/API隔离测试当生产验证。

## 已完成的本地验证

自动化涵盖图案规则、3种模式、输入、会话与计时清理、存档结构/恢复、cloud SDK选择与冲突、排行榜身份/去重、语言路由/安全字典。最终数量见 docs/verification.md。

浏览器实际试玩包括：中文练习由可见反馈推理解锁（6次）、刷新后历史和进度恢复、挑战第10次失败及答案揭晓、手机390×844与桌面1280×800布局。测试未读取隐藏答案、未注入游戏状态或伪造成绩。鼠标/触屏完整折线与生产平台接口仍需最终验证。
