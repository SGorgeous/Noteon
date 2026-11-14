# Noteon

> 桌面便签，也是一个「卡片容器」。  
> 每张卡片都是独立、无边框的小窗口；卡片里能做什么，由插件决定。

![控制台](docs/img/console.png)

## 项目状态

从 **v2.0.0** 起，Noteon 的默认实现是 **C# WPF + WebView2**：

- `main` / `v2-csharp`：C# 宿主（当前主分支）
- `electron-legacy`：旧 Electron 实现，保留 v0.1.2 及更早版本
- 便携包：`csharp/dist/Noteon-win64.zip`，解压后运行 `Noteon.exe`
- 环境：Windows 10/11 + 系统 WebView2 Runtime（Edge 自带）
- 运行时：.NET Framework 4.8

C# 宿主不是把 Electron 嵌进去，而是：

- **WPF** 负责透明窗口、无边框拖动、缩放、置顶、全屏、托盘、全局热键
- **WebView2** 负责卡片界面和 Web 内容
- 现有的 `renderer/`、`plugins/` 全部复用，不需要为 C# 重写插件

## 功能

### 卡片

- 独立无边框窗口，可拖动、缩放、置顶、隐藏、关闭
- 主题、单卡主题覆盖、不透明度、重命名
- 全屏 / 小窗
- **桌面组件层**：卡片位于普通窗口之下、Windows 桌面之上；应用盖住时被遮挡，回到桌面时出现
- 自动吸附屏幕边缘和其他卡片边缘（可在控制台关闭）
- 退出时先让插件保存，再写 `board.json`

### 内置插件

| 插件 | 能做什么 |
| --- | --- |
| 便签 | Markdown 编辑与预览、字号、自动保存 |
| 文本 | 打开/编辑 txt、md、代码，自动保存，可拖入文件 |
| 图片 | 缩放、拖动、多图、分割对比、三分网格、翻转、双击纯图、右键取色 |
| 截屏 | 全屏或拖框截取，裁剪/旋转/翻转/画布编辑，生成图片卡片 |
| 文件夹映射 | 把文件夹钉在桌面，浏览、打开、拖入复制 |
| 网页 | 网址或本地 HTML，地址栏、前进后退、缩放 |
| 文件中转 | 暂存文件，再拖到桌面、聊天窗口或其他软件 |
| 绘画 Demo | Painteon 精简演示：笔刷、橡皮、图层、选区、复制粘贴、导入图片 |

### 控制台

- 从托盘打开（启动时不再自动打开，避免和卡片 WebView2 同时初始化）
- 卡片管理、主题、插件设置、右键新建菜单配置
- `Esc` 或 `Alt+F4` 关闭

### 系统集成

- 托盘菜单
- 全局热键 `Ctrl+Alt+N`：显示全部卡片并排列
- 桌面/文件夹右键 →「在 Noteon 新建」
- 开机启动
- 单实例：再次运行 `Noteon.exe --new ...` 会把新建请求交给已运行实例

## 项目结构

```text
Noteon/
  csharp/
    Noteon/                C# 宿主源码
      Program.cs           入口、单实例、托盘、热键、启动队列
      CardWindow.cs        卡片 WPF 窗口 + WebView2 + 原生拖动/缩放
      PanelWindow.cs       控制台窗口
      RegionWindow.cs      区域截屏遮罩
      Store.cs             board.json 读写
      ShellMenu.cs         右键菜单注册
      AutoStart.cs         开机启动
      bridge.js            JS ↔ C# 桥
      build.ps1            编译
      pack.ps1             生成便携 zip
    install.ps1
    uninstall.ps1
    lib/webview2/          WebView2 SDK
    dist/                  打包输出
  renderer/
    card.html/js/css       卡片外壳（标题栏、菜单、主题、事件）
    panel.html/js/css      控制台
    shared/                主题、图标、基础样式
  plugins/
    note/ text/ image/ screenshot/ folder/ web/ relay/ paint/
  assets/
    icon.ico               程序图标
  docs/
    使用说明.md
    插件开发.md
```

## 构建与运行

### 直接运行

```powershell
cd Q:\DSH\Projects\Noteon\csharp\Noteon
.\build.ps1
.\Noteon.exe
```

### 生成便携包

```powershell
cd Q:\DSH\Projects\Noteon\csharp\Noteon
.\pack.ps1
```

输出：

```text
csharp/dist/Noteon-win64.zip
```

包内包含 exe、WebView2 SDK DLL、`bridge.js`、`renderer/`、`plugins/`、`assets/`。

### 从旧版迁移数据

旧 Electron 数据在 `renderer/data/board.json` 或旧 `data/board.json`。  
C# 首次启动时，如果程序目录下的 `data/board.json` 不存在，会自动尝试复制旧数据。

## 数据存放

| 内容 | 位置 |
| --- | --- |
| 卡片、位置、主题、插件状态 | `<Noteon 目录>\data\board.json` |
| WebView2 缓存 | `<Noteon 目录>\data\webview2\` |
| 截屏临时文件 | `<Noteon 目录>\data\shots\` |
| 崩溃日志 | `<Noteon 目录>\data\crash.log` |

数据默认全部在程序目录内，删掉 `data` 就是重置。

## 插件制作

Noteon 的插件是**运行在卡片 WebView2 里的本地前端代码**，不需要编译，不需要 C#。  
宿主只负责窗口、文件、剪贴板、截屏、WebView 子窗口等系统能力；插件负责卡片内部的一切 UI 和逻辑。

### 1. 目录结构

在 `plugins/` 下新建一个目录，例如 `hello/`：

```text
plugins/hello/
  plugin.json      插件清单（必需）
  index.js         入口（必需）
  style.css        卡片样式（可选）
  icon.svg         图标（可选）
```

一个最小插件：

```text
plugins/hello/plugin.json
plugins/hello/index.js
```

### 2. plugin.json

```json
{
  "id": "hello",
  "name": "问候",
  "description": "一个最小示例插件",
  "version": "1.0.0",
  "icon": "icon.svg",
  "entry": "index.js",
  "style": "style.css",
  "defaultSize": [320, 240],
  "minSize": [220, 160],
  "order": 90,
  "accent": "#5eead4"
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一 ID，必须和目录名、`Noteon.define` 的 `id` 一致 |
| `name` | 显示名称 |
| `description` | 新建卡片时的说明 |
| `version` | 插件版本 |
| `icon` | 图标，相对插件目录，建议 SVG |
| `entry` | 入口 JS，通常 `index.js` |
| `style` | 卡片 CSS，可选 |
| `defaultSize` | 新建卡片默认尺寸 `[宽, 高]`（DIP） |
| `minSize` | 最小尺寸 |
| `order` | 新建面板中的排序，越小越靠前 |
| `accent` | 插件强调色，用于新建列表等 |

### 3. index.js 生命周期

插件入口必须调用 `window.Noteon.define`：

```js
'use strict';

window.Noteon.define({
  id: 'hello',

  async mount(ctx) {
    const { root, api } = ctx;

    root.innerHTML = `
      <div class="hello">
        <h2>Hello, Noteon</h2>
        <button class="hello-btn">点我</button>
        <p class="hello-tip"></p>
      </div>`;

    const tip = root.querySelector('.hello-tip');
    root.querySelector('.hello-btn').addEventListener('click', () => {
      tip.textContent = '你点了按钮';
      api.toast('已点击');
    });

    return {
      unmount() {
        // 卡片关闭 / Noteon 退出前调用，适合保存状态、停止定时器
      }
    };
  }
});
```

`mount(ctx)` 可以返回一个对象：

- `unmount()`：卡片关闭或退出前调用
- 其他字段不会被宿主使用，插件可自行保存

### 4. ctx 提供什么

| 字段 | 说明 |
| --- | --- |
| `ctx.root` | 插件专属根节点，已经插入卡片内容区 |
| `ctx.manifest` | 当前 `plugin.json` |
| `ctx.card` | 卡片数据，包含 `id/title/state/...` |
| `ctx.theme` | 当前主题，`get ctx.theme` 可实时读取 |
| `ctx.api` | 宿主 API（见下表） |
| `ctx.util` | 常用工具函数 |
| `ctx.icon(name, size)` | 使用内置 SVG 图标 |
| `ctx.onDrop(fn)` | 拖入文件回调 |
| `ctx.onTheme(fn)` | 主题变化回调 |
| `ctx.onCardUpdate(fn)` | 卡片更新回调 |

### 5. 常用 API

#### 卡片与窗口

| API | 说明 |
| --- | --- |
| `api.title(text)` | 修改标题 |
| `api.close()` | 关闭卡片 |
| `api.hide()` | 隐藏卡片 |
| `api.setImmersive(on)` | 进入/退出纯内容模式 |
| `api.openCard({ plugin, state, title, ... })` | 新建卡片 |
| `api.openFile(path)` | 用系统默认程序打开文件 |
| `api.showCard(id)` | 显示指定卡片 |
| `api.listCards()` | 列出卡片 |
| `api.saveState(patch)` | 合并保存插件状态到 `board.json` |
| `api.toast(text)` | 卡片底部提示 |
| `api.setStatus(text)` | 显示/隐藏底部状态文字 |

#### 文件与对话框

| API | 说明 |
| --- | --- |
| `api.pickFolder()` | 选择文件夹 |
| `api.pickFiles(opts)` | 选择文件 |
| `api.saveFileDialog(opts)` | 另存为对话框 |
| `api.messageBox(opts)` | 系统消息框 |
| `api.readDir(dir, hidden)` | 读目录 |
| `api.readText(path, max)` | 读文本 |
| `api.writeText(path, text)` | 写文本 |
| `api.stat(path)` / `api.exists(path)` | 文件信息 |
| `api.copyInto(paths, dest)` | 复制文件到目录 |
| `api.listDrives()` | 列出盘符 |
| `api.reveal(path)` | 在资源管理器中显示 |
| `api.openPath(path)` | 用系统方式打开路径 |
| `api.openUrl(url)` | 用默认浏览器打开 URL |

#### 剪贴板与拖放

| API | 说明 |
| --- | --- |
| `api.copy(text)` | 复制文本 |
| `api.readClipboardText()` / `api.writeClipboardText(text)` | 文本剪贴板 |
| `api.readClipboardImage()` / `api.writeClipboardImage(data)` | 图片剪贴板 |
| `api.dragFile(path)` | 开始拖出一个文件 |

#### 图片与截屏

| API | 说明 |
| --- | --- |
| `await api.loadImage(src)` | 读取本地图片/URL，返回 Blob URL 和尺寸 |
| `api.captureScreen()` | 全屏截图 |
| `api.captureRegion()` | 区域截图 |
| `api.saveCapture(dataUrl, saveAs)` | 保存截图为文件 |

#### 网页子窗口

网页卡片使用独立的 WebView2 子窗口；其他插件如果需要嵌入网页，也可以使用：

| API | 说明 |
| --- | --- |
| `api.webMount(rect)` | 在卡片内创建网页子窗口 |
| `api.webBounds(rect)` | 更新网页区域 |
| `api.webLoad(url, rect)` | 加载网页 |
| `api.webAction(action)` | 前进/后退/刷新等 |
| `api.webZoom(factor)` | 缩放 |
| `api.webVisible(visible)` | 显示/隐藏 |
| `api.webDevTools()` / `api.webDestroy()` | 开发者工具 / 销毁 |

#### 菜单与设置

| API | 说明 |
| --- | --- |
| `api.menu(items, x, y)` | 打开卡片菜单，返回选中项 id |
| `api.invoke(fn, args)` | 调用 C# 宿主扩展方法 |
| `api.pluginSettings()` | 读取插件设置 |
| `api.savePluginSettings(patch)` | 保存插件设置 |
| `api.openDevTools()` | 打开卡片开发者工具 |
| `api.on(channel, cb)` | 监听宿主事件 |

### 6. 事件

| 事件 | 说明 |
| --- | --- |
| `theme:changed` | 全局主题或单卡主题变化 |
| `card:updated` | 卡片数据更新 |
| `plugins:reloaded` | 插件重载，宿主会自动刷新 |
| `noteon:flush` | 退出前刷新；插件通常只需要在 `unmount` 里保存 |

示例：

```js
ctx.api.on('theme:changed', () => {
  // 重新读取 ctx.theme 或重绘
});
```

### 7. 样式与主题

插件 `style.css` 会自动加载到卡片里。  
主题变量由 `renderer/shared/themes.js` 注入到 `document.documentElement`：

| 变量 | 说明 |
| --- | --- |
| `--bg` | 卡片背景（含透明度） |
| `--bg-solid` | 不透明背景色 |
| `--fg` | 主文字 |
| `--muted` | 次要文字 |
| `--border` | 边框色 |
| `--accent` | 强调色 |
| `--accent-soft` / `--accent-line` | 强调色弱化/线条 |
| `--hover` / `--active` | 悬停/按下 |
| `--panel` | 内层面板背景 |
| `--radius` | 圆角 |
| `--shadow` | 阴影 |
| `--sheen` | 高光渐变 |

建议插件只使用这些变量，不要在样式里写死黑/白，否则切换主题会不协调。

```css
.hello {
  padding: 14px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.hello button {
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}
```

### 8. 状态保存

插件状态保存在 `card.state` 中：

```js
// 读取
const theme = ctx.api.state.theme || 'light';

// 保存（会合并到 card.state）
ctx.api.saveState({ theme: 'dark', count: 3 });
```

不要直接写 `board.json`；让宿主统一保存，避免并发覆盖。

### 9. 加载、调试与重载

- 新建卡片时，控制台会读 `plugin.json` 并加载 `entry`
- 修改插件后：
  - 关闭并重新打开卡片，或
  - 控制台里重载插件，或
  - 在卡片里 `Ctrl+Shift+I` 打开开发者工具（`api.openDevTools()`）
- 插件入口 URL 带文件时间戳，正常情况下修改后刷新即可加载新代码

### 10. 安全边界

插件是**本地可信代码**，不是沙箱插件：

- 可以读写文件、访问剪贴板、打开网页
- 不要加载来源不明的插件
- 插件运行在卡片 WebView2 中，和宿主通过 `window.noteon` 通信
- 需要新的系统能力时，应在 `bridge.js` / C# 中增加明确 API，而不是让插件直接调用系统命令

## 常见问题

### 为什么不用 Electron 了？

C# + WebView2 启动更快、内存更低、安装包更小，同时保留现有 Web 插件生态。  
旧 Electron 版仍在 `electron-legacy` 分支。

### 卡片全透明后看不见？

不透明度最低为 **10%**；0% 会造成卡片不可见并且难以找回，所以不再允许。

### 桌面模式是什么？

「置于最底层（桌面组件）」会把卡片插到 Windows 桌面之上、普通应用窗口之下：

```text
普通应用窗口
    ↑
Noteon 桌面卡片
    ↑
Windows 桌面
```

它**不是**真正的壁纸层嵌入；C# WPF 的 `SetParent` 壁纸方案会让 WebView2 卡片不可见，因此当前采用安全的桌面组件层。

### 为什么控制台要从托盘打开？

卡片和控制台都使用 WebView2。启动时同时初始化两个 WebView2 控件会互相卡住，所以启动时只加载卡片，控制台由托盘按需打开。

### 数据在哪？

默认在程序目录的 `data/board.json`。便携包不会带 `data`，首次启动自动生成。

## 贡献

1. Fork / 新建分支
2. 修改 `renderer/` 或 `plugins/`
3. 用 `csharp/Noteon/build.ps1` 编译
4. 确认卡片能创建、编辑、保存、退出
5. 提 PR 时说明改了哪个插件/宿主行为

## License

见仓库 `LICENSE`。
