const fs = require('fs');
const path = 'src/pages/business/estimates/EstimateBuilderV2.tsx';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/\r\n/g, '\n');

// 1. Remove the extra closing </div> that causes AST parsing errors at the bottom
code = code.replace(
`            )}
        </div>
        </div>
    );
}`,
`            )}
        </div>
    );
}`);

// We will extract blocks by finding their boundaries using precise indexOf
const strStartCustomer = '                    {/* CUSTOMER CONTEXT */}';
const strEndCustomer = '                        )}\\n                    </div>';

const strStartVehicle = '                    {/* COMPACT VEHICLE CARD */}';
const strEndVehicle = '                            </div>\\n                        )}\\n                    </div>';

const strStartSales = '                    {/* SALES & INTAKE INFORMATION */}';
const strEndSales = '                                        ))}\\n                                    </div>\\n                                )}\\n                            </div>\\n                        </div>\\n                    </div>';

function extractBlock(startMarker, endMarker) {
    const startIdx = code.indexOf(startMarker);
    if (startIdx === -1) throw new Error("Could not find start marker: " + startMarker);
    const endMatchIdx = code.indexOf(endMarker, startIdx);
    if (endMatchIdx === -1) throw new Error("Could not find end marker");
    const endIdx = endMatchIdx + endMarker.length;
    
    const block = code.substring(startIdx, endIdx);
    code = code.substring(0, startIdx) + code.substring(endIdx);
    return block;
}

const customerBlock = extractBlock(strStartCustomer, strEndCustomer);
const vehicleBlock = extractBlock(strStartVehicle, strEndVehicle);
const salesBlock = extractBlock(strStartSales, strEndSales);

// Now we insert Customer and Vehicle into the LEFT column, above Project Financials
const strLeftColInner = '                <div className="xl:col-span-8 flex flex-col gap-8 min-w-0">\\n\\n<div className="bg-gradient-to-br from-indigo-600 to-indigo-800';
const leftColIdx = code.indexOf(strLeftColInner);
if (leftColIdx === -1) throw new Error("Could not find left column insertion point");
const leftColInsertPos = leftColIdx + '                <div className="xl:col-span-8 flex flex-col gap-8 min-w-0">\\n'.length;

const addedLeft = `
${customerBlock}
${vehicleBlock}
`;
code = code.substring(0, leftColInsertPos) + addedLeft + code.substring(leftColInsertPos);

// Now we insert Sales Block ABOVE Project Logistics in the RIGHT column
// Currently the exact start of Right Col:
const strRightColTop = '                <div className="xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 max-h-[calc(100vh-6rem)] xl:overflow-y-auto no-scrollbar pb-32 xl:pb-32">\\n';
const rightColIdx = code.indexOf(strRightColTop);
if (rightColIdx === -1) throw new Error("Could not find right col top");
const rightColInsertPos = rightColIdx + strRightColTop.length;

const addedRight = `
${salesBlock}
`;
code = code.substring(0, rightColInsertPos) + addedRight + code.substring(rightColInsertPos);

fs.writeFileSync(path, code);
console.log("Restructure successful.");
