using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

public class NewCardWindow : Window
{
    private readonly AppHost app;

    public NewCardWindow(AppHost app)
    {
        this.app = app;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.Manual;
        SizeToContent = SizeToContent.Height;
        Width = 300;

        var border = new Border
        {
            Background = new SolidColorBrush(Color.FromRgb(20, 25, 34)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(54, 66, 82)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(14),
            Padding = new Thickness(12),
        };
        Content = border;

        var stack = new StackPanel();
        border.Child = stack;

        stack.Children.Add(new TextBlock
        {
            Text = "新建卡片",
            FontSize = 15,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(235, 241, 250)),
            Margin = new Thickness(4, 0, 4, 2),
        });
        stack.Children.Add(new TextBlock
        {
            Text = "选择一个插件",
            FontSize = 11,
            Foreground = new SolidColorBrush(Color.FromRgb(139, 152, 169)),
            Margin = new Thickness(4, 0, 4, 8),
        });

        var scroll = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            MaxHeight = 460,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        };
        var list = new StackPanel();
        scroll.Content = list;
        stack.Children.Add(scroll);

        var ids = app.PluginIds();
        foreach (var id in ids)
        {
            var p = app.GetPlugin(id);
            if (string.IsNullOrEmpty(p.id)) continue;
            list.Children.Add(MakeItem(p));
        }

        if (list.Children.Count == 0)
        {
            list.Children.Add(new TextBlock
            {
                Text = "没有可用插件",
                Foreground = new SolidColorBrush(Color.FromRgb(200, 210, 225)),
                Margin = new Thickness(6, 10, 6, 10),
            });
        }

        PreviewKeyDown += (s, e) => { if (e.Key == Key.Escape) Close(); };
        Loaded += (s, e) =>
        {
            try
            {
                var pos = System.Windows.Forms.Cursor.Position;
                var screen = System.Windows.Forms.Screen.FromPoint(pos);
                var dpi = VisualTreeHelper.GetDpi(this);
                var area = screen.WorkingArea;
                double w = ActualWidth > 0 ? ActualWidth : Width;
                double h = ActualHeight > 0 ? ActualHeight : 500;
                double left = pos.X / Math.Max(0.1, dpi.DpiScaleX) - w / 2;
                double top = pos.Y / Math.Max(0.1, dpi.DpiScaleY) - h / 2;
                double minLeft = area.Left / Math.Max(0.1, dpi.DpiScaleX) + 8;
                double minTop = area.Top / Math.Max(0.1, dpi.DpiScaleY) + 8;
                double maxLeft = (area.Right - 8) / Math.Max(0.1, dpi.DpiScaleX) - w;
                double maxTop = (area.Bottom - 8) / Math.Max(0.1, dpi.DpiScaleY) - h;
                Left = Math.Max(minLeft, Math.Min(left, maxLeft));
                Top = Math.Max(minTop, Math.Min(top, maxTop));
            }
            catch { }
        };
    }

    private UIElement MakeItem(PluginInfo p)
    {
        var btn = new Button
        {
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(8, 7, 8, 7),
            Margin = new Thickness(0, 1, 0, 1),
            Cursor = Cursors.Hand,
        };
        btn.Template = ButtonTemplate();

        var row = new StackPanel();
        row.Children.Add(new TextBlock
        {
            Text = p.name,
            FontSize = 13,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(235, 241, 250)),
        });
        if (!string.IsNullOrEmpty(p.description))
        {
            row.Children.Add(new TextBlock
            {
                Text = p.description,
                FontSize = 10.5,
                Foreground = new SolidColorBrush(Color.FromRgb(139, 152, 169)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 2, 0, 0),
            });
        }
        btn.Content = row;
        btn.Click += (s, e) =>
        {
            try { app.CreateFromLaunch(p.id, ""); } catch { }
            Close();
        };
        return btn;
    }

    private static ControlTemplate ButtonTemplate()
    {
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Button.BackgroundProperty));
        border.SetValue(Border.PaddingProperty, new Thickness(2));
        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        border.AppendChild(presenter);

        var template = new ControlTemplate(typeof(Button));
        template.VisualTree = border;

        var trigger = new Trigger { Property = Button.IsMouseOverProperty, Value = true };
        trigger.Setters.Add(new Setter(Button.BackgroundProperty, new SolidColorBrush(Color.FromRgb(41, 50, 64))));
        template.Triggers.Add(trigger);
        return template;
    }
}
