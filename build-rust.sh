#!/bin/bash

set -e

echo "🚀 Building Rust target for JSII..."

# Clean up previous output to avoid conflicts
echo "🧹 Cleaning up previous output..."
rm -rf ./output/rust
rm -rf ./packages/jsii-pacmak/output/rust

# Run the Docker container with all commands
docker run --rm -v .:/jsii -w /jsii --user "$(id -u):$(id -g)" -e HOME=/tmp -e YARN_CACHE_FOLDER=/tmp/.yarn-cache jsii/superchain:local bash -c "
    set -e
    
    echo '📦 Building jsii-pacmak...'
    if ! yarn workspace jsii-pacmak build; then
        echo '❌ Failed to build jsii-pacmak - stopping here'
        exit 1
    fi
    
    echo '🦀 Generating Rust code for dependencies...'
    
    # Generate dependencies first (with --force-target since they don't have Rust targets configured)
    echo '📦 Generating @scope/jsii-calc-base-of-base...'
    if ! yarn workspace jsii-pacmak run jsii-pacmak --target rust --force-target --outdir ../../output ../../packages/@scope/jsii-calc-base-of-base/; then
        echo '❌ Failed to generate @scope/jsii-calc-base-of-base - stopping here'
        exit 1
    fi
    
    echo '📦 Generating @scope/jsii-calc-base...'
    if ! yarn workspace jsii-pacmak run jsii-pacmak --target rust --force-target --outdir ../../output ../../packages/@scope/jsii-calc-base/; then
        echo '❌ Failed to generate @scope/jsii-calc-base - stopping here'
        exit 1
    fi
    
    echo '📦 Generating @scope/jsii-calc-lib...'
    if ! yarn workspace jsii-pacmak run jsii-pacmak --target rust --force-target --outdir ../../output ../../packages/@scope/jsii-calc-lib/; then
        echo '❌ Failed to generate @scope/jsii-calc-lib - stopping here'
        exit 1
    fi
    
    echo '🦀 Generating main jsii-calc...'
    if ! yarn workspace jsii-pacmak run jsii-pacmak --target rust --outdir ../../output ../../packages/jsii-calc/; then
        echo '❌ Failed to generate Rust code - stopping here'
        exit 1
    fi
    
    echo '🔧 Checking if Rust code was generated...'
    if [ ! -d 'output/rust' ]; then
        echo '❌ output/rust directory not found - generation failed'
        echo 'Looking for alternative locations...'
        if [ -d 'packages/jsii-pacmak/output/rust' ]; then
            echo '✅ Found Rust code in packages/jsii-pacmak/output/rust'
            cd packages/jsii-pacmak/output/rust
        else
            echo '❌ No Rust code found in any expected location'
            exit 1
        fi
    else
        cd output/rust
    fi
    
    echo '🎨 Running cargo fmt...'
    if ! cargo fmt --check 2>&1; then
        echo '⚠️ cargo fmt check failed, trying to fix formatting...'
        if ! cargo fmt 2>&1; then
            echo '❌ cargo fmt failed - stopping here (likely syntax errors)'
            exit 1
        fi
        echo '✅ Fixed formatting issues'
    fi
    
    echo '🔧 Attempting cargo build...'
    if RUSTFLAGS='-Awarnings' cargo build 2>&1; then
        echo '✅ Cargo build succeeded!'
        exit 0
    else
        echo '❌ Cargo build failed - see errors above'
        exit 1
    fi
"

echo "🏁 Build process completed" 