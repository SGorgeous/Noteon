# Noteon

> 一个桌面便签工具，也是一个「卡片容器」。  
> 每张卡片都是独立、无边框、可置顶的小窗口；卡片里能做什么，由插件决定。

![控制台](docs/img/console.png)

## 当前版本：C# WPF + WebView2

从 **v2.0.0** 起，Noteon 的默认分支是 C# WPF + WebView2 宿主，不再使用 Electron 运行时。

- 下载：[Noteon v2.0.0](https://github.com/SGorgeous/Noteon/releases/tag/v2.0.0)
- 便携包：`Noteon-win64.zip`，解压后直接运行 `Noteon.exe`
- 需要 Windows 10/11 + 系统 WebView2 Runtime（Edge 自带）

旧 Electron 版保留在：
- 分支：`electron-legacy`
- 标签：`v0.1.2` 及更早的 Release

## 插件

| 插件 | 能做什么 |
| --- | --- |
| 便签 | 随手写，Markdown 预览，自动保存 |
| 文本 | 打开 / 编辑 txt、md、代码，自动保存，可拖入文件 |
| 图片 | 滚轮缩放、拖动、多图、分割对比、三分网格、水平翻转；双击进入纯图模式，右键取色 |
| 截屏 | 全屏或拖框截取，裁剪 / 旋转 / 翻转 / 画布编辑，直接生成图片卡片 |
| 文件夹映射 | 把文件夹钉在桌面，浏览、打开、拖入即复制 |
| 网页 | 网址或本地 HTML，地址栏、前进后退、缩放；没写协议自动补 `http://` |
| 文件中转 | 暂存文件，再拖到桌面 / 聊天窗口 / 任意软件 |

## 操作

| 操作 | 方式 |
| --- | --- |
| 移动卡片 | 拖标题栏（原生窗口拖动） |
| 缩放卡片 | 拖左右边、底边或底角 |
| 置顶 / 取消 | 标题栏图钉，或卡片 `⋯` |
| 换主题 / 透明度 / 重命名 | 卡片 `⋯` |
| 隐藏卡片 | 标题栏眼睛图标 |
| 关闭卡片 | 标题栏 × |
| 桌面模式 | 卡片 `⋯` → 桌面模式（不置顶） |
| 全部显示并排列 | `Ctrl+Alt+N`，或托盘菜单 |
| 资源管理器新建 | 桌面 / 文件夹空白处右键 → 在 Noteon 新建 |

## 目录

```
csharp/                 C# WPF + WebView2 宿主（当前主分支）
  Noteon/               宿主源码 + build.ps1 / pack.ps1
  install.ps1           安装器
  uninstall.ps1         卸载器
renderer/               卡片壳、控制台、共享主题与图标
plugins/                插件
main/                   Electron 旧主进程（electron-legacy 分支）
assets/                 图标
docs/                   使用与插件开发文档
data/                   卡片数据，运行时生成（不进版本库）
```

## 构建 C# 版

```powershell
cd csharp/Noteon
.\build.ps1          # 生成 Noteon.exe
.\pack.ps1           # 生成 dist\Noteon-win64.zip
```

要求：Windows 10/11、.NET Framework 4.8、WebView2 Runtime。

## 数据

| 内容 | 位置 |
| --- | --- |
| 卡片、位置、主题、插件设置 | `<Noteon 目录>\data\board.json` |
| WebView2 缓存 | `<Noteon 目录>\data\webview2\` |
| 截屏 | `<Noteon 目录>\data\shots\` |

数据全部在程序目录内；重置即退出后删除 `data`。

## 已知边界

- 真正壁纸层嵌入不可行：WPF `SetParent` 后卡片不可见，当前提供安全的「桌面模式」。
- 网页卡片不能在壁纸层嵌入，但可以正常独立播放视频；关闭卡片会释放 WebView2。
- 只有 Windows 构建。

## 旧 Electron 版

分支 `electron-legacy`，包含 v0.1.2 及之前的功能：

```powershell
git switch electron-legacy
```

旧版使用 `runtime/electron/`，不进版本库。
