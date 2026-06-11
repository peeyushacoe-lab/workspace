# Building Nexus on macOS

Electron-builder cannot cross-compile Mac builds from Windows. Build it on your MacBook directly.

## Prereqs

- macOS 11+
- Node 20+ (`brew install node`)
- Xcode Command Line Tools (`xcode-select --install`)

## Steps

```bash
# 1. Transfer the whole `cybersage-mail` repo to the Mac (USB, AirDrop, git clone, etc.)

# 2. From the repo root:
cd cybersage-mail/apps/desktop

# 3. Install
npm install

# 4. Build the renderer + electron sources
npm run build

# 5. Package — produces .dmg and .zip for both Intel and Apple Silicon
npx electron-builder --mac

# Output:
#   release/Nexus-Mac-x64.dmg       Intel install image
#   release/Nexus-Mac-arm64.dmg     Apple Silicon install image
#   release/Nexus-Mac-x64.zip
#   release/Nexus-Mac-arm64.zip
#   release/mac/Nexus.app           Intel unpackaged .app
#   release/mac-arm64/Nexus.app     Apple Silicon unpackaged .app
```

If you only want one architecture (saves time):

```bash
npx electron-builder --mac dmg --arm64    # M1/M2/M3 only
npx electron-builder --mac dmg --x64      # Intel only
```

## First launch

The build is **unsigned** (no Apple Developer ID). macOS will block it on first open with "Nexus cannot be opened because it is from an unidentified developer."

Right-click the app → **Open** → confirm in the dialog. After that it'll open normally.

Or in Terminal: `xattr -cr /Applications/Nexus.app` after dragging it to Applications.

## Notes

- The app talks to `https://cybersage-mail.vercel.app` by default (same backend as Windows).
- To point at a different backend, set `~/Library/Application Support/Nexus/config.json` to `{"apiUrl":"https://your-host"}`.
- Same login as Windows (`peeyush@cybersage.uk`). Session is encrypted via macOS Keychain (`safeStorage`).
- Camera & microphone permission prompts appear on first call — accept them in System Settings → Privacy & Security.
