const fs = require('fs');
const path = 'src/pages/business/estimates/EstimateBuilderV2.tsx';
let code = fs.readFileSync(path, 'utf8');

// Normalize line endings to avoid \r\n vs \n headaches
code = code.replace(/\r\n/g, '\n');

// Find boundaries based on sibling headers
const idxCustomerTop = code.indexOf('                    {/* CUSTOMER CONTEXT */}');
const idxVehicleTop = code.indexOf('                    {/* COMPACT VEHICLE CARD */}');
const idxLogisticsTop = code.indexOf('                                        {/* PROJECT LOGISTICS & TARGETS */}');

if (idxCustomerTop === -1) throw new Error('Missing Customer Top');
if (idxVehicleTop === -1) throw new Error('Missing Vehicle Top');
if (idxLogisticsTop === -1) throw new Error('Missing Logistics Top');

// Extract Customer
const customerBlock = code.substring(idxCustomerTop, idxVehicleTop);

// Find the end of vehicle (which is the beginning of logistics, except there's an internal scope note somewhere?)
// Wait! In the right column:
// 1. Customer
// 2. Vehicle
// 3. Project Logistics
// 4. Internal Scope Note
// 5. Sales & Intake

const idxSalesTop = code.indexOf('                    {/* SALES & INTAKE INFORMATION */}');
if (idxSalesTop === -1) throw new Error('Missing Sales Top');

// Find end of Sales (Mobile save button)
const idxMobileSave = code.indexOf('            {/* Mobile save button at bottom */}');
if (idxMobileSave === -1) throw new Error('Missing Mobile Save Boundary');

// We must extract Vehicle block. It goes from idxVehicleTop to idxLogisticsTop.
const vehicleBlock = code.substring(idxVehicleTop, idxLogisticsTop);

// So from Right Column, we REMOVE Customer and Vehicle.
// But wait, if I slice code by replacing with '', I'll mess up subsequent indices!
// Best approach: DO NOT do it sequentially on the same string if we rely on indices.
// Instead, just replace with nothing sequentially, but re-calculate indices dynamically.

// 1. Extract Customer + Vehicle combined block! 
// Because they are contiguous! From idxCustomerTop to idxLogisticsTop!
const combinedCustVeh = code.substring(idxCustomerTop, idxLogisticsTop);
code = code.substring(0, idxCustomerTop) + code.substring(idxLogisticsTop);

// 2. Now find Left Column top!
const leftColTarget = '                <div className="xl:col-span-8 flex flex-col gap-8 min-w-0">\n\n<div className="bg-gradient-to-br from-indigo-600 to-indigo-800';
const leftColIdx = code.indexOf(leftColTarget);
if (leftColIdx === -1) throw new Error('Missing leftColTarget');

const lenToSplit = '                <div className="xl:col-span-8 flex flex-col gap-8 min-w-0">\n'.length;
const insertPointLeft = leftColIdx + lenToSplit;

// Insert combined into Left Column!
code = code.substring(0, insertPointLeft) + '\n' + combinedCustVeh + '\n' + code.substring(insertPointLeft);


// 3. Now extract Sales!
// We must recalculate Sales index since we changed the string.
const s2Top = code.indexOf('                    {/* SALES & INTAKE INFORMATION */}');
const m2Save = code.indexOf('            {/* Mobile save button at bottom */}');

// From Sales Top until the wrapper closes before Mobile Save... wait, the Sales block itself ends with </div>, then there\'s </div></div> before Mobile Save.
// We can just find the LAST </div></div> before Mobile Save.
// Let's just find the Sales block using the regex or explicit marker.
// Above Mobile Save:
//                 </div>
//             </div>
// 
//             {/* Mobile save button at bottom */}
// That's 43 chars backward. We can just use lastIndexOf('                </div>', m2Save) to find the end of Sales block.
let endSalesDiv = code.lastIndexOf('                </div>', m2Save);

// Actually, `</div>\n                </div>\n            </div>\n\n            {/* Mobile`
// Since I know Sales Tools block:
// <div className="bg-zinc...
// ...
// </div>
// Let's just grab from `s2Top` down to `</div>` that closes it.
// Sales block starts with `{/* SALES ... */}\n<div className="bg-zinc-900 border... ">`
// Instead of risky parsing, let's just use string split!
const salesCodeSplit = code.substring(s2Top, endSalesDiv); 

code = code.substring(0, s2Top) + code.substring(endSalesDiv);

// 4. Insert Sales to the TOP of Right Column!
const rightColTopStr = '                <div className="xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 max-h-[calc(100vh-6rem)] xl:overflow-y-auto no-scrollbar pb-32 xl:pb-32">\n';
const rightColTop = code.indexOf(rightColTopStr);
if (rightColTop === -1) throw new Error('Missing rightColTopStr');
const rightColInsert = rightColTop + rightColTopStr.length;

code = code.substring(0, rightColInsert) + '\n' + salesCodeSplit + '\n' + code.substring(rightColInsert);

fs.writeFileSync(path, code);
console.log("Restructure successful v2.");
