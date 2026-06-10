import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TaskTitleAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  qbItems: any[];
  id?: string;
}

export function TaskTitleAutocomplete({ value, onChange, qbItems, id }: TaskTitleAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  // Close on click outside
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
  }, [isOpen, value, qbItems]);

  const filtered = qbItems
    .map(item => item.FullName || item.Name || '')
    .filter((name, idx, self) => name && self.indexOf(name) === idx) // Unique list of names
    .filter(name => name.toLowerCase().includes(value.toLowerCase()));

  const handleSelect = (val: string) => {
    onChange(val);
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
        setActiveIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : -1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          handleSelect(filtered[activeIndex]);
        } else if (filtered.length > 0) {
          handleSelect(filtered[0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
      case 'Tab':
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          onChange(filtered[activeIndex]);
        }
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          placeholder="Task Title..."
          onFocus={() => {
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onChange={e => {
            onChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none pl-1 pr-5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-semibold text-zinc-900 dark:text-white"
        />
        <ChevronDown 
          className="w-3.5 h-3.5 text-zinc-450 dark:text-zinc-600 absolute right-1 cursor-pointer pointer-events-none" 
        />
      </div>

      {isOpen && filtered.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            minWidth: `${coords.width}px`,
            width: 'max-content',
            maxWidth: '400px',
          }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-[100] max-h-48 overflow-y-auto p-1 custom-scrollbar"
        >
          {filtered.map((name, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur before click registers
              }}
              onClick={() => handleSelect(name)}
              className={cn(
                "w-full px-2 py-1.5 text-left text-xs rounded-lg transition-colors truncate block cursor-pointer",
                idx === activeIndex
                  ? "bg-indigo-500 text-white font-bold"
                  : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
              )}
            >
              {name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
