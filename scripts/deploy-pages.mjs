#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDistDir = path.resolve(rootDir, "artifacts/monarch-lens/dist/public");
const appPackagePath = path.resolve(
  rootDir,
  "artifacts/monarch-lens/package.json",
);
const expectedGithubUser = "roxy4798";

function run(cmd, options = {}) {
  return execSync(cmd, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.silent ? "pipe" : "inherit",
    ...options,
  });
}

function runOutput(cmd, options = {}) {
  return execSync(cmd, {
    cwd: rootDir,
    encoding: "utf8",
    ...options,
  }).trim();
}

const isDryRun = process.argv.includes("--dry-run");

console.log("=== Monarch Lens GitHub Pages Deployment ===");
if (isDryRun) {
  console.log("[DRY RUN MODE ENABLED - No changes will be pushed]");
}

// 1. Verify Git repository and origin remote
const originUrl = runOutput("git remote get-url origin");
console.log(`Checking remote origin: ${originUrl}`);
if (
  !/github\.com[/:](roxy4798|ROXY4798)\/(MONARCH-LENS|monarch-lens)(\.git)?$/i.test(
    originUrl.trim(),
  )
) {
  console.error(
    `Error: origin remote does not point to roxy4798/MONARCH-LENS: ${originUrl}`,
  );
  process.exit(1);
}

// 2. Verify authenticated GitHub account (commit metadata is not authentication)
let authenticatedUser;
try {
  authenticatedUser = runOutput("gh api user --jq .login");
} catch {
  console.error(
    "Error: cannot verify the authenticated GitHub account. Sign in with `gh auth login` and retry.",
  );
  process.exit(1);
}
if (authenticatedUser !== expectedGithubUser) {
  console.error(
    `Error: authenticated GitHub account must be ${expectedGithubUser} (current: ${authenticatedUser}).`,
  );
  process.exit(1);
}
console.log(`Authenticated GitHub account: ${authenticatedUser}`);

// 3. Verify current branch and clean source tree for every execution mode
const currentBranch = runOutput("git rev-parse --abbrev-ref HEAD");
console.log(`Current branch: ${currentBranch}`);
if (currentBranch !== "main") {
  console.error(
    `Error: deployment must be performed from 'main' branch (current: ${currentBranch})`,
  );
  process.exit(1);
}

const gitStatus = runOutput("git status --porcelain");
if (gitStatus) {
  console.error(
    "Error: working directory has uncommitted changes. Commit or stash before building or deploying.",
  );
  console.error(gitStatus);
  process.exit(1);
}

// 4. Require HEAD to match the current remote main tip exactly
const sourceCommitSha = runOutput("git rev-parse HEAD");
const remoteMainLine = runOutput("git ls-remote origin refs/heads/main");
const remoteMainSha = remoteMainLine.split(/\s+/)[0];
if (!remoteMainSha || remoteMainSha !== sourceCommitSha) {
  console.error(
    `Error: local HEAD (${sourceCommitSha}) must exactly match origin/main (${remoteMainSha || "unavailable"}).`,
  );
  process.exit(1);
}
const shortSha = runOutput("git rev-parse --short HEAD");
const timestampUtc = new Date().toISOString();
console.log(`Source commit: ${sourceCommitSha} (${shortSha})`);
console.log(`Build timestamp: ${timestampUtc}`);

// 5. Build monarch-lens frontend
console.log("Running production build for @workspace/monarch-lens...");
run("corepack pnpm --filter @workspace/monarch-lens run build");

if (
  !fs.existsSync(appDistDir) ||
  !fs.existsSync(path.join(appDistDir, "index.html"))
) {
  console.error(
    `Error: build output directory missing index.html at ${appDistDir}`,
  );
  process.exit(1);
}

// 6. Generate deployment manifest
const applicationPackage = JSON.parse(fs.readFileSync(appPackagePath, "utf8"));
if (
  typeof applicationPackage.version !== "string" ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(applicationPackage.version)
) {
  console.error(
    "Error: application package.json must contain a valid application version.",
  );
  process.exit(1);
}
const manifest = {
  repository: "roxy4798/MONARCH-LENS",
  sourceBranch: "main",
  sourceCommit: sourceCommitSha,
  sourceCommitShort: shortSha,
  buildTimestampUtc: timestampUtc,
  targetBranch: "gh-pages",
  applicationVersion: applicationPackage.version,
  basePath: "/MONARCH-LENS/",
};

const manifestPath = path.join(appDistDir, "deploy-manifest.json");
fs.writeFileSync(
  manifestPath,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
console.log("Generated deploy-manifest.json:");
console.log(JSON.stringify(manifest, null, 2));

// 7. Ensure .nojekyll and 404.html exist
fs.writeFileSync(path.join(appDistDir, ".nojekyll"), "", "utf8");
fs.copyFileSync(
  path.join(appDistDir, "index.html"),
  path.join(appDistDir, "404.html"),
);
const generatedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (
  generatedManifest.sourceCommit !== sourceCommitSha ||
  generatedManifest.applicationVersion !== applicationPackage.version ||
  generatedManifest.basePath !== "/MONARCH-LENS/"
) {
  console.error(
    "Error: generated deployment manifest failed consistency validation.",
  );
  process.exit(1);
}
console.log("Created .nojekyll and synchronized 404.html fallback.");

if (isDryRun) {
  console.log(
    "Dry run complete. Build artifacts and manifest generated successfully without pushing.",
  );
  process.exit(0);
}

// 8. Deploy to gh-pages branch
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-pages-deploy-"));
try {
  console.log(`Cloning gh-pages branch to temporary workdir: ${tempDir}`);
  execSync(
    `git clone --branch gh-pages --depth 1 "${originUrl}" "${tempDir}"`,
    { stdio: "inherit" },
  );
  const deploymentBaseSha = execSync("git rev-parse HEAD", {
    cwd: tempDir,
    encoding: "utf8",
  }).trim();

  // Inherit local git user config to respect GitHub email privacy settings
  const userName =
    execSync("git config user.name", {
      cwd: rootDir,
      encoding: "utf8",
    }).trim() || "roxy4798";
  const userEmail =
    execSync("git config user.email", {
      cwd: rootDir,
      encoding: "utf8",
    }).trim() || "178382217+roxy4798@users.noreply.github.com";
  execSync(`git config user.name "${userName}"`, { cwd: tempDir });
  execSync(`git config user.email "${userEmail}"`, { cwd: tempDir });

  // Reconcile this temporary deployment checkout to the generated static output.
  // Preserve only Git metadata; the source working tree is never touched here.
  for (const entry of fs.readdirSync(tempDir)) {
    if (entry !== ".git")
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
  }

  // Copy fresh dist files
  const distFiles = fs.readdirSync(appDistDir);
  for (const file of distFiles) {
    const srcPath = path.join(appDistDir, file);
    const destPath = path.join(tempDir, file);
    fs.cpSync(srcPath, destPath, { recursive: true });
  }

  // Check git status in gh-pages workdir
  const ghStatus = execSync("git status --porcelain", {
    cwd: tempDir,
    encoding: "utf8",
  }).trim();
  if (!ghStatus) {
    console.log(
      "No changes to deploy: gh-pages is already up to date with this build.",
    );
  } else {
    console.log("Staging and committing changes to gh-pages:");
    execSync("git add -A", { cwd: tempDir, stdio: "inherit" });
    const commitMsg = `deploy: sync production build with main ${shortSha} (${timestampUtc})`;
    execSync(`git commit -m "${commitMsg}"`, {
      cwd: tempDir,
      stdio: "inherit",
    });

    const remotePagesLine = execSync(
      "git ls-remote origin refs/heads/gh-pages",
      { cwd: tempDir, encoding: "utf8" },
    ).trim();
    const remotePagesSha = remotePagesLine.split(/\s+/)[0];
    if (remotePagesSha !== deploymentBaseSha) {
      throw new Error(
        `origin/gh-pages advanced during deployment (cloned ${deploymentBaseSha}, current ${remotePagesSha || "missing"}); refusing to overwrite remote work.`,
      );
    }
    console.log("Pushing to origin gh-pages (fast-forward only)...");
    execSync("git push origin gh-pages", { cwd: tempDir, stdio: "inherit" });
    console.log("Successfully pushed new build to gh-pages branch.");
  }
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

console.log(
  "Deployment complete and synchronized with source commit: " + shortSha,
);
