using System;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
using System.Windows;
using System.Windows.Interop;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Threading;
using WinForms = System.Windows.Forms;
using Drawing = System.Drawing;

class Program
{
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    static void FlushAndExit(AppHost host, Application app)
    {
        var windows = new List<CardWindow>(host.Windows);
        foreach (var w in windows) w.FlushState();
        // 给 WebView2 的 saveState 消息留出处理时间。
        var frame = new DispatcherFrame();
        var timer = new DispatcherTimer();
        timer.Interval = TimeSpan.FromMilliseconds(260);
        timer.Tick += (s, e) => { timer.Stop(); frame.Continue = false; };
        timer.Start();
        Dispatcher.PushFrame(frame);
        try { host.Store.Save(); } catch { }
        app.Shutdown();
    }

    [STAThread]
    static void Main()
    {
        // GUI 程序从终端启动时不要继续挂在父控制台上。
        try { FreeConsole(); } catch { }
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var cmdArgs = Environment.GetCommandLineArgs();
        string reqPlugin = null;
        string reqPath = null;
        for (int i = 0; i < cmdArgs.Length; i++)
        {
            if (cmdArgs[i] == "--new" && i + 1 < cmdArgs.Length) reqPlugin = cmdArgs[++i];
            else if (cmdArgs[i] == "--path" && i + 1 < cmdArgs.Length) reqPath = cmdArgs[++i];
        }
        bool createdNew;
        var mutex = new Mutex(true, "NoteonCSharpHost", out createdNew);
        if (!createdNew)
        {
            WriteLaunch(baseDir, reqPlugin, reqPath);
            return;
        }
        var bridgePath = Path.Combine(baseDir, "bridge.js");
        if (!File.Exists(bridgePath))
        {
            MessageBox.Show("bridge.js 不存在", "Noteon");
            return;
        }
        var webRoot = FindWebRoot(baseDir);
        var dataDir = Path.Combine(baseDir, "data");
        Directory.CreateDirectory(dataDir);
        AppDomain.CurrentDomain.UnhandledException += (s, e) => { try { File.AppendAllText(Path.Combine(dataDir, "crash.log"), DateTime.Now + " | " + e.ExceptionObject); } catch { } };
        var legacyBoard = Path.Combine(webRoot, "data", "board.json");
        var targetBoard = Path.Combine(dataDir, "board.json");
        if (!File.Exists(targetBoard) && File.Exists(legacyBoard))
        {
            try { File.Copy(legacyBoard, targetBoard); } catch { }
        }
        var store = new Store(dataDir);
        if (!store.Settings.ContainsKey("autoStart"))
        {
            try { AutoStart.Set(true); } catch { }
            store.Settings["autoStart"] = true;
            store.Save();
        }
        if (!store.Settings.ContainsKey("version"))
        {
            store.Settings["version"] = "1.0.0";
            store.Save();
        }
        var host = new AppHost();
        host.Store = store;
        host.WebRoot = webRoot;
        host.DataDir = dataDir;
        host.BridgeJs = File.ReadAllText(bridgePath);

        if (reqPlugin == null && store.Cards.Count == 0)
        {
            var state = new Dictionary<string, object>();
            state["text"] = @"# 欢迎使用 Noteon

**作者：ACMinerva** · 版本 **1.0.0**

Noteon 是一个桌面便签 / 卡片容器。每张卡片都是独立小窗口，卡片里能做什么由插件决定。

## 内置卡片

- **便签**：Markdown 编辑与预览、字号、自动保存
- **文本**：打开 txt / md / 代码，自动保存，可拖入文件
- **图片**：缩放、拖动、多图、分割对比、三分网格、翻转、取色；双击图片隐藏 UI
- **截屏**：全屏或拖框截取，裁剪 / 旋转 / 翻转 / 画布编辑，生成图片卡片
- **文件夹映射**：双击打开，列表 / 网格图片预览，小 / 中 / 大图标
- **网页**：网址或本地 HTML，地址栏、前进后退、缩放
- **文件中转**：暂存文件，再拖到桌面、聊天窗口或其他软件
- **绘画 Demo**：笔刷、橡皮、图层、选区、复制粘贴、导入图片

## 快捷键

- **Ctrl+Alt+N**：显示全部卡片并排列
- **Ctrl+Alt+Shift+N**：弹出「新建卡片」选择窗口
- **Ctrl+W**：关闭并删除当前卡片
- **Ctrl+H**：隐藏当前卡片（可从托盘或控制台恢复）
- **Esc**：关闭菜单 / 退出重命名 / 退出图片纯图模式
- **图片双击**：进入或退出纯图模式
- **文件夹 F5**：刷新
- **文件夹 Backspace / Alt+↑**：上一级
- **文件夹 Enter**：打开选中项
- **控制台 F5**：刷新

## 卡片标题栏

- 最左：关闭并删除卡片
- 中间：标题
- 最右：隐藏卡片
- 其他：置顶、全屏、小窗、卡片设置

## 控制台

- 托盘单击或双击打开控制台
- 主题、透明度、置顶、桌面组件、鼠标穿透
- 卡片管理、插件、右键菜单
- 开机自启默认开启，可在设置里关闭

## 右键新建

在桌面或文件夹空白处右键，选择「在 Noteon 新建」。

## 数据

卡片和内容保存在程序目录的 data/board.json，正常退出会自动保存。点最左的 × 会删除卡片；想保留内容请用最右端的隐藏。";
            state["fontSize"] = 14;
            state["preview"] = true;
            store.Add("note", "欢迎使用 Noteon", 180, 140, 460, 500, state);
        }

        var app = new Application();
        app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
        app.DispatcherUnhandledException += (s, e) => { try { File.AppendAllText(Path.Combine(dataDir, "crash.log"), DateTime.Now + " | " + e.Exception); } catch { } };
        host.EnvironmentTask = Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDir, "webview2"), null);
        foreach (var c in store.Cards)
        {
            var w = host.OpenCard(c, false);
            w.Show();
        }

        if (reqPlugin != null)
        {
            host.CreateFromLaunch(reqPlugin, reqPath);
        }

        HwndSource hotkey = null;
        try
        {
            var hp = new HwndSourceParameters("NoteonHotkey");
            hp.Width = 0; hp.Height = 0; hp.WindowStyle = 0;
            hotkey = new HwndSource(hp);
            hotkey.AddHook(delegate(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
            {
                if (msg == 0x0312)
                {
                    var id = wParam.ToInt32();
                    if (id == 1) host.ShowAndTile();
                    else if (id == 2) host.ShowNewCardWindow();
                    handled = true;
                }
                return IntPtr.Zero;
            });
            RegisterHotKey(hotkey.Handle, 1, 0x0002 | 0x0001, 0x4E);
            RegisterHotKey(hotkey.Handle, 2, 0x0002 | 0x0001 | 0x0004, 0x4E);
        }
        catch { }

        var noPanel = Array.IndexOf(cmdArgs, "--nopanel") >= 0 || reqPlugin != null;
        // 不在启动时自动打开控制台：面板和卡片的 WebView2 同时初始化会互相卡住。
        // 控制台改由托盘手动打开。

        if (Convert.ToBoolean(host.Store.Settings.ContainsKey("contextMenu") ? host.Store.Settings["contextMenu"] : false))
        {
            ShellMenu.Install(host, host.SelectedMenuIds());
        }

        var launchTimer = new DispatcherTimer();
        launchTimer.Interval = TimeSpan.FromMilliseconds(700);
        launchTimer.Tick += (s, e) => ProcessLaunchQueue(dataDir, host);
        launchTimer.Start();

        var fgTimer = new DispatcherTimer();
        fgTimer.Interval = TimeSpan.FromMilliseconds(500);
        fgTimer.Tick += (s, e) => { foreach (var w in host.Windows) w.CheckFullscreenForeground(); };
        fgTimer.Start();

        WinForms.NotifyIcon tray = null;
        try
        {
            var iconPath = Path.Combine(webRoot, "assets", "icon.ico");
            tray = new WinForms.NotifyIcon();
            tray.Icon = new Drawing.Icon(iconPath);
            tray.Text = "Noteon";
            tray.Visible = true;
            var menu = new WinForms.ContextMenuStrip();
            var newItem = new WinForms.ToolStripMenuItem("新建卡片…");
            newItem.Click += (s, e) => host.ShowNewCardWindow();
            menu.Items.Add(newItem);
            var openItem = new WinForms.ToolStripMenuItem("控制台");
            openItem.Click += (s, e) => { host.OpenPanel(); };
            var exitItem = new WinForms.ToolStripMenuItem("退出 Noteon");
            exitItem.Click += (s, e) =>
            {
                if (host.Panel != null) host.Panel.ClosePanel();
                if (tray != null) tray.Visible = false;
                FlushAndExit(host, app);
            };
            menu.Items.Add(openItem);
            var autoItem = new WinForms.ToolStripMenuItem("开机启动");
            autoItem.Checked = AutoStart.IsEnabled();
            autoItem.Click += (s, e) => { autoItem.Checked = !autoItem.Checked; AutoStart.Set(autoItem.Checked); host.Store.Settings["autoStart"] = autoItem.Checked; host.Store.Save(); };
            menu.Items.Add(autoItem);
            var allDesk = new WinForms.ToolStripMenuItem("全部桌面模式");
            allDesk.Click += (s, e) => host.SetAllDesktop(true);
            var noDesk = new WinForms.ToolStripMenuItem("全部取消桌面模式");
            noDesk.Click += (s, e) => host.SetAllDesktop(false);
            menu.Items.Add(allDesk);
            menu.Items.Add(noDesk);
            menu.Items.Add(new WinForms.ToolStripSeparator());
            menu.Items.Add(exitItem);
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => { host.OpenPanel(); };
        }
        catch { }

        app.Run();
        try { store.Save(); } catch { }
        launchTimer.Stop();
        try { mutex.ReleaseMutex(); } catch { }
        if (hotkey != null) { try { UnregisterHotKey(hotkey.Handle, 1); hotkey.Dispose(); } catch { } }
        if (tray != null) tray.Dispose();
    }

    static string LaunchDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Noteon", "launch");
    }

    static void WriteLaunch(string baseDir, string plugin, string path)
    {
        try
        {
            if (string.IsNullOrEmpty(plugin)) return;
            var dir = LaunchDir();
            Directory.CreateDirectory(dir);
            var d = new Dictionary<string, object>();
            d["plugin"] = plugin;
            d["path"] = path ?? "";
            var file = Path.Combine(dir, "launch-" + Process.GetCurrentProcess().Id + ".json");
            File.WriteAllText(file, new JavaScriptSerializer().Serialize(d));
        }
        catch { }
    }

    static void ProcessLaunchQueue(string dataDir, AppHost host)
    {
        try
        {
            var dirs = new List<string> { LaunchDir() };
            if (!string.Equals(dataDir, LaunchDir(), StringComparison.OrdinalIgnoreCase)) dirs.Add(dataDir);
            var files = new List<string>();
            foreach (var dir in dirs)
            {
                try { if (Directory.Exists(dir)) files.AddRange(Directory.GetFiles(dir, "launch-*.json")); } catch { }
            }
            foreach (var file in files)
            {
                try
                {
                    var d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
                    File.Delete(file);
                    if (d == null) continue;
                    var plugin = d.ContainsKey("plugin") ? Convert.ToString(d["plugin"]) : "note";
                    var path = d.ContainsKey("path") ? Convert.ToString(d["path"]) : "";
                    host.CreateFromLaunch(plugin, path);
                }
                catch { }
            }
        }
        catch { }
    }

    static string FindWebRoot(string start)
    {
        var d = new DirectoryInfo(start);
        while (d != null)
        {
            if (File.Exists(Path.Combine(d.FullName, "renderer", "card.html"))) return d.FullName;
            d = d.Parent;
        }
        return start;
    }
}
