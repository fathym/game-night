#!/usr/bin/env sh
# Builds the relay plugin inside the .NET 8 SDK image so the server never needs an SDK installed.
# Output: ./plugins/GameNight.Relay.dll, which the impostor service mounts at /app/plugins.
set -eu
cd "$(dirname "$0")"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e DOTNET_NOLOGO=1 \
  -v "$PWD/../plugin:/src" \
  -v "$PWD/plugins:/out" \
  -w /src \
  mcr.microsoft.com/dotnet/sdk:8.0 \
  dotnet build -c Release -o /out

ls -la plugins
