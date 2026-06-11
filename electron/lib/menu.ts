import { Menu, shell, app } from "electron";
import { getMainWindow } from "./window";

function nav(path: string) {
  return () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send("navigate", { path });
    }
  };
}

export function buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),

    {
      label: "File",
      submenu: [
        { label: "New Email",  accelerator: "CmdOrCtrl+N",       click: nav("/compose") },
        { label: "New Chat",   accelerator: "CmdOrCtrl+Shift+N", click: nav("/chat") },
        { type: "separator" },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },

    {
      label: "View",
      submenu: [
        {
          label: "Command Palette",
          accelerator: "CmdOrCtrl+K",
          click: () => getMainWindow()?.webContents.send("open-command-palette"),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    {
      label: "Workspace",
      submenu: [
        { label: "Inbox",    accelerator: "CmdOrCtrl+1", click: nav("/inbox") },
        { label: "Chat",     accelerator: "CmdOrCtrl+2", click: nav("/chat") },
        { label: "Meet",     accelerator: "CmdOrCtrl+3", click: nav("/meet") },
        { label: "Drive",    accelerator: "CmdOrCtrl+4", click: nav("/drive") },
        { label: "Calendar", accelerator: "CmdOrCtrl+5", click: nav("/calendar") },
        { type: "separator" },
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: nav("/settings") },
      ],
    },

    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? ([{ type: "separator" }, { role: "front" }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: "close" }] as Electron.MenuItemConstructorOptions[])),
      ],
    },

    {
      label: "Help",
      submenu: [
        { label: "Support",       click: () => shell.openExternal("mailto:hello@cybersage.uk") },
        { label: "System Status", click: nav("/status") },
        { type: "separator" },
        ...(!isMac ? [{ role: "toggleDevTools" as const }] : []),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
