#!/bin/bash

set -e  # Exit on any error

echo "🚀 Building Rust target for AWS S3 test..."

# Ensure output directory exists with correct permissions
mkdir -p test-rust-generation
# Fix ownership if needed (in case it was created by root previously)
if [ "$(stat -c %U test-rust-generation)" != "$(whoami)" ]; then
  echo "🔧 Fixing directory permissions..."
  sudo chown -R "$(id -u):$(id -g)" test-rust-generation/
fi

echo "📦 Building everything inside Docker..."
docker run -it --rm \
  -v "$(pwd)":/source \
  -v "$(pwd)/test-rust-generation":/output \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e YARN_CACHE_FOLDER=/tmp/.yarn-cache \
  -w /source \
  jsii/superchain:local \
  bash -c "
    echo '📦 Installing root dependencies...'
    yarn install
    
    echo '🔨 Building dependencies first...'
    yarn workspace @scope/jsii-calc-lib build
    
    echo '🔨 Building aws-s3-test package...'
    yarn workspace aws-s3-test build
    
    echo '🔧 Fixing jsii-pacmak linting issues...'
    yarn workspace jsii-pacmak lint:fix || echo 'Lint fix attempted, continuing...'
    
    echo '🔨 Building jsii-pacmak...'
    yarn workspace jsii-pacmak build
    
    echo '🦀 Generating Rust code...'
    node packages/jsii-pacmak/bin/jsii-pacmak --target rust --force-target --outdir /output packages/aws-s3-test
  "

echo "🦀 Building generated Rust code on host..."
if [ -d "test-rust-generation/rust/aws_s3_test" ]; then
  cd test-rust-generation/rust/aws_s3_test
  
  echo "📋 Generated Cargo.toml:"
  cat Cargo.toml
  echo ""
  
  echo "🔍 Generated Rust files:"
  find . -name "*.rs" | head -10
  echo ""
  
  cargo build
  echo "✅ Rust build completed successfully!"
else
  echo "❌ Error: Generated Rust code not found in test-rust-generation/rust/aws_s3_test"
  echo "📂 Available directories:"
  ls -la test-rust-generation/
  if [ -d "test-rust-generation/rust" ]; then
    echo "📂 In rust directory:"
    ls -la test-rust-generation/rust/
  fi
  exit 1
fi 