import sys

file_path = r'src/pages/business/estimates/EstimateBuilderV2.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines(True)

# Quote Totals block: 1391 to 1521 (0-indexed base) -> line 1392 to 1522
quote_totals_start = 1391
quote_totals_end = 1522
quote_totals_block = "".join(lines[quote_totals_start:quote_totals_end])

# Project Logistics: 2346 to 2435 (0-indexed base) -> line 2347 to 2436
# The user wants to REMOVE Dropoff/Pickup. 
# Logistics actually spans from "Project Logistics & Targets" to the Internal Completion ETA block.
# Wait, let's keep it simple: Just transplant both for now, then edit the DOM via React tool.
project_logistics_start = 2346
project_logistics_end = 2436
project_logistics_block = "".join(lines[project_logistics_start:project_logistics_end])

new_lines = []
for i, line in enumerate(lines):
    if quote_totals_start <= i < quote_totals_end:
        continue # omit quote totals
    if project_logistics_start <= i < project_logistics_end:
        continue # omit project logistics
    
    new_lines.append(line)
    
    # After right column starts:
    if '<div className=\"xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 max-h-[calc(100vh-6rem)] xl:overflow-y-auto no-scrollbar pb-32 xl:pb-32\">' in line:
        new_lines.append(quote_totals_block)
        new_lines.append(project_logistics_block)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully spliced Quote Totals and Project Logistics.")
