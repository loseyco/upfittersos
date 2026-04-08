const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/business/estimates/EstimateBuilderV2.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

const quoteStart = 1391;
const quoteEnd = 1522;
const quoteBlock = lines.slice(quoteStart, quoteEnd).join('\n') + '\n';

const logStart = 2346;
const logEnd = 2436;
const logBlock = lines.slice(logStart, logEnd).join('\n') + '\n';

const newLines = [];
let rightColumnFound = false;

for (let i = 0; i < lines.length; i++) {
    if (i >= quoteStart && i < quoteEnd) continue;
    if (i >= logStart && i < logEnd) continue;
    
    newLines.push(lines[i]);
    
    if (lines[i].includes('<div className="xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 max-h-[calc(100vh-6rem)] xl:overflow-y-auto no-scrollbar pb-32 xl:pb-32">')) {
        newLines.push(quoteBlock.trimEnd());
        newLines.push(logBlock.trimEnd());
    }
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Successfully spliced Quote Totals and Project Logistics.');
