# 来源与授权记录

本记录对应从 maxwellito/BreakLock 移植的这一份源码和资源；许可证允许的使用仍须履行保留版权及许可等条件。记录不等于对所有第三方权利或商标的全面检索。

## 原作

- 原作者与仓库：[maxwellito/breaklock](https://github.com/maxwellito/breaklock)。
- 冻结基准：[8dedd3baccc051928b09605db5cb8dae3702d2f3](https://github.com/maxwellito/breaklock/tree/8dedd3baccc051928b09605db5cb8dae3702d2f3)，保留原 Git 历史。
- 原作 [MIT 许可证](https://github.com/maxwellito/breaklock/blob/8dedd3baccc051928b09605db5cb8dae3702d2f3/LICENSE) 原样保存在根目录 `LICENSE`，版权为 © 2017 maxwellito。
- 原 README 的逐字副本：[upstream-README.md](upstream-README.md)。其中保留 HKalbasi 对翻译与本地化系统的贡献记录。
- 本项目是社区移植，不能把移植者写成原作作者，也不表示原作者或其项目对平台的背书。

## 字体：Roboto Mono Light

使用文件位于 `assets/fonts/robotomono-light-webfont.{ttf,woff,woff2}`，三份均与冻结原作的文件逐字节相同。

直接解析 TTF 与 WOFF 的 `name` 表，得到 `Copyright 2015 Google Inc. All Rights Reserved.` 和 `Licensed under the Apache License, Version 2.0`。版权、许可 URL、文件哈希和核对结果保存在 [font-provenance.json](font-provenance.json)。WOFF2 只做了原文件一致性校验，没有单独解码其名称表。

- [固定原文件来源](https://github.com/maxwellito/breaklock/tree/8dedd3baccc051928b09605db5cb8dae3702d2f3/assets/fonts)
- [Apache 官方许可证文本](https://www.apache.org/licenses/LICENSE-2.0.txt)，完整副本：`licenses/Apache-2.0.txt`
- 字体归属与使用范围：`licenses/RobotoMono-NOTICE.txt`

此处使用的是这组旧字体二进制中的 Apache-2.0 授权，不能用较新字体版本的许可覆盖它。当前未修改字体；若以后改字体文件，需进一步履行 Apache 对修改标记等要求。

## 图标：Lucide languages

`index.html` 中 `#icon-lang` 仍有 `Multi-lang icon from lucide.dev` 来源注释。BreakLock 的 [0d499e46d22643fd99e35466491c6837385f8f4c](https://github.com/maxwellito/breaklock/commit/0d499e46d22643fd99e35466491c6837385f8f4c) 于 2022-04-25 引入它。

核对了 [Lucide 当时的 languages.svg](https://github.com/lucide-icons/lucide/blob/4cf59708416ff334601e9200a30efd8f8d3af0d3/icons/languages.svg)，路径几何与游戏内图标一致（SVG 命令书写形式有差异）。保留的完整 ISC 许可来自当时有效的 [许可证版本](https://github.com/lucide-icons/lucide/blob/11c6a2e9173dc46f714f215c0704ef71bd5b79af/LICENSE)，版权为 © 2020 Lucide Contributors，位于 `licenses/Lucide-ISC.txt`。

## 其余画面与品牌元素

点阵、路径和反馈图形由游戏代码生成。原仓库还包含图标、启动图、宣传横幅和 `assets/intro.svg`；本移植沿用原仓库的 MIT 授权，未发现这些文件附带单独许可或非商用条款。但原仓库没有为每一个 PNG/SVG 提供独立作者及第三方来源台账，不能声称逐个完成了权利链审计。

GitHub、Facebook、Twitter 等品牌图形，以及原作者图标，存在于原游戏的链接或分享界面。它们的出现不赋予本项目商标所有权，不应作为 AIWANNA 自有标识使用。没有进行 BreakLock 名称的注册商标检索。

当前仓库未含独立音频文件，本轮未额外引入音乐、角色贴图或外部游戏素材包。以后新增素材应在本文件补充来源及许可。

## 随发布物分发

构建会复制根目录 `LICENSE`、`NOTICE`、`THIRD_PARTY*`、`COPYING` 及 `licenses/` 到 `dist/`，不能在上传时丢弃这些文件。完整的开发依赖许可仍随各自 npm 包提供；如果后续引入会打包到游戏的运行时库，需核对并保留它们的发布声明。
