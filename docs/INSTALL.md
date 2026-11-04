# 安装与排障

本文是 [`README.md`](../README.md) 安装章节的加长版，给第一次接触 Harness 插件、或者安装时遇到问题的朋友。

---

## 0. 先确认三件事

1. **版本**：DeepSeek Harness Desktop **0.2.1-rc.5 或更新**。本包在此版本上开发与验证；更老的版本未验证，可能只部分生效。
2. **界面**：只支持 Web 界面。TUI / headless 没有可装饰的页面，装上也看不到效果。
3. **没有旧主题**：如果 profile 里还装着旧版开发包、其他侧栏品牌包或别的主题包，先卸载它们。两个主题会抢同一组 `single` 插槽，表现为只有一个生效、或者品牌位闪烁。

---

## 1. 方式一：本地目录（推荐）

### 下载与解压

下载 `dsh-theme-cyrene-0.37.0.zip`，解压到一个固定的目录，例如：

```text
D:\Plugins\dsh-theme-cyrene
```

解压后确认目录长这样：

```text
D:\Plugins\dsh-theme-cyrene\
├─ package.json
├─ index.js
├─ client.js
├─ cordis.patch.yml
├─ locale\
├─ icon.svg
└─ splash-art.svg
```

> 安装时选的是**包含 `package.json` 的这一层**，不是它的上一层，也不是 zip 文件本身。

### 在 Harness 里安装

1. 打开 Harness，点侧栏的 **插件**。
2. 点右上角 **添加插件**（或加号菜单里的 **安装第三方插件**）。
3. 在输入框里粘贴：

   ```text
   D:\Plugins\dsh-theme-cyrene
   ```

4. 点 **安装**。Host 会先读取 `package.json`，确认它是一个组合包，然后运行 pnpm 登记依赖。
5. 安装完成后，确认 **昔涟印象 · 主题** 处于启用状态。
6. 完全退出 Harness，再启动。

> 只刷新页面通常不够：客户端插件在 Harness 启动时组装。装完请至少重启一次。

### 安装成功后应该看到

- 侧栏左上角变成四瓣花核 + 渐变字标（「全」档）；
- 界面整体变成月白配色；
- 下次启动时出现开屏动画；
- **设置 → 通用** 里多出四行主题设置。

---

## 2. 方式二：tgz 压缩包

如果你不想解压，或者想把插件放在一个文件里：

1. 下载 `dsh-theme-cyrene-0.37.0.tgz`。
2. 插件页 → **添加插件**。
3. 粘贴 tgz 的绝对路径：

   ```text
   D:\Downloads\dsh-theme-cyrene-0.37.0.tgz
   ```

4. 安装、启用、重启，同上。

tgz 就是 npm 包格式；Harness 会把它当作一个本地 tarball 安装。它和 zip 的运行时文件一致，只是压缩格式不同。

---

## 3. 方式三：命令行

适合已经习惯终端的人。先确认 `dsh` 在 `PATH` 里：

```powershell
dsh --version
```

然后：

```powershell
# 本地目录
dsh plugin --profile desktop add "D:\Plugins\dsh-theme-cyrene"

# 或 tgz
dsh plugin --profile desktop add "D:\Downloads\dsh-theme-cyrene-0.37.0.tgz"

# 查看装了什么
dsh plugin --profile desktop list

# 卸载
dsh plugin --profile desktop remove dsh-theme-cyrene
```

`--profile desktop` 是默认桌面 profile 的名字；如果你用的是自定义 profile，换成自己的名字。

---

## 4. 方式四：GitHub 仓库

把本目录作为一个独立仓库推到 GitHub 后，可以直接在 **添加插件** 里粘贴仓库地址：

```text
https://github.com/Linxi-1105/dsh-theme-cyrene
```

要求：

- 仓库根目录有 `package.json`；
- `package.json` 里有 `dsh.bundle.patch`；
- 打了 tag 更稳（例如 `v0.37.0`），安装时可以写 `#v0.37.0`。

GitHub 方式需要本机能够访问 GitHub；如果超时，插件管理器会提示改用镜像或换成本地目录。

---

## 5. 第一次启动

安装并重启后：

- 开屏动画默认播放一次，点画面或按 `Esc` 跳过；
- 主题默认是「月白」+「全」档；
- 按 `Ctrl + Alt + X` 可以立刻关掉主题，对比原版；
- 按 `Ctrl + Alt + P` 打开调试面板。

如果开屏被跳过、或者你关了又开，它只会在下一次**启动**时再播；同一会话刷新不会重复。

---

## 6. 升级

插件管理器目前不提供“版本选择器”。升级方法是：

1. 插件页 → 已安装插件 → **昔涟印象 · 主题** → 卸载；
2. 用新版本的 zip / tgz 重新安装；
3. 重启 Harness。

偏好保存在 `localStorage['dsh.cyrene.v1']`，卸载插件不会清掉它；重装后配色、开屏设置会保留。想回到默认，地址栏加 `?cyrene=reset`。

---

## 7. 卸载

### 从界面

插件页 → 已安装插件 → **昔涟印象 · 主题** → 卸载 → 重启。

### 从命令行

```powershell
dsh plugin --profile desktop remove dsh-theme-cyrene
```

卸载后：

- 主题的 Host / Client 模块不再加载；
- 侧栏品牌位回到官方鱼标；
- 已经写入的 `localStorage` 偏好会保留，但不再生效。

---

## 8. 校验下载文件

每个 release 旁边会有一份 `SHA256SUMS.txt`。Windows 上这样校验：

```powershell
Get-FileHash .\dsh-theme-cyrene-0.37.0.zip -Algorithm SHA256
Get-FileHash .\dsh-theme-cyrene-0.37.0.tgz -Algorithm SHA256
```

把输出和 `SHA256SUMS.txt` 里的值对比。不一致就不要安装。

---

## 9. 排障

### 安装按钮点了没反应 / 报 `not-a-package`

选中的目录不对。必须选**直接包含 `package.json`** 的那一层。

### 报 `not-a-bundle`

`package.json` 里没有 `dsh.bundle.patch`，或者 `cordis.patch.yml` 路径不对。确认你下载的是本包，而不是别的主题。

### 报 `incompatible-version`

Harness 版本低于 `0.2.1-rc.5`。先升级 Harness；如果暂时不能升级，不要强行安装。

### 报 `already-installed`

已经装过同名包。先卸载旧版本，再装新的。

### 装完界面没变化

1. 插件页确认组合包是**启用**状态；
2. 完全退出 Harness 再启动；
3. 地址栏加 `?cyrene=off` 再打开，确认是不是主题没加载；
4. 打开开发者工具 Console，看有没有 `[theme-cyrene]` 开头的报错。

### 侧栏还是鱼标

说明 `@deepseek-ai/dsh-client-ui-brand-official` 还占着插槽。检查本包的 `cordis.patch.yml` 是否被正确应用；如果你的 DSH 版本改了官方品牌行的 id，需要把 patch 里的 `ui-brand-official` 改成新的 id。

### 开屏不出现

- 「轻」档默认关闭开屏；到设置里打开。
- 检查是否在本次会话已经看过（同一会话只播一次）。
- 面板里点 `▶` 可以立即重播。

### 水印看不到

- 美化程度必须是「全」；
- 「对话背景」必须开着；
- 水印只在对话内容区域显示，空会话看不到。

### 升级 Harness 后白屏

1. 地址栏加 `?cyrene=off` 再回车；
2. 如果能进，说明主题与新版不兼容；
3. 插件页卸载本包，重启；
4. 等主题适配新版，或回退 Harness。

### 想彻底清空偏好

地址栏加 `?cyrene=reset`，或者在开发者工具里执行：

```js
localStorage.removeItem('dsh.cyrene.v1')
localStorage.removeItem('dsh.cyrene.splashSeen')
localStorage.removeItem('dsh.cyrene.splashDeck')
```

然后刷新。

---

## 10. 仍然卡住？

请附上这些信息开 issue：

- Harness 版本（设置 → 关于，或 `dsh --version`）；
- 操作系统；
- 安装方式（目录 / tgz / GitHub / CLI）；
- Console 里 `[theme-cyrene]` 开头的完整报错；
- 插件页里组合包的状态截图。

不要附整个 profile 目录，里面可能含有你的会话与凭据。
