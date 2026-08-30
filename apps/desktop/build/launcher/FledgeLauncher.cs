using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            var stub = Process.GetCurrentProcess().MainModule.FileName;
            var root = Path.GetDirectoryName(stub);
            if (string.IsNullOrEmpty(root))
            {
                MessageBox(IntPtr.Zero, "インストール先を特定できませんでした。", "Fledge", 0x10);
                return 1;
            }

            var target = Path.Combine(root, "data", "meta", "runtime", "Fledge.exe");
            if (!File.Exists(target))
            {
                MessageBox(IntPtr.Zero, "Fledge の実行ファイルが見つかりません。再インストールしてください。", "Fledge", 0x10);
                return 1;
            }

            var psi = new ProcessStartInfo();
            psi.FileName = target;
            psi.WorkingDirectory = Path.GetDirectoryName(target);
            psi.UseShellExecute = false;
            psi.Arguments = QuoteArgs(args);
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox(IntPtr.Zero, ex.Message, "Fledge", 0x10);
            return 1;
        }
    }

    static string QuoteArgs(string[] args)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < args.Length; i++)
        {
            if (i > 0) sb.Append(' ');
            var a = args[i] ?? "";
            if (a.IndexOfAny(new[] { ' ', '"' }) >= 0)
            {
                sb.Append('"');
                sb.Append(a.Replace("\"", "\\\""));
                sb.Append('"');
            }
            else sb.Append(a);
        }
        return sb.ToString();
    }
}
