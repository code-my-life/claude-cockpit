#!/usr/bin/env node
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const SOURCE_DIR = join(process.cwd(), 'docs/design/site');
const SITE_DIR = join(process.cwd(), 'site');
const OUTPUT_DIR = join(process.cwd(), 'site/dist');

// Clean output directory
if (existsSync(OUTPUT_DIR)) {
  execSync(`rm -rf "${OUTPUT_DIR}"`, { shell: true });
}
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'ds'), { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'vendor'), { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'fr'), { recursive: true });

// Copy site/ to dist/ but exclude the dist/ directory itself
function copySiteDir(src, dest) {
  const items = readdirSync(src);
  for (const item of items) {
    // Skip the dist directory to prevent infinite recursion
    if (item === 'dist') {
      continue;
    }
    
    const srcPath = join(src, item);
    const destPath = join(dest, item);
    const stat = statSync(srcPath);
    
    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copySiteDir(srcPath, destPath);
    } else {
      // Skip reference/*.webp files
      if (item.endsWith('.webp')) {
        continue;
      }
      // Ensure destination directory exists
      mkdirSync(dest.substring(0, dest.lastIndexOf('/')), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying site directory to dist...');
copySiteDir(SITE_DIR, OUTPUT_DIR);

// Copy ds/ and vendor/ from docs/design/site/ to dist/
function copyAssets(srcDir, destDir) {
  console.log(`Copying ${srcDir} to ${destDir}...`);
  mkdirSync(destDir, { recursive: true });
  const items = readdirSync(srcDir);
  for (const item of items) {
    const srcPath = join(srcDir, item);
    const destPath = join(destDir, item);
    const stat = statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyAssets(srcPath, destPath);
    } else {
      // Ensure destination directory exists
      mkdirSync(destPath.substring(0, destPath.lastIndexOf('/')), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

copyAssets(join(SOURCE_DIR, 'ds'), join(OUTPUT_DIR, 'ds'));
copyAssets(join(SOURCE_DIR, 'vendor'), join(OUTPUT_DIR, 'vendor'));

// Generate roadmap from GitHub milestones if token is available
async function generateRoadmap() {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.log('No GITHUB_TOKEN, using fallback roadmap from mockup');
    return null;
  }
  
  try {
    const response = await fetch('https://api.github.com/repos/code-my-life/claude-cockpit/milestones?state=all&per_page=100', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }
    
    const milestones = await response.json();
    const roadmapData = milestones.map(m => ({
      title: m.title,
      description: m.description || '',
      items: m.labels ? m.labels.map(l => l.name) : [],
      closedIssues: m.closed_issues,
      state: m.state
    }));
    
    return roadmapData;
  } catch (error) {
    console.error('Error fetching milestones:', error.message);
    console.log('Using fallback roadmap from mockup');
    return null;
  }
}

// If roadmap is generated, update the HTML files
const roadmapData = await generateRoadmap();

if (roadmapData) {
  console.log('Roadmap generated from GitHub milestones');
  // Here we would update the HTML files with the generated roadmap
  // For now, we just log it
  console.log('Roadmap data:', JSON.stringify(roadmapData, null, 2));
} else {
  console.log('Using fallback roadmap from mockup');
}

console.log('\nBuild complete! Output in site/dist/');
console.log('Files copied:');
console.log('  - site/ (EN pages)');
console.log('  - site/fr/ (FR pages)');
console.log('  - ds/ (Liquid Paper assets)');
console.log('  - vendor/ (Systems Generator assets)');
console.log('\nNote: reference/*.webp files are excluded from the build');