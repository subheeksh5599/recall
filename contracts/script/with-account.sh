#!/usr/bin/env bash
# Run a command with the deployer key loaded from the 0600 key file outside the repo.
# The key is never printed; it lives only in this process's environment.
set -euo pipefail
KEYFILE="${RECALL_KEYFILE:-$HOME/.config/recall/deployer.env}"
[ -r "$KEYFILE" ] || { echo "missing $KEYFILE" >&2; exit 1; }
PRIVATE_KEY="$(grep '^DEPLOYER_PK=' "$KEYFILE" | cut -d= -f2)"
DEPLOYER="$(grep '^DEPLOYER_ADDR=' "$KEYFILE" | cut -d= -f2)"
export PRIVATE_KEY DEPLOYER
exec "$@"
