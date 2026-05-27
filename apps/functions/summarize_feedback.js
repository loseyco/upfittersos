const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'all_feedback.json');
if (!fs.existsSync(dataPath)) {
  console.error("Data file does not exist.");
  process.exit(1);
}

const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log(`Total feedback items loaded: ${items.length}`);

// Let's analyze types
const types = {};
const statuses = {};
const collections = {};

items.forEach(item => {
  types[item.type || 'unknown'] = (types[item.type || 'unknown'] || 0) + 1;
  statuses[item.status || 'unknown'] = (statuses[item.status || 'unknown'] || 0) + 1;
  collections[item.collection] = (collections[item.collection] || 0) + 1;
});

console.log("Types:", types);
console.log("Statuses:", statuses);
console.log("Collections:", collections);

// Categorize open items (status !== 'resolved' && status !== 'closed')
const openItems = items.filter(item => {
  const s = (item.status || '').toLowerCase();
  return s !== 'resolved' && s !== 'closed' && s !== 'completed' && s !== 'done';
});

console.log(`Open items count: ${openItems.length}`);

const bugs = openItems.filter(item => (item.type || '').toLowerCase() === 'bug');
const features = openItems.filter(item => (item.type || '').toLowerCase() === 'feature');
const ideas = openItems.filter(item => (item.type || '').toLowerCase() === 'idea');
const others = openItems.filter(item => {
  const t = (item.type || '').toLowerCase();
  return t !== 'bug' && t !== 'feature' && t !== 'idea';
});

console.log(`Bugs: ${bugs.length}, Features: ${features.length}, Ideas: ${ideas.length}, Others: ${others.length}`);

// Let's generate a markdown report file!
let md = `# UpfittersOS Feedback, Features & Bugs Audit

Total Feedback/Bug Items Logged: ${items.length}
Active/Open Items: ${openItems.length} (Bugs: ${bugs.length}, Features: ${features.length}, Ideas: ${ideas.length}, Others: ${others.length})

---

## 🐛 Open Bugs (${bugs.length})

`;

bugs.forEach((b, idx) => {
  md += `### ${idx + 1}. ${b.title || 'Untitled Bug'}
- **ID**: \`${b.id}\` (from \`${b.collection}\`)
- **Reporter**: ${b.authorName || 'Anonymous'} (${b.authorEmail || 'N/A'})
- **Date**: ${b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A'}
- **Priority**: \`${b.priority || 'normal'}\` | **Status**: \`${b.status || 'open'}\`
- **Path**: \`${b.path || 'N/A'}\`
- **Description**: ${b.description || '*No description provided*'}
${b.screenshotUrl ? `- **Screenshot**: [View Screenshot](${b.screenshotUrl})\n` : ''}
`;
});

md += `\n---

## ✨ Open Features (${features.length})

`;

features.forEach((f, idx) => {
  md += `### ${idx + 1}. ${f.title || 'Untitled Feature'}
- **ID**: \`${f.id}\` (from \`${f.collection}\`)
- **Reporter**: ${f.authorName || 'Anonymous'} (${f.authorEmail || 'N/A'})
- **Date**: ${f.createdAt ? new Date(f.createdAt).toLocaleDateString() : 'N/A'}
- **Priority**: \`${f.priority || 'normal'}\` | **Status**: \`${f.status || 'open'}\`
- **Path**: \`${f.path || 'N/A'}\`
- **Description**: ${f.description || '*No description provided*'}
${f.screenshotUrl ? `- **Screenshot**: [View Screenshot](${f.screenshotUrl})\n` : ''}
`;
});

md += `\n---

## 💡 Open Ideas / Suggestions (${ideas.length})

`;

ideas.forEach((idea, idx) => {
  md += `### ${idx + 1}. ${idea.title || 'Untitled Idea'}
- **ID**: \`${idea.id}\` (from \`${idea.collection}\`)
- **Reporter**: ${idea.authorName || 'Anonymous'} (${idea.authorEmail || 'N/A'})
- **Date**: ${idea.createdAt ? new Date(idea.createdAt).toLocaleDateString() : 'N/A'}
- **Priority**: \`${idea.priority || 'normal'}\` | **Status**: \`${idea.status || 'open'}\`
- **Path**: \`${idea.path || 'N/A'}\`
- **Description**: ${idea.description || '*No description provided*'}
${idea.screenshotUrl ? `- **Screenshot**: [View Screenshot](${idea.screenshotUrl})\n` : ''}
`;
});

md += `\n---

## ❓ Other Open Items (${others.length})

`;

others.forEach((o, idx) => {
  md += `### ${idx + 1}. ${o.title || 'Untitled Item'} (Type: \`${o.type || 'unknown'}\`)
- **ID**: \`${o.id}\` (from \`${o.collection}\`)
- **Reporter**: ${o.authorName || 'Anonymous'} (${o.authorEmail || 'N/A'})
- **Date**: ${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}
- **Priority**: \`${o.priority || 'normal'}\` | **Status**: \`${o.status || 'open'}\`
- **Path**: \`${o.path || 'N/A'}\`
- **Description**: ${o.description || '*No description provided*'}
${o.screenshotUrl ? `- **Screenshot**: [View Screenshot](${o.screenshotUrl})\n` : ''}
`;
});

fs.writeFileSync(path.join(__dirname, 'feedback_report.md'), md);
console.log("Saved feedback_report.md successfully!");
