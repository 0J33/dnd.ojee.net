#!/bin/bash
# Builds the client for the demo (same origin: the server serves it) into a
# side folder and swaps it in only if the build succeeds.
set -e
cd "$(dirname "$0")/../client"
rm -rf dist-next
VITE_SERVER_URL=/ npx vite build --outDir dist-next --emptyOutDir
rm -rf dist-prev
[ -d dist ] && mv dist dist-prev
mv dist-next dist
rm -rf dist-prev
echo "demo build swapped in"
