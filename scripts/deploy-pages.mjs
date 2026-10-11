#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const appDistDir = path.resolve(rootDir, 'artifacts/monarch-lens/dist/public');

function run(cmd, options = {}) {
  return execSync(cmd, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    ...options,
  });
}

function runOutput(cmd, options = {}) {
  return execSync(cmd, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  }).trim();
}

const isDryRun = process.argv.includes('--dry-run');

console.log('=== Monarch Lens GitHub Pages Deployment ===');
if (isDryRun) {
  console.log('[DRY RUN MODE ENABLED - No changes will be pushed]');
}

// 1. Verify Git repository and origin remote
const originUrl = runOutput('git remote get-url origin');
console.log(`Checking remote origin: ${originUrl}`);
if (!/github\.com[/:](roxy4798|ROXY4798)\/(MONARCH-LENS|monarch-lens)(\.git)?$/i.test(originUrl.trim())) {
  console.error(`Error: origin remote does not point to roxy4798/MONARCH-LENS: ${originUrl}`);
  process.exit(1);
}

// 2. Verify current branch
const currentBranch = runOutput('git rev-parse --abbrev-ref HEAD');
console.log(`Current branch: ${currentBranch}`);
if (currentBranch !== 'main') {
  console.error(`Error: deployment must be performed from 'main' branch (current: ${currentBranch})`);
  process.exit(1);
}

// 3. Verify working directory cleanliness (unless dry-run)
const gitStatus = runOutput('git status --porcelain');
if (gitStatus && !isDryRun) {
  console.error('Error: working directory has uncommitted changes. Commit or stash before deploying.');
  console.error(gitStatus);
  process.exit(1);
}

// 4. Retrieve current source commit details
const sourceCommitSha = runOutput('git rev-parse HEAD');
const shortSha = runOutput('git rev-parse --short HEAD');
const timestampUtc = new Date().toISOString();
console.log(`Source commit: ${sourceCommitSha} (${shortSha})`);
console.log(`Build timestamp: ${timestampUtc}`);

// 5. Build monarch-lens frontend
console.log('Running production build for @workspace/monarch-lens...');
run('npm --prefix artifacts/monarch-lens run build');

if (!fs.existsSync(appDistDir) || !fs.existsSync(path.join(appDistDir, 'index.html'))) {
  console.error(`Error: build output directory missing index.html at ${appDistDir}`);
  process.exit(1);
}

// 6. Generate deployment manifest
const manifest = {
  repository: 'roxy4798/MONARCH-LENS',
  sourceBranch: 'main',
  sourceCommit: sourceCommitSha,
  sourceCommitShort: shortSha,
  buildTimestampUtc: timestampUtc,
  targetBranch: 'gh-pages',
  applicationVersion: '0.1.0',
  basePath: '/MONARCH-LENS/',
};

const manifestPath = path.join(appDistDir, 'deploy-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('Generated deploy-manifest.json:');
console.log(JSON.stringify(manifest, null, 2));

// 7. Ensure .nojekyll and 404.html exist
fs.writeFileSync(path.join(appDistDir, '.nojekyll'), '', 'utf8');
fs.copyFileSync(path.join(appDistDir, 'index.html'), path.join(appDistDir, '404.html'));
console.log('Created .nojekyll and synchronized 404.html fallback.');

if (isDryRun) {
  console.log('Dry run complete. Build artifacts and manifest generated successfully without pushing.');
  process.exit(0);
}

// 8. Deploy to gh-pages branch
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-pages-deploy-'));
try {
  console.log(`Cloning gh-pages branch to temporary workdir: ${tempDir}`);
  execSync(`git clone --branch gh-pages --depth 1 "${originUrl}" "${tempDir}"`, { stdio: 'inherit' });

  // Clean old assets
  const oldAssetsDir = path.join(tempDir, 'assets');
  if (fs.existsSync(oldAssetsDir)) {
    fs.rmSync(oldAssetsDir, { recursive: true, force: true });
  }

  // Copy fresh dist files
  const distFiles = fs.readdirSync(appDistDir);
  for (const file of distFiles) {
    const srcPath = path.join(appDistDir, file);
    const destPath = path.join(tempDir, file);
    fs.cpSync(srcPath, destPath, { recursive: true });
  }

  // Check git status in gh-pages workdir
  const ghStatus = execSync('git status --porcelain', { cwd: tempDir, encoding: 'utf8' }).trim();
  if (!ghStatus) {
    console.log('No changes to deploy: gh-pages is already up to date with this build.');
  } else {
    console.log('Staging and committing changes to gh-pages:');
    execSync('git add -A', { cwd: tempDir, stdio: 'inherit' });
    const commitMsg = `deploy: sync production build with main ${shortSha} (${timestampUtc})`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: tempDir, stdio: 'inherit' });

    console.log('Pushing to origin gh-pages (fast-forward only)...');
    execSync('git push origin gh-pages', { cwd: tempDir, stdio: 'inherit' });
    console.log('Successfully pushed new build to gh-pages branch.');
  }
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

console.log('Deployment complete and synchronized with source commit: ' + shortSha);
