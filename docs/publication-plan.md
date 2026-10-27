# BreakLock 上架计划

状态：**pending**。本目录只准备本地物料；尚未取得真实游戏 ID、gameSlug 或榜单 ID，不能视为已上传到 1GP、已上线或已接通云服务。

用户已选择多语言、云存档和排行榜，明确只上架游戏、不发社区帖：`announcement: false`。本计划不包含任何社区发帖步骤。

## 数据格式

已只读核对平台的 `lib/store-kit.ts`、`lib/store-kit-prompt.ts`、`mcp/src/promotion.js`、`mcp/src/publishing-prompts.js`、`mcp/src/server.js` 和 `public/local-publishing-api.md`。

- [game.json](../1gp-kit/game.json) 只使用物料导入器实际支持的字段：中英文名称与简介、分类、标签、工具和主封面路径。没有编造 `titleJa` 等导入字段。
- [publication.json](../1gp-kit/publication.json) 是本地发布计划数据，不是平台可直接执行或导入的配置。它记录五语言 `titles` / `descriptions`、待配置功能与 `announcement: false`。真实游戏标识取得后，`storeDetails` 可供 `set_game_details` 逐字段使用。
- 分类：`puzzle`。中文标签：开源移植、逻辑推理、图案解锁、限时挑战。英文标签：Open-source port、Logical deduction、Pattern unlocking、Time challenge。
- 标题最多 120 字、简介最多 2000 字；中文标签最多 5 个且单个不超过 12 字，英文标签不超过 24 字符。封面路径相对 `1gp-kit/`。
- `allowRemix`、公开范围等作者设置没有推断或代填。MIT 授权说明不自动决定平台的这些设置。

## 游戏介绍

以下文案只介绍现有玩法，不承诺尚未完成线上验证的云存档与排行榜。

### 中文

**BreakLock · 图案解锁**

连起九宫格里的圆点，用每次反馈推理出隐藏图案。

用鼠标或手指画出路径：白点表示圆点和顺序都对，空心点表示圆点选对、顺序不对。

从 4、5、6 个点的图案中选择难度，慢慢练习、在 10 次机会内破解，或挑战 60 秒倒计时。

这是 maxwellito 原作 BreakLock 的 MIT 开源移植版，保留原作署名与许可证。

### English

**BreakLock**

Connect the dots and use each clue to crack the hidden pattern.

Draw a path with your mouse or finger. White clues mean the dot and its position are right; hollow clues mean the dot is right but its position is wrong.

Choose patterns of 4, 5 or 6 dots. Practise without limits, solve a Challenge in 10 attempts, or race a 60-second countdown.

An open-source port of BreakLock by maxwellito, under the MIT license. Original credits and license are retained.

### 日本語

**BreakLock · パターン解読**

点をつなぎ、ヒントを頼りに隠されたパターンを解き明かそう。

マウスや指で線を引きます。白いヒントは点も順番も正解、白い輪のヒントは点は正しくても順番が違うことを表します。

難易度は4・5・6個の点から選択。じっくり練習するもよし、10回以内の解読や60秒のタイムアタックに挑むもよし。

maxwellitoによるBreakLockのオープンソース移植版です。原作のMITライセンスとクレジットを保持しています。

### 한국어

**BreakLock · 패턴 해독**

점을 잇고 힌트를 추리해 숨겨진 패턴을 풀어 보세요.

마우스나 손가락으로 경로를 그립니다. 흰색 힌트는 점과 순서가 모두 맞다는 뜻이고, 속이 빈 원 모양의 힌트는 점은 맞지만 순서가 다르다는 뜻입니다.

점 4개, 5개, 6개 중 난이도를 고르세요. 제한 없이 연습하거나, 10번 안에 풀기에 도전하거나, 60초 카운트다운을 즐길 수 있습니다.

maxwellito의 BreakLock을 MIT 라이선스에 따라 이식한 오픈 소스 버전입니다. 원작의 저작자 표시와 라이선스를 유지합니다.

### Español

**BreakLock · Descifra el patrón**

Une los puntos y usa las pistas para descifrar el patrón oculto.

Traza un recorrido con el ratón o el dedo. Una pista blanca indica un punto correcto en la posición correcta; una hueca, un punto correcto en otra posición.

Elige patrones de 4, 5 o 6 puntos. Practica sin límites, resuelve el Desafío en 10 intentos o juega contrarreloj durante 60 segundos.

Adaptación de código abierto de BreakLock, de maxwellito, bajo la licencia MIT. Se conservan los créditos y la licencia originales.

## 来源、许可与仓库

原作：[maxwellito/breaklock](https://github.com/maxwellito/breaklock)，冻结基准为 `8dedd3baccc051928b09605db5cb8dae3702d2f3`。本项目是 MIT 开源移植，原作版权为 © 2017 maxwellito。保留根目录 `LICENSE`、`NOTICE` 及第三方许可文件，并随构建产物分发。字体为原作随附的 Roboto Mono Light（该版本为 Apache-2.0），Lucide 语言图标为 ISC；详情见 [asset-provenance.md](asset-provenance.md)。本移植不是原作官方发行版，也不表示原作者背书。

公开移植仓库为 [illidan53/breaklock-aiwanna](https://github.com/illidan53/breaklock-aiwanna)，已创建并推送 main，GitHub 已返回 PUBLIC。1GP 发布仍为 pending。

## 排行榜计划

只统计挑战模式成功解锁所用的尝试次数。4、5、6 个点分别建榜，次数越少越好。练习、倒计时、未成功局和云存档恢复的局不提交成绩。真实开局创建 run，成功结算时提交实际整数分数；失败、离线、重试不影响继续游玩。

| 稳定 key | 名称 | order | unit | minScore | maxScore |
| --- | --- | --- | --- | --- | --- |
| challenge-4 | 挑战 · 4 个点 | asc | count | 1 | 10 |
| challenge-5 | 挑战 · 5 个点 | asc | count | 1 | 10 |
| challenge-6 | 挑战 · 6 个点 | asc | count | 1 | 10 |

三张榜均为 **pending**，没有填写虚构 boardId。`minPlayMs` 刻意省略：原作规则没有足以推导出防作弊最短时长的依据，需按实际接入材料确定是否需要；不套用 API 示例值。取得真实 gameId/gameSlug 后，先读取 `get_game_integrations` 的已有配置，再创建缺少的榜。相同 key 出现配置冲突时核对差异，不换 key 绕过。配置成功后还需验证真实开局、成功结算、个人最佳、重复提交与断网。

## 云存档计划

状态为 **pending**，拟启用 `schemaVersion: 1`。`publication.json` 中 `plannedConfiguration.enabled: true` 只是用户已选择功能的待执行配置，不表示平台已经启用。真实 gameId 仍为空，代码应保持远端请求关闭。取得真实配置后使用官方 SDK 和返回的可信域名。

完整保存当前模式、难度、局面与本地进度。远端存档与当前进度不同，必须让玩家选择再恢复；不能因为读取成功而覆盖正在玩的局。冲突不静默覆盖，读取失败不等于空存档。保持离线游玩并验证刷新续玩、云端恢复、账号切换、断网、冲突及不兼容格式处理。

## 封面与实际画面

- [cover.png](../1gp-kit/cover.png) 为 1600 × 900 黑白点阵封面，标题为 BreakLock；[cover.svg](../1gp-kit/cover.svg) 为可编辑源文件。
- [cover-base.png](../1gp-kit/cover-base.png) 为同构图无字底图；[cover-base.svg](../1gp-kit/cover-base.svg) 为源文件。左侧留给平台叠加各语言游戏名，右侧为九宫格图案。
- 图像为本次以 SVG 编写的几何封面插画，不是游戏截图。除系统字体渲染标题外未引入外部美术素材；无字底图不含可见文字。图案使用 6 个点的连续路径，仅表现真实玩法元素，没有伪造游戏界面、分数或奖励。
- 平台不接受 SVG 作为图片上传候选，所以 `game.json` 指向 PNG；SVG 仅作为本地源文件保存。
- 主执行代理必须亲自打开并检查主封面和无字底图，检查缩小到卡片尺寸后的可读性后再上传。导入器能读到路径，不等于已完成视觉验证。
- 已保存并查看四张真实截图：gameplay-menu.png、gameplay-practice.png、gameplay-win.png、gameplay-countdown.png。未录实机视频，可用浏览器工具未提供录屏接口。主封面和底图是插画，不作为截图。

## 后续发布顺序

1. 主执行代理集中审阅文案、封面和游戏检查结果。实际连接的 AIWANNA MCP 须为 0.12.1 或更高兼容版；复用同一 `prepare_game` 返回的 updateId 与用户选择，保留 `announcement: false`。
2. 通过已授权的游戏发布流程取得真实游戏标识。必要的首轮部署仍关闭尚无真实 ID 的功能请求；不得把此时宣称为全部功能已验证。
3. 读取真实云存档与排行榜配置，填写返回的 ID 与域名、创建所需配置，验证游戏接入；同一任务的后续部署沿用相同 updateId。
4. 用五语言数据补齐缺少的名称和简介，保留已有作者文字。上传实际语言文本；原始语种与已有语言以平台结果为准。多语言封面使用同一无字底图，并实际查看各语种预览。
5. 用 `set_game_details(fillMissing: true)` 补分类与标签，`set_game_media` 上传已经检查的主封面，路径使用项目相对路径 `1gp-kit/cover.png`。未知平台状态先恢复读取；已有物料先复用。纯物料修改无需重新部署。
6. 最终发布 ready 后实测公开页面、语言、云存档和三张榜，分别报告已验证和未完成项。保持社区发帖关闭。不将本目录随游戏运行产物上传。
