const fs = require('fs');
const path = require('path');

const filePath = path.join('c:/_Projects/SAEGroup/src/pages/business/estimates/EstimateBuilderV2.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The main grid starts at:
// <div className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-8 mt-4 relative z-10">

const gridStartStr = '<div className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-8 mt-4 relative z-10">';
const gridStartIdx = content.indexOf(gridStartStr);

if (gridStartIdx === -1) {
    console.error("Grid start not found");
    process.exit(1);
}

// Blocks to extract:
// xl:col-span-2 block:
const colSpan2StartStr = '<div className="xl:col-span-2 space-y-8">';
// xl:col-span-1 block:
const colSpan1StartStr = '<div className="xl:col-span-1 space-y-6 order-first xl:order-last">';

// Inside col-span-1, we have:
// 1. Logistics: {/* PROJECT LOGISTICS & TARGETS */} -> next block
// 2. Financials: <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 
// 3. Scope Notes: <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col max-h-[800px]">

// Quick helper to extract div blocks by curly braces balance
function extractBlock(startIdx) {
    if (startIdx === -1) return null;
    let braces = 0;
    let inBlock = false;
    let endIdx = -1;
    for (let i = startIdx; i < content.length; i++) {
        if (content.substring(i, i + 4) === '<div') {
            braces++;
            inBlock = true;
        } else if (content.substring(i, i + 5) === '</div') {
            braces--;
        }
        if (inBlock && braces === 0) {
            endIdx = content.indexOf('>', i) + 1;
            return {
                text: content.substring(startIdx, endIdx),
                start: startIdx,
                end: endIdx
            };
        }
    }
    return null;
}

const customerCardIdx = content.indexOf('{/* COMPACT CUSTOMER CARD */}');
const vehicleCardIdx = content.indexOf('{/* COMPACT VEHICLE CARD */}');
const mediaGalleryIdx = content.indexOf('{/* UPLOADED PHOTOS */}');
const taskListIdx = content.indexOf('<div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">'); // Tasks
const logisticsIdx = content.indexOf('{/* PROJECT LOGISTICS & TARGETS */}');
let financialsIdx = content.indexOf('<div className="bg-gradient-to-br from-indigo-600 to-indigo-800');
let scopeNotesIdx = content.indexOf('<div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col max-h-[800px]">');

const blocks = {
    customer: extractBlock(content.substring(0, customerCardIdx).lastIndexOf('<div', customerCardIdx)),
    vehicle: extractBlock(content.substring(0, vehicleCardIdx).lastIndexOf('<div', vehicleCardIdx)),
    media: extractBlock(mediaGalleryIdx > -1 ? content.substring(0, mediaGalleryIdx).lastIndexOf('<div', mediaGalleryIdx) : -1),
    tasks: extractBlock(taskListIdx),
    logistics: extractBlock(content.substring(0, logisticsIdx).lastIndexOf('<div', logisticsIdx)),
    financials: extractBlock(financialsIdx),
    scope: extractBlock(scopeNotesIdx)
};

// Also we need to close the main tag.
// <div className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-8 mt-4 relative z-10">
// ...
// </div>

const endMainGrid = content.indexOf('             {/* Mobile save button at bottom */}');

const newGridShell = `            <div className="max-w-4xl mx-auto w-full p-4 md:p-6 flex flex-col gap-8 mt-4 relative z-10">
                \${blocks.financials.text}
                \${blocks.customer.text}
                \${blocks.vehicle.text}
                \${blocks.logistics.text}
                \${blocks.media.text}
                \${blocks.tasks.text}
                \${blocks.scope.text}
            </div>
`;

let finalContent = content.substring(0, gridStartIdx) + newGridShell + content.substring(endMainGrid);

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully rebuilt layout!");
