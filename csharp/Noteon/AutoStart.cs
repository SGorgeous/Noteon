using System;
using System.Diagnostics;
using Microsoft.Win32;

public static class AutoStart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "Noteon";

    public static bool IsEnabled()
    {
        try
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
            {
                return key != null && key.GetValue(ValueName) != null;
            }
        }
        catch { return false; }
    }

    public static void Set(bool enabled)
    {
        try
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (key == null) return;
                if (enabled)
                {
                    var exe = Process.GetCurrentProcess().MainModule.FileName;
                    key.SetValue(ValueName, "\"" + exe + "\"");
                }
                else
                {
                    key.DeleteValue(ValueName, false);
                }
            }
        }
        catch { }
    }
}
