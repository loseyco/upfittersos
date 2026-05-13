import sys
import os

with open('ItemDetailsModal.tsx.bak', 'r', encoding='utf-8') as f:
    content = f.read()

# content is the original file
# split into imports, component body, and barcode icon
parts = content.split('export function ItemDetailsModal')
imports_and_types = parts[0]

# parts[1] contains the component body and then BarcodeFormatIcon at the end.
sub_parts = parts[1].split('function BarcodeFormatIcon(props: any) {')
component_body = sub_parts[0]
barcode_icon = 'function BarcodeFormatIcon(props: any) {' + sub_parts[1]

legacy_function_body = 'function LegacyItemDetailsModal' + component_body

beta_function_body = legacy_function_body.replace('function LegacyItemDetailsModal', 'function BetaItemDetailsModal')

beta_badge_html = """          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-purple-500/20 shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Beta
            </span>
          </div>"""

beta_function_body = beta_function_body.replace('<div className="flex items-center gap-2">\n            {!isEditing &&', beta_badge_html + '\n          <div className="flex items-center gap-2">\n            {!isEditing &&')

hotkeys = """useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) setIsEditing(false);
        else onClose();
      } else if (e.key === 'e' && !isEditing && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsEditing(true);
      } else if (e.key === 'Enter' && e.ctrlKey && isEditing) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditing]);

  const handleSave = async () => {"""

beta_function_body = beta_function_body.replace('const handleSave = async () => {', hotkeys)

beta_function_body = beta_function_body.replace('type="text"\n                        value={editData.title}', 'type="text"\n                        autoFocus\n                        value={editData.title}')

wrapper_code = """
export function ItemDetailsModal(props: ItemDetailsModalProps) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaItemDetailsModal {...props} />;
  }
  return <LegacyItemDetailsModal {...props} />;
}
"""

final_content = imports_and_types + wrapper_code + beta_function_body + '\n\n' + legacy_function_body + '\n\n' + barcode_icon

with open('ItemDetailsModal.tsx', 'w', encoding='utf-8') as f:
    f.write(final_content)

print('Successfully fixed ItemDetailsModal.tsx')
