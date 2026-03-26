/**
 * Pre-install check: verifies that native build tools are available
 * for compiling node-pty. Runs before npm install to give a clear
 * error message instead of a cryptic build failure.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const os = platform();
let ok = true;

function check(label, cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    console.log(`  ✓ ${label}`);
    return true;
  } catch {
    console.log(`  ✗ ${label}`);
    return false;
  }
}

console.log('\nChecking prerequisites for node-pty...\n');

// Node.js version
const nodeVersion = process.versions.node;
const major = parseInt(nodeVersion.split('.')[0], 10);
if (major < 18) {
  console.log(`  ✗ Node.js 18+ required (found ${nodeVersion})`);
  ok = false;
} else {
  console.log(`  ✓ Node.js ${nodeVersion}`);
}

// Platform-specific native build tools
if (os === 'win32') {
  if (!check('C/C++ compiler (MSVC or Build Tools)', 'where cl.exe')) {
    ok = false;
    console.log('\n  → Install Visual Studio Build Tools:');
    console.log('    npm install --global windows-build-tools');
    console.log('    or download from https://visualstudio.microsoft.com/visual-cpp-build-tools/');
  }
} else if (os === 'darwin') {
  if (!check('Xcode Command Line Tools', 'xcode-select -p')) {
    ok = false;
    console.log('\n  → Run: xcode-select --install');
  }
} else {
  if (!check('C/C++ compiler (gcc/g++)', 'which gcc')) {
    ok = false;
    console.log('\n  → Install build-essential:');
    console.log('    sudo apt install build-essential python3');
  }
}

// Python (needed by node-gyp)
const hasPython = check('Python (for node-gyp)', os === 'win32' ? 'where python' : 'which python3');
if (!hasPython) {
  ok = false;
  console.log('\n  → Install Python 3 from https://python.org');
}

console.log('');

if (!ok) {
  console.log('Some prerequisites are missing. node-pty requires native');
  console.log('compilation — install the items above and try again.\n');
  process.exit(1);
} else {
  console.log('All prerequisites met. Proceeding with install...\n');
}
