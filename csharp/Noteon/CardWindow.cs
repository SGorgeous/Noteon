using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Drawing.Imaging;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls.Primitives;
using WinForms = System.Windows.Forms;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Shell;
using System.Windows.Markup;
using System.Windows.Threading;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Animation;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

public class PluginInfo
{
    public string id = "";
    public string name = "";
    public string entry = "index.js";
    public string style = "";
    public string icon = "icon.svg";
    public string description = "";
    public string version = "0.0.0";
    public string accent = "";
    public int order = 100;
    public double[] defaultSize = new double[] { 420, 480 };
    public double[] minSize = new double[] { 240, 160 };
}

public class AppHost
{
    public Store Store;
    public string WebRoot;
    public string DataDir;
    public string BridgeJs;
    public List<CardWindow> Windows = new List<CardWindow>();
    public PanelWindow Panel;
    public NewCardWindow NewCardWindow;
    public Task<CoreWebView2Environment> EnvironmentTask;

    public PluginInfo GetPlugin(string id)
    {
        var p = new PluginInfo();
        p.id = id;
        try
        {
            var file = Path.Combine(WebRoot, "plugins", id, "plugin.json");
            if (File.Exists(file))
            {
                var json = new JavaScriptSerializer();
                var d = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
                if (d != null)
                {
                    if (d.ContainsKey("name")) p.name = Convert.ToString(d["name"]);
                    if (d.ContainsKey("entry")) p.entry = Convert.ToString(d["entry"]);
                    if (d.ContainsKey("style")) p.style = Convert.ToString(d["style"]);
                    if (d.ContainsKey("icon")) p.icon = Convert.ToString(d["icon"]);
                    if (d.ContainsKey("description")) p.description = Convert.ToString(d["description"]);
                    if (d.ContainsKey("version")) p.version = Convert.ToString(d["version"]);
                    if (d.ContainsKey("accent")) p.accent = Convert.ToString(d["accent"]);
                    if (d.ContainsKey("order")) p.order = Convert.ToInt32(d["order"]);
                    if (d.ContainsKey("defaultSize") && d["defaultSize"] is System.Collections.IList)
                    {
                        var a = (System.Collections.IList)d["defaultSize"];
                        p.defaultSize = new double[] { Convert.ToDouble(a[0]), Convert.ToDouble(a[1]) };
                    }
                    if (d.ContainsKey("minSize") && d["minSize"] is System.Collections.IList)
                    {
                        var a = (System.Collections.IList)d["minSize"];
                        p.minSize = new double[] { Convert.ToDouble(a[0]), Convert.ToDouble(a[1]) };
                    }
                }
            }
        }
        catch { }
        if (string.IsNullOrEmpty(p.name)) p.name = id;
        return p;
    }

    public string PluginUrl(string id, string file)
    {
        var url = "https://noteon.local/plugins/" + id + "/" + file;
        try
        {
            var path = Path.Combine(WebRoot, "plugins", id, file);
            if (File.Exists(path)) url += "?v=" + File.GetLastWriteTimeUtc(path).Ticks;
        }
        catch { }
        return url;
    }

    public CardWindow OpenCard(Card card, bool show)
    {
        var w = new CardWindow(card, this);
        Windows.Add(w);
        if (show) w.Show();
        return w;
    }

    public void Remove(CardWindow w)
    {
        Windows.Remove(w);
    }

    public CardWindow FindWindow(string id)
    {
        foreach (var w in Windows) if (w.Card.id == id) return w;
        return null;
    }

    public List<string> PluginIds()
    {
        var list = new List<PluginInfo>();
        var dir = Path.Combine(WebRoot, "plugins");
        if (Directory.Exists(dir))
        {
            foreach (var sub in Directory.GetDirectories(dir))
            {
                if (!File.Exists(Path.Combine(sub, "plugin.json"))) continue;
                list.Add(GetPlugin(Path.GetFileName(sub)));
            }
        }
        list.Sort(delegate(PluginInfo a, PluginInfo b)
        {
            int c = a.order.CompareTo(b.order);
            return c != 0 ? c : string.Compare(a.name, b.name, StringComparison.Ordinal);
        });
        var ids = new List<string>();
        foreach (var p in list) ids.Add(p.id);
        return ids;
    }

    public List<string> SelectedMenuIds()
    {
        var all = PluginIds();
        if (!Store.Settings.ContainsKey("contextMenuPlugins")) return all;
        var saved = Store.Settings["contextMenuPlugins"] as System.Collections.IList;
        if (saved == null) return all;
        var list = new List<string>();
        foreach (var id in all) foreach (var s in saved) if (Convert.ToString(s) == id) list.Add(id);
        return list;
    }

    public void CreateFromLaunch(string plugin, string path)
    {
        if (string.IsNullOrEmpty(plugin)) plugin = "note";
        if (GetPlugin(plugin).id == "") plugin = "note";
        var st = new Dictionary<string, object>();
        if (plugin == "folder" && !string.IsNullOrEmpty(path) && Directory.Exists(path)) st["path"] = path;
        var p = GetPlugin(plugin);
        double w = p.defaultSize != null ? p.defaultSize[0] : 420;
        double h = p.defaultSize != null ? p.defaultSize[1] : 480;
        var c = Store.Add(plugin, "", 180, 140, w, h, st);
        OpenCard(c, true);
    }

    public void SetAllDesktop(bool on)
    {
        foreach (var w in Windows) w.ApplyDesktop(on);
        Store.Save();
    }

    public void ShowAndTile()
    {
        if (Windows.Count == 0) return;
        var area = System.Windows.SystemParameters.WorkArea;
        int n = Windows.Count;
        int cols = n == 1 ? 1 : (int)Math.Ceiling(Math.Sqrt(n));
        int rows = (int)Math.Ceiling((double)n / cols);
        double gap = 12;
        double cw = Math.Min(920, Math.Max(240, (area.Width - gap * (cols + 1)) / cols));
        double ch = Math.Min(720, Math.Max(160, (area.Height - gap * (rows + 1)) / rows));
        double gridW = cols * cw + gap * (cols - 1);
        double gridH = rows * ch + gap * (rows - 1);
        double ox = area.X + Math.Max(gap, (area.Width - gridW) / 2);
        double oy = area.Y + Math.Max(gap, (area.Height - gridH) / 2);
        for (int i = 0; i < n; i++)
        {
            var w = Windows[i];
            double x = ox + (i % cols) * (cw + gap);
            double y = oy + (i / cols) * (ch + gap);
            w.Left = x; w.Top = y; w.Width = cw; w.Height = ch;
            w.Card.x = x; w.Card.y = y; w.Card.w = cw; w.Card.h = ch;
            w.Show();
        }
        Store.Save();
        Windows[0].Activate();
    }

    public void ShowNewCardWindow()
    {
        if (NewCardWindow != null && NewCardWindow.IsVisible)
        {
            NewCardWindow.Activate();
            return;
        }
        NewCardWindow = new NewCardWindow(this);
        NewCardWindow.Closed += (s, e) => { NewCardWindow = null; };
        NewCardWindow.Show();
        NewCardWindow.Activate();
    }

    public void OpenNewCardPanel()
    {
        if (Panel == null)
        {
            Panel = new PanelWindow(this);
            Panel.Closed += (s, e) => { Panel = null; };
        }
        Panel.FocusNewCard();
    }

    public PanelWindow OpenPanel()
    {
        if (Panel == null)
        {
            Panel = new PanelWindow(this);
            Panel.Closed += (s, e) => { Panel = null; };
        }
        Panel.ShowPanel();
        return Panel;
    }
}

public class CardWindow : Window
{
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] private static extern IntPtr FindWindow(string cls, string name);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);

    private readonly AppHost app;
    public Card Card { get; private set; }
    private WebView2CompositionControl web;
    private WebView2 webView;
    private Grid rootGrid;
    private bool webReady;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    private bool initializing = true;

    private bool dragging;
    private Point dragStart;
    private double dragLeft;
    private double dragTop;

    private string resizeEdge;
    private Point resizeStart;
    private double resizeLeft;
    private double resizeTop;
    private double resizeW;
    private double resizeH;
    private DispatcherTimer resizeTimer;
    private Style menuItemStyle;
    private bool resizing;
    private bool moving;
    private bool isFullscreen;
    private bool applyingBounds;
    private Rect restoreBounds;
    private bool topmostBeforeFullscreen;
    private double cardOpacity = 1;
    private Rect? stylusCanvas;
    private List<Rect> stylusExclude = new List<Rect>();
    private Border loadingOverlay;

    public CardWindow(Card card, AppHost app)
    {
        this.app = app;
        Card = card;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;
        MinWidth = 240;
        MinHeight = 160;
        var chrome = new WindowChrome();
        chrome.CaptionHeight = 0;
        chrome.ResizeBorderThickness = new Thickness(0);
        chrome.GlassFrameThickness = new Thickness(0);
        chrome.CornerRadius = new CornerRadius(0);
        chrome.UseAeroCaptionButtons = false;
        WindowChrome.SetWindowChrome(this, chrome);
        try { Icon = BitmapFrame.Create(new Uri(Path.Combine(app.WebRoot, "assets", "icon.ico"))); } catch { }
        Left = card.x;
        Top = card.y;
        Width = Math.Max(240, card.w);
        Height = Math.Max(160, card.h);
        Topmost = card.alwaysOnTop;
        AllowDrop = true;
        HookDrop(this);

        rootGrid = new Grid();
        var loading = new Border();
        loading.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(245, 18, 22, 30));
        loading.CornerRadius = new CornerRadius(12);
        var stack = new StackPanel();
        stack.VerticalAlignment = VerticalAlignment.Center;
        stack.HorizontalAlignment = HorizontalAlignment.Center;
        var pname = new TextBlock();
        pname.Text = app.GetPlugin(Card.plugin).name;
        pname.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(232, 238, 248));
        pname.FontSize = 15;
        pname.HorizontalAlignment = HorizontalAlignment.Center;
        var hint = new TextBlock();
        hint.Text = "正在加载…";
        hint.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(150, 162, 180));
        hint.FontSize = 11.5;
        hint.Margin = new Thickness(0, 6, 0, 0);
        hint.HorizontalAlignment = HorizontalAlignment.Center;
        var bar = new ProgressBar();
        bar.IsIndeterminate = true;
        bar.Width = 96;
        bar.Height = 3;
        bar.Margin = new Thickness(0, 12, 0, 0);
        bar.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(165, 140, 255));
        bar.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(70, 255, 255, 255));
        bar.BorderThickness = new Thickness(0);
        stack.Children.Add(pname);
        stack.Children.Add(hint);
        stack.Children.Add(bar);
        loading.Child = stack;
        rootGrid.Children.Add(loading);
        rootGrid.Clip = new RectangleGeometry(new Rect(0, 0, Math.Max(1, Width), Math.Max(1, Height)), 14, 14);
        Content = rootGrid;
        loadingOverlay = loading;
        Opacity = 0;

        Stylus.SetIsPressAndHoldEnabled(this, false);
        Stylus.SetIsFlicksEnabled(this, false);
        Stylus.SetIsTapFeedbackEnabled(this, false);
        Loaded += (s, e) => { BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(150))); };
        Loaded += OnLoaded;
        PreviewStylusDown += (s, e) => PostStylus("down", e);
        PreviewStylusMove += (s, e) => PostStylus("move", e);
        PreviewStylusUp += (s, e) => PostStylus("up", e);
        LocationChanged += (s, e) => { if (!initializing && !moving && !resizing && !applyingBounds && !isFullscreen) SaveBounds(); };
        SizeChanged += (s, e) => {
            if (!isFullscreen) rootGrid.Clip = new RectangleGeometry(new Rect(0, 0, Math.Max(1, ActualWidth), Math.Max(1, ActualHeight)), 14, 14);
            if (!initializing && !resizing && !applyingBounds && !isFullscreen) SaveBounds();
        };
        Closed += (s, e) => { if (resizeTimer != null) resizeTimer.Stop(); DisposeWebViews(); app.Remove(this); };
        Deactivated += (s, e) => { if (isFullscreen) ExitFullscreen(); if (Card.desktop) SendToBottom(); };
    }

    public void StopWebMedia()
    {
        try
        {
            if (webView != null && webView.CoreWebView2 != null)
            {
                try { webView.ExecuteScriptAsync("document.querySelectorAll('video,audio').forEach(function(e){try{e.pause();e.removeAttribute('src');e.load();}catch(x){}});"); } catch { }
                try { webView.CoreWebView2.Navigate("about:blank"); } catch { }
            }
        }
        catch { }
    }

    private void DisposeWebViews()
    {
        try
        {
            if (webView != null)
            {
                try
                {
                    if (webView.CoreWebView2 != null)
                    {
                        try { webView.CoreWebView2.Stop(); } catch { }
                        try { webView.CoreWebView2.Navigate("about:blank"); } catch { }

                    }
                }
                catch { }
                try { webView.Dispose(); } catch { }
                webView = null;
            }
        }
        catch { }
        try
        {
            if (web != null)
            {
                try { web.Dispose(); } catch { }
                web = null;
            }
        }
        catch { }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var env = await app.EnvironmentTask;
            // 先把窗口显示出来，再创建 WebView2，避免新建卡片时窗口迟迟不出现。
            web = new WebView2CompositionControl();
            web.DefaultBackgroundColor = System.Drawing.Color.Transparent;
            try { web.AllowExternalDrop = false; } catch { }
            HookDrop(web);
            rootGrid.Children.Insert(0, web);
            if (Card.plugin == "web")
            {
                webView = new WebView2();
                webView.DefaultBackgroundColor = System.Drawing.Color.White;
                webView.Visibility = Visibility.Collapsed;
                webView.HorizontalAlignment = HorizontalAlignment.Left;
                webView.VerticalAlignment = VerticalAlignment.Top;
                rootGrid.Children.Add(webView);
                await webView.EnsureCoreWebView2Async(env);
                SetupWebView();
            }
            await web.EnsureCoreWebView2Async(env);
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("noteon.local", app.WebRoot, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreDefaultContextMenusEnabled = false;
            try { core.Settings.IsSwipeNavigationEnabled = false; } catch { }
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = true;
            core.Settings.IsWebMessageEnabled = true;
            try { await core.CallDevToolsProtocolMethodAsync("Network.enable", "{}"); await core.CallDevToolsProtocolMethodAsync("Network.setCacheDisabled", "{\"cacheDisabled\":true}"); } catch { }
            core.WebMessageReceived += OnWebMessage;
            core.NavigationCompleted += (s2, ev) => { if (loadingOverlay != null) loadingOverlay.Visibility = Visibility.Collapsed; if (Card.desktop) SendToBottom(); PostWebState(ev.IsSuccess ? (CoreWebView2WebErrorStatus?)null : ev.WebErrorStatus, false); };
            await core.AddScriptToExecuteOnDocumentCreatedAsync(app.BridgeJs);
            core.Navigate("https://noteon.local/renderer/card.html?card=" + Uri.EscapeDataString(Card.id) + "&v=" + DateTime.UtcNow.Ticks);
            if (Card.desktop) ApplyDesktop(true);
            initializing = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.ToString(), "WebView2");
        }
    }

    private Dictionary<string, object> CardDict()
    {
        var p = app.GetPlugin(Card.plugin);
        var d = new Dictionary<string, object>();
        d["id"] = Card.id;
        d["plugin"] = Card.plugin;
        d["pluginName"] = p.name;
        d["title"] = Card.title;
        d["state"] = Card.state ?? new Dictionary<string, object>();
        d["alwaysOnTop"] = Card.alwaysOnTop;
        d["desktop"] = Card.desktop;
        d["locked"] = Card.locked;
        d["alpha"] = null;
        d["accent"] = "";
        d["themeId"] = Card.themeId ?? "";
        d["accent"] = Card.accent ?? "";
        d["alpha"] = Card.alpha;
        d["bounds"] = new Dictionary<string, object> { { "x", Card.x }, { "y", Card.y }, { "width", Card.w }, { "height", Card.h } };
        return d;
    }

    private Dictionary<string, object> ManifestDict()
    {
        var p = app.GetPlugin(Card.plugin);
        var d = new Dictionary<string, object>();
        d["id"] = p.id;
        d["name"] = p.name;
        d["entry"] = p.entry;
        d["entryUrl"] = app.PluginUrl(p.id, p.entry);
        d["styleUrl"] = string.IsNullOrEmpty(p.style) ? "" : app.PluginUrl(p.id, p.style);
        d["iconUrl"] = string.IsNullOrEmpty(p.icon) ? "" : app.PluginUrl(p.id, p.icon);
        return d;
    }

    private Dictionary<string, object> CardGetResult()
    {
        var theme = new Dictionary<string, object>();
        theme["themeId"] = app.Store.Settings.ContainsKey("themeId") ? app.Store.Settings["themeId"] : "mist";
        theme["customTheme"] = new Dictionary<string, object>();
        var r = new Dictionary<string, object>();
        r["card"] = CardDict();
        r["manifest"] = ManifestDict();
        r["theme"] = theme;
        r["settings"] = app.Store.Settings;
        r["pluginSettings"] = new Dictionary<string, object>();
        return r;
    }

    private void SetupWebView()
    {
        var core = webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsWebMessageEnabled = false;
        core.SourceChanged += (s, e) => PostWebState(null, false);
        core.DocumentTitleChanged += (s, e) => PostWebState(null, false);
        core.HistoryChanged += (s, e) => PostWebState(null, false);
        core.NewWindowRequested += (s, e) =>
        {
            e.Handled = true;
            try { Process.Start(e.Uri); } catch { }
        };
        webReady = true;
    }

    private void PostWebState(CoreWebView2WebErrorStatus? errorStatus, bool loading)
    {
        if (web == null || web.CoreWebView2 == null) return;
        var d = new Dictionary<string, object>();
        d["cardId"] = Card.id;
        d["url"] = webView.CoreWebView2 != null ? webView.CoreWebView2.Source : "";
        d["title"] = webView.CoreWebView2 != null ? webView.CoreWebView2.DocumentTitle : "";
        d["loading"] = loading;
        if (webView.CoreWebView2 != null)
        {
            d["canGoBack"] = webView.CoreWebView2.CanGoBack;
            d["canGoForward"] = webView.CoreWebView2.CanGoForward;
        }
        if (errorStatus.HasValue)
        {
            var err = new Dictionary<string, object>();
            err["code"] = (int)errorStatus.Value;
            err["description"] = errorStatus.Value.ToString();
            d["error"] = err;
        }
        PostEvent("web:state", d);
    }

    private void SetWebBounds(Dictionary<string, object> rect)
    {
        if (rect == null) return;
        double x = rect.ContainsKey("x") ? Convert.ToDouble(rect["x"]) : 0;
        double y = rect.ContainsKey("y") ? Convert.ToDouble(rect["y"]) : 0;
        double w = rect.ContainsKey("width") ? Convert.ToDouble(rect["width"]) : 1;
        double h = rect.ContainsKey("height") ? Convert.ToDouble(rect["height"]) : 1;
        webView.Margin = new Thickness(x, y, 0, 0);
        webView.Width = Math.Max(1, w);
        webView.Height = Math.Max(1, h);
        webView.HorizontalAlignment = HorizontalAlignment.Left;
        webView.VerticalAlignment = VerticalAlignment.Top;
    }

    private string NormalizeUrl(string value)
    {
        var v = value == null ? "" : value.Trim();
        if (v.StartsWith("http://") || v.StartsWith("https://") || v.StartsWith("about:")) return v;
        if (File.Exists(v)) return new Uri(v).AbsoluteUri;
        return v;
    }

    private async void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
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
            try
            {
                result = await DispatchAsync(method, args);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }
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
            File.AppendAllText(Path.Combine(app.DataDir, "bridge-error.txt"), ex.ToString() + Environment.NewLine);
        }
    }

    private async Task<object> DispatchAsync(string method, object[] args)
    {
        if (method == "menu")
        {
            var items = args.Length > 0 ? args[0] as IList : null;
            return await ShowMenu(items);
        }
        return Dispatch(method, args);
    }

    private Task<object> ShowMenu(IList items)
    {
        var tcs = new TaskCompletionSource<object>();
        var menu = new ContextMenu();
        ApplyMenuStyle(menu);
        menu.Placement = PlacementMode.MousePoint;
        menu.PlacementTarget = web;
        menu.Closed += (s, e) => { if (!tcs.Task.IsCompleted) tcs.TrySetResult(null); };
        try
        {
            BuildMenu(menu.Items, items, tcs, menu);
            menu.IsOpen = true;
        }
        catch
        {
            tcs.TrySetResult(null);
        }
        return tcs.Task;
    }

    private void ApplyMenuStyle(ContextMenu menu)
    {
        var bg = new SolidColorBrush(System.Windows.Media.Color.FromRgb(23, 27, 36));
        var fg = new SolidColorBrush(System.Windows.Media.Color.FromRgb(229, 236, 246));
        var border = new SolidColorBrush(System.Windows.Media.Color.FromRgb(58, 66, 82));
        var accent = new SolidColorBrush(System.Windows.Media.Color.FromRgb(167, 128, 255));
        menu.Background = bg;
        menu.Foreground = fg;
        menu.BorderBrush = border;
        menu.BorderThickness = new Thickness(1);
        menu.Padding = new Thickness(4);
        menu.FontSize = 12.5;
        menu.HasDropShadow = false;
        menu.Resources[SystemColors.MenuBrushKey] = bg;
        menu.Resources[SystemColors.MenuTextBrushKey] = fg;
        menu.Resources[SystemColors.HighlightBrushKey] = accent;
        menu.Resources[SystemColors.HighlightTextBrushKey] = System.Windows.Media.Brushes.White;
        var itemStyle = new Style(typeof(MenuItem));
        itemStyle.Setters.Add(new Setter(MenuItem.ForegroundProperty, fg));
        itemStyle.Setters.Add(new Setter(MenuItem.BackgroundProperty, System.Windows.Media.Brushes.Transparent));
        itemStyle.Setters.Add(new Setter(MenuItem.FontSizeProperty, 12.5));
        itemStyle.Setters.Add(new Setter(MenuItem.PaddingProperty, new Thickness(10, 6, 14, 6)));
        itemStyle.Setters.Add(new Setter(MenuItem.MinHeightProperty, 30.0));
        try
        {
            var xaml = @"<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='{x:Type MenuItem}'>
  <Grid>
    <Border x:Name='Bd' Background='#171B24' CornerRadius='6' Padding='{TemplateBinding Padding}'>
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width='*'/>
          <ColumnDefinition Width='12'/>
        </Grid.ColumnDefinitions>
        <ContentPresenter Grid.Column='0' ContentSource='Header' RecognizesAccessKey='True' VerticalAlignment='Center'/>
        <Path x:Name='Arrow' Grid.Column='1' Data='M0,0 L4,4 L0,8' Stroke='#A8B3C4' StrokeThickness='1.4' Visibility='Collapsed' HorizontalAlignment='Right' VerticalAlignment='Center'/>
      </Grid>
    </Border>
    <Popup x:Name='PART_Popup' AllowsTransparency='True' Focusable='False' IsOpen='{TemplateBinding IsSubmenuOpen}' Placement='Right' HorizontalOffset='0' VerticalOffset='-4'>
      <Border Background='#171B24' BorderBrush='#3A4252' BorderThickness='1' CornerRadius='8' Padding='4'>
        <ItemsPresenter/>
      </Border>
    </Popup>
  </Grid>
  <ControlTemplate.Triggers>
    <Trigger Property='IsHighlighted' Value='True'><Setter TargetName='Bd' Property='Background' Value='#2B3242'/></Trigger>
        <Trigger Property='HasItems' Value='True'><Setter TargetName='Arrow' Property='Visibility' Value='Visible'/></Trigger>
    <Trigger Property='IsEnabled' Value='False'><Setter Property='Opacity' Value='0.45'/></Trigger>
  </ControlTemplate.Triggers>
</ControlTemplate>";
            itemStyle.Setters.Add(new Setter(Control.TemplateProperty, XamlReader.Parse(xaml)));
            menu.Resources[typeof(MenuItem)] = itemStyle;
        }
        catch (Exception ex) { try { File.AppendAllText(Path.Combine(app.DataDir, "menu.log"), ex.ToString() + Environment.NewLine); } catch { } }
        try
        {
            var sepXaml = @"<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='{x:Type Separator}'><Border Height='1' Background='#363E4E' Margin='8,3,8,3'/></ControlTemplate>";
            var sepStyle = new Style(typeof(Separator));
            sepStyle.Setters.Add(new Setter(Control.TemplateProperty, XamlReader.Parse(sepXaml)));
            menu.Resources[typeof(Separator)] = sepStyle;
        }
        catch { }
        try
        {
            var menuXaml = @"<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='{x:Type ContextMenu}'><Border Background='#171B24' BorderBrush='#3A4252' BorderThickness='1' CornerRadius='8' Padding='4'><ScrollViewer VerticalScrollBarVisibility='Auto'><ItemsPresenter/></ScrollViewer></Border></ControlTemplate>";
            menu.Template = (ControlTemplate)XamlReader.Parse(menuXaml);
        }
        catch (Exception ex) { try { File.AppendAllText(Path.Combine(app.DataDir, "menu.log"), ex.ToString() + Environment.NewLine); } catch { } }
        menuItemStyle = itemStyle;
    }

    private void BuildMenu(ItemCollection target, IList items, TaskCompletionSource<object> tcs, ContextMenu root)
    {
        if (items == null) return;
        foreach (var obj in items)
        {
            var d = obj as Dictionary<string, object>;
            if (d == null) continue;
            var type = d.ContainsKey("type") ? Convert.ToString(d["type"]) : "";
            if (type == "separator") { target.Add(new Separator()); continue; }
            var item = new MenuItem();
            if (menuItemStyle != null) item.Style = menuItemStyle;
            var label = d.ContainsKey("label") ? Convert.ToString(d["label"]) : "";
            if (type == "checkbox") item.Header = (d.ContainsKey("checked") && Convert.ToBoolean(d["checked"]) ? "✓  " : "    ") + label;
            else item.Header = label;
            if (d.ContainsKey("enabled")) item.IsEnabled = Convert.ToBoolean(d["enabled"]);
            if (type == "checkbox") { item.IsCheckable = true; item.IsChecked = d.ContainsKey("checked") && Convert.ToBoolean(d["checked"]); }
            var sub = d.ContainsKey("submenu") ? d["submenu"] as IList : null;
            if (sub != null)
            {
                BuildMenu(item.Items, sub, tcs, root);
            }
            else
            {
                var id = d.ContainsKey("id") ? Convert.ToString(d["id"]) : null;
                item.Click += (s, e) =>
                {
                    tcs.TrySetResult(id);
                    root.IsOpen = false;
                };
            }
            target.Add(item);
        }
    }

    private object Dispatch(string method, object[] args)
    {
        if (method == "cardGet") return CardGetResult();
        if (method == "updateCard")
        {
            ApplyPatch(args.Length > 0 ? args[0] as Dictionary<string, object> : null);
            var r = CardDict();
            PostEvent("card:updated", r);
            return r;
        }
        if (method == "saveState")
        {
            var patch = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            if (patch != null)
            {
                if (Card.state == null) Card.state = new Dictionary<string, object>();
                foreach (var kv in patch) Card.state[kv.Key] = kv.Value;
            }
            app.Store.Save();
            return true;
        }
        if (method == "setCardOpacity")
        {
            cardOpacity = args.Length > 0 ? Convert.ToDouble(args[0]) : 1;
            ApplyClickThrough(cardOpacity <= 0.01);
            return true;
        }
        if (method == "setStylusArea")
        {
            var area = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            stylusCanvas = null;
            stylusExclude.Clear();
            if (area != null)
            {
                if (area.ContainsKey("canvas")) stylusCanvas = RectFrom(area["canvas"] as Dictionary<string, object>);
                var ex = area.ContainsKey("exclude") ? area["exclude"] as IList : null;
                if (ex != null) foreach (var o in ex) { var r = RectFrom(o as Dictionary<string, object>); if (r.HasValue) stylusExclude.Add(r.Value); }
            }
            return true;
        }
        if (method == "close") { StopWebMedia(); app.Store.Remove(Card); Close(); return true; }
        if (method == "hide") { Hide(); return true; }
        if (method == "listCards")
        {
            var list = new List<object>();
            foreach (var c in app.Store.Cards) list.Add(CardDictFor(c));
            return list;
        }
        if (method == "openCard")
        {
            var opts = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            var plugin = opts != null && opts.ContainsKey("plugin") ? Convert.ToString(opts["plugin"]) : "note";
            var title = opts != null && opts.ContainsKey("title") ? Convert.ToString(opts["title"]) : "";
            var state = opts != null && opts.ContainsKey("state") ? opts["state"] as Dictionary<string, object> : null;
            var c = app.Store.Add(plugin, title, 180, 160, 420, 480, state);
            app.OpenCard(c, true);
            return CardDictFor(c);
        }
        if (method == "dragStart") { DragStart(PointFrom(args)); return true; }
        if (method == "dragMove") { DragMove(PointFrom(args)); return true; }
        if (method == "dragEnd") { SaveBounds(); return true; }
        if (method == "resizeStart")
        {
            var edge = args.Length > 0 ? Convert.ToString(args[0]) : "";
            var p = args.Length > 1 ? PointFromArg(args[1]) : new Point(0, 0);
            ResizeStart(edge, p);
            return true;
        }
        if (method == "resizeMove") { ResizeMove(PointFrom(args)); return true; }
        if (method == "resizeEnd") { StopResize(); return true; }
        if (method == "openUrl")
        {
            var u = args.Length > 0 ? Convert.ToString(args[0]) : "";
            if (u.StartsWith("http://") || u.StartsWith("https://") || u.StartsWith("mailto:")) Process.Start(u);
            return true;
        }
        if (method == "openPath")
        {
            var p = args.Length > 0 ? Convert.ToString(args[0]) : "";
            if (File.Exists(p)) Process.Start(new ProcessStartInfo { FileName = p, UseShellExecute = true });
            else if (Directory.Exists(p)) Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = "\"" + p + "\"", UseShellExecute = true });
            return true;
        }
        if (method == "openDevTools") { web.CoreWebView2.OpenDevToolsWindow(); return true; }
        if (method == "copy" || method == "writeClipboardText") { Clipboard.SetText(args.Length > 0 ? Convert.ToString(args[0]) : ""); return true; }
        if (method == "readClipboardText") { try { return Clipboard.ContainsText() ? Clipboard.GetText() : ""; } catch { return ""; } }
        if (method == "writeClipboardImage")
        {
            try
            {
                var src = DecodeDataUrl(args.Length > 0 ? Convert.ToString(args[0]) : "");
                if (src == null) return false;
                Clipboard.SetImage(src);
                return true;
            }
            catch { return false; }
        }
        if (method == "readClipboardImage")
        {
            var d = new Dictionary<string, object>();
            try
            {
                var img = Clipboard.GetImage();
                if (img == null) { d["ok"] = false; d["error"] = "剪贴板没有图片"; return d; }
                d["ok"] = true;
                d["dataUrl"] = "data:image/png;base64," + Convert.ToBase64String(EncodePng(img));
                d["width"] = img.PixelWidth;
                d["height"] = img.PixelHeight;
            }
            catch (Exception ex) { d["ok"] = false; d["error"] = ex.Message; }
            return d;
        }
        if (method == "openFile")
        {
            var p = args.Length > 0 ? Convert.ToString(args[0]) : "";
            try
            {
                if (File.Exists(p))
                {
                    Process.Start(new ProcessStartInfo { FileName = p, UseShellExecute = true });
                }
                else if (Directory.Exists(p))
                {
                    Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = "\"" + p + "\"", UseShellExecute = true });
                }
                else return new Dictionary<string, object> { { "ok", false }, { "error", "文件不存在" } };
                return new Dictionary<string, object> { { "ok", true } };
            }
            catch (Exception ex) { return new Dictionary<string, object> { { "ok", false }, { "error", ex.Message } }; }
        }
        if (method == "pickFiles")
        {
            var opts = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            var dlg = new Microsoft.Win32.OpenFileDialog();
            dlg.Multiselect = true;
            dlg.Filter = BuildFilter(opts);
            var ok = dlg.ShowDialog(this);
            if (ok != true) return new string[0];
            return dlg.FileNames;
        }
        if (method == "pickFolder")
        {
            var dlg = new WinForms.FolderBrowserDialog();
            return dlg.ShowDialog() == WinForms.DialogResult.OK ? dlg.SelectedPath : "";
        }
        if (method == "readDir")
        {
            var dir = args.Length > 0 ? Convert.ToString(args[0]) : "";
            var d = new Dictionary<string, object>();
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir))
            {
                d["ok"] = false;
                d["error"] = "文件夹不存在";
                return d;
            }
            d["ok"] = true;
            d["path"] = Path.GetFullPath(dir);
            d["entries"] = ReadDir(dir);
            return d;
        }
        if (method == "readText")
        {
            var p = args.Length > 0 ? Convert.ToString(args[0]) : "";
            var max = args.Length > 1 ? Convert.ToInt32(args[1]) : 1024 * 1024;
            var text = File.ReadAllText(p);
            if (text.Length > max) text = text.Substring(0, max);
            return text;
        }
        if (method == "writeText")
        {
            var p = args.Length > 0 ? Convert.ToString(args[0]) : "";
            var text = args.Length > 1 ? Convert.ToString(args[1]) : "";
            File.WriteAllText(p, text);
            return true;
        }
        if (method == "stat") return Stat(args.Length > 0 ? Convert.ToString(args[0]) : "");
        if (method == "exists") return File.Exists(args.Length > 0 ? Convert.ToString(args[0]) : "") || Directory.Exists(args.Length > 0 ? Convert.ToString(args[0]) : "");
        if (method == "saveFileDialog")
        {
            var opts = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            var dlg = new Microsoft.Win32.SaveFileDialog();
            if (opts != null && opts.ContainsKey("defaultPath")) dlg.FileName = Convert.ToString(opts["defaultPath"]);
            dlg.Filter = BuildFilter(opts);
            return dlg.ShowDialog(this) == true ? dlg.FileName : "";
        }
        if (method == "messageBox")
        {
            var opts = args.Length > 0 ? args[0] as Dictionary<string, object> : null;
            var text = opts != null && opts.ContainsKey("message") ? Convert.ToString(opts["message"]) : "";
            var title = opts != null && opts.ContainsKey("title") ? Convert.ToString(opts["title"]) : "Noteon";
            MessageBox.Show(this, text, title, MessageBoxButton.OK, MessageBoxImage.Information);
            return true;
        }
        if (method == "copyInto")
        {
            var paths = args.Length > 0 ? args[0] as IList : null;
            var dest = args.Length > 1 ? Convert.ToString(args[1]) : "";
            try
            {
                if (paths == null || !Directory.Exists(dest)) return new Dictionary<string, object> { { "ok", false }, { "error", "目标文件夹不存在" } };
                foreach (var obj in paths)
                {
                    var src = Convert.ToString(obj);
                    if (File.Exists(src)) File.Copy(src, Path.Combine(dest, Path.GetFileName(src)), true);
                }
                return new Dictionary<string, object> { { "ok", true } };
            }
            catch (Exception ex) { return new Dictionary<string, object> { { "ok", false }, { "error", ex.Message } }; }
        }
        if (method == "listDrives")
        {
            var list = new List<object>();
            foreach (var d in DriveInfo.GetDrives()) list.Add(d.Name);
            return list;
        }
        if (method == "reveal")
        {
            var p = args.Length > 0 ? Convert.ToString(args[0]) : "";
            if (File.Exists(p)) Process.Start("explorer.exe", "/select,\"" + p + "\"");
            else if (Directory.Exists(p)) Process.Start("explorer.exe", "\"" + p + "\"");
            return true;
        }
        if (method == "loadImage")
        {
            return LoadImage(args.Length > 0 ? Convert.ToString(args[0]) : "");
        }
        if (method == "captureScreen")
        {
            return CaptureScreen();
        }
        if (method == "captureRegion")
        {
            return CaptureRegion();
        }
        if (method == "saveCapture")
        {
            var data = args.Length > 0 ? Convert.ToString(args[0]) : "";
            return SaveCapture(data);
        }
        if (method == "webMount" || method == "webLoad")
        {
            if (!webReady) return new Dictionary<string, object> { { "ok", false }, { "error", "WebView2 未初始化" } };
            if (args.Length > 1 && args[1] is Dictionary<string, object>) SetWebBounds((Dictionary<string, object>)args[1]);
            var url = args.Length > 0 ? NormalizeUrl(Convert.ToString(args[0])) : "";
            if (!string.IsNullOrEmpty(url)) webView.CoreWebView2.Navigate(url);
            webView.Visibility = Visibility.Visible;
            return new Dictionary<string, object> { { "ok", true } };
        }
        if (method == "webBounds")
        {
            SetWebBounds(args.Length > 0 ? args[0] as Dictionary<string, object> : null);
            return true;
        }
        if (method == "webVisible")
        {
            webView.Visibility = (args.Length > 0 && Convert.ToBoolean(args[0])) ? Visibility.Visible : Visibility.Collapsed;
            return true;
        }
        if (method == "webAction")
        {
            if (!webReady) return false;
            var action = args.Length > 0 ? Convert.ToString(args[0]) : "";
            if (action == "back" && webView.CoreWebView2.CanGoBack) webView.CoreWebView2.GoBack();
            else if (action == "forward" && webView.CoreWebView2.CanGoForward) webView.CoreWebView2.GoForward();
            else if (action == "reload") webView.CoreWebView2.Reload();
            else if (action == "stop") webView.CoreWebView2.Stop();
            return true;
        }
        if (method == "webZoom")
        {
            if (webReady && args.Length > 0) webView.ZoomFactor = Convert.ToDouble(args[0]);
            return true;
        }
        if (method == "webDevTools")
        {
            if (webReady) webView.CoreWebView2.OpenDevToolsWindow();
            return true;
        }
        if (method == "webDestroy")
        {
            if (webReady)
            {
                webView.Visibility = Visibility.Collapsed;
                webView.CoreWebView2.Navigate("about:blank");
            }
            return true;
        }
        if (method == "setStatus") return true;
        if (method == "fullscreen") return ToggleFullscreen();
        if (method == "smallWindow") return SmallWindow();
        if (method == "dragFile")
        {
            try
            {
                var file = args.Length > 0 ? Convert.ToString(args[0]) : "";
                if (File.Exists(file))
                {
                    var data = new DataObject();
                    data.SetData(DataFormats.FileDrop, new string[] { file });
                    DragDrop.DoDragDrop(this, data, DragDropEffects.Copy);
                }
                return true;
            }
            catch { return false; }
        }
        if (method == "toast" || method == "menu") return null;
        return null;
    }

    private static byte[] EncodePng(BitmapSource src)
    {
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(src));
        using (var ms = new MemoryStream())
        {
            enc.Save(ms);
            return ms.ToArray();
        }
    }

    private static BitmapSource DecodeDataUrl(string dataUrl)
    {
        if (string.IsNullOrEmpty(dataUrl)) return null;
        var comma = dataUrl.IndexOf(',');
        var b64 = comma >= 0 ? dataUrl.Substring(comma + 1) : dataUrl;
        var bytes = Convert.FromBase64String(b64);
        using (var ms = new MemoryStream(bytes))
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.StreamSource = ms;
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
    }

    private static Dictionary<string, object> LoadImage(string src)
    {
        var d = new Dictionary<string, object>();
        try
        {
            if (src.StartsWith("data:"))
            {
                d["ok"] = true; d["dataUrl"] = src; d["name"] = "inline"; d["path"] = "";
                return d;
            }
            if (src.StartsWith("file:///")) src = Uri.UnescapeDataString(src.Substring(8));
            if (!File.Exists(src)) throw new Exception("文件不存在：" + src);
            var ext = Path.GetExtension(src).ToLowerInvariant();
            string mime = "application/octet-stream";
            if (ext == ".png") mime = "image/png";
            else if (ext == ".jpg" || ext == ".jpeg") mime = "image/jpeg";
            else if (ext == ".gif") mime = "image/gif";
            else if (ext == ".webp") mime = "image/webp";
            else if (ext == ".bmp") mime = "image/bmp";
            else if (ext == ".svg") mime = "image/svg+xml";
            else if (ext == ".ico") mime = "image/x-icon";
            else if (ext == ".avif") mime = "image/avif";
            var bytes = File.ReadAllBytes(src);
            d["ok"] = true;
            d["dataUrl"] = "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
            d["mime"] = mime;
            d["name"] = Path.GetFileName(src);
            d["path"] = src;
            return d;
        }
        catch (Exception ex)
        {
            d["ok"] = false; d["error"] = ex.Message;
            return d;
        }
    }

    private Dictionary<string, object> CaptureScreen()
    {
        var d = new Dictionary<string, object>();
        var panel = app.Panel;
        bool panelShown = panel != null && panel.IsVisible;
        try
        {
            Hide();
            if (panelShown) panel.Hide();
            Thread.Sleep(240);
            var screen = WinForms.Screen.FromPoint(WinForms.Cursor.Position);
            var b = screen.Bounds;
            using (var bmp = new System.Drawing.Bitmap(b.Width, b.Height))
            using (var g = System.Drawing.Graphics.FromImage(bmp))
            using (var ms = new MemoryStream())
            {
                g.CopyFromScreen(b.Left, b.Top, 0, 0, bmp.Size);
                bmp.Save(ms, ImageFormat.Png);
                d["ok"] = true;
                d["dataUrl"] = "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                d["width"] = b.Width;
                d["height"] = b.Height;
            }
        }
        catch (Exception ex)
        {
            d["ok"] = false; d["error"] = ex.Message;
        }
        finally
        {
            Show();
            if (panelShown && panel != null) panel.Show();
        }
        return d;
    }

    private Dictionary<string, object> CaptureRegion()
    {
        var d = new Dictionary<string, object>();
        var panel = app.Panel;
        bool panelShown = panel != null && panel.IsVisible;
        System.Drawing.Bitmap bmp = null;
        try
        {
            Hide();
            if (panelShown) panel.Hide();
            Thread.Sleep(240);
            var screen = WinForms.Screen.FromPoint(WinForms.Cursor.Position);
            var b = screen.Bounds;
            bmp = new System.Drawing.Bitmap(b.Width, b.Height);
            using (var g = System.Drawing.Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(b.Left, b.Top, 0, 0, bmp.Size);
            }
            var win = new RegionWindow(bmp, b);
            win.ShowDialog();
            var rect = win.Result;
            if (!rect.HasValue)
            {
                d["ok"] = false; d["canceled"] = true;
                return d;
            }
            var r = rect.Value;
            using (var cropped = bmp.Clone(new System.Drawing.Rectangle(r.X, r.Y, r.Width, r.Height), bmp.PixelFormat))
            using (var ms = new MemoryStream())
            {
                cropped.Save(ms, ImageFormat.Png);
                d["ok"] = true;
                d["dataUrl"] = "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                d["width"] = r.Width;
                d["height"] = r.Height;
            }
            return d;
        }
        catch (Exception ex)
        {
            d["ok"] = false; d["error"] = ex.Message;
            return d;
        }
        finally
        {
            if (bmp != null) bmp.Dispose();
            Show();
            if (panelShown && panel != null) panel.Show();
        }
    }

    private Dictionary<string, object> SaveCapture(string dataUrl)
    {
        var d = new Dictionary<string, object>();
        try
        {
            var idx = dataUrl.IndexOf("base64,");
            if (idx < 0) throw new Exception("图片数据无效");
            var bytes = Convert.FromBase64String(dataUrl.Substring(idx + 7));
            var dir = Path.Combine(app.DataDir, "shots");
            Directory.CreateDirectory(dir);
            var file = Path.Combine(dir, "Noteon-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".png");
            File.WriteAllBytes(file, bytes);
            d["ok"] = true; d["path"] = file;
            return d;
        }
        catch (Exception ex)
        {
            d["ok"] = false; d["error"] = ex.Message;
            return d;
        }
    }

    private static string BuildFilter(Dictionary<string, object> opts)
    {
        if (opts == null || !opts.ContainsKey("filters")) return "所有文件|*.*";
        var list = opts["filters"] as IList;
        if (list == null) return "所有文件|*.*";
        var parts = new List<string>();
        foreach (var item in list)
        {
            var d = item as Dictionary<string, object>;
            if (d == null) continue;
            var name = d.ContainsKey("name") ? Convert.ToString(d["name"]) : "文件";
            var exts = d.ContainsKey("extensions") ? d["extensions"] as IList : null;
            if (exts == null || exts.Count == 0) continue;
            var patterns = new List<string>();
            foreach (var e in exts) patterns.Add("*." + Convert.ToString(e));
            parts.Add(name + "|" + string.Join(";", patterns.ToArray()));
        }
        parts.Add("所有文件|*.*");
        return string.Join("|", parts.ToArray());
    }

    private static List<object> ReadDir(string dir)
    {
        var list = new List<object>();
        if (!Directory.Exists(dir)) return list;
        foreach (var p in Directory.GetFileSystemEntries(dir))
        {
            var isDir = Directory.Exists(p);
            var d = new Dictionary<string, object>();
            d["name"] = Path.GetFileName(p);
            d["path"] = p;
            d["isDir"] = isDir;
            try
            {
                if (isDir) { d["size"] = 0; d["mtime"] = Directory.GetLastWriteTime(p).ToFileTime(); }
                else { var fi = new FileInfo(p); d["size"] = fi.Length; d["mtime"] = fi.LastWriteTime.ToFileTime(); }
            }
            catch { d["size"] = 0; d["mtime"] = 0; }
            list.Add(d);
        }
        return list;
    }

    private static Dictionary<string, object> Stat(string p)
    {
        var d = new Dictionary<string, object>();
        d["exists"] = false;
        if (File.Exists(p))
        {
            var fi = new FileInfo(p);
            d["exists"] = true; d["isDir"] = false; d["size"] = fi.Length; d["mtime"] = fi.LastWriteTime.ToFileTime();
        }
        else if (Directory.Exists(p))
        {
            d["exists"] = true; d["isDir"] = true; d["size"] = 0; d["mtime"] = Directory.GetLastWriteTime(p).ToFileTime();
        }
        return d;
    }

    private Dictionary<string, object> CardDictFor(Card c)
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
        return d;
    }

    private void PostStylus(string phase, StylusEventArgs e)
    {
        if (web == null) return;
        try
        {
            var pos = e.GetPosition(web);
            if (Card.plugin != "paint")
            {
                var ui = new Dictionary<string, object>();
                ui["phase"] = phase; ui["x"] = pos.X; ui["y"] = pos.Y;
                PostEvent("stylus:ui", ui);
                e.Handled = true;
                return;
            }
            bool inCanvas = stylusCanvas.HasValue && stylusCanvas.Value.Contains(pos);
            if (inCanvas) foreach (var r in stylusExclude) if (r.Contains(pos)) { inCanvas = false; break; }
            if (!inCanvas)
            {
                var ui = new Dictionary<string, object>();
                ui["phase"] = phase; ui["x"] = pos.X; ui["y"] = pos.Y;
                PostEvent("stylus:ui", ui);
                e.Handled = true;
                return;
            }
            var points = e.GetStylusPoints(web);
            var d = new Dictionary<string, object>();
            d["phase"] = phase;
            d["x"] = pos.X;
            d["y"] = pos.Y;
            var arr = new List<object>();
            double firstPressure = 0.5;
            if (points != null)
            {
                foreach (var pt in points)
                {
                    var o = new Dictionary<string, object>();
                    o["x"] = pt.X;
                    o["y"] = pt.Y;
                    o["pressure"] = pt.PressureFactor;
                    arr.Add(o);
                    firstPressure = pt.PressureFactor;
                }
            }
            if (arr.Count == 0)
            {
                var o = new Dictionary<string, object>();
                o["x"] = pos.X; o["y"] = pos.Y; o["pressure"] = 0.5;
                arr.Add(o);
            }
            d["pressure"] = firstPressure;
            d["points"] = arr;
            PostEvent("stylus:input", d);
            e.Handled = true;
        }
        catch { }
    }

    private void HookDrop(UIElement el)
    {
        el.AllowDrop = true;
        el.DragOver += (s, e) =>
        {
            try
            {
                if (e.Data != null && e.Data.GetDataPresent(DataFormats.FileDrop))
                {
                    e.Effects = DragDropEffects.Copy;
                    e.Handled = true;
                }
            }
            catch { }
        };
        el.Drop += (s, e) =>
        {
            try
            {
                var files = e.Data != null ? e.Data.GetData(DataFormats.FileDrop) as string[] : null;
                if (files != null && files.Length > 0)
                {
                    PostEvent("files:dropped", files);
                    e.Handled = true;
                }
            }
            catch { }
        };
    }

    private void PostEvent(string name, object payload)
    {
        if (web == null || web.CoreWebView2 == null) return;
        var d = new Dictionary<string, object>();
        d["event"] = name;
        d["payload"] = payload;
        web.CoreWebView2.PostWebMessageAsJson(json.Serialize(d));
    }

    public bool ToggleFullscreen()
    {
        if (isFullscreen) { ExitFullscreen(); return false; }
        try
        {
            restoreBounds = new Rect(Left, Top, Width, Height);
            topmostBeforeFullscreen = Topmost;
            var hwnd = new WindowInteropHelper(this).Handle;
            var screen = WinForms.Screen.FromHandle(hwnd);
            var dpi = VisualTreeHelper.GetDpi(this);
            var area = screen.WorkingArea;
            applyingBounds = true;
            Topmost = true;
            Left = area.Left / Math.Max(0.1, dpi.DpiScaleX);
            Top = area.Top / Math.Max(0.1, dpi.DpiScaleY);
            Width = area.Width / Math.Max(0.1, dpi.DpiScaleX);
            Height = area.Height / Math.Max(0.1, dpi.DpiScaleY);
            isFullscreen = true;
            rootGrid.Clip = null;
            applyingBounds = false;
            return true;
        }
        catch
        {
            applyingBounds = false;
            return false;
        }
    }

    public void ExitFullscreen()
    {
        if (!isFullscreen) return;
        isFullscreen = false;
        applyingBounds = true;
        try
        {
            Left = restoreBounds.X;
            Top = restoreBounds.Y;
            Width = Math.Max(240, restoreBounds.Width);
            Height = Math.Max(160, restoreBounds.Height);
            Topmost = topmostBeforeFullscreen;
            rootGrid.Clip = new RectangleGeometry(new Rect(0, 0, Math.Max(1, Width), Math.Max(1, Height)), 14, 14);
            // 不要 Show()，避免退出全屏时抢回焦点。
        }
        catch { }
        applyingBounds = false;
    }

    public bool SmallWindow()
    {
        if (isFullscreen) ExitFullscreen();
        applyingBounds = true;
        try
        {
            var w = Math.Min(420, Math.Max(240, SystemParameters.WorkArea.Width - 24));
            var h = Math.Min(360, Math.Max(160, SystemParameters.WorkArea.Height - 24));
            var l = Left + (Width - w) / 2;
            var t = Top + (Height - h) / 2;
            Left = Math.Max(SystemParameters.WorkArea.Left + 8, Math.Min(l, SystemParameters.WorkArea.Right - w - 8));
            Top = Math.Max(SystemParameters.WorkArea.Top + 8, Math.Min(t, SystemParameters.WorkArea.Bottom - h - 8));
            Width = w;
            Height = h;
            Topmost = Card.alwaysOnTop;
        }
        catch { }
        applyingBounds = false;
        SaveBounds();
        return true;
    }

    public void SendToBottom()
    {
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero) return;
            var progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero) progman = FindWindow("WorkerW", null);
            IntPtr after = IntPtr.Zero;
            if (progman != IntPtr.Zero)
            {
                // 插到桌面窗口的上方、其他普通窗口的下方。
                after = GetWindow(progman, 3); // GW_HWNDPREV
            }
            if (after == IntPtr.Zero) after = new IntPtr(1); // fallback HWND_BOTTOM
            SetWindowPos(hwnd, after, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040);
        }
        catch { }
    }

    public void ApplyDesktop(bool on)
    {
        Card.desktop = on;
        if (on)
        {
            Topmost = false;
            ShowInTaskbar = false;
            Show();
            Dispatcher.BeginInvoke(new Action(SendToBottom), System.Windows.Threading.DispatcherPriority.Loaded);
        }
        else
        {
            Topmost = Card.alwaysOnTop;
            ShowInTaskbar = true;
            Left = Card.x; Top = Card.y;
            Width = Math.Max(240, Card.w); Height = Math.Max(160, Card.h);
            Show();
        }
        app.Store.Save();
    }

    public void FlushState()
    {
        try
        {
            if (web != null && web.CoreWebView2 != null)
                web.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('noteon:flush'))");
        }
        catch { }
    }

    public void PostTheme()
    {
        var payload = new Dictionary<string, object>();
        payload["themeId"] = app.Store.Settings.ContainsKey("themeId") ? app.Store.Settings["themeId"] : "mist";
        payload["customTheme"] = app.Store.Settings.ContainsKey("customTheme") ? app.Store.Settings["customTheme"] : new Dictionary<string, object>();
        payload["settings"] = app.Store.Settings;
        PostEvent("theme:changed", payload);
    }

    public void PostCardUpdated()
    {
        PostEvent("card:updated", CardDict());
    }

    public void ApplyExternalPatch(Dictionary<string, object> patch)
    {
        ApplyPatch(patch);
    }

    public void CloseFromPanel()
    {
        app.Store.Remove(Card);
        Close();
    }

    private void ApplyPatch(Dictionary<string, object> patch)
    {
        if (patch == null) return;
        if (patch.ContainsKey("title")) Card.title = Convert.ToString(patch["title"]);
        if (patch.ContainsKey("themeId")) Card.themeId = Convert.ToString(patch["themeId"]);
        if (patch.ContainsKey("accent")) Card.accent = Convert.ToString(patch["accent"]);
        if (patch.ContainsKey("alpha")) Card.alpha = patch["alpha"] == null ? (double?)null : Convert.ToDouble(patch["alpha"]);
        if (patch.ContainsKey("alwaysOnTop"))
        {
            Card.alwaysOnTop = Convert.ToBoolean(patch["alwaysOnTop"]);
            Topmost = Card.alwaysOnTop;
        }
        if (patch.ContainsKey("desktop"))
        {
            ApplyDesktop(Convert.ToBoolean(patch["desktop"]));
        }
        app.Store.Save();
    }

    private static Point PointFrom(object[] args)
    {
        return args.Length > 0 ? PointFromArg(args[0]) : new Point(0, 0);
    }

    private static Point PointFromArg(object arg)
    {
        var d = arg as Dictionary<string, object>;
        if (d == null) return new Point(0, 0);
        double x = d.ContainsKey("x") ? Convert.ToDouble(d["x"]) : 0;
        double y = d.ContainsKey("y") ? Convert.ToDouble(d["y"]) : 0;
        return new Point(x, y);
    }

    private void StartNativeDrag(int hitTest)
    {
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            ReleaseCapture();
            SendMessage(hwnd, 0x00A1, (IntPtr)hitTest, IntPtr.Zero);
        }
        catch { }
    }

    private void DragStart(Point p)
    {
        moving = true;
        StartNativeDrag(2); // HTCAPTION
        moving = false;
        SnapToTargets();
        SaveBounds();
    }

    private void DragMove(Point p) { /* native move loop handles it */ }

    private void ResizeStart(string edge, Point p)
    {
        resizeEdge = edge;
        var c = WinForms.Cursor.Position;
        resizeStart = new Point(c.X, c.Y);
        resizeLeft = Left;
        resizeTop = Top;
        resizeW = Width;
        resizeH = Height;
        resizing = true;
        if (resizeTimer == null)
        {
            resizeTimer = new DispatcherTimer();
            resizeTimer.Interval = TimeSpan.FromMilliseconds(16);
            resizeTimer.Tick += (s, e) => ResizeTick();
        }
        resizeTimer.Start();
    }

    private void ResizeTick()
    {
        if (string.IsNullOrEmpty(resizeEdge)) { StopResize(); return; }
        if ((GetAsyncKeyState(0x01) & 0x8000) == 0) { StopResize(); return; }
        var c = WinForms.Cursor.Position;
        var dpi = VisualTreeHelper.GetDpi(this);
        double dx = (c.X - resizeStart.X) / Math.Max(0.1, dpi.DpiScaleX);
        double dy = (c.Y - resizeStart.Y) / Math.Max(0.1, dpi.DpiScaleY);
        double l = resizeLeft, t = resizeTop, w = resizeW, h = resizeH;
        if (resizeEdge.Contains("e")) w = Math.Max(240, resizeW + dx);
        if (resizeEdge.Contains("s")) h = Math.Max(160, resizeH + dy);
        if (resizeEdge.Contains("w")) { w = Math.Max(240, resizeW - dx); l = resizeLeft + (resizeW - w); }
        if (Math.Abs(Left - l) < 0.5 && Math.Abs(Top - t) < 0.5 && Math.Abs(Width - w) < 0.5 && Math.Abs(Height - h) < 0.5) return;
        Left = l; Top = t; Width = w; Height = h;
    }

    private void StopResize()
    {
        resizeEdge = "";
        resizing = false;
        if (resizeTimer != null) resizeTimer.Stop();
        SaveBounds();
    }

    private void ResizeMove(Point p) { /* timer drives the resize */ }

    private static Rect? RectFrom(Dictionary<string, object> d)
    {
        if (d == null) return null;
        try
        {
            double x = d.ContainsKey("x") ? Convert.ToDouble(d["x"]) : 0;
            double y = d.ContainsKey("y") ? Convert.ToDouble(d["y"]) : 0;
            double w = d.ContainsKey("w") ? Convert.ToDouble(d["w"]) : (d.ContainsKey("width") ? Convert.ToDouble(d["width"]) : 0);
            double h = d.ContainsKey("h") ? Convert.ToDouble(d["h"]) : (d.ContainsKey("height") ? Convert.ToDouble(d["height"]) : 0);
            if (w <= 0 || h <= 0) return null;
            return new Rect(x, y, w, h);
        }
        catch { return null; }
    }

    private void SnapToTargets()
    {
        if (isFullscreen) return;
        bool enabled = true;
        try { if (app.Store.Settings.ContainsKey("snap")) enabled = Convert.ToBoolean(app.Store.Settings["snap"]); } catch { }
        if (!enabled) return;
        const double threshold = 14;
        var hwnd = new WindowInteropHelper(this).Handle;
        var screen = WinForms.Screen.FromHandle(hwnd);
        var dpi = VisualTreeHelper.GetDpi(this);
        double sx = Math.Max(0.1, dpi.DpiScaleX);
        double sy = Math.Max(0.1, dpi.DpiScaleY);
        var wa = screen.WorkingArea;
        double sl = wa.Left / sx, st = wa.Top / sy, sr = wa.Right / sx, sb = wa.Bottom / sy;

        var xs = new List<double> { sl, sr - Width };
        var ys = new List<double> { st, sb - Height };
        foreach (var w in app.Windows)
        {
            if (w == this || w.Card == null || !w.IsVisible) continue;
            xs.Add(w.Left);
            xs.Add(w.Left + w.Width);
            xs.Add(w.Left - Width);
            xs.Add(w.Left + w.Width - Width);
            ys.Add(w.Top);
            ys.Add(w.Top + w.Height);
            ys.Add(w.Top - Height);
            ys.Add(w.Top + w.Height - Height);
        }

        double bestX = double.MaxValue, bestLeft = Left;
        foreach (var target in xs)
        {
            double d = Math.Abs(Left - target);
            if (d < bestX && d <= threshold) { bestX = d; bestLeft = target; }
        }
        double bestY = double.MaxValue, bestTop = Top;
        foreach (var target in ys)
        {
            double d = Math.Abs(Top - target);
            if (d < bestY && d <= threshold) { bestY = d; bestTop = target; }
        }
        if (bestX <= threshold) Left = bestLeft;
        if (bestY <= threshold) Top = bestTop;
    }

    public void CheckFullscreenForeground()
    {
        if (!isFullscreen) return;
        try
        {
            var fg = GetForegroundWindow();
            var root = fg == IntPtr.Zero ? IntPtr.Zero : GetAncestor(fg, 2); // GA_ROOT
            var mine = new WindowInteropHelper(this).Handle;
            if (root != mine) ExitFullscreen();
        }
        catch { }
    }

    private void ApplyClickThrough(bool transparent)
    {
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero) return;
            int ex = GetWindowLong(hwnd, -20);
            ex = transparent ? (ex | 0x20) : (ex & ~0x20);
            SetWindowLong(hwnd, -20, ex);
        }
        catch { }
    }

    private void SaveBounds()
    {
        if (applyingBounds || isFullscreen) return;
        dragging = false;
        Card.x = Left;
        Card.y = Top;
        Card.w = Width;
        Card.h = Height;
        app.Store.Save();
    }
}
