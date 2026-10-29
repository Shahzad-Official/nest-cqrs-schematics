#!/bin/sh
set -eu

usage() {
  printf '%s\n' 'Usage: ./install.sh [npm|pnpm]' \
    'Installs generator dependencies and registers nest-cqrs globally.' \
    'Defaults to npm. Requires a supported Node.js and the selected package manager.' \
    'When supplied through stdin, downloads a persistent copy without requiring Git.'
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 1
fi

installer_manager=${1:-npm}
case "$installer_manager" in
  -h|--help) usage; exit 0 ;;
  npm|pnpm) ;;
  *) usage >&2; exit 1 ;;
esac

for installer_command in node "$installer_manager"; do
  if ! command -v "$installer_command" >/dev/null 2>&1; then
    printf 'Required command is not installed: %s\n' "$installer_command" >&2
    exit 1
  fi
done

case "$0" in
  */install.sh|install.sh)
    installer_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    ;;
  *)
    for installer_command in curl tar mktemp sed; do
      if ! command -v "$installer_command" >/dev/null 2>&1; then
        printf 'Required command is not installed: %s\n' "$installer_command" >&2
        exit 1
      fi
    done
    installer_data="${XDG_DATA_HOME:-$HOME/.local/share}/nest-cqrs-schematics"
    mkdir -p "$installer_data"
    installer_download=$(mktemp -d "$installer_data/install.XXXXXX")
    trap 'rm -rf -- "$installer_download"' 0
    trap 'exit 130' 2
    trap 'exit 143' 15
    printf '%s\n' 'Downloading Nest CQRS Schematics...'
    curl -fsSL 'https://github.com/Shahzad-Official/nest-cqrs-schematics/archive/refs/heads/main.tar.gz' \
      -o "$installer_download/source.tar.gz"
    installer_root="$installer_download/source"
    mkdir "$installer_root"
    tar -xzf "$installer_download/source.tar.gz" -C "$installer_root" --strip-components=1
    if [ ! -f "$installer_root/install.sh" ] || [ ! -f "$installer_root/package.json" ]; then
      printf '%s\n' 'Downloaded archive does not contain the expected installer and package.json.' >&2
      exit 1
    fi
    rm -f "$installer_download/source.tar.gz"
    # Keep source once registration starts: global package links may refer to it.
    trap - 0 2 15
    printf 'Installing dependencies and registering nest-cqrs (%s)...\n' "$installer_manager"
    if sh "$installer_root/install.sh" "$installer_manager" </dev/null >"$installer_download/install.log" 2>&1; then
      sed -n '/^Installation complete\./,$p' "$installer_download/install.log"
      printf 'Installed files: %s\n' "$installer_root"
      printf 'Installation log: %s\n' "$installer_download/install.log"
    else
      installer_status=$?
      cat "$installer_download/install.log" >&2
      printf 'Installation failed. Files and log retained at: %s\n' "$installer_download" >&2
      exit "$installer_status"
    fi
    exit 0
    ;;
esac
cd "$installer_root"

record_installation() {
  mkdir -p bin
  printf '{"packageManager":"%s"}\n' "$installer_manager" > bin/installation.json
}

if [ "$installer_manager" = npm ]; then
  printf '%s\n' 'Installing dependencies with npm (Node engine requirements enforced)...'
  npm ci --engine-strict
  record_installation
  printf '%s\n' 'Registering nest-cqrs globally...'
  npm link
  installer_bin="$(npm prefix --global)/bin"
else
  installer_version=$(pnpm --version)
  installer_major=${installer_version%%.*}
  case "$installer_major" in
    ''|*[!0-9]*) printf 'Cannot determine pnpm version: %s\n' "$installer_version" >&2; exit 1 ;;
  esac
  if [ "$installer_major" -lt 10 ]; then
    printf '%s\n' 'Use pnpm 10 or newer with this installer.' >&2
    exit 1
  fi
  if ! installer_bin=$(pnpm bin --global); then
    printf '%s\n' 'Run pnpm setup, reopen your terminal, then rerun ./install.sh pnpm.' >&2
    exit 1
  fi
  printf '%s\n' 'Installing dependencies with pnpm (Node engine requirements enforced)...'
  CI=true pnpm install --frozen-lockfile --config.engine-strict=true
  record_installation
  printf '%s\n' 'Registering nest-cqrs globally...'
  if [ "$installer_major" -ge 11 ]; then
    pnpm add --global .
  else
    pnpm link --global
  fi
fi

printf '\n%s\n' 'Installation complete.'
case ":$PATH:" in
  *":$installer_bin:"*) ;;
  *) printf 'Add this global command directory to PATH: %s\n' "$installer_bin" ;;
esac
printf '%s\n' 'Verify manually: nest-cqrs --help' \
  'Update later: nest-cqrs update' \
  'Then, inside an existing Nest project: nest-cqrs init'
