using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

public class PanelWindow : Window
{
    private readonly AppHost app;
    private WebView2CompositionControl web;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    private bool allowClose;
    private bool dragging;
    private Point dragStart;
    private double dragLeft;
    private double dragTop;

    public PanelWindow(AppHost app)
    {
        this.app = app;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        try { Icon = BitmapFrame.Create(new Uri(Path.Combine(app.WebRoot, "assets", "icon.ico"))); } catch { }
        Width = 1100;
        Height = 760;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ShowInTaskbar = true;
        ResizeMode = ResizeMode.NoResize;

        web = new WebView2CompositionControl();
        web.DefaultBackgroundColor = System.Drawing.Color.Transparent;
        Content = web;
        Loaded += OnLoaded;
        Closing += (s, e) =>
        {
            if (!allowClose)
            {
                e.Cancel = true;
                Hide();
            }
        };
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var env = await app.EnvironmentTask;
            await web.EnsureCoreWebView2Async(env);
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("noteon.local", app.WebRoot, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsWebMessageEnabled = true;
            core.WebMessageReceived += OnWebMessage;
            await core.AddScriptToExecuteOnDocumentCreatedAsync(app.BridgeJs);
            core.Navigate("https://noteon.local/renderer/panel.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.ToString(), "WebView2");
        }
    }

    public void ClosePanel()
    {
        allowClose = true;
        Close();
    }

    private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var msg = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            if (msg == null) return;
            var id = msg.ContainsKey("id") ? Convert.ToInt32(msg["id"]) : 0;
            var method = msg.ContainsKey("method") ? Convert.ToString(msg["method"]) : "";
            object[] args = new object[0];
            if (msg.ContainsKey("args") && msg["args"] is IList)
            {
                var al = (IList)msg["args"];
                args = new object[al.Count];
                al.CopyTo(args, 0);
            }
            object result = null;
            string error = null;
            try { result = Dispatch(method, args); }
            catch (Exception ex) { error = ex.Message; }
            var resp = new Dictionary<string, object>();
            resp["id"] = id;
            resp["result"] = result;
            if (error != null) resp["error"] = error;
            if (web != null && web.CoreWebView2 != null)
            {
                try { web.CoreWebView2.PostWebMessageAsJson(json.Serialize(resp)); } catch { }
            }
        }
        catch (Exception ex)
        {
            File.AppendAllText(Path.Combine(app.DataDir, "panel-error.txt"), ex.ToString() + Environment.NewLine);
        }
    }

    private object Dispatch(string method, object[] args)
    {
        if (method == "listPlugins") return PluginList();
        if (method == "listCards") return CardList();
        if (method == "createCard")
        {
            var opts = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            return CreateCard(opts);
        }
        if (method == "panelUpdateCard")
        {
            var cid = args.Length > 0 ? Convert.ToString(args[0]) : "";
            var patch = args.Length > 1 ? args[1] as Dictionary<string, object> : null;
            var w = app.FindWindow(cid);
            if (w != null && patch != null) { w.ApplyExternalPatch(patch); w.PostCardUpdated(); }
            PostBoard();
            return true;
        }
        if (method == "showCard")
        {
            var w = app.FindWindow(args.Length > 0 ? Convert.ToString(args[0]) : "");
            if (w != null) { w.Show(); w.Activate(); }
            return true;
        }
        if (method == "closeCard")
        {
            var w = app.FindWindow(args.Length > 0 ? Convert.ToString(args[0]) : "");
            if (w != null) w.CloseFromPanel();
            PostBoard();
            return true;
        }
        if (method == "showAllCards") { foreach (var w in app.Windows) { w.Show(); } return true; }
        if (method == "hideAllCards") { foreach (var w in app.Windows) { w.Hide(); } return true; }
        if (method == "unlockAll") return true;
        if (method == "getSettings") return app.Store.Settings;
        if (method == "setSettings")
        {
            var patch = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            if (patch != null) foreach (var kv in patch) app.Store.Settings[kv.Key] = kv.Value;
            app.Store.Save();
            foreach (var w in app.Windows) w.PostTheme();
            return app.Store.Settings;
        }
        if (method == "applyToAll")
        {
            var patch = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            if (patch != null)
            {
                foreach (var c in app.Store.Cards)
                {
                    if (patch.ContainsKey("themeId")) c.themeId = Convert.ToString(patch["themeId"]);
                    if (patch.ContainsKey("accent")) c.accent = Convert.ToString(patch["accent"]);
                    if (patch.ContainsKey("alpha")) c.alpha = patch["alpha"] == null ? (double?)null : Convert.ToDouble(patch["alpha"]);
                    var w = app.FindWindow(c.id);
                    if (w != null) w.PostCardUpdated();
                }
                app.Store.Save();
            }
            return true;
        }
        if (method == "getShellMenu")
        {
            var d = new Dictionary<string, object>();
            var pairs = new List<object>();
            foreach (var id in app.PluginIds())
            {
                var p = app.GetPlugin(id);
                pairs.Add(new object[] { id, p.name });
            }
            d["enabled"] = Convert.ToBoolean(app.Store.Settings.ContainsKey("contextMenu") ? app.Store.Settings["contextMenu"] : false);
            d["plugins"] = pairs;
            d["selected"] = app.SelectedMenuIds();
            return d;
        }
        if (method == "setShellMenu")
        {
            var cfg = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            var enabled = cfg != null && cfg.ContainsKey("enabled") && Convert.ToBoolean(cfg["enabled"]);
            var ids = new List<string>();
            if (cfg != null && cfg.ContainsKey("plugins") && cfg["plugins"] is IList)
            {
                var al = (IList)cfg["plugins"];
                foreach (var x in al) ids.Add(Convert.ToString(x));
            }
            if (ids.Count == 0) ids = app.SelectedMenuIds();
            app.Store.Settings["contextMenu"] = enabled && ids.Count > 0;
            app.Store.Settings["contextMenuPlugins"] = ids;
            app.Store.Save();
            bool ok;
            if (enabled && ids.Count > 0) ok = ShellMenu.Install(app, ids);
            else ok = ShellMenu.Uninstall(app);
            var d = new Dictionary<string, object>();
            d["ok"] = ok;
            d["enabled"] = enabled && ids.Count > 0;
            d["selected"] = ids;
            if (!ok) d["error"] = "注册表写入失败";
            return d;
        }
        if (method == "openDataDir") { Process.Start("explorer.exe", "\"" + app.DataDir + "\""); return true; }
        if (method == "openPluginDir") { Process.Start("explorer.exe", "\"" + Path.Combine(app.WebRoot, "plugins") + "\""); return true; }
        if (method == "openDocs") { Process.Start("explorer.exe", "\"" + Path.Combine(app.WebRoot, "docs") + "\""); return true; }
        if (method == "minimize") { WindowState = WindowState.Minimized; return true; }
        if (method == "maximize") { WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized; return true; }
        if (method == "close") { Hide(); return true; }
        if (method == "dragStart") { DragStart(PointFrom(args)); return true; }
        if (method == "dragMove") { DragMove(PointFrom(args)); return true; }
        if (method == "dragEnd") { dragging = false; return true; }
        return null;
    }

    private static Point PointFrom(object[] args)
    {
        if (args.Length == 0) return new Point(0, 0);
        var d = args[0] as Dictionary<string, object>;
        if (d == null) return new Point(0, 0);
        return new Point(d.ContainsKey("x") ? Convert.ToDouble(d["x"]) : 0, d.ContainsKey("y") ? Convert.ToDouble(d["y"]) : 0);
    }

    private void DragStart(Point p)
    {
        dragging = true;
        dragStart = p;
        dragLeft = Left;
        dragTop = Top;
    }

    private void DragMove(Point p)
    {
        if (!dragging) return;
        Left = dragLeft + (p.X - dragStart.X);
        Top = dragTop + (p.Y - dragStart.Y);
    }

    private List<object> PluginList()
    {
        var list = new List<object>();
        var dir = Path.Combine(app.WebRoot, "plugins");
        if (!Directory.Exists(dir)) return list;
        foreach (var sub in Directory.GetDirectories(dir))
        {
            var p = app.GetPlugin(Path.GetFileName(sub));
            if (string.IsNullOrEmpty(p.id)) continue;
            var d = new Dictionary<string, object>();
            d["id"] = p.id;
            d["name"] = p.name;
            d["description"] = p.description;
            d["version"] = p.version;
            d["accent"] = p.accent;
            d["order"] = p.order;
            d["iconUrl"] = string.IsNullOrEmpty(p.icon) ? "" : app.PluginUrl(p.id, p.icon);
            d["entryUrl"] = app.PluginUrl(p.id, p.entry);
            d["styleUrl"] = string.IsNullOrEmpty(p.style) ? "" : app.PluginUrl(p.id, p.style);
            d["defaultSize"] = p.defaultSize;
            d["minSize"] = p.minSize;
            list.Add(d);
        }
        return list;
    }

    private List<object> CardList()
    {
        var list = new List<object>();
        foreach (var c in app.Store.Cards) list.Add(CardData(c));
        return list;
    }

    private Dictionary<string, object> CardData(Card c)
    {
        var p = app.GetPlugin(c.plugin);
        var d = new Dictionary<string, object>();
        d["id"] = c.id;
        d["plugin"] = c.plugin;
        d["pluginName"] = p.name;
        d["title"] = c.title;
        d["state"] = c.state ?? new Dictionary<string, object>();
        d["alwaysOnTop"] = c.alwaysOnTop;
        d["desktop"] = c.desktop;
        d["locked"] = c.locked;
        d["themeId"] = c.themeId ?? "";
        d["accent"] = c.accent ?? "";
        d["alpha"] = c.alpha;
        d["bounds"] = new Dictionary<string, object> { { "x", c.x }, { "y", c.y }, { "width", c.w }, { "height", c.h } };
        return d;
    }

    private object CreateCard(Dictionary<string, object> opts)
    {
        var plugin = opts != null && opts.ContainsKey("plugin") ? Convert.ToString(opts["plugin"]) : "note";
        var p = app.GetPlugin(plugin);
        double w = p.defaultSize != null ? p.defaultSize[0] : 420;
        double h = p.defaultSize != null ? p.defaultSize[1] : 480;
        var c = app.Store.Add(plugin, "", 180, 140, w, h, new Dictionary<string, object>());
        app.OpenCard(c, true);
        PostBoard();
        return CardData(c);
    }

    private void PostBoard()
    {
        if (web == null || web.CoreWebView2 == null) return;
        var d = new Dictionary<string, object>();
        d["event"] = "board:changed";
        d["payload"] = CardList();
        web.CoreWebView2.PostWebMessageAsJson(json.Serialize(d));
    }
}
