#!/bin/bash
# Nexus Mac Setup Script
# Run once from Terminal: bash setup-mac.sh
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${CYAN}[nexus]${NC} $1"; }
success() { echo -e "${GREEN}[done]${NC} $1"; }
warn()    { echo -e "${YELLOW}[warn]${NC} $1"; }

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Homebrew ───────────────────────────────────────────────────────────────
info "Checking Homebrew…"
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew (you may be prompted for your password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for this session and future sessions
  if [[ "$(uname -m)" == "arm64" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    # Add to both .zprofile (login shells) and .zshrc (interactive shells)
    grep -q 'brew shellenv' ~/.zprofile 2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zprofile
    grep -q 'brew shellenv' ~/.zshrc   2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zshrc
  fi
else
  success "Homebrew already installed"
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
info "Checking Node.js…"
if ! command -v node &>/dev/null; then
  info "Installing Node.js 22 LTS via Homebrew…"
  brew install node@22
  brew link node@22 --force --overwrite
else
  success "Node $(node --version) already installed"
fi

# ── 3. Git (Homebrew version for latest) ─────────────────────────────────────
info "Checking git…"
if ! brew list git &>/dev/null; then
  brew install git
else
  success "git $(git --version) already installed"
fi

# ── 4. Global CLIs ───────────────────────────────────────────────────────────
info "Installing Vercel CLI…"
npm install -g vercel@latest

info "Installing EAS CLI (Expo Application Services)…"
npm install -g eas-cli@latest

info "Installing Expo CLI…"
npm install -g expo-cli@latest

# ── 5. npm install — repo root (Next.js backend) ─────────────────────────────
info "Installing Next.js backend dependencies…"
cd "$REPO_ROOT"
npm install

# ── 6. npm install — desktop app ─────────────────────────────────────────────
info "Installing desktop app dependencies…"
cd "$REPO_ROOT/apps/desktop"
npm install

# ── 7. npm install — mobile app ──────────────────────────────────────────────
info "Installing mobile app dependencies…"
cd "$REPO_ROOT/apps/workspace-mobile"
# --legacy-peer-deps needed due to react-native-worklets version conflict in expo-router sub-deps
npm install --legacy-peer-deps

# ── 8. Prisma generate ───────────────────────────────────────────────────────
info "Generating Prisma client…"
cd "$REPO_ROOT"
npx prisma generate

# ── 9. Clear macOS quarantine from binary tools ───────────────────────────────
info "Clearing macOS quarantine from binary tools (electron-builder, 7zip)…"
find "$REPO_ROOT/apps/desktop/node_modules/app-builder-bin" -type f -exec xattr -cr {} \; 2>/dev/null || true
find "$REPO_ROOT/apps/desktop/node_modules/7zip-bin" -type f -exec xattr -cr {} \; 2>/dev/null || true
find "$REPO_ROOT/apps/desktop/node_modules/.bin" -type f -exec chmod +x {} \; 2>/dev/null || true

echo ""
success "All dependencies installed!"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo ""
echo "  Mac app build:"
echo "    cd apps/desktop && npm run build && npx electron-builder --mac"
echo ""
echo "  Run Next.js backend locally (optional — uses Vercel prod by default):"
echo "    npm run dev"
echo ""
echo "  iOS simulator build:"
echo "    cd apps/workspace-mobile && npx expo start --ios"
echo ""
echo "  iOS device / TestFlight build via EAS:"
echo "    eas login"
echo "    eas build --platform ios --profile preview"
echo ""
echo "  Deploy backend to Vercel:"
echo "    vercel --prod"
echo ""
