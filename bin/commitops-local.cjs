#!/usr/bin/env node
'use strict';
const {spawnSync, spawn} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const home = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'commitops-local');
const runtime = path.join(home, 'runtime-v1');
const python = path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const args = process.argv.slice(2);
if (args.includes('--setup')) {
  fs.mkdirSync(home, {recursive: true, mode: 0o700});
  const command = process.env.COMMITOPS_LOCAL_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  for (const [exe, argv] of [[command, ['-m', 'venv', runtime]], [python, ['-m', 'pip', 'install', '-r', path.join(root, 'requirements.txt')]]]) {
    const result = spawnSync(exe, argv, {stdio: 'inherit', shell: false});
    if (result.error || result.status !== 0) { console.error('Setup failed. Python 3.12+ and public package access are required.'); process.exit(1); }
  }
  console.log('Setup complete. Run commitops-local. Processing now works offline.');
  process.exit(0);
}
if (!fs.existsSync(python)) { console.error('Run commitops-local --setup once to install the local Python engine.'); process.exit(1); }
// Allowlist environment: no cloud credentials, hosted settings or PYTHONPATH.
const env = {};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'LANG']) if (process.env[key]) env[key] = process.env[key];
env.PYTHONNOUSERSITE = '1'; env.PYTHONDONTWRITEBYTECODE = '1';
const child = spawn(python, [path.join(root, 'engine', 'local_app.py'), '--data', path.join(home, 'data'), ...args], {stdio: 'inherit', shell: false, env});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
