import sys
import os

with open('VehiclesManager.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Rename to legacy
content = content.replace('export function VehicleDetailsModal', 'function LegacyVehicleDetailsModal')
content = content.replace('export function EditVehicleModal', 'function LegacyEditVehicleModal')

# 2. Extract legacy bodies to create beta bodies
# It's a bit tricky to extract the exact bodies without a parser.
# However, we can just replace 'function LegacyVehicleDetailsModal' with 'function BetaVehicleDetailsModal' etc.
# But wait, if we duplicate the entire file, we'll duplicate `VehiclesManager` too.
# Let's split the file into three parts: VehiclesManager, LegacyVehicleDetailsModal, LegacyEditVehicleModal.

parts1 = content.split('function LegacyVehicleDetailsModal')
part_top = parts1[0]
part_modals = 'function LegacyVehicleDetailsModal' + parts1[1]

parts2 = part_modals.split('function LegacyEditVehicleModal')
legacy_details = parts2[0]
legacy_edit = 'function LegacyEditVehicleModal' + parts2[1]

beta_details = legacy_details.replace('function LegacyVehicleDetailsModal', 'function BetaVehicleDetailsModal')
beta_edit = legacy_edit.replace('function LegacyEditVehicleModal', 'function BetaEditVehicleModal')

# Add Beta Badge to Details
beta_badge_html = """          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-purple-500/20 shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Beta
            </span>
          </div>"""

beta_details = beta_details.replace('<div className="flex items-center gap-2">\n            {!isQB && onArchive && (', beta_badge_html + '\n          <div className="flex items-center gap-2">\n            {!isQB && onArchive && (')

# Add Hotkeys to Details
hotkeys_details = """const currentZone = zones?.find(z => z.currentVehicleVin === vehicle.vin);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'e' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        onEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onEdit]);
"""
beta_details = beta_details.replace('const currentZone = zones?.find(z => z.currentVehicleVin === vehicle.vin);\n  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);', hotkeys_details)

# Add Beta Badge to Edit
beta_edit = beta_edit.replace('<h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">\n            Edit Vehicle', '<h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">\n            Edit Vehicle\n            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[8px] font-black uppercase tracking-[0.2em] rounded border border-purple-500/20 shadow-sm flex items-center gap-1 ml-2"><span className="w-1 h-1 rounded-full bg-purple-500 animate-pulse" /> Beta</span>')

# Add AutoFocus to Edit
beta_edit = beta_edit.replace('value={year} onChange={e => setYear(e.target.value)}', 'autoFocus value={year} onChange={e => setYear(e.target.value)}')

# Add Hotkeys to Edit
hotkeys_edit = """const [apiVerified, setApiVerified] = useState(vehicle.apiVerified || false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (!isSubmitting) {
          const form = document.getElementById('edit-vehicle-form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);
"""
beta_edit = beta_edit.replace('const [apiVerified, setApiVerified] = useState(vehicle.apiVerified || false);', hotkeys_edit)
beta_edit = beta_edit.replace('<form onSubmit={handleSubmit}', '<form id="edit-vehicle-form" onSubmit={handleSubmit}')


# Create Wrappers
wrappers_code = """
import { useAuthStore } from '../../lib/auth/store';

export function VehicleDetailsModal(props: any) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaVehicleDetailsModal {...props} />;
  }
  return <LegacyVehicleDetailsModal {...props} />;
}

export function EditVehicleModal(props: any) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaEditVehicleModal {...props} />;
  }
  return <LegacyEditVehicleModal {...props} />;
}
"""

# The useAuthStore import needs to be at the top, but we already add it in wrappers_code right above the wrappers.
# But putting imports in the middle of a file is bad. Let's move it to top.

if "import { useAuthStore }" not in part_top:
    part_top = part_top.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect } from 'react';\nimport { useAuthStore } from '../../lib/auth/store';")
    wrappers_code = wrappers_code.replace("import { useAuthStore } from '../../lib/auth/store';\n", "")

final_content = part_top + wrappers_code + beta_details + beta_edit + legacy_details + legacy_edit

with open('VehiclesManager.tsx', 'w', encoding='utf-8') as f:
    f.write(final_content)

print('Successfully generated VehiclesManager.tsx')
