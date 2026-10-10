#!/usr/bin/env bash
set -euo pipefail
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
base="${DEVSECOPS_SETUP_DIR:-$(dirname -- "$repo")/.onboarding}"
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  echo "Este script requiere Linux x86_64; en Windows usa WSL." >&2
  exit 1
fi
mkdir -p "$base/bin" "$base/downloads" "$base/provider-cache"
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)'
npm ci --prefix "$repo" --cache "$base/npm-cache" --no-audit --no-fund
cd "$base/downloads"
if [ ! -f terraform_1.13.5_linux_amd64.zip ] || [ ! -f terraform_1.13.5_SHA256SUMS ]; then
 curl -fLsS --retry 2 --max-time 180 https://releases.hashicorp.com/terraform/1.13.5/terraform_1.13.5_linux_amd64.zip -o terraform_1.13.5_linux_amd64.zip
 curl -fLsS --retry 2 --max-time 60 https://releases.hashicorp.com/terraform/1.13.5/terraform_1.13.5_SHA256SUMS -o terraform_1.13.5_SHA256SUMS
fi
python3 - "$base" <<'PY'
import hashlib,pathlib,zipfile,sys
b=pathlib.Path(sys.argv[1]); p=b/'downloads'; f='terraform_1.13.5_linux_amd64.zip'
expected=next(line.split()[0] for line in (p/'terraform_1.13.5_SHA256SUMS').read_text().splitlines() if line.split()[-1]==f)
assert hashlib.sha256((p/f).read_bytes()).hexdigest()==expected, 'Terraform checksum mismatch'
with zipfile.ZipFile(p/f) as z: z.extract('terraform',b/'bin')
(b/'bin'/'terraform').chmod(0o755)
PY
export PATH="$base/bin:$PATH"
export TF_PLUGIN_CACHE_DIR="$base/provider-cache"
export TF_DATA_DIR="$base/terraform-dev"
cd "$repo/enviroments/dev"
terraform init -backend=false -input=false -no-color
terraform validate -no-color
export TF_DATA_DIR="$base/terraform-lab11"
cd "$repo/api-gateway"
terraform init -backend=false -input=false -no-color
terraform validate -no-color
terraform test -no-color
cd "$repo"
npm test -- --runInBand
npm run test:lambda
npm run test:messaging
node run-saga-demo.js
git -C "$repo" status --short

