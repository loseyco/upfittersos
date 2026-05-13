import sys
import os

with open('JobDetailsModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Split into top (imports) and component
parts = content.split('export function JobDetailsModal')
if len(parts) < 2:
    print("Could not find export function JobDetailsModal")
    sys.exit(1)

part_top = parts[0]
legacy_component = 'function LegacyJobDetailsModal' + parts[1]

# 2. Add useAuthStore if not present
if "import { useAuthStore }" not in part_top:
    part_top = part_top.replace("import React,", "import React,\nimport { useAuthStore } from '../../lib/auth/store';")
    if "import { useAuthStore }" not in part_top:
        part_top = part_top.replace("import { useState", "import { useAuthStore } from '../../lib/auth/store';\nimport { useState")

# 3. Create beta component
beta_component = legacy_component.replace('function LegacyJobDetailsModal', 'function BetaJobDetailsModal')

# 4. Add Beta Badge to Header
beta_badge_html = """          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-purple-500/20 shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Beta
            </span>
          </div>"""

# Need to find the header div with the title, usually <h2 or <h3
# Let's just insert it after the close button or before it.
# Actually, let's look for a known string. Let's just use `Ctrl+Enter` and `Esc` first.
hotkeys_code = """  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
"""
beta_component = beta_component.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(true);\n' + hotkeys_code)

# 5. Create wrapper
wrappers_code = """
export function JobDetailsModal(props: JobDetailsModalProps) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaJobDetailsModal {...props} />;
  }
  return <LegacyJobDetailsModal {...props} />;
}
"""

final_content = part_top + wrappers_code + beta_component + "\n\n" + legacy_component

with open('JobDetailsModal.tsx', 'w', encoding='utf-8') as f:
    f.write(final_content)

print('Successfully generated JobDetailsModal.tsx')
