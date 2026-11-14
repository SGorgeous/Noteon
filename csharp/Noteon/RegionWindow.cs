using System;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Controls;

public class RegionWindow : Window
{
    private readonly SelectionView view;
    public Int32Rect? Result { get; private set; }

    public RegionWindow(System.Drawing.Bitmap bitmap, System.Drawing.Rectangle screenBounds)
    {
        var source = ToSource(bitmap);
        double scale = 1.0;
        try
        {
            using (var g = System.Drawing.Graphics.FromHwnd(IntPtr.Zero)) scale = g.DpiX / 96.0;
        }
        catch { }
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = false;
        Background = System.Windows.Media.Brushes.Black;
        ShowInTaskbar = false;
        Topmost = true;
        Left = screenBounds.Left / scale;
        Top = screenBounds.Top / scale;
        Width = screenBounds.Width / scale;
        Height = screenBounds.Height / scale;
        view = new SelectionView(source);
        view.Done += (rect) =>
        {
            Result = rect;
            Close();
        };
        Content = new Grid();
        ((Grid)Content).Children.Add(view);
        var hint = new TextBlock();
        hint.Text = "拖拽选择截屏区域 · Esc / 右键取消";
        hint.Foreground = System.Windows.Media.Brushes.White;
        hint.Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(190, 8, 12, 18));
        hint.Padding = new Thickness(14, 7, 14, 7);
        hint.FontSize = 12;
        hint.HorizontalAlignment = HorizontalAlignment.Center;
        hint.VerticalAlignment = VerticalAlignment.Top;
        hint.Margin = new Thickness(0, 22, 0, 0);
        ((Grid)Content).Children.Add(hint);
        Loaded += (s, e) => { Activate(); Focus(); view.Focus(); };
        PreviewKeyDown += (s, e) =>
        {
            if (e.Key == Key.Escape) { Result = null; Close(); }
        };
    }

    private static BitmapSource ToSource(System.Drawing.Bitmap bitmap)
    {
        using (var ms = new MemoryStream())
        {
            bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            ms.Position = 0;
            var bi = new BitmapImage();
            bi.BeginInit();
            bi.CacheOption = BitmapCacheOption.OnLoad;
            bi.StreamSource = ms;
            bi.EndInit();
            bi.Freeze();
            return bi;
        }
    }

    public class SelectionView : FrameworkElement
    {
        private readonly BitmapSource image;
        private Point start;
        private bool dragging;
        private Rect selection = Rect.Empty;
        public event Action<Int32Rect?> Done;

        public SelectionView(BitmapSource image)
        {
            this.image = image;
            Focusable = true;
            Cursor = Cursors.Cross;
        }

        protected override void OnRender(DrawingContext dc)
        {
            dc.DrawImage(image, new Rect(0, 0, ActualWidth, ActualHeight));
            dc.DrawRectangle(new SolidColorBrush(System.Windows.Media.Color.FromArgb(150, 2, 6, 12)), null, new Rect(0, 0, ActualWidth, ActualHeight));
            if (selection.Width > 0 && selection.Height > 0)
            {
                dc.PushClip(new RectangleGeometry(selection));
                dc.DrawImage(image, new Rect(0, 0, ActualWidth, ActualHeight));
                dc.Pop();
                dc.DrawRectangle(null, new Pen(new SolidColorBrush(System.Windows.Media.Color.FromRgb(90, 209, 200)), 1.5), selection);
            }
        }

        protected override void OnMouseDown(MouseButtonEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.ChangedButton == MouseButton.Right) { Done(null); return; }
            if (e.ChangedButton != MouseButton.Left) return;
            start = e.GetPosition(this);
            selection = new Rect(start, new Size(0, 0));
            dragging = true;
            CaptureMouse();
            InvalidateVisual();
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (!dragging) return;
            var p = e.GetPosition(this);
            selection = new Rect(Math.Min(start.X, p.X), Math.Min(start.Y, p.Y), Math.Abs(p.X - start.X), Math.Abs(p.Y - start.Y));
            InvalidateVisual();
        }

        protected override void OnMouseUp(MouseButtonEventArgs e)
        {
            base.OnMouseUp(e);
            if (!dragging || e.ChangedButton != MouseButton.Left) return;
            dragging = false;
            ReleaseMouseCapture();
            if (selection.Width < 4 || selection.Height < 4) { selection = Rect.Empty; InvalidateVisual(); return; }
            double sx = image.PixelWidth / Math.Max(1, ActualWidth);
            double sy = image.PixelHeight / Math.Max(1, ActualHeight);
            int x = (int)Math.Round(selection.X * sx);
            int y = (int)Math.Round(selection.Y * sy);
            int w = (int)Math.Round(selection.Width * sx);
            int h = (int)Math.Round(selection.Height * sy);
            x = Math.Max(0, Math.Min(image.PixelWidth - 1, x));
            y = Math.Max(0, Math.Min(image.PixelHeight - 1, y));
            w = Math.Max(1, Math.Min(image.PixelWidth - x, w));
            h = Math.Max(1, Math.Min(image.PixelHeight - y, h));
            Done(new Int32Rect(x, y, w, h));
        }
    }
}
