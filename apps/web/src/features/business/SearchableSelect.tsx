import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ThemeColor = 'indigo' | 'amber' | 'blue' | 'emerald' | 'rose' | 'zinc' | 'violet';

interface SearchableSelectProps<T> {
  options: T[];
  value: string | null;
  onChange: (value: string | null) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  icon?: React.ReactNode;
  renderOption?: (option: T) => React.ReactNode;
  className?: string;
  theme?: ThemeColor;
  footerAction?: {
    label: string;
    onClick: (search: string) => void;
    icon?: React.ReactNode;
  };
}

const themeClasses: Record<ThemeColor, {
  button: string;
  inputFocus: string;
  optionHover: string;
  icon: string;
  footer: string;
}> = {
  indigo: {
    button: "focus:ring-indigo-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-indigo-500/20 focus:border-indigo-500",
    optionHover: "hover:bg-indigo-50 dark:hover:bg-indigo-500/10",
    icon: "text-indigo-500",
    footer: "bg-indigo-600 hover:bg-indigo-700 text-white"
  },
  amber: {
    button: "focus:ring-amber-500/20 border-amber-100 dark:border-amber-500/20",
    inputFocus: "focus:ring-amber-500/20 focus:border-amber-500",
    optionHover: "hover:bg-amber-50 dark:hover:bg-amber-500/10",
    icon: "text-amber-500",
    footer: "bg-amber-600 hover:bg-amber-700 text-white"
  },
  blue: {
    button: "focus:ring-blue-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-blue-500/20 focus:border-blue-500",
    optionHover: "hover:bg-blue-50 dark:hover:bg-blue-500/10",
    icon: "text-blue-500",
    footer: "bg-blue-600 hover:bg-blue-700 text-white"
  },
  emerald: {
    button: "focus:ring-emerald-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-emerald-500/20 focus:border-emerald-500",
    optionHover: "hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
    icon: "text-emerald-500",
    footer: "bg-emerald-600 hover:bg-emerald-700 text-white"
  },
  rose: {
    button: "focus:ring-rose-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-rose-500/20 focus:border-rose-500",
    optionHover: "hover:bg-rose-50 dark:hover:bg-rose-500/10",
    icon: "text-rose-500",
    footer: "bg-rose-600 hover:bg-rose-700 text-white"
  },
  zinc: {
    button: "focus:ring-zinc-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-zinc-500/20 focus:border-zinc-500",
    optionHover: "hover:bg-zinc-100 dark:hover:bg-zinc-800",
    icon: "text-zinc-500",
    footer: "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
  },
  violet: {
    button: "focus:ring-violet-500/20 border-zinc-200 dark:border-zinc-800",
    inputFocus: "focus:ring-violet-500/20 focus:border-violet-500",
    optionHover: "hover:bg-violet-50 dark:hover:bg-violet-500/10",
    icon: "text-violet-500",
    footer: "bg-violet-600 hover:bg-violet-700 text-white"
  }
};

export function SearchableSelect<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue,
  placeholder = "Select...",
  searchPlaceholder = "Type to filter...",
  icon,
  renderOption,
  className,
  theme = 'indigo',
  footerAction
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => getValue(o) === value);
  const filteredOptions = options.filter(o => 
    getLabel(o).toLowerCase().includes(search.toLowerCase())
  );

  const currentTheme = themeClasses[theme];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900/50 border rounded-2xl text-sm focus:ring-2 outline-none transition-all font-bold text-left shadow-sm",
          currentTheme.button
        )}
      >
        <div className="flex items-center gap-3">
          {icon && <div className={cn("shrink-0", currentTheme.icon)}>{icon}</div>}
          <span className={cn(selectedOption ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
            {selectedOption ? getLabel(selectedOption) : placeholder}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none transition-all",
                  currentTheme.inputFocus
                )}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <button
                  key={getValue(option)}
                  type="button"
                  onClick={() => {
                    onChange(getValue(option));
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "w-full px-3 py-2.5 text-left flex flex-col rounded-xl transition-colors",
                    currentTheme.optionHover
                  )}
                >
                  {renderOption ? renderOption(option) : (
                    <span className="font-bold text-zinc-900 dark:text-white text-sm">{getLabel(option)}</span>
                  )}
                </button>
              ))
            ) : (
              !footerAction && <p className="p-4 text-center text-xs text-zinc-500 italic">No options found.</p>
            )}

            {footerAction && (
              <button 
                type="button"
                onClick={() => { footerAction.onClick(search); setIsOpen(false); }} 
                className={cn(
                  "w-full mt-1 px-3 py-3 text-left flex items-center gap-3 rounded-xl transition-all shadow-sm active:scale-[0.98]",
                  currentTheme.footer
                )}
              >
                <div className="p-1.5 bg-white/20 rounded-md">
                  {footerAction.icon || <Plus className="w-4 h-4" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest">{footerAction.label}</span>
                  {search.trim() && <span className="text-[10px] opacity-80 font-bold">{search}</span>}
                </div>
              </button>
            )}
          </div>
          {value && (
            <div className="p-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                  setSearch('');
                }}
                className="w-full px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
