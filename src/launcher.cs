using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace AtelierLauncher
{
    static class Program
    {
        private const string MutexName = "Atelier_Studio_Launcher_SingleInstance_Mutex";
        internal static readonly int WM_SHOW_ATELIER = RegisterWindowMessage("WM_SHOW_ATELIER_LAUNCHER");

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern int RegisterWindowMessage(string lpString);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool PostMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                SetProcessDPIAware();
            }
            catch { }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    // An instance of Atelier Launcher is already active. Broadcast restore message to unhide it.
                    PostMessage((IntPtr)0xffff, WM_SHOW_ATELIER, IntPtr.Zero, IntPtr.Zero);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                try
                {
                    Application.Run(new MainForm(args));
                }
                catch (Exception ex)
                {
                    MainForm.LogFatal("FATAL: " + ex.ToString());
                    MessageBox.Show(
                        "Atelier Launcher encountered an error:\n" + ex.Message,
                        "Atelier Launcher Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
            }
        }
    }

    public class MainForm : Form
    {
        // Color Tokens - Atelier Studio Dark Theme (Strictly zero gradients)
        private static readonly Color BgDark = Color.FromArgb(15, 17, 23);          // #0f1117
        private static readonly Color BgCard = Color.FromArgb(24, 27, 36);          // #181b24
        private static readonly Color BgCardAlt = Color.FromArgb(19, 21, 29);       // #13151d
        private static readonly Color BorderSubtle = Color.FromArgb(42, 46, 61);     // #2a2e3d
        private static readonly Color BorderFocus = Color.FromArgb(59, 130, 246);   // #3b82f6
        private static readonly Color TextPrimary = Color.FromArgb(241, 245, 249);   // #f1f5f9
        private static readonly Color TextSecondary = Color.FromArgb(148, 163, 184); // #94a3b8
        private static readonly Color TextMuted = Color.FromArgb(100, 116, 139);    // #64748b
        private static readonly Color PrimaryBlue = Color.FromArgb(37, 99, 235);    // #2563eb
        private static readonly Color PrimaryHover = Color.FromArgb(29, 78, 216);   // #1d4ed8
        private static readonly Color DangerRed = Color.FromArgb(220, 38, 38);      // #dc2626
        private static readonly Color DangerHover = Color.FromArgb(185, 28, 28);    // #b91c1c
        private static readonly Color SuccessGreen = Color.FromArgb(16, 185, 129);  // #10b981
        private static readonly Color SuccessBg = Color.FromArgb(6, 78, 59);        // #064e3b
        private static readonly Color SuccessBorder = Color.FromArgb(5, 150, 105);  // #059669
        private static readonly Color StoppedBg = Color.FromArgb(30, 41, 59);       // #1e293b
        private static readonly Color StoppedBorder = Color.FromArgb(51, 65, 85);   // #334155

        // Controls
        private Panel pnlHeader;
        private Label lblTitle;
        private Label lblSubtitle;
        private Panel pnlStatusCard;
        private Label lblStatusHeader;
        private Label lblStatusBadge;
        private Label lblUrlLabel;
        private LinkLabel lnkUrl;
        private Label lblPortLabel;
        private NumericUpDown numPort;
        private Button btnApplyPort;
        private Button btnOpenBrowser;
        private Button btnToggleServer;
        private Button btnOpenData;
        private Button btnOpenAppDir;
        private CheckBox chkAutoOpenBrowser;
        private CheckBox chkMinimizeToTray;
        private Label lblStatusMessage;
        private NotifyIcon notifyIcon;
        private ContextMenuStrip trayMenu;
        private ToolStripMenuItem mnuTrayToggle;
        private System.Windows.Forms.Timer pollTimer;

        // State
        private Process serverProcess;
        private bool isServerRunning;
        private int currentPort = 8080;
        private bool isPortable;
        private string resolvedAtelierExe;
        private string resolvedDataDir;
        private string resolvedProjectDir;
        private bool isExiting;

        public MainForm(string[] args)
        {
            Log("MainForm constructor started");
            ParseArgs(args);
            LocateFiles();
            Log("Entering InitializeComponent");
            InitializeComponent();
            Log("Finished InitializeComponent");
            Log("Entering SetupTray");
            SetupTray();
            Log("Finished SetupTray");

            pollTimer = new System.Windows.Forms.Timer();
            pollTimer.Interval = 1200;
            pollTimer.Tick += OnPollTimerTick;
            Log("MainForm constructor completed");
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Program.WM_SHOW_ATELIER)
            {
                RestoreWindow();
            }
            base.WndProc(ref m);
        }

        public static void LogFatal(string msg)
        {
            Log(msg);
        }

        private static void Log(string msg)
        {
            try
            {
                string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "atelier-launcher.log");
                File.AppendAllText(logPath, string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}\r\n", DateTime.Now, msg));
            }
            catch { }
        }

        protected override void OnLoad(EventArgs e)
        {
            Log("OnLoad called");
            base.OnLoad(e);
            pollTimer.Start();
            CheckInitialStartup();
        }

        private void ParseArgs(string[] args)
        {
            Log("ParseArgs called with " + args.Length + " args");
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length)
                {
                    int p;
                    if (int.TryParse(args[i + 1], out p) && p >= 1024 && p <= 65535)
                    {
                        currentPort = p;
                    }
                }
                else if (args[i] == "--portable")
                {
                    isPortable = true;
                }
            }
        }

        private void LocateFiles()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string curDir = Directory.GetCurrentDirectory();

            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "atelier.exe"),
                Path.Combine(curDir, "atelier.exe"),
                Path.Combine(baseDir, "..", "..", "target", "release", "atelier.exe"),
                Path.Combine(curDir, "target", "release", "atelier.exe"),
                Path.Combine(baseDir, "..", "..", "target", "debug", "atelier.exe"),
                Path.Combine(curDir, "target", "debug", "atelier.exe"),
                Path.Combine(baseDir, "..", "target", "release", "atelier.exe"),
                Path.Combine(baseDir, "..", "target", "debug", "atelier.exe")
            };

            resolvedAtelierExe = null;
            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    resolvedAtelierExe = Path.GetFullPath(candidates[i]);
                    break;
                }
            }

            if (resolvedAtelierExe == null)
            {
                resolvedAtelierExe = Path.GetFullPath(candidates[0]);
            }

            Log("LocateFiles resolved: " + resolvedAtelierExe + " (Exists: " + File.Exists(resolvedAtelierExe) + ")");

            // Resolve Project Directory (workspace root or app installation directory)
            if (File.Exists(Path.Combine(baseDir, "..", "..", "Cargo.toml")))
            {
                resolvedProjectDir = Path.GetFullPath(Path.Combine(baseDir, "..", ".."));
            }
            else if (File.Exists(Path.Combine(curDir, "Cargo.toml")))
            {
                resolvedProjectDir = Path.GetFullPath(curDir);
            }
            else
            {
                resolvedProjectDir = baseDir;
            }

            // Resolve Data Directory
            string envDataDir = Environment.GetEnvironmentVariable("ATELIER_DATA_DIR");
            if (!string.IsNullOrEmpty(envDataDir))
            {
                resolvedDataDir = Path.GetFullPath(envDataDir);
            }
            else if (isPortable || Directory.Exists(Path.Combine(baseDir, "data")) || Directory.Exists(Path.Combine(curDir, "data")))
            {
                if (Directory.Exists(Path.Combine(baseDir, "data")))
                    resolvedDataDir = Path.Combine(baseDir, "data");
                else if (Directory.Exists(Path.Combine(curDir, "data")))
                    resolvedDataDir = Path.Combine(curDir, "data");
                else
                    resolvedDataDir = Path.Combine(baseDir, "data");
            }
            else
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                if (!string.IsNullOrEmpty(localAppData))
                {
                    resolvedDataDir = Path.Combine(localAppData, "Atelier", "data");
                }
                else
                {
                    resolvedDataDir = Path.Combine(baseDir, "data");
                }
            }
        }

        private void InitializeComponent()
        {
            try
            {
                Log("Init: SuspendLayout");
                this.SuspendLayout();

                // Form properties
                this.Text = "Atelier Studio - Control Panel";
                this.ClientSize = new Size(440, 520);
                this.FormBorderStyle = FormBorderStyle.FixedSingle;
                this.MaximizeBox = false;
                this.StartPosition = FormStartPosition.CenterScreen;
                this.BackColor = BgDark;
                this.ForeColor = TextPrimary;
                this.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

                // Branded Application Icon
                Icon appIcon = null;
                try
                {
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string curDir = Directory.GetCurrentDirectory();
                    string[] icoCandidates = new string[]
                    {
                        Path.Combine(baseDir, "atelier.ico"),
                        Path.Combine(baseDir, "installer", "atelier.ico"),
                        Path.Combine(curDir, "installer", "atelier.ico"),
                        Path.Combine(baseDir, "..", "..", "installer", "atelier.ico")
                    };
                    foreach (string p in icoCandidates)
                    {
                        if (File.Exists(p))
                        {
                            appIcon = new Icon(p);
                            break;
                        }
                    }
                    if (appIcon == null)
                    {
                        appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                    }
                }
                catch (Exception ex)
                {
                    Log("Init: Icon exception: " + ex.Message);
                }

                this.Icon = appIcon ?? SystemIcons.Application;

                // Header Panel
                pnlHeader = new Panel();
                pnlHeader.Location = new Point(16, 14);
                pnlHeader.Size = new Size(408, 64);
                pnlHeader.BackColor = BgCard;
                pnlHeader.Paint += (s, e) => DrawBorder(e.Graphics, pnlHeader.ClientRectangle, BorderSubtle, 6);

                lblTitle = new Label();
                lblTitle.Text = "ATELIER";
                lblTitle.Font = new Font("Segoe UI", 15F, FontStyle.Bold, GraphicsUnit.Point);
                lblTitle.ForeColor = TextPrimary;
                lblTitle.Location = new Point(14, 10);
                lblTitle.AutoSize = true;
                lblTitle.BackColor = Color.Transparent;

                lblSubtitle = new Label();
                lblSubtitle.Text = "Creative Content Studio • Local Server & Workspace";
                lblSubtitle.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point);
                lblSubtitle.ForeColor = TextSecondary;
                lblSubtitle.Location = new Point(16, 38);
                lblSubtitle.AutoSize = true;
                lblSubtitle.BackColor = Color.Transparent;

                pnlHeader.Controls.Add(lblTitle);
                pnlHeader.Controls.Add(lblSubtitle);

                // Status Card Panel
                pnlStatusCard = new Panel();
                pnlStatusCard.Location = new Point(16, 88);
                pnlStatusCard.Size = new Size(408, 140);
                pnlStatusCard.BackColor = BgCard;
                pnlStatusCard.Paint += (s, e) => DrawBorder(e.Graphics, pnlStatusCard.ClientRectangle, BorderSubtle, 6);

                lblStatusHeader = new Label();
                lblStatusHeader.Text = "SERVER STATUS";
                lblStatusHeader.Font = new Font("Segoe UI", 8F, FontStyle.Bold, GraphicsUnit.Point);
                lblStatusHeader.ForeColor = TextMuted;
                lblStatusHeader.Location = new Point(16, 14);
                lblStatusHeader.AutoSize = true;
                lblStatusHeader.BackColor = Color.Transparent;

                lblStatusBadge = new Label();
                lblStatusBadge.Text = "[ CHECKING ]";
                lblStatusBadge.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold, GraphicsUnit.Point);
                lblStatusBadge.ForeColor = TextSecondary;
                lblStatusBadge.BackColor = StoppedBg;
                lblStatusBadge.TextAlign = ContentAlignment.MiddleCenter;
                lblStatusBadge.Location = new Point(275, 12);
                lblStatusBadge.Size = new Size(116, 24);
                lblStatusBadge.Paint += (s, e) => DrawBorder(e.Graphics, lblStatusBadge.ClientRectangle, isServerRunning ? SuccessBorder : StoppedBorder, 4);

                lblUrlLabel = new Label();
                lblUrlLabel.Text = "Studio URL:";
                lblUrlLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
                lblUrlLabel.ForeColor = TextSecondary;
                lblUrlLabel.Location = new Point(16, 52);
                lblUrlLabel.AutoSize = true;
                lblUrlLabel.BackColor = Color.Transparent;

                lnkUrl = new LinkLabel();
                lnkUrl.Text = string.Format("http://localhost:{0}", currentPort);
                lnkUrl.Font = new Font("Segoe UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
                lnkUrl.LinkColor = Color.FromArgb(96, 165, 250);
                lnkUrl.ActiveLinkColor = Color.FromArgb(147, 197, 253);
                lnkUrl.VisitedLinkColor = Color.FromArgb(96, 165, 250);
                lnkUrl.Location = new Point(100, 50);
                lnkUrl.AutoSize = true;
                lnkUrl.BackColor = Color.Transparent;
                lnkUrl.LinkClicked += (s, e) => OpenInBrowser();

                lblPortLabel = new Label();
                lblPortLabel.Text = "HTTP Port:";
                lblPortLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
                lblPortLabel.ForeColor = TextSecondary;
                lblPortLabel.Location = new Point(16, 94);
                lblPortLabel.AutoSize = true;
                lblPortLabel.BackColor = Color.Transparent;

                numPort = new NumericUpDown();
                numPort.Minimum = 1024;
                numPort.Maximum = 65535;
                numPort.Value = currentPort;
                numPort.Location = new Point(102, 92);
                numPort.Size = new Size(90, 26);
                numPort.BackColor = BgDark;
                numPort.ForeColor = TextPrimary;
                numPort.BorderStyle = BorderStyle.FixedSingle;
                numPort.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
                numPort.KeyDown += (s, e) =>
                {
                    if (e.KeyCode == Keys.Enter)
                    {
                        e.SuppressKeyPress = true;
                        OnChangePortClicked(s, EventArgs.Empty);
                    }
                };
                numPort.ValueChanged += (s, e) =>
                {
                    int val = (int)numPort.Value;
                    if (val != currentPort)
                    {
                        btnApplyPort.BackColor = PrimaryBlue;
                        btnApplyPort.ForeColor = Color.White;
                    }
                    else
                    {
                        btnApplyPort.BackColor = BgCardAlt;
                        btnApplyPort.ForeColor = TextSecondary;
                    }
                };

                btnApplyPort = CreateStyledButton("Apply Port", BgCardAlt, TextSecondary, BorderSubtle);
                btnApplyPort.Location = new Point(202, 90);
                btnApplyPort.Size = new Size(110, 28);
                btnApplyPort.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point);
                btnApplyPort.Click += OnChangePortClicked;

                pnlStatusCard.Controls.Add(lblStatusHeader);
                pnlStatusCard.Controls.Add(lblStatusBadge);
                pnlStatusCard.Controls.Add(lblUrlLabel);
                pnlStatusCard.Controls.Add(lnkUrl);
                pnlStatusCard.Controls.Add(lblPortLabel);
                pnlStatusCard.Controls.Add(numPort);
                pnlStatusCard.Controls.Add(btnApplyPort);

                // Action Buttons
                btnOpenBrowser = CreateStyledButton("Open Studio in Browser", PrimaryBlue, Color.White, Color.Transparent);
                btnOpenBrowser.Location = new Point(16, 240);
                btnOpenBrowser.Size = new Size(408, 42);
                btnOpenBrowser.Font = new Font("Segoe UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
                btnOpenBrowser.Click += (s, e) => OpenInBrowser();

                btnToggleServer = CreateStyledButton("Start Server", SuccessGreen, Color.White, Color.Transparent);
                btnToggleServer.Location = new Point(16, 292);
                btnToggleServer.Size = new Size(408, 40);
                btnToggleServer.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold, GraphicsUnit.Point);
                btnToggleServer.Click += OnToggleServerClicked;

                // Directory Shortcuts
                btnOpenData = CreateStyledButton("Open Data Folder", BgCard, TextPrimary, BorderSubtle);
                btnOpenData.Location = new Point(16, 344);
                btnOpenData.Size = new Size(198, 36);
                btnOpenData.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point);
                btnOpenData.Click += (s, e) => OpenDataFolder();

                btnOpenAppDir = CreateStyledButton("Open Project Directory", BgCard, TextPrimary, BorderSubtle);
                btnOpenAppDir.Location = new Point(226, 344);
                btnOpenAppDir.Size = new Size(198, 36);
                btnOpenAppDir.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point);
                btnOpenAppDir.Click += (s, e) => OpenAppDirectory();

                // Preferences Checkboxes
                chkAutoOpenBrowser = new CheckBox();
                chkAutoOpenBrowser.Text = "Auto-open browser on server startup";
                chkAutoOpenBrowser.Checked = true;
                chkAutoOpenBrowser.ForeColor = TextSecondary;
                chkAutoOpenBrowser.BackColor = Color.Transparent;
                chkAutoOpenBrowser.Location = new Point(20, 394);
                chkAutoOpenBrowser.AutoSize = true;

                chkMinimizeToTray = new CheckBox();
                chkMinimizeToTray.Text = "Minimize to system tray when closing window";
                chkMinimizeToTray.Checked = true;
                chkMinimizeToTray.ForeColor = TextSecondary;
                chkMinimizeToTray.BackColor = Color.Transparent;
                chkMinimizeToTray.Location = new Point(20, 422);
                chkMinimizeToTray.AutoSize = true;

                // Status message
                lblStatusMessage = new Label();
                lblStatusMessage.Text = "Initializing...";
                lblStatusMessage.Font = new Font("Segoe UI", 8F, FontStyle.Regular, GraphicsUnit.Point);
                lblStatusMessage.ForeColor = TextMuted;
                lblStatusMessage.Location = new Point(18, 460);
                lblStatusMessage.Size = new Size(404, 28);
                lblStatusMessage.BackColor = Color.Transparent;

                // Add all controls to form
                this.Controls.Add(pnlHeader);
                this.Controls.Add(pnlStatusCard);
                this.Controls.Add(btnOpenBrowser);
                this.Controls.Add(btnToggleServer);
                this.Controls.Add(btnOpenData);
                this.Controls.Add(btnOpenAppDir);
                this.Controls.Add(chkAutoOpenBrowser);
                this.Controls.Add(chkMinimizeToTray);
                this.Controls.Add(lblStatusMessage);

                this.FormClosing += OnMainFormClosing;

                this.ResumeLayout(false);
                Log("Init: Finished InitializeComponent successfully");
            }
            catch (Exception ex)
            {
                Log("Init: Exception in InitializeComponent: " + ex.ToString());
                throw;
            }
        }

        private Button CreateStyledButton(string text, Color backColor, Color foreColor, Color borderColor)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.BackColor = backColor;
            btn.ForeColor = foreColor;
            btn.FlatStyle = FlatStyle.Flat;
            if (borderColor == Color.Transparent || borderColor.A == 0)
            {
                btn.FlatAppearance.BorderSize = 0;
            }
            else
            {
                btn.FlatAppearance.BorderSize = 1;
                btn.FlatAppearance.BorderColor = borderColor;
            }
            btn.Cursor = Cursors.Hand;
            btn.UseVisualStyleBackColor = false;

            btn.Paint += (s, e) =>
            {
                if (borderColor != Color.Transparent && borderColor.A > 0)
                {
                    DrawBorder(e.Graphics, btn.ClientRectangle, borderColor, 4);
                }
            };

            return btn;
        }

        private static void DrawBorder(Graphics g, Rectangle rect, Color borderColor, int radius)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
            if (radius <= 0)
            {
                using (Pen pen = new Pen(borderColor))
                {
                    g.DrawRectangle(pen, r);
                }
                return;
            }

            // Enforce max 8px border radius invariant
            if (radius > 8) radius = 8;
            int d = radius * 2;

            using (GraphicsPath path = new GraphicsPath())
            {
                path.AddArc(r.X, r.Y, d, d, 180, 90);
                path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
                path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
                path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
                path.CloseFigure();

                using (Pen pen = new Pen(borderColor, 1))
                {
                    g.DrawPath(pen, path);
                }
            }
        }

        private void SetupTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.BackColor = BgCard;
            trayMenu.ForeColor = TextPrimary;
            trayMenu.ShowImageMargin = false;

            ToolStripMenuItem mnuOpenBrowser = new ToolStripMenuItem("Open Atelier in Browser", null, (s, e) => OpenInBrowser());
            ToolStripMenuItem mnuShow = new ToolStripMenuItem("Show Control Panel", null, (s, e) => RestoreWindow());
            mnuTrayToggle = new ToolStripMenuItem("Start Server", null, (s, e) => OnToggleServerClicked(s, e));
            ToolStripMenuItem mnuData = new ToolStripMenuItem("Open Data Folder", null, (s, e) => OpenDataFolder());
            ToolStripSeparator sep = new ToolStripSeparator();
            ToolStripMenuItem mnuExit = new ToolStripMenuItem("Exit Atelier", null, (s, e) => ExitApplication());

            trayMenu.Items.AddRange(new ToolStripItem[] {
                mnuOpenBrowser,
                mnuShow,
                mnuTrayToggle,
                mnuData,
                sep,
                mnuExit
            });

            notifyIcon = new NotifyIcon();
            notifyIcon.Text = "Atelier Studio";
            notifyIcon.ContextMenuStrip = trayMenu;
            notifyIcon.Icon = this.Icon != null ? this.Icon : SystemIcons.Application;
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += (s, e) => RestoreWindow();
            notifyIcon.MouseClick += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    RestoreWindow();
                }
            };
        }

        private void RestoreWindow()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void CheckInitialStartup()
        {
            bool alreadyRunning = ProbePort(currentPort);
            if (alreadyRunning)
            {
                UpdateServerStatus(true);
                lblStatusMessage.Text = string.Format("Connected to active Atelier server on port {0}.", currentPort);
            }
            else
            {
                StartServer(false);
            }
        }

        private void OnPollTimerTick(object sender, EventArgs e)
        {
            CheckServerHealth();
        }

        private void CheckServerHealth(Action<bool> onComplete = null)
        {
            if (!this.IsHandleCreated || this.Disposing || this.IsDisposed) return;

            int probePort = currentPort;
            ThreadPool.QueueUserWorkItem(delegate
            {
                bool running = ProbePort(probePort);
                if (this.IsHandleCreated && !this.Disposing && !this.IsDisposed)
                {
                    try
                    {
                        this.BeginInvoke(new Action(delegate
                        {
                            UpdateServerStatus(running);
                            if (onComplete != null)
                            {
                                onComplete(running);
                            }
                        }));
                    }
                    catch { }
                }
            });
        }

        private bool ProbePort(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(300);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        client.Close();
                        return true;
                    }
                    client.Close();
                }
            }
            catch
            {
                // Port probe failed
            }
            return false;
        }

        private void UpdateServerStatus(bool running)
        {
            if (this.Disposing || this.IsDisposed) return;

            isServerRunning = running;
            if (running)
            {
                lblStatusBadge.Text = "[ RUNNING ]";
                lblStatusBadge.ForeColor = SuccessGreen;
                lblStatusBadge.BackColor = SuccessBg;

                btnToggleServer.Text = "Stop Server";
                btnToggleServer.BackColor = DangerRed;

                btnOpenBrowser.Text = "Open Studio in Browser";
                btnOpenBrowser.BackColor = PrimaryBlue;
                btnOpenBrowser.ForeColor = Color.White;

                lblStatusMessage.Text = string.Format("Server active at http://localhost:{0}", currentPort);
                if (notifyIcon != null)
                {
                    notifyIcon.Text = string.Format("Atelier Studio (Port {0} - Running)", currentPort);
                }
                if (mnuTrayToggle != null)
                {
                    mnuTrayToggle.Text = "Stop Server";
                }
            }
            else
            {
                lblStatusBadge.Text = "[ STOPPED ]";
                lblStatusBadge.ForeColor = TextSecondary;
                lblStatusBadge.BackColor = StoppedBg;

                btnToggleServer.Text = "Start Server";
                btnToggleServer.BackColor = SuccessGreen;

                btnOpenBrowser.Text = "Open Studio in Browser (Starts Server)";
                btnOpenBrowser.BackColor = BgCard;
                btnOpenBrowser.ForeColor = TextPrimary;

                lblStatusMessage.Text = "Server stopped. Click Start Server to begin.";
                if (notifyIcon != null)
                {
                    notifyIcon.Text = "Atelier Studio (Stopped)";
                }
                if (mnuTrayToggle != null)
                {
                    mnuTrayToggle.Text = "Start Server";
                }
            }

            lnkUrl.Text = string.Format("http://localhost:{0}", currentPort);
            pnlStatusCard.Invalidate();
        }

        private void StartServer(bool openBrowserOnSuccess)
        {
            Log("StartServer invoked. isServerRunning = " + isServerRunning);
            if (isServerRunning || ProbePort(currentPort))
            {
                Log("StartServer: already running on port " + currentPort);
                UpdateServerStatus(true);
                lblStatusMessage.Text = string.Format("Server is active on port {0}.", currentPort);
                if (openBrowserOnSuccess && chkAutoOpenBrowser.Checked)
                {
                    OpenInBrowser();
                }
                return;
            }

            Log("StartServer checking resolvedAtelierExe: " + resolvedAtelierExe);
            if (string.IsNullOrEmpty(resolvedAtelierExe) || !File.Exists(resolvedAtelierExe))
            {
                Log("StartServer: Executable not found at " + resolvedAtelierExe);
                lblStatusMessage.Text = string.Format("Executable not found: {0}", resolvedAtelierExe);
                return;
            }

            try
            {
                lblStatusMessage.Text = string.Format("Starting Atelier server on port {0}...", currentPort);

                string exeFolder = Path.GetDirectoryName(resolvedAtelierExe);
                string workDir = exeFolder;
                if (!Directory.Exists(Path.Combine(exeFolder, "static")) && Directory.Exists(Path.Combine(exeFolder, "..", "..", "static")))
                {
                    workDir = Path.GetFullPath(Path.Combine(exeFolder, "..", ".."));
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = resolvedAtelierExe;
                psi.Arguments = string.Format("--server --port {0} --no-browser{1}", currentPort, isPortable ? " --portable" : "");
                psi.WorkingDirectory = workDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                serverProcess = Process.Start(psi);
                Log("Process.Start executed successfully! Server PID: " + (serverProcess != null ? serverProcess.Id.ToString() : "null"));

                // Verify server actually started before triggering browser launch
                System.Windows.Forms.Timer waitTimer = new System.Windows.Forms.Timer();
                waitTimer.Interval = 750;
                waitTimer.Tick += (s, e) =>
                {
                    waitTimer.Stop();
                    waitTimer.Dispose();
                    CheckServerHealth(delegate(bool isRunning)
                    {
                        if (isRunning)
                        {
                            if (openBrowserOnSuccess && chkAutoOpenBrowser.Checked)
                            {
                                OpenInBrowser();
                            }
                        }
                        else
                        {
                            if (serverProcess != null && serverProcess.HasExited)
                            {
                                lblStatusMessage.Text = string.Format("Server exited with code {0}. Port may be in use.", serverProcess.ExitCode);
                            }
                            else
                            {
                                lblStatusMessage.Text = string.Format("Server did not respond on port {0}. Click Start Server to retry.", currentPort);
                            }
                        }
                    });
                };
                waitTimer.Start();
            }
            catch (Exception ex)
            {
                lblStatusMessage.Text = string.Format("Failed to start server: {0}", ex.Message);
            }
        }

        private void StopServer()
        {
            lblStatusMessage.Text = "Stopping server...";
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                    serverProcess.WaitForExit(1000);
                    serverProcess = null;
                }
            }
            catch
            {
            }

            // Clean up any remaining atelier server processes
            try
            {
                Process[] procs = Process.GetProcessesByName("atelier");
                foreach (Process p in procs)
                {
                    try
                    {
                        bool matches = false;
                        try
                        {
                            if (p.MainModule != null && string.Equals(p.MainModule.FileName, resolvedAtelierExe, StringComparison.OrdinalIgnoreCase))
                            {
                                matches = true;
                            }
                        }
                        catch
                        {
                            // In case of permission/bitness query restrictions
                            matches = true;
                        }

                        if (matches && !p.HasExited)
                        {
                            p.Kill();
                            p.WaitForExit(800);
                        }
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }

            Thread.Sleep(250);
            UpdateServerStatus(ProbePort(currentPort));
        }

        private void OnToggleServerClicked(object sender, EventArgs e)
        {
            if (isServerRunning)
            {
                StopServer();
            }
            else
            {
                StartServer(true);
            }
        }

        private void OnChangePortClicked(object sender, EventArgs e)
        {
            int newPort = (int)numPort.Value;
            if (newPort == currentPort)
            {
                lblStatusMessage.Text = string.Format("Port {0} is already active.", currentPort);
                btnApplyPort.BackColor = BgCardAlt;
                btnApplyPort.ForeColor = TextSecondary;
                return;
            }

            // Prevent hijacking or crashing if port is occupied by another application
            if (ProbePort(newPort))
            {
                lblStatusMessage.Text = string.Format("Port {0} is already in use by another program. Choose a different port.", newPort);
                return;
            }

            bool wasRunning = isServerRunning;
            if (wasRunning)
            {
                lblStatusMessage.Text = string.Format("Restarting server on new port {0}...", newPort);
                StopServer();
                Thread.Sleep(300);
            }

            currentPort = newPort;
            lnkUrl.Text = string.Format("http://localhost:{0}", currentPort);
            btnApplyPort.BackColor = BgCardAlt;
            btnApplyPort.ForeColor = TextSecondary;

            if (wasRunning)
            {
                StartServer(false);
            }
            else
            {
                lblStatusMessage.Text = string.Format("Port set to {0}. Click Start Server when ready.", currentPort);
            }
        }

        private void OpenInBrowser()
        {
            if (!isServerRunning)
            {
                lblStatusMessage.Text = "Starting server before opening browser...";
                StartServer(true);
                return;
            }

            string url = string.Format("http://localhost:{0}", currentPort);
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                lblStatusMessage.Text = string.Format("Error opening browser: {0}", ex.Message);
            }
        }

        private void OpenDataFolder()
        {
            try
            {
                if (!Directory.Exists(resolvedDataDir))
                {
                    Directory.CreateDirectory(resolvedDataDir);
                }
                Process.Start("explorer.exe", string.Format("\"{0}\"", resolvedDataDir));
            }
            catch (Exception ex)
            {
                lblStatusMessage.Text = string.Format("Error opening data directory: {0}", ex.Message);
            }
        }

        private void OpenAppDirectory()
        {
            try
            {
                string targetDir = !string.IsNullOrEmpty(resolvedProjectDir) && Directory.Exists(resolvedProjectDir)
                    ? resolvedProjectDir
                    : AppDomain.CurrentDomain.BaseDirectory;
                Process.Start("explorer.exe", string.Format("\"{0}\"", targetDir));
            }
            catch (Exception ex)
            {
                lblStatusMessage.Text = string.Format("Error opening project directory: {0}", ex.Message);
            }
        }

        private void OnMainFormClosing(object sender, FormClosingEventArgs e)
        {
            if (isExiting)
            {
                StopServer();
                if (notifyIcon != null)
                {
                    notifyIcon.Visible = false;
                    notifyIcon.Dispose();
                }
                return;
            }

            if (chkMinimizeToTray.Checked && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
                if (notifyIcon != null)
                {
                    notifyIcon.ShowBalloonTip(
                        2000,
                        "Atelier Studio",
                        "Atelier is still running in the background. Click or double-click this icon to restore control panel.",
                        ToolTipIcon.Info
                    );
                }
            }
            else
            {
                ExitApplication();
            }
        }

        private void ExitApplication()
        {
            isExiting = true;
            StopServer();
            if (notifyIcon != null)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }
            Application.Exit();
        }
    }
}
