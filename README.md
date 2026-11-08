# 逐句辨析

逐句辨析是 DeepSeek Harness 的中文聊天插件。它让模型在回答中区分相近的概念，写清判断成立的条件，以及现有证据能支持什么结论。回答的长短随提问要求调整。

## 安装

已在 DeepSeek Harness `0.2.2-rc.1` 的 Web 配置中验证。插件要求 Node.js 24.9.0 或更高版本。

```sh
dsh plugin --profile web add https://github.com/pacholigoooo/dsh-defensive-style/releases/download/v1.1.2/dsh-defensive-style-1.1.2.tgz
```

也可以先下载 `dsh-defensive-style-1.1.2.tgz`，再在下载目录执行本地安装命令。[下载 1.1.2 安装包](https://github.com/pacholigoooo/dsh-defensive-style/releases/download/v1.1.2/dsh-defensive-style-1.1.2.tgz)

```sh
dsh plugin --profile web add ./dsh-defensive-style-1.1.2.tgz
```

安装完成后，重启 DSH Web 并新建会话。模型、供应商和 API 设置沿用 DSH 的配置。

## 试用

在聊天框输入「公平硬币连续五次出现正面，第六次正反两面的概率各是多少？」。回答会说明独立抛掷的条件和判断概率的依据。也可以指定用一句长句作答。

插件按句处理普通段落。符合风格的完整句子可以提前显示，需要调整的句子会在文本块结束时整理。代码块、Markdown 引文、表格和 JSON 保留原文。翻译、逐字引用和固定格式输出遵循提问时给出的要求。

## 卸载

```sh
dsh plugin --profile web remove dsh-defensive-style
```

重启 DSH Web 后生效。

## 从源码打包

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm pack
```

打包会编译插件入口，并把 Markdown 解析器及其许可证放进安装包。[MIT 许可证](LICENSE)
