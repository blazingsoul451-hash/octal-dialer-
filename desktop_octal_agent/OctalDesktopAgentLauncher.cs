using System;
using System.Drawing;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace OctalDesktopAgent
{
    public class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        private Panel headerPanel;
        private Label titleLabel;
        private Label subtitleLabel;
        private Label badgeLabel;
        private Panel statusPanel;
        private Label statusTitle;
        private Label lblNodeStatus;
        private Label lblEngineStatus;
        private Label lblServerStatus;
        private Button btnRunBot;
        private Button btnConnectFb;
        private Button btnOpenWeb;
        private Button btnDownloadApk;
        private Button btnRunFlutter;
        private RichTextBox logBox;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private string baseDir;

        public MainForm()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory;
            InitializeComponent();
            CheckEnvironment();
        }

        private void InitializeComponent()
        {
            this.Text = "Octal Desktop Agent - Edge Automation Worker";
            this.Size = new Size(820, 620);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(11, 15, 25);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;

            // Header Panel
            headerPanel = new Panel();
            headerPanel.Location = new Point(0, 0);
            headerPanel.Size = new Size(820, 85);
            headerPanel.BackColor = Color.FromArgb(17, 24, 39);

            titleLabel = new Label();
            titleLabel.Text = "OCTAL DESKTOP AGENT";
            titleLabel.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(0, 240, 255);
            titleLabel.Location = new Point(24, 16);
            titleLabel.AutoSize = true;

            subtitleLabel = new Label();
            subtitleLabel.Text = "Distributed Residential Edge Worker • 0.0% Cloud Server Load Mode";
            subtitleLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            subtitleLabel.ForeColor = Color.FromArgb(156, 163, 175);
            subtitleLabel.Location = new Point(25, 48);
            subtitleLabel.AutoSize = true;

            badgeLabel = new Label();
            badgeLabel.Text = "● CLOUD LIVE";
            badgeLabel.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            badgeLabel.ForeColor = Color.FromArgb(16, 185, 129);
            badgeLabel.BackColor = Color.FromArgb(6, 78, 59);
            badgeLabel.Padding = new Padding(6, 4, 6, 4);
            badgeLabel.Location = new Point(680, 24);
            badgeLabel.AutoSize = true;

            headerPanel.Controls.Add(titleLabel);
            headerPanel.Controls.Add(subtitleLabel);
            headerPanel.Controls.Add(badgeLabel);
            this.Controls.Add(headerPanel);

            // Status Panel
            statusPanel = new Panel();
            statusPanel.Location = new Point(24, 105);
            statusPanel.Size = new Size(760, 110);
            statusPanel.BackColor = Color.FromArgb(24, 32, 47);
            statusPanel.Padding = new Padding(16);

            statusTitle = new Label();
            statusTitle.Text = "SYSTEM & RUNTIME STATUS";
            statusTitle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            statusTitle.ForeColor = Color.FromArgb(148, 163, 184);
            statusTitle.Location = new Point(16, 12);
            statusTitle.AutoSize = true;

            lblNodeStatus = new Label();
            lblNodeStatus.Text = "Node.js Engine: Checking...";
            lblNodeStatus.Location = new Point(16, 38);
            lblNodeStatus.ForeColor = Color.White;
            lblNodeStatus.AutoSize = true;

            lblEngineStatus = new Label();
            lblEngineStatus.Text = "Local Edge Bot: Checking...";
            lblEngineStatus.Location = new Point(16, 62);
            lblEngineStatus.ForeColor = Color.White;
            lblEngineStatus.AutoSize = true;

            lblServerStatus = new Label();
            lblServerStatus.Text = "Production Gateway: https://zestify7.online (Ready)";
            lblServerStatus.Location = new Point(16, 86);
            lblServerStatus.ForeColor = Color.FromArgb(52, 211, 153);
            lblServerStatus.AutoSize = true;

            statusPanel.Controls.Add(statusTitle);
            statusPanel.Controls.Add(lblNodeStatus);
            statusPanel.Controls.Add(lblEngineStatus);
            statusPanel.Controls.Add(lblServerStatus);
            this.Controls.Add(statusPanel);

            // Action Buttons
            int btnY = 230;
            int btnHeight = 44;

            btnRunBot = CreateButton("🚀 Run FB Automation Bot", new Point(24, btnY), new Size(240, btnHeight), Color.FromArgb(14, 116, 144));
            btnRunBot.Click += (s, e) => LaunchScript("local_engine\\local_fb_bot.js", "Facebook Automation Bot");

            btnConnectFb = CreateButton("🔑 Connect FB Profile", new Point(280, btnY), new Size(240, btnHeight), Color.FromArgb(30, 41, 59));
            btnConnectFb.Click += (s, e) => LaunchScript("local_engine\\local_cookie_grabber.js", "Facebook Profile Connect");

            btnRunFlutter = CreateButton("💻 Run Flutter UI", new Point(536, btnY), new Size(248, btnHeight), Color.FromArgb(67, 56, 202));
            btnRunFlutter.Click += (s, e) => LaunchFlutter();

            this.Controls.Add(btnRunBot);
            this.Controls.Add(btnConnectFb);
            this.Controls.Add(btnRunFlutter);

            // Second Row Buttons
            int btnY2 = 286;
            btnOpenWeb = CreateButton("🌐 Open Web CRM & Dialer", new Point(24, btnY2), new Size(368, 40), Color.FromArgb(30, 41, 59));
            btnOpenWeb.Click += (s, e) => OpenUrl("https://zestify7.online");

            btnDownloadApk = CreateButton("📱 Download Android Mobile APK", new Point(416, btnY2), new Size(368, 40), Color.FromArgb(30, 41, 59));
            btnDownloadApk.Click += (s, e) => OpenUrl("https://zestify7.online/download/apk");

            this.Controls.Add(btnOpenWeb);
            this.Controls.Add(btnDownloadApk);

            // Real-time Activity Log
            Label logTitle = new Label();
            logTitle.Text = "AGENT DIAGNOSTIC & EVENT LOG";
            logTitle.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            logTitle.ForeColor = Color.FromArgb(148, 163, 184);
            logTitle.Location = new Point(24, 340);
            logTitle.AutoSize = true;
            this.Controls.Add(logTitle);

            logBox = new RichTextBox();
            logBox.Location = new Point(24, 365);
            logBox.Size = new Size(760, 195);
            logBox.BackColor = Color.FromArgb(15, 23, 42);
            logBox.ForeColor = Color.FromArgb(203, 213, 225);
            logBox.Font = new Font("Consolas", 9f);
            logBox.ReadOnly = true;
            logBox.BorderStyle = BorderStyle.None;
            this.Controls.Add(logBox);

            // Tray Icon
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Show Octal Agent", null, (s, e) => ShowAndRestore());
            trayMenu.Items.Add("Open Web CRM", null, (s, e) => OpenUrl("https://zestify7.online"));
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Exit Agent", null, (s, e) => ExitApplication());

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Octal Desktop Agent";
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.DoubleClick += (s, e) => ShowAndRestore();
            if (this.Icon != null) trayIcon.Icon = this.Icon;
            trayIcon.Visible = true;

            this.Resize += (s, e) => {
                if (this.WindowState == FormWindowState.Minimized) {
                    this.Hide();
                    trayIcon.ShowBalloonTip(2000, "Octal Desktop Agent", "Agent running minimized in system tray.", ToolTipIcon.Info);
                }
            };

            this.FormClosing += (s, e) => {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            };
        }

        private Button CreateButton(string text, Point loc, Size size, Color backColor)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.Location = loc;
            btn.Size = size;
            btn.BackColor = backColor;
            btn.ForeColor = Color.White;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderSize = 0;
            btn.Cursor = Cursors.Hand;
            btn.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            return btn;
        }

        private void CheckEnvironment()
        {
            Log("🚀 [Agent] Initializing Octal Desktop Agent...");
            Log(string.Format("📁 [Path] Base Directory: {0}", baseDir));

            // Check Node
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("node", "-v");
                psi.RedirectStandardOutput = true;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                using (Process p = Process.Start(psi))
                {
                    string outStr = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(3000);
                    lblNodeStatus.Text = string.Format("Node.js Engine: Installed ({0})", outStr);
                    lblNodeStatus.ForeColor = Color.FromArgb(52, 211, 153);
                    Log(string.Format("✅ [Runtime] Node.js runtime detected: {0}", outStr));
                }
            }
            catch
            {
                lblNodeStatus.Text = "Node.js Engine: NOT FOUND (Required for edge automation)";
                lblNodeStatus.ForeColor = Color.FromArgb(248, 113, 113);
                Log("❌ [Runtime] Node.js not detected in system PATH.");
            }

            // Check Local Engine files
            string botScript = Path.Combine(baseDir, "local_engine\\local_fb_bot.js");
            if (File.Exists(botScript))
            {
                lblEngineStatus.Text = "Local Edge Bot: Ready (local_engine\\local_fb_bot.js)";
                lblEngineStatus.ForeColor = Color.FromArgb(52, 211, 153);
                Log("✅ [Engine] Edge Automation Bot script located.");
            }
            else
            {
                lblEngineStatus.Text = "Local Edge Bot: Script missing";
                lblEngineStatus.ForeColor = Color.FromArgb(248, 113, 113);
            }

            // Check Flutter Runner Binary
            string runnerExe = Path.Combine(baseDir, "build\\windows\\x64\runner\\Release\\desktop_octal_agent.exe");
            if (File.Exists(runnerExe))
            {
                Log(string.Format("✅ [Flutter] Native Release Executable available: {0}", runnerExe));
            }
            else
            {
                Log("ℹ️ [Flutter] Native Release binary not pre-built; launching will invoke Flutter runner or local engine.");
            }

            Log("📡 [Cloud] Production Cloud Server: https://zestify7.online");
            Log("⚡ [Agent] Ready. Select an action above to start edge automation.");
        }

        private void LaunchScript(string relativeScriptPath, string taskName)
        {
            string fullPath = Path.Combine(baseDir, relativeScriptPath);
            if (!File.Exists(fullPath))
            {
                MessageBox.Show(string.Format("Script file not found:\n{0}", fullPath), "Script Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Log(string.Format("▶️ Launching {0} ({1})...", taskName, relativeScriptPath));
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = string.Format("/k \"cd /d \"{0}\" && node \"{1}\"\"", Path.GetDirectoryName(fullPath), Path.GetFileName(fullPath));
                psi.UseShellExecute = true;
                psi.WindowStyle = ProcessWindowStyle.Normal;
                Process.Start(psi);
                Log(string.Format("✅ {0} process started successfully.", taskName));
            }
            catch (Exception ex)
            {
                Log(string.Format("❌ Failed to start {0}: {1}", taskName, ex.Message));
            }
        }

        private void LaunchFlutter()
        {
            string runnerExe = Path.Combine(baseDir, "build\\windows\\x64\\runner\\Release\\desktop_octal_agent.exe");
            if (File.Exists(runnerExe))
            {
                Log(string.Format("▶️ Starting compiled native Flutter binary: {0}", runnerExe));
                Process.Start(new ProcessStartInfo(runnerExe) { UseShellExecute = true });
                return;
            }

            // Try flutter run
            string flutterBat = @"C:\src\flutter\bin\flutter.bat";
            if (!File.Exists(flutterBat))
            {
                flutterBat = "flutter";
            }

            Log("▶️ Starting Flutter Desktop UI (flutter run -d windows)...");
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = string.Format("/k \"cd /d \"{0}\" && \"{1}\" run -d windows\"", baseDir, flutterBat);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                Log(string.Format("❌ Failed to run Flutter UI: {0}", ex.Message));
            }
        }

        private void OpenUrl(string url)
        {
            Log(string.Format("🌐 Opening URL: {0}", url));
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Log(string.Format("❌ Failed to open URL: {0}", ex.Message));
            }
        }

        private void Log(string message)
        {
            if (logBox.InvokeRequired)
            {
                logBox.Invoke(new Action<string>(Log), message);
                return;
            }

            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            logBox.AppendText(string.Format("[{0}] {1}\n", timestamp, message));
            logBox.SelectionStart = logBox.Text.Length;
            logBox.ScrollToCaret();
        }

        private void ShowAndRestore()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
        }

        private void ExitApplication()
        {
            trayIcon.Visible = false;
            Application.Exit();
        }
    }
}
