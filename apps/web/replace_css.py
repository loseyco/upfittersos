import os
import re

file_path = 'src/features/business/BayMonitor.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Compact Card Root
content = content.replace(
    'className={cn("relative rounded border flex flex-col transition-all duration-1000 min-h-0 overflow-hidden px-1.5 py-1 3xl:p-1.5", cardBg)}',
    'className={cn("@container relative rounded border flex flex-col transition-all duration-1000 min-h-0 overflow-hidden px-1.5 py-1", cardBg)}'
)

# Compact Card Fonts
content = content.replace(
    'className={cn("text-[9px] lg:text-[10px] xl:text-xs 3xl:text-[36px] font-bold tracking-tight truncate", textColor)}',
    'className={cn("text-[max(9px,10cqw)] font-bold tracking-tight truncate", textColor)}'
)
content = content.replace(
    'className="bg-red-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] font-black uppercase tracking-widest flex items-center animate-pulse leading-none"',
    'className="bg-red-500 text-white px-1 py-0.5 rounded-[2px] text-[max(6px,8cqw)] font-black uppercase tracking-widest flex items-center animate-pulse leading-none"'
)
content = content.replace(
    'className="bg-emerald-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] font-black uppercase tracking-widest flex items-center leading-none"',
    'className="bg-emerald-500 text-white px-1 py-0.5 rounded-[2px] text-[max(6px,8cqw)] font-black uppercase tracking-widest flex items-center leading-none"'
)
content = content.replace(
    'className="text-[9px] lg:text-[10px] xl:text-[11px] 3xl:text-[30px] font-bold text-white truncate leading-tight"',
    'className="text-[max(9px,12cqw)] font-bold text-white truncate leading-tight"'
)
content = content.replace(
    'className="absolute bottom-[3px] right-1.5 text-[7px] lg:text-[8px] 3xl:text-[18px] text-white/40 font-black tracking-widest bg-black/20 px-1 rounded"',
    'className="absolute bottom-[3px] right-1.5 text-[max(7px,7cqw)] text-white/40 font-black tracking-widest bg-black/20 px-1 rounded"'
)
content = content.replace(
    'className="flex-1 min-h-0 flex items-center text-[9px] lg:text-[10px] xl:text-xs font-bold text-zinc-600"',
    'className="flex-1 min-h-0 flex items-center text-[max(9px,10cqw)] font-bold text-zinc-600"'
)

# Large Card Root
content = content.replace(
    'className={cn("rounded-3xl p-4 lg:p-6 3xl:p-6 border-4 flex flex-col transition-all duration-1000 min-h-0 overflow-hidden", cardBg)}',
    'className={cn("@container rounded-3xl p-[max(1rem,3cqw)] border-4 flex flex-col transition-all duration-1000 min-h-0 overflow-hidden", cardBg)}'
)

# Large Card Inner Elements
content = content.replace(
    'className="flex items-start justify-between mb-2 3xl:mb-3"',
    'className="flex items-start justify-between mb-[max(0.5rem,2cqw)]"'
)
content = content.replace(
    'className={cn("text-xl md:text-2xl lg:text-3xl 2xl:text-4xl 3xl:text-[108px] font-black tracking-tight line-clamp-2 leading-none", textColor)}',
    'className={cn("text-[max(1.25rem,8cqw)] font-black tracking-tight line-clamp-2 leading-none", textColor)}'
)
content = content.replace(
    'className="flex flex-col items-end gap-1 3xl:gap-3 shrink-0 ml-2"',
    'className="flex flex-col items-end gap-[max(0.25rem,1cqw)] shrink-0 ml-2"'
)
content = content.replace(
    'className="bg-red-500 text-white px-2 py-1 3xl:px-6 3xl:py-3 rounded-lg text-[10px] 2xl:text-xs 3xl:text-[36px] font-black uppercase tracking-widest flex items-center gap-1 3xl:gap-3 animate-pulse"',
    'className="bg-red-500 text-white px-[max(0.5rem,1.5cqw)] py-[max(0.25rem,1cqw)] rounded-lg text-[max(0.6rem,2cqw)] font-black uppercase tracking-widest flex items-center gap-[max(0.25rem,1cqw)] animate-pulse"'
)
content = content.replace(
    'className="w-3 h-3 3xl:w-8 3xl:h-8"',
    'className="w-[max(0.75rem,2.5cqw)] h-[max(0.75rem,2.5cqw)]"'
)
content = content.replace(
    'className="bg-emerald-500 text-white px-2 py-1 3xl:px-6 3xl:py-3 rounded-lg text-[10px] 2xl:text-xs 3xl:text-[36px] font-black uppercase tracking-widest flex items-center gap-1 3xl:gap-3"',
    'className="bg-emerald-500 text-white px-[max(0.5rem,1.5cqw)] py-[max(0.25rem,1cqw)] rounded-lg text-[max(0.6rem,2cqw)] font-black uppercase tracking-widest flex items-center gap-[max(0.25rem,1cqw)]"'
)
content = content.replace(
    'className="flex-1 min-h-0 flex flex-col justify-center mb-2 3xl:mb-3"',
    'className="flex-1 min-h-0 flex flex-col justify-center mb-[max(0.5rem,2cqw)]"'
)
content = content.replace(
    'className="text-xl md:text-2xl 2xl:text-3xl 3xl:text-[72px] font-bold text-white truncate leading-tight mb-1 3xl:mb-3"',
    'className="text-[max(1.25rem,7cqw)] font-bold text-white truncate leading-tight mb-[max(0.25rem,1cqw)]"'
)
content = content.replace(
    'className={cn("text-base md:text-lg 2xl:text-xl 3xl:text-[45px] font-medium line-clamp-2 leading-tight mb-1 3xl:mb-3", textColor, "opacity-90")}',
    'className={cn("text-[max(1rem,4.5cqw)] font-medium line-clamp-2 leading-tight mb-[max(0.25rem,1cqw)]", textColor, "opacity-90")}'
)
content = content.replace(
    'className="text-xs md:text-sm 2xl:text-base 3xl:text-[36px] font-bold uppercase tracking-widest text-white/50 truncate leading-none"',
    'className="text-[max(0.75rem,3cqw)] font-bold uppercase tracking-widest text-white/50 truncate leading-none"'
)
content = content.replace(
    'className="flex-1 min-h-0 flex items-center text-xl md:text-2xl 2xl:text-3xl 3xl:text-[72px] font-bold text-zinc-600"',
    'className="flex-1 min-h-0 flex items-center text-[max(1.25rem,7cqw)] font-bold text-zinc-600"'
)
content = content.replace(
    'className="pt-2 3xl:pt-6 border-t-2 border-white/10 shrink-0 grid grid-cols-2 gap-2 3xl:gap-4"',
    'className="pt-[max(0.5rem,2cqw)] border-t-2 border-white/10 shrink-0 grid grid-cols-2 gap-[max(0.5rem,2cqw)]"'
)

# Regex replacements for identical tags
content = re.sub(
    r'className="font-bold uppercase tracking-widest text-white\/40 text-\[10px\] 2xl:text-xs 3xl:text-\[30px\] leading-none mb-1 3xl:mb-2"',
    'className="font-bold uppercase tracking-widest text-white/40 text-[max(0.6rem,2cqw)] leading-none mb-[max(0.25rem,1cqw)]"',
    content
)

content = re.sub(
    r'className="font-black text-white\/90 text-sm 2xl:text-lg 3xl:text-\[45px\] leading-none truncate"',
    'className="font-black text-white/90 text-[max(0.875rem,3.5cqw)] leading-none truncate"',
    content
)

content = content.replace(
    'className={cn("font-black tracking-widest text-sm 2xl:text-lg 3xl:text-[45px] leading-none truncate", isOverdue ? "text-red-400 animate-pulse" : "text-emerald-400")}',
    'className={cn("font-black tracking-widest text-[max(0.875rem,3.5cqw)] leading-none truncate", isOverdue ? "text-red-400 animate-pulse" : "text-emerald-400")}'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete")
