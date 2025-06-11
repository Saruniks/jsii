#!/bin/bash
# Docker-based pack script for Rust bindings generation
set -eu

echo "🦀 Generating Rust bindings for AWS CDK using custom jsii-pacmak (Docker)"

RUST_OUTPUT_DIR="$(pwd)/aws-cdk-rust-bindings"
mkdir -p "$RUST_OUTPUT_DIR"

echo "🐳 Running build inside Docker container..."

docker run -it --rm \
  -v "$(pwd)":/aws-cdk \
  -v "/home/clear/jsii":/jsii \
  -v "$RUST_OUTPUT_DIR":/output \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e YARN_CACHE_FOLDER=/tmp/.yarn-cache \
  -w /aws-cdk \
  jsii/superchain:local \
  bash -c "
    echo '📦 Installing AWS CDK dependencies...'
    yarn install
    
    echo '🔨 Building aws-cdk-lib...'
    npx lerna run build --scope aws-cdk-lib --include-dependencies --stream
    
    echo '🦀 Generating Rust bindings...'
    echo 'Using jsii-pacmak: /jsii/packages/jsii-pacmak/bin/jsii-pacmak'
    echo 'Output directory: /output'
    
    # Generate Rust bindings using our custom jsii-pacmak
    NODE_PATH=/jsii/packages/jsii-pacmak/node_modules:\$NODE_PATH \
    node /jsii/packages/jsii-pacmak/bin/jsii-pacmak \
      --verbose \
      --targets rust \
      --code-only \
      --output /output \
      ./packages/aws-cdk-lib
  "

echo "✅ Rust bindings generated in $RUST_OUTPUT_DIR"
echo "📁 Contents:"
ls -la "$RUST_OUTPUT_DIR" 