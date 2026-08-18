import { useState, useRef, useEffect } from 'react';
import { X, Check, Users, UserPlus, Search } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface StaffMember {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  fullName?: string;
  email?: string;
  role?: string;
  departmentId?: string;
  departmentName?: string;
  [key: string]: any;
}

interface SearchableStaffMultiPickerProps {
  allStaff: StaffMember[];
  selectedStaffIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
  className?: string;
  mode?: 'popover' | 'embedded';
  maxChipsDisplay?: number;
}

export function SearchableStaffMultiPicker({
  allStaff = [],
  selectedStaffIds = [],
  onChange,
  placeholder = "Search & assign staff...",
  className,
  mode = 'popover',
  maxChipsDisplay = 4
}: SearchableStaffMultiPickerProps) {
  const [isOpen, setIsOpen] = useState(mode === 'embedded');
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close popover on click outside (only in popover mode)
  useEffect(() => {
    if (mode !== 'popover') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mode]);

  const resolveStaffName = (st: StaffMember) => {
    const combined = `${st.firstName || ''} ${st.lastName || ''}`.trim();
    return combined || st.displayName || st.name || st.fullName || (st.email ? st.email.split('@')[0] : 'Technician');
  };

  const isStaffActive = (st: StaffMember) => {
    if (st.isArchived) return false;
    if (st.fireDate) return false;
    if (st.isDeviceAccount) return false;
    if (st.active === false) return false;
    const s = (st.status || '').toLowerCase();
    if (s === 'inactive' || s === 'archived' || s === 'fired' || s === 'terminated' || s === 'disabled') return false;
    return true;
  };

  const activeStaffList = allStaff.filter(st => isStaffActive(st) || selectedStaffIds.includes(st.id));

  const filteredStaff = activeStaffList.filter(st => {
    const name = resolveStaffName(st).toLowerCase();
    const email = (st.email || '').toLowerCase();
    const role = (st.role || '').toLowerCase();
    const dept = (st.departmentName || '').toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return name.includes(query) || email.includes(query) || role.includes(query) || dept.includes(query);
  });

  // Checked/Assigned staff sorted directly to the top for effortless toggling
  const sortedFilteredStaff = [...filteredStaff].sort((a, b) => {
    const aSelected = selectedStaffIds.includes(a.id);
    const bSelected = selectedStaffIds.includes(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return resolveStaffName(a).localeCompare(resolveStaffName(b));
  });

  const handleToggle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedStaffIds.includes(id)) {
      onChange(selectedStaffIds.filter(x => x !== id));
    } else {
      onChange([...selectedStaffIds, id]);
    }
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedStaffIds.filter(x => x !== id));
  };

  const selectedStaffMembers = allStaff.filter(st => selectedStaffIds.includes(st.id));
  const hiddenCount = selectedStaffMembers.length - maxChipsDisplay;

  // =========================================================================
  // EMBEDDED MODE (For Modals & Drawers - Zero Overflow Clipping)
  // =========================================================================
  if (mode === 'embedded') {
    return (
      <div className={cn("w-full space-y-2", className)}>
        {/* Selected Chips Bar */}
        {selectedStaffMembers.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
            {selectedStaffMembers.map(st => {
              const name = resolveStaffName(st);
              return (
                <span
                  key={st.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold shrink-0 animate-in fade-in"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  <span className="truncate max-w-[130px]">{name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemove(st.id, e)}
                    className="hover:text-white hover:bg-indigo-500/30 rounded p-0.5 transition cursor-pointer"
                    title={`Remove ${name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold ml-auto px-2 py-0.5 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Search Filter Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs font-medium focus:border-indigo-500 outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Staff List */}
        <div className="max-h-52 overflow-y-auto rounded-xl bg-zinc-900/90 border border-zinc-800 p-1 space-y-0.5 custom-scrollbar">
          {sortedFilteredStaff.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500 italic">
              No staff members found matching "{searchQuery}".
            </div>
          ) : (
            sortedFilteredStaff.map((st) => {
              const isSelected = selectedStaffIds.includes(st.id);
              const name = resolveStaffName(st);

              return (
                <div
                  key={st.id}
                  onClick={(e) => handleToggle(st.id, e)}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl text-left transition flex items-center justify-between gap-2.5 cursor-pointer select-none",
                    isSelected
                      ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                      : "hover:bg-zinc-800/70 text-zinc-300 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                      isSelected ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30" : "bg-zinc-800 text-zinc-400"
                    )}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <span>{name}</span>
                        {isSelected && (
                          <span className="text-[10px] text-indigo-400 font-normal">
                            (Assigned)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate flex items-center gap-2">
                        {st.role && <span className="capitalize">{st.role}</span>}
                        {st.departmentName && <span>• {st.departmentName}</span>}
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "w-5 h-5 rounded-md flex items-center justify-center border transition shrink-0",
                    isSelected
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "border-zinc-700 bg-zinc-950 text-transparent"
                  )}>
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // POPOVER MODE (For Horizontal Quick Add Bar)
  // =========================================================================
  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Main Container / Input Trigger */}
      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        className={cn(
          "w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-2 py-1 transition cursor-pointer flex items-center flex-wrap gap-1 min-h-[36px]",
          isOpen && "ring-1 ring-indigo-500 border-indigo-500/50"
        )}
      >
        {/* Render Selected Staff Chips */}
        {selectedStaffMembers.slice(0, maxChipsDisplay).map(st => {
          const name = resolveStaffName(st);
          return (
            <span
              key={st.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span className="truncate max-w-[90px]">{name}</span>
              <button
                type="button"
                onClick={(e) => handleRemove(st.id, e)}
                className="hover:text-white hover:bg-indigo-500/30 rounded p-0.5 transition cursor-pointer"
                title={`Remove ${name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}

        {/* Overflow Badge */}
        {hiddenCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[10px] font-mono font-bold">
            +{hiddenCount}
          </span>
        )}

        {/* Inline Search Input */}
        <div className="flex-1 min-w-[70px] flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedStaffIds.length === 0 ? placeholder : "Add tech..."}
            className="w-full bg-transparent border-none outline-none text-xs text-zinc-200 placeholder-zinc-500 font-medium py-0.5"
          />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(prev => !prev);
          }}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer ml-auto shrink-0"
        >
          {selectedStaffIds.length > 0 ? (
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          ) : (
            <UserPlus className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </button>
      </div>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-[120] max-h-56 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar animate-in fade-in zoom-in-95">
          {/* Header Controls */}
          <div className="px-2 py-1 flex items-center justify-between border-b border-zinc-800/80 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Select Staff ({filteredStaff.length})
            </span>
            {selectedStaffIds.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Filtered Staff List */}
          {sortedFilteredStaff.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-500 italic">
              No staff matching "{searchQuery}".
            </div>
          ) : (
            sortedFilteredStaff.map((st) => {
              const isSelected = selectedStaffIds.includes(st.id);
              const name = resolveStaffName(st);

              return (
                <div
                  key={st.id}
                  onClick={(e) => handleToggle(st.id, e)}
                  className={cn(
                    "w-full px-2 py-1.5 rounded-xl text-left transition flex items-center justify-between gap-2 cursor-pointer",
                    isSelected 
                      ? "bg-indigo-500/15 border border-indigo-500/30 text-white" 
                      : "hover:bg-zinc-800/80 text-zinc-300"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
                      isSelected ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400"
                    )}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{name}</div>
                      {st.role && (
                        <div className="text-[9px] text-zinc-500 capitalize truncate">{st.role}</div>
                      )}
                    </div>
                  </div>

                  <div className={cn(
                    "w-4 h-4 rounded flex items-center justify-center border transition shrink-0",
                    isSelected 
                      ? "bg-indigo-600 border-indigo-500 text-white" 
                      : "border-zinc-700 bg-zinc-950 text-transparent"
                  )}>
                    <Check className="w-3 h-3" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
