using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

public static class ShellMenu
{
    private static readonly string[] Roots = new string[]
    {
        @"Software\Classes\DesktopBackground\Shell\NoteonCards",
        @"Software\Classes\Directory\Background\shell\NoteonCards",
    };

    private static readonly string[] Legacy = new string[]
    {
        @"Software\Classes\DesktopBackground\Shell\Noteon",
        @"Software\Classes\DesktopBackground\Shell\NoteonMenu",
        @"Software\Classes\DesktopBackground\Shell\NoteonCreate",
        @"Software\Classes\Directory\Background\shell\Noteon",
        @"Software\Classes\Directory\Background\shell\NoteonMenu",
        @"Software\Classes\Directory\Background\shell\NoteonCreate",
    };

    public static bool Install(AppHost app, IList ids)
    {
        try
        {
            var exe = Process.GetCurrentProcess().MainModule.FileName;
            var icon = Path.Combine(app.WebRoot, "assets", "icon.ico");
            var selected = new List<string>();
            foreach (var obj in ids) selected.Add(Convert.ToString(obj));
            using (var user = Registry.CurrentUser)
            {
                foreach (var legacy in Legacy) DeleteTree(user, legacy);
                var pluginsText = string.Join(",", selected.ToArray());
                foreach (var root in Roots)
                {
                    DeleteTree(user, root);
                    using (var key = user.CreateSubKey(root))
                    {
                        key.SetValue("MUIVerb", "在 Noteon 新建");
                        key.SetValue("Icon", "\"" + icon + "\"");
                        key.SetValue("Position", "Top");
                        key.SetValue("SubCommands", "");
                        key.SetValue("MenuVersion", "2");
                        key.SetValue("MenuPlugins", pluginsText);
                        key.SetValue("InstallPath", exe);
                        int n = 0;
                        foreach (var id in selected)
                        {
                            var p = app.GetPlugin(id);
                            if (string.IsNullOrEmpty(p.id)) continue;
                            n++;
                            using (var child = key.CreateSubKey("shell\\0" + n + id))
                            {
                                child.SetValue("MUIVerb", p.name);
                                using (var cmd = child.CreateSubKey("command"))
                                    cmd.SetValue(null, "\"" + exe + "\" --new " + id + " --path \"%V\"");
                            }
                        }
                    }
                }
            }
            return true;
        }
        catch (Exception ex)
        {
            File.AppendAllText(Path.Combine(app.DataDir, "shellmenu-error.txt"), ex.ToString() + Environment.NewLine);
            return false;
        }
    }

    public static bool Uninstall(AppHost app)
    {
        try
        {
            using (var user = Registry.CurrentUser)
            {
                foreach (var root in Roots) DeleteTree(user, root);
                foreach (var legacy in Legacy) DeleteTree(user, legacy);
            }
            return true;
        }
        catch { return false; }
    }

    private static void DeleteTree(RegistryKey user, string path)
    {
        try { user.DeleteSubKeyTree(path, false); } catch { }
    }

    public static bool IsInstalled()
    {
        try
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Roots[0])) return key != null;
        }
        catch { return false; }
    }
}
