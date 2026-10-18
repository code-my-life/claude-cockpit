#!/usr/bin/env node
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_DIR = join(process.cwd(), 'docs/design/site');
const SITE_DIR = join(process.cwd(), 'site');
const OUTPUT_DIR = join(process.cwd(), 'site/dist');

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

// Copy assets directory
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

// Escape HTML special characters (null/undefined become an empty string)
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text ?? '').replace(/[&<>"']/g, m => map[m]);
}

const LABELS = {
  en: { shipped: 'Shipped', next: 'Next' },
  fr: { shipped: 'Livrée', next: 'Prochain' }
};

// Render only the <li class="cc-stage"> items (no <ol> wrapper)
export function renderRoadmapItems(milestones, issuesByMilestone, lang) {
  const labels = LABELS[lang] ?? LABELS.en;
  const items = [];

  for (const milestone of milestones) {
    const isShipped = milestone.state === 'closed';
    const issues = issuesByMilestone.get(milestone.number) || [];

    let html = isShipped ? '<li class="cc-stage" data-done="">' : '<li class="cc-stage">';
    html += isShipped
      ? `\n<span class="ep-tag ep-tag--success">${escapeHtml(labels.shipped)}</span>`
      : `\n<span class="ep-tag ep-tag--info">${escapeHtml(labels.next)}</span>`;
    html += `\n<h3 class="h4">${escapeHtml(milestone.title)}</h3>`;
    html += `\n<p class="ep-note">${escapeHtml(milestone.description)}</p>`;

    // Only show the issue list for open milestones (future work)
    if (!isShipped && issues.length > 0) {
      html += '\n<ul>';
      for (const issue of issues) {
        html += `\n<li><a href="https://github.com/code-my-life/claude-cockpit/issues/${issue.number}">${escapeHtml(issue.title)}</a></li>`;
      }
      html += '\n</ul>';
    }

    html += '\n</li>';
    items.push(html);
  }

  return items.join('\n');
}

// Replace only the inner content of the first <ol class="cc-track">, keeping its opening tag (and aria-label)
export function injectRoadmap(html, itemsHtml) {
  const olRegex = /(<ol class="cc-track"[^>]*>)[\s\S]*?(<\/ol>)/;
  if (!olRegex.test(html)) return html;
  return html.replace(olRegex, (_m, open, close) => `${open}\n${itemsHtml}\n${close}`);
}

// Fetch milestones and their issues from GitHub
export async function fetchMilestones(token) {
  if (!token) {
    console.log('No GITHUB_TOKEN, using fallback roadmap from mockup');
    return null;
  }

  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  try {
    const milestonesResponse = await fetch('https://api.github.com/repos/code-my-life/claude-cockpit/milestones?state=all&per_page=100', { headers });
    if (!milestonesResponse.ok) {
      throw new Error(`GitHub API milestones returned ${milestonesResponse.status}`);
    }
    const milestones = await milestonesResponse.json();

    const issuesResponse = await fetch('https://api.github.com/repos/code-my-life/claude-cockpit/issues?state=all&per_page=100', { headers });
    if (!issuesResponse.ok) {
      throw new Error(`GitHub API issues returned ${issuesResponse.status}`);
    }
    const allIssues = await issuesResponse.json();

    // Group issues by milestone number
    const issuesByMilestone = new Map();
    for (const issue of allIssues) {
      if (issue.milestone !== null) {
        const number = issue.milestone.number;
        if (!issuesByMilestone.has(number)) {
          issuesByMilestone.set(number, []);
        }
        issuesByMilestone.get(number).push({ number: issue.number, title: issue.title });
      }
    }

    if (milestones.length === 0) {
      console.log('No milestones found, using fallback roadmap from mockup');
      return null;
    }

    return {
      milestones: milestones.map(m => ({ number: m.number, title: m.title, description: m.description, state: m.state })),
      issuesByMilestone
    };
  } catch (error) {
    console.error('Error fetching roadmap:', error.message);
    console.log('Using fallback roadmap from mockup');
    return null;
  }
}

// Main build process
async function main() {
  console.log('Starting build...');

  // Clean output directory to prevent stale files
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'ds'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'vendor'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'fr'), { recursive: true });

  copySiteDir(SITE_DIR, OUTPUT_DIR);
  copyAssets(join(SOURCE_DIR, 'ds'), join(OUTPUT_DIR, 'ds'));
  copyAssets(join(SOURCE_DIR, 'vendor'), join(OUTPUT_DIR, 'vendor'));

  const data = await fetchMilestones(process.env.GITHUB_TOKEN);
  let roadmapUpdated = false;

  if (data) {
    const targets = [
      { file: join(OUTPUT_DIR, 'index.html'), lang: 'en' },
      { file: join(OUTPUT_DIR, 'fr', 'index.html'), lang: 'fr' }
    ];
    for (const { file, lang } of targets) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf8');
      const updated = injectRoadmap(content, renderRoadmapItems(data.milestones, data.issuesByMilestone, lang));
      if (updated !== content) {
        writeFileSync(file, updated, 'utf8');
        roadmapUpdated = true;
        console.log(`Updated roadmap in ${file}`);
      }
    }
  }

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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
