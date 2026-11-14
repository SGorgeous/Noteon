using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

public class Card
{
    public string id = "";
    public string plugin = "note";
    public string title = "";
    public double x = 160;
    public double y = 160;
    public double w = 420;
    public double h = 480;
    public bool alwaysOnTop = true;
    public bool desktop = false;
    public bool desktopTop = true;
    public bool locked = false;
    public string themeId = "";
    public string accent = "";
    public double? alpha = null;
    public Dictionary<string, object> state = new Dictionary<string, object>();
}

public class Board
{
    public int version = 1;
    public Dictionary<string, object> settings = new Dictionary<string, object>();
    public List<Card> cards = new List<Card>();
}

public class Store
{
    private readonly string file;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    public Board Board { get; private set; }
    public List<Card> Cards { get { return Board.cards; } }
    public Dictionary<string, object> Settings { get { return Board.settings; } }

    public Store(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        file = Path.Combine(dataDir, "board.json");
        Load();
    }

    private void Load()
    {
        try
        {
            if (File.Exists(file))
            {
                Board = json.Deserialize<Board>(File.ReadAllText(file));
                if (Board == null) Board = NewBoard();
            }
            else
            {
                Board = NewBoard();
            }
            if (Board.cards == null) Board.cards = new List<Card>();
            if (Board.settings == null) Board.settings = new Dictionary<string, object>();
            foreach (var c in Board.cards)
            {
                if (c.state == null) c.state = new Dictionary<string, object>();
            }
        }
        catch
        {
            Board = NewBoard();
        }
    }

    private static Board NewBoard()
    {
        var b = new Board();
        b.settings["themeId"] = "ink";
        b.settings["defaultAlwaysOnTop"] = true;
        b.settings["restoreOnStart"] = true;
        b.settings["snap"] = true;
        b.settings["hideFromTaskbar"] = true;
        b.settings["contextMenu"] = false;
        return b;
    }

    public Card Add(string plugin, string title, double x, double y, double w, double h, Dictionary<string, object> state)
    {
        var c = new Card();
        c.id = "c_" + Guid.NewGuid().ToString("N").Substring(0, 10);
        c.plugin = plugin;
        c.title = title;
        c.x = x;
        c.y = y;
        c.w = w;
        c.h = h;
        c.alwaysOnTop = true;
        c.state = state ?? new Dictionary<string, object>();
        Cards.Add(c);
        Save();
        return c;
    }

    public void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(file);
            Directory.CreateDirectory(dir);
            var tmp = file + ".tmp";
            File.WriteAllText(tmp, json.Serialize(Board));
            if (File.Exists(file)) File.Delete(file);
            File.Move(tmp, file);
        }
        catch (Exception ex)
        {
            File.WriteAllText(file + ".error.txt", ex.ToString());
        }
    }

    public Card Get(string id)
    {
        foreach (var c in Cards) if (c.id == id) return c;
        return null;
    }

    public void Remove(Card c)
    {
        if (c != null) Cards.Remove(c);
        Save();
    }
}
