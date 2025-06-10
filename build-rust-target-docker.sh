#!/bin/bash

set -e  # Exit on any error

echo "🚀 Building Rust target for jsii-calc (all in Docker)..."

# Ensure output directory exists
mkdir -p test-rust-generation

echo "📦 Building everything in Docker..."
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
    
    echo '🦀 Building generated Rust code...'
    if [ -d '/output/rust/jsii_calc' ]; then
      cd /output/rust/jsii_calc
      cargo build
      echo '✅ Rust build completed successfully!'
    else
      echo '❌ Error: Generated Rust code not found'
      exit 1
    fi
  "

echo "🎉 All done! Check test-rust-generation/rust/jsii_calc for the generated and built Rust code." 