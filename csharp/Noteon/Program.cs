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
        var host = new AppHost();
        host.Store = store;
        host.WebRoot = webRoot;
        host.DataDir = dataDir;
        host.BridgeJs = File.ReadAllText(bridgePath);

        if (reqPlugin == null && store.Cards.Count == 0)
        {
            var state = new Dictionary<string, object>();
            state["text"] = "# 你好，Noteon (C# WebView2)\n\n这是新的 C# 宿主，正在逐步接管原来的 Electron 功能。\n\n- 透明卡片\n- 拖动标题栏移动\n- 右下角缩放\n- 关闭按钮";
            state["fontSize"] = 14;
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
                    host.ShowAndTile();
                    handled = true;
                }
                return IntPtr.Zero;
            });
            RegisterHotKey(hotkey.Handle, 1, 0x0002 | 0x0001, 0x4E);
        }
        catch { }

        var noPanel = Array.IndexOf(cmdArgs, "--nopanel") >= 0 || reqPlugin != null;
        if (!noPanel) host.OpenPanel();

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
            var openItem = new WinForms.ToolStripMenuItem("控制台");
            openItem.Click += (s, e) => { if (host.Panel != null) host.Panel.Show(); else host.OpenPanel(); };
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
            autoItem.Click += (s, e) => { autoItem.Checked = !autoItem.Checked; AutoStart.Set(autoItem.Checked); };
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
            tray.DoubleClick += (s, e) => { if (host.Panel != null) host.Panel.Show(); else host.OpenPanel(); };
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
