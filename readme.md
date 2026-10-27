# BreakLock · AIWANNA 社区移植

基于 [maxwellito 的 BreakLock](https://github.com/maxwellito/breaklock) 制作的网页社区移植，保留原作玩法和原作者署名。原作基准提交为 [`8dedd3baccc051928b09605db5cb8dae3702d2f3`](https://github.com/maxwellito/breaklock/tree/8dedd3baccc051928b09605db5cb8dae3702d2f3)，完整 Git 历史保留。

本项目不是原作官方版本。移植工作包括现代构建、根路径托管、语言选择、翻译修订、输入与会话生命周期修复，以及 AIWANNA 平台功能适配。原版 README 的逐字副本位于 [docs/upstream-README.md](docs/upstream-README.md)。

![BreakLock cover](1gp-kit/cover.png)

## 怎么玩

在九宫格中连线猜出隐藏图案。每次尝试后，白点表示选中了正确的点且顺序正确，空心点表示选中了正确的点但顺序不对。简单、中等、困难分别需要连接 4、5、6 个点。

保留原作三种模式：

- **练习**：不限尝试次数。
- **挑战**：最多 10 次尝试。
- **倒计时**：60 秒内解锁，不限尝试次数。

## 本地运行与构建

使用现代 Node.js（依赖最低要求为 20.19；本轮实际使用 Node.js 26）。依赖来自 npm registry；项目不需要运行依赖安装脚本。

```sh
npm ci --ignore-scripts
npm test
npm run test:build
npm run build
python3 -m http.server 8080 --directory dist
```

然后打开 `http://localhost:8080/`。构建输出为 `dist/`，适合静态托管，无游戏服务器要求。构建使用 Dart Sass，已移除停止维护的 node-sass。原 SCSS 仍有 `@import` 与旧除法写法的弃用提示，当前版本可以完成构建。

`npm test` 执行玩法与输入等 `tests/*.test.cjs` 测试；`npm run test:build` 单独验证语言路由、翻译字符串安全及字典导出。构建及测试通过不等于完整浏览器流程或正式发布已经完成。

## 语言

当前构建 11 种语言：简体中文、英语、日语、韩语、西班牙语、繁体中文、波斯语、法语、俄语、巴西葡萄牙语和意大利语。

根页面以简体中文为原始语言。`?lang=` 优先于当前语言目录，例如 `/?lang=ja`；未知语言回退英文。显式语言目录仍可直接访问，例如 `/fr/`，菜单切换保留其他查询参数和锚点。此版本新增日语、韩语、西班牙语并修订简体中文；其余语言保留上游翻译，未声称全部重新人工校对。

源字典在 `src/l10n/*.yml`。构建另输出 `dist/i18n/{locale}.json` 纯玩家文本字典，去掉语言代码、内嵌 CSS、动画字符集合及署名 HTML，以供平台文本同步使用。

`src/platform/config.js` 已配置真实 `gameSlug`。启动桥先按当前语言读取平台公开 `/i18n/<slug>/<locale>.json`，再启动游戏。查询参数语言优先；请求最长等待 3 秒，失败时使用随包本地文本。只接受已知玩家文本键的字符串，逐键检查占位符；远程文本通过文本节点及限定的描述属性更新，不作为 HTML 执行。未配置游戏标识时不会向平台请求字典。静态语言目录和本地字典仍完整保留。

## 平台集成与发布状态

截至 2026-10-26，游戏已上线：[游戏页面](https://www.aiwanna.games/games/6ac7b2a01196c3347e0eee1236d4506c-a7760a79) · [直接游玩](https://www.aiwanna.games/games/6ac7b2a01196c3347e0eee1236d4506c-a7760a79/playing)。最终 build `5eb9caaa-6346-4f19-ba2e-acdb53f12a7d` 已达到 `ready`，deployment 为 `dpl_6emo5T5vsA2PFP1iVPjfYyoMCHHW`。发布使用官方 MCP SDK 与 stdio 的 v0.14.0 授权连接。

游戏 ID 为 `91ea48d5-85d0-46bb-924d-b4a4a727572e`，slug 为 `6ac7b2a01196c3347e0eee1236d4506c-a7760a79`。真实游戏 ID、slug 和三张难度榜的 ID 已写入配置。云存档已开启，`schemaVersion: 1`。排行榜只收新开挑战局成功解锁所用的尝试次数，包含最后一次成功尝试；4、5、6 点分别排名，越少越好，范围为 1–10，恢复存档的局不参榜。

平台已登记简体中文、英语、日语、韩语、西班牙语，每种语言 74 条文本均为 `ready`。自动 keys 来源为 `i18n/zh.json`，扫描状态 `complete`，没有待审候选。最终线上播放器的五语言切换已全部实际验证，`?lang=` 与各语言目录匹配，按钮完整，日语、韩语、西班牙语截图无乱码。平台以后编辑字典后的运行时读取尚未实测。

主封面、4 张实际试玩截图及英语、日语、韩语、西班牙语封面配置已保存。全部 5 张公开封面与 4 张截图均已在内置浏览器实际查看，未发现乱码、截断或错误回退。英文商店页的标签目前仍显示中文，平台缓存翻译尚未完成；预览视频尚未录制。

本地浏览器已验证键盘连点、实际解锁、挑战失败与揭晓、刷新恢复和桌面/手机布局。最终线上版本已通过访客试玩与刷新恢复：中文练习提交一次连线后计数为 `001`，父页面显示已保存到本机；刷新后自动恢复原局及历史，等待遮罩消失并可继续游玩。测试浏览器尚未登录平台账号，账号云端保存/恢复、跨设备冲突、真实排行榜提交与个人最佳仍未验收。

静态发布上传 `dist/` 并保留全部许可证文件。当前发布使用 update ID `4c6aa504-1012-40d3-a6e2-6d6af6914f88`。作者选择不发社区帖或版本帖，首发组保持 `draft`，不调用 `complete_game_update`。

完整测试与尚未验证项见 [验收记录](docs/verification.md)，后续工作见 [验证清单](docs/CONTINUE.md)。

## 版权与来源

- 原作代码：© 2017 maxwellito，[MIT 许可证](LICENSE)。保留原版权及许可文本。
- 随包 Roboto Mono Light 字体：© 2015 Google Inc.，[Apache-2.0](licenses/Apache-2.0.txt)。字体未修改，具体文件与内嵌版权证据见 [字体说明](licenses/RobotoMono-NOTICE.txt)。
- Lucide 语言图标：© 2020 Lucide Contributors，[ISC 许可证](licenses/Lucide-ISC.txt)。

[NOTICE](NOTICE) 随发布物分发；[素材来源记录](docs/asset-provenance.md) 区分已验证授权和仍有限制的来源信息。原作其他图标和图片依赖仓库整体 MIT 声明，原库没有为每个资源提供独立作者台账。名称和品牌标识不代表商标授权或任何第三方背书。
