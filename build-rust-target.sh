#!/bin/bash

set -e  # Exit on any error

echo "🚀 Building Rust target for jsii-calc..."

# Ensure output directory exists with correct permissions
mkdir -p test-rust-generation
# Fix ownership if needed (in case it was created by root previously)
if [ "$(stat -c %U test-rust-generation)" != "$(whoami)" ]; then
  echo "🔧 Fixing directory permissions..."
  sudo chown -R "$(id -u):$(id -g)" test-rust-generation/
fi

echo "📦 Building jsii-pacmak and generating Rust code..."
docker run -it --rm \
  -v "$(pwd)":/source \
  -v "$(pwd)/test-rust-generation":/output \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e YARN_CACHE_FOLDER=/tmp/.yarn-cache \
  -w /source \
  jsii/superchain:local \
  bash -c "
    echo '🔨 Building jsii-pacmak...'
    yarn workspace jsii-pacmak build
    
    echo '🦀 Generating Rust code...'
    node packages/jsii-pacmak/bin/jsii-pacmak --target rust --force-target --outdir /output packages/jsii-calc
  "

echo "🦀 Building generated Rust code..."
if [ -d "test-rust-generation/rust/jsii_calc" ]; then
  cd test-rust-generation/rust/jsii_calc
  cargo build
  echo "✅ Rust build completed successfully!"
else
  echo "❌ Error: Generated Rust code not found in test-rust-generation/rust/jsii_calc"
  exit 1
fi 