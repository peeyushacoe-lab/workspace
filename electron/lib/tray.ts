import { Tray, Menu, nativeImage, app } from "electron";
import path from "path";
import { getMainWindow, createMainWindow } from "./window";

let tray: Tray | null = null;
let unreadCount = 0;
let dndEnabled = false;

function buildMenu() {
  const win = getMainWindow();

  return Menu.buildFromTemplate([
    {
      label: "Open CyberSage",
      click: () => {
        if (win) {
          win.show();
          win.focus();
        } else {
          createMainWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Inbox",
      click: () => navigateTo("/inbox"),
    },
    {
      label: "Chat",
      click: () => navigateTo("/chat"),
    },
    {
      label: "Meet",
      click: () => navigateTo("/meet"),
    },
    { type: "separator" },
    ...(unreadCount > 0
      ? [{ label: `${unreadCount} unread`, enabled: false }]
      : []),
    {
      label: dndEnabled ? "✓ Do Not Disturb" : "Do Not Disturb",
      click: () => {
        dndEnabled = !dndEnabled;
        getMainWindow()?.webContents.send("dnd-changed", { enabled: dndEnabled });
        rebuild();
      },
    },
    { type: "separator" as const },
    {
      label: "Quit CyberSage",
      role: "quit" as const,
    },
  ]);
}

function navigateTo(path: string) {
  const win = getMainWindow();
  if (win) {
    win.show();
    win.focus();
    win.webContents.send("navigate", { path });
  }
}

function rebuild() {
  tray?.setContextMenu(buildMenu());
  if (unreadCount > 0) {
    tray?.setTitle(`${unreadCount}`);
    tray?.setToolTip(`CyberSage — ${unreadCount} unread`);
  } else {
    tray?.setTitle("");
    tray?.setToolTip("CyberSage Workspace");
  }
}

export function createTray(): Tray {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "../../public/icon-512.png"))
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("CyberSage Workspace");
  rebuild();

  tray.on("double-click", () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
    } else {
      createMainWindow();
    }
  });

  return tray;
}

export function updateTrayBadge(count: number) {
  unreadCount = count;
  rebuild();
  if (process.platform === "darwin") {
    app.setBadgeCount(count);
  }
}
