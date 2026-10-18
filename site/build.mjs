#!/usr/bin/env node
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_DIR = join(process.cwd(), 'docs/design/site');
const SITE_DIR = join(process.cwd(), 'site');
const OUTPUT_DIR = join(process.cwd(), 'site/dist');

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'ds'), { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'vendor'), { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'fr'), { recursive: true });

// Copy site/ to dist/ but exclude the dist/ and test/ directories
function copySiteDir(src, dest) {
  if (!existsSync(src)) return;
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    // Skip the dist and test directories
    if (entry.name === 'dist' || entry.name === 'test') {
      continue;
    }
    
    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copySiteDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copySiteDir(SITE_DIR, OUTPUT_DIR);
copyAssets(join(SOURCE_DIR, 'ds'), join(OUTPUT_DIR, 'ds'));
copyAssets(join(SOURCE_DIR, 'vendor'), join(OUTPUT_DIR, 'vendor'));

// Helper to copy assets directory
function copyAssets(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyAssets(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Generate roadmap HTML from GitHub milestones and issues
async function generateRoadmapHtml() {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.log('No GITHUB_TOKEN, using fallback roadmap from mockup');
    return null;
  }
  
  try {
    // Fetch all milestones
    const milestonesResponse = await fetch('https://api.github.com/repos/code-my-life/claude-cockpit/milestones?state=all&per_page=100', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!milestonesResponse.ok) {
      throw new Error(`GitHub API milestones returned ${milestonesResponse.status}`);
    }
    
    const milestones = await milestonesResponse.json();
    
    // Fetch all issues (we'll filter by milestone)
    const issuesResponse = await fetch('https://api.github.com/repos/code-my-life/claude-cockpit/issues?state=all&per_page=100', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!issuesResponse.ok) {
      throw new Error(`GitHub API issues returned ${issuesResponse.status}`);
    }
    
    const allIssues = await issuesResponse.json();
    
    // Group issues by milestone number
    const issuesByMilestone = new Map();
    for (const issue of allIssues) {
      if (issue.milestone !== null) {
        const milestoneNumber = issue.milestone.number;
        if (!issuesByMilestone.has(milestoneNumber)) {
          issuesByMilestone.set(milestoneNumber, []);
        }
        issuesByMilestone.get(milestoneNumber).push(issue);
      }
    }
    
    // Generate HTML for each milestone
    const stageItems = [];
    
    for (const milestone of milestones) {
      const milestoneIssues = issuesByMilestone.get(milestone.number) || [];
      
      // Determine if this is a shipped or future milestone based on state
      const isShipped = milestone.state === 'closed';
      
      let stageHtml = `
        <li class="cc-stage" data-done="${isShipped ? '' : 'future'}">
          <span class="ep-tag ep-tag--${isShipped ? 'success' : milestone.state === 'open' ? 'info' : 'later'}">${isShipped ? 'Shipped' : milestone.state === 'open' ? 'Next' : 'Vision'}</span>
          <h3 class="h4">${escapeHtml(milestone.title)}</h3>
          <p class="ep-note">${escapeHtml(milestone.description || '')}</p>`;
      
      // Only show issue list for open milestones (future work)
      if (milestone.state === 'open' && milestoneIssues.length > 0) {
        stageHtml += `
          <ul>`;
        for (const issue of milestoneIssues) {
          stageHtml += `
            <li><a href="https://github.com/code-my-life/claude-cockpit/issues/${issue.number}">${escapeHtml(issue.title)}</a></li>`;
        }
        stageHtml += `
          </ul>`;
      }
      
      stageHtml += `
        </li>`;
      
      stageItems.push(stageHtml.trim());
    }
    
    if (stageItems.length === 0) {
      console.log('No milestones found, using fallback roadmap from mockup');
      return null;
    }
    
    return `
      <ol class="cc-track" aria-label="Roadmap">
        ${stageItems.join('\n\n')}
      </ol>`;
  } catch (error) {
    console.error('Error generating roadmap:', error.message);
    console.log('Using fallback roadmap from mockup');
    return null;
  }
}

// Escape HTML special characters
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Update HTML files with generated roadmap
async function updateHtmlWithRoadmap() {
  const roadmapHtml = await generateRoadmapHtml();
  if (!roadmapHtml) {
    return false;
  }
  
  const htmlFiles = [
    join(OUTPUT_DIR, 'index.html'),
    join(OUTPUT_DIR, 'fr', 'index.html')
  ];
  
  let updated = false;
  for (const htmlFile of htmlFiles) {
    if (existsSync(htmlFile)) {
      let content = readFileSync(htmlFile, 'utf8');
      const oldRoadmapRegex = /<section id="roadmap" class="cc-section" aria-labelledby="h-roadmap">[\s\S]*?<\/section>/;
      const match = content.match(oldRoadmapRegex);
      
      if (match) {
        const newSection = `<section id="roadmap" class="cc-section" aria-labelledby="h-roadmap">
<h2 id="h-roadmap" class="h2">Where it comes from, where it goes</h2>
<p class="ep-lede">Three stages shipped, three ahead. The page is rebuilt from the repository, so the plan never drifts from the work.</p>
${roadmapHtml}
</section>`;
        content = content.replace(oldRoadmapRegex, newSection);
        writeFileSync(htmlFile, content, 'utf8');
        updated = true;
        console.log(`Updated roadmap in ${htmlFile}`);
      }
    }
  }
  
  return updated;
}

// Main build process
async function main() {
  console.log('Starting build...');
  
  // Try to generate and inject roadmap
  const roadmapUpdated = await updateHtmlWithRoadmap();
  
  if (roadmapUpdated) {
    console.log('Roadmap successfully generated and injected from GitHub milestones');
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
}

main().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
