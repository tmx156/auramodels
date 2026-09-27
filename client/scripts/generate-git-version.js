/**
 * Git Version Generator
 * 
 * This script runs during build to capture the latest Git commit info.
 * It generates a version.json file that the app uses to detect updates.
 * 
 * To use: Add to package.json scripts:
 * "prebuild": "node scripts/generate-git-version.js",
 * "prestart": "node scripts/generate-git-version.js",
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitInfo() {
  try {
    // Get the latest commit hash (short)
    const commitHash = execSync('git rev-parse --short HEAD', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..') // Go to project root
    }).trim();

    // Get the full commit hash
    const fullCommitHash = execSync('git rev-parse HEAD', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Get commit message
    const commitMessage = execSync('git log -1 --pretty=%s', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Get commit date
    const commitDate = execSync('git log -1 --pretty=%ci', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Get author
    const author = execSync('git log -1 --pretty=%an', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Get branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Get total commit count
    const commitCount = execSync('git rev-list --count HEAD', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Generate build timestamp
    const buildTimestamp = new Date().toISOString();

    return {
      version: `1.0.${commitCount}`,
      commitHash,
      fullCommitHash,
      commitMessage,
      commitDate,
      author,
      branch,
      commitCount: parseInt(commitCount, 10),
      buildTimestamp,
      // Unique identifier for this build
      buildId: `${commitHash}-${Date.now()}`,
    };
  } catch (error) {
    console.warn('⚠️  Could not get Git info:', error.message);
    
    // Return fallback values
    return {
      version: '1.0.0-dev',
      commitHash: 'unknown',
      fullCommitHash: 'unknown',
      commitMessage: 'Development build',
      commitDate: new Date().toISOString(),
      author: 'Unknown',
      branch: 'unknown',
      commitCount: 0,
      buildTimestamp: new Date().toISOString(),
      buildId: `dev-${Date.now()}`,
    };
  }
}

function generateVersionFile() {
  const gitInfo = getGitInfo();
  
  // Add release name based on date
  const now = new Date();
  const monthNames = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
  const releaseName = `${monthNames[now.getMonth()]} Update`;
  
  const versionData = {
    ...gitInfo,
    releaseName,
    // This is the key that triggers the modal
    // Users will see the modal when this changes
    seenKey: `${gitInfo.branch}-${gitInfo.commitHash}`,
  };

  // Write to src folder so it's included in the build
  const outputPath = path.join(__dirname, '..', 'src', 'version.json');
  
  fs.writeFileSync(outputPath, JSON.stringify(versionData, null, 2));
  
  console.log('✅ Git version info generated:');
  console.log(`   Version: ${versionData.version}`);
  console.log(`   Commit: ${versionData.commitHash}`);
  console.log(`   Branch: ${versionData.branch}`);
  console.log(`   Message: ${versionData.commitMessage}`);
  console.log(`   Build ID: ${versionData.buildId}`);
  console.log(`   Output: ${outputPath}`);
  
  return versionData;
}

// Run if called directly
if (require.main === module) {
  generateVersionFile();
}

module.exports = { generateVersionFile, getGitInfo };
