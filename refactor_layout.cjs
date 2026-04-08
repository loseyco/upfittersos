const fs = require('fs');

const path = 'src/pages/business/estimates/EstimateBuilderV2.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. EXTRACT CUSTOMER
const custStartStr = '{/* END MAIN WORK COLUMN (Wait, Customer + Vehicle were here. Moved to right column.) */}\\n                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 pb-8 shadow-xl relative overflow-hidden">';
const custEndStr = 'No customer profile selected. Click edit to link a customer.\\n                            </div>\\n                        )}\\n                    </div>';

const custStart = code.indexOf(custStartStr);
const custEnd = code.indexOf(custEndStr) + custEndStr.length;
const customerBlock = code.substring(custStart, custEnd);

code = code.substring(0, custStart) + code.substring(custEnd);

// 2. EXTRACT VEHICLE
const vehStartStr = '{/* COMPACT VEHICLE CARD */}\\n                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 pb-8 shadow-xl relative overflow-hidden">';
const vehEndStr = 'No vehicle profile selected. Click edit to link a vehicle.\\n                            </div>\\n                        )}\\n                    </div>';

const vehStart = code.indexOf(vehStartStr);
const vehEnd = code.indexOf(vehEndStr) + vehEndStr.length;
const vehicleBlock = code.substring(vehStart, vehEnd);

code = code.substring(0, vehStart) + code.substring(vehEnd);

// 3. INSERT BOTH INTO LEFT COLUMN
const leftColTarget = '<div className="xl:col-span-8 flex flex-col gap-8 min-w-0">\\n';
const leftColIdx = code.indexOf(leftColTarget) + leftColTarget.length;

const newLeftBlock = `
                    {/* CUSTOMER CONTEXT */}
                    ${customerBlock.trim()}

                    {/* VEHICLE CONTEXT */}
                    ${vehicleBlock.trim()}
`;
code = code.substring(0, leftColIdx) + newLeftBlock + code.substring(leftColIdx);

// 4. MULTIPLY RE-ARRANGE RIGHT COLUMN
// We need Sales & Intake at TOP of Right column.
// Right column starts here:
const rightColStartStr = '<div className="xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 max-h-[calc(100vh-6rem)] xl:overflow-y-auto no-scrollbar pb-32 xl:pb-32">';
const rightColStartIdx = code.indexOf(rightColStartStr) + rightColStartStr.length;

const salesStartStr = '{/* SALES & INTAKE INFORMATION */}\\n                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">';
const salesEndStr = '</div>\\n                                            </div>\\n                                        ))}';

// Find start of sales block
const salesStart = code.indexOf(salesStartStr);

// The sales block ends with its own </div> but because we know the structure, let's grab till the end of the mobile save button?
// No, the sales block ends inside the right column.
// Let's just find the closing tags:
const searchTargetForSalesClose = '                             )}\\n                            </div>\\n                        </div>\\n                    </div>';
const salesEnd = code.indexOf(searchTargetForSalesClose, salesStart) + searchTargetForSalesClose.length;

const salesBlock = code.substring(salesStart, salesEnd);

// Remove sales block from its current place
code = code.substring(0, salesStart) + code.substring(salesEnd);

// Insert sales block at the TOP of the right column
const rightColTopMarkerIdx = code.indexOf(rightColStartStr) + rightColStartStr.length;

const newSalesBlock = `\\n                    ${salesBlock.trim()}\\n\\n`;
code = code.substring(0, rightColTopMarkerIdx) + newSalesBlock + code.substring(rightColTopMarkerIdx);

fs.writeFileSync(path, code);
console.log("Refactoring complete");
