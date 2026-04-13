import re
with open('src/pages/TechPortal.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove useState for activeTaskView and discoveryModal
text = re.sub(r'const \[activeTaskView,\s*setActiveTaskView\][^;]+;\n?', '', text)
text = re.sub(r'const \[discoveryModal,\s*setDiscoveryModal\][^;]+;\n?', '', text)

# 2. Remove submitDiscoveryNote
text = re.sub(r'const submitDiscoveryNote\s*=\s*async\s*\(\)\s*=>\s*\{.*?\};\n', '', text, flags=re.DOTALL)

# 3. Remove handleUpdateTaskStatus
text = re.sub(r'const handleUpdateTaskStatus\s*=\s*async\s*\(.*?\)[\s\S]*?(?=^    const \w)|^    const handleUpdateTaskStatus.*?};\n', '', text, flags=re.DOTALL | re.MULTILINE)

# 4. Remove handleToggleDiscoveryClock
text = re.sub(r'const handleToggleDiscoveryClock\s*=\s*async\s*\(.*?\)[\s\S]*?(?=^    const \w)|^    const handleToggleDiscoveryClock.*?};\n', '', text, flags=re.DOTALL | re.MULTILINE)

# 5. In My Assignments, replace the map loop body
map_start = '                                    {job.myTasks.map((t: any, idx: number) => {'
map_end = '                                    )})} '

with open('src/pages/TechPortal.tsx', 'w', encoding='utf-8') as f:
    f.write(text)