#!/usr/bin/env node
const { execSync } = require('child_process');
const { removeSync } = require('fs-extra');
const { join, resolve } = require('path');

const genRoot = join(__dirname, '..', 'jsii-calc');

// Clean previous generation
removeSync(genRoot);

console.log('🦀 Generating Rust bindings for jsii-calc...');

// Generate Rust bindings for jsii-calc
try {
  execSync([
    'npx jsii-pacmak',
    '-t rust',
    '-v',
    '-c',
    '-o', genRoot,
    '--recurse',
    resolve(__dirname, '..', '..', '..', 'jsii-calc')
  ].join(' '), { 
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✅ Rust bindings generated successfully!');
} catch (error) {
  console.error('❌ Failed to generate Rust bindings:', error.message);
  process.exit(1);
} 