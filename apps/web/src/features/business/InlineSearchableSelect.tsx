import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
  value: string;
  label: string;
}

interface InlineSearchableSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function InlineSearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  className
}: InlineSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ top: number; left: number; width: number; direction: 'up' | 'down' }>({
    top: 0,
    left: 0,
    width: 0,
    direction: 'down',
  });

  const updateCoords = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current ? menuRef.current.offsetHeight : 200;
      
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let direction: 'up' | 'down' = 'down';
      // If space below is less than 220px and we have more space above, open up
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        direction = 'up';
      }

      setCoords({
        top: direction === 'down' 
          ? rect.bottom + window.scrollY 
          : rect.top + window.scrollY - menuHeight - 4,
        left: rect.left + window.scrollX,
        width: rect.width,
        direction,
      });
    }
  };

  const selectedOption = options.find(o => o.value === value);

  // Sync search input value with selected option label when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedOption ? selectedOption.label : '');
    }
  }, [value, selectedOption, isOpen]);

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && 
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update coords dynamically
  useEffect(() => {
    if (isOpen) {
      updateCoords();
      
      const handleScrollResize = () => {
        updateCoords();
      };
      
      window.addEventListener('scroll', handleScrollResize, true);
      window.addEventListener('resize', handleScrollResize);
      
      const raf = requestAnimationFrame(() => {
        updateCoords();
      });
      
      return () => {
        window.removeEventListener('scroll', handleScrollResize, true);
        window.removeEventListener('resize', handleScrollResize);
        cancelAnimationFrame(raf);
      };
    }
  }, [isOpen, search, options]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    const opt = options.find(o => o.value === optionValue);
    setSearch(opt ? opt.label : '');
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      return;
    }

    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
      e.stopPropagation();
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : -1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (filteredOptions.length > 0 ? (prev - 1 + filteredOptions.length) % filteredOptions.length : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          handleSelect(filteredOptions[activeIndex].value);
        } else if (filteredOptions.length > 0) {
          handleSelect(filteredOptions[0].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
      case 'Tab':
        // Select highlighted option on Tab to mimic spreadsheet behavior
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          onChange(filteredOptions[activeIndex].value);
        } else if (filteredOptions.length > 0) {
          onChange(filteredOptions[0].value);
        }
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          value={search}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            setActiveIndex(-1);
            inputRef.current?.select();
          }}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none pl-1 pr-5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer placeholder-zinc-400 dark:placeholder-zinc-650"
        />
        <ChevronDown className="w-3.5 h-3.5 text-zinc-450 dark:text-zinc-600 absolute right-1 pointer-events-none" />
      </div>

      {isOpen && filteredOptions.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            minWidth: `${coords.width}px`,
            width: 'max-content',
            maxWidth: '300px',
          }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-[100] max-h-48 overflow-y-auto p-1 custom-scrollbar"
        >
          {filteredOptions.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => {
                // Prevent input blur before click registers
                e.preventDefault();
              }}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "w-full px-2 py-1.5 text-left text-xs rounded-lg transition-colors truncate block cursor-pointer",
                idx === activeIndex
                  ? "bg-indigo-500 text-white font-bold"
                  : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
