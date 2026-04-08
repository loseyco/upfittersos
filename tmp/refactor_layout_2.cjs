const fs = require('fs');

const path = 'c:/_Projects/SAEGroup/src/pages/business/estimates/EstimateBuilderV2.tsx';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

const logisticsAndSalesLines = lines.slice(2104, 2278);
lines.splice(2104, 2278 - 2104);

const customerAndVehicleLines = lines.slice(1108, 1389);
lines.splice(1108, 1389 - 1108);

let newContent = lines.join('\n');

newContent = newContent.replace('<div id="customer-card-placement-placeholder"></div>', customerAndVehicleLines.join('\n'));
newContent = newContent.replace('<div id="vehicle-card-placement-placeholder"></div>', '');
newContent = newContent.replace('<div id="logistics-card-placement-placeholder"></div>', logisticsAndSalesLines.join('\n'));
newContent = newContent.replace('<div id="sales-tools-placement-placeholder"></div>', '');

fs.writeFileSync(path, newContent);
console.log('Done refactoring layout!');
