const fs = require('fs');
const filePath = 'c:/_Projects/SAEGroup/src/pages/business/estimates/EstimateBuilderV2.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const containerStr = '<div className="max-w-5xl mx-auto w-full p-4 md:p-6 flex flex-col gap-8 mt-4 relative z-10">';
const containerIdx = content.indexOf(containerStr);

if (containerIdx === -1) {
    console.error("Container not found");
    process.exit(1);
}

const financialsStr = '<div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 shadow-xl border border-indigo-500 text-white relative overflow-hidden">';
const financialsIdx = content.indexOf(financialsStr);

if (financialsIdx === -1) {
    console.error("Financials block not found");
    process.exit(1);
}

let braces = 0;
let inBlock = false;
let financialsEndIdx = -1;

for (let i = financialsIdx; i < content.length; i++) {
    if (content.substring(i, i + 4) === '<div') {
        braces++;
        inBlock = true;
    } else if (content.substring(i, i + 5) === '</div') {
        braces--;
    }
    if (inBlock && braces === 0) {
        financialsEndIdx = content.indexOf('>', i) + 1;
        break;
    }
}

if (financialsEndIdx === -1) {
    console.error("End of financials block not found");
    process.exit(1);
}

// Slice the financials block out
const finBlock = content.substring(financialsIdx, financialsEndIdx);
const withoutFin = content.substring(0, financialsIdx) + content.substring(financialsEndIdx);

// Insert it right after container 
const insertPoint = containerIdx + containerStr.length;
const finalContent = withoutFin.substring(0, insertPoint) + '\n\n' + finBlock + '\n\n' + withoutFin.substring(insertPoint);

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully moved financials to the top!");
