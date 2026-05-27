import _QRCode from 'react-qr-code';
import { CarFront, Briefcase, Wrench } from 'lucide-react';

const QRCode = (_QRCode as any).default || _QRCode;

interface LogoQRCodeProps {
  value: string;
  size?: number;
  logoUrl?: string;
  businessName?: string;
  type?: 'vehicle' | 'job' | 'part' | 'general';
  level?: 'L' | 'M' | 'Q' | 'H';
}

export function LogoQRCode({
  value,
  size = 180,
  logoUrl,
  businessName,
  type = 'general',
  level = 'H' // Default to High error correction to allow center overlay
}: LogoQRCodeProps) {
  
  // Calculate center logo size (typically 22-25% of overall QR size)
  const logoSize = Math.floor(size * 0.22);
  const borderSize = Math.floor(logoSize * 0.12);

  // Default fallback emblem based on type
  const renderFallbackIcon = () => {
    switch (type) {
      case 'vehicle':
        return <CarFront className="text-zinc-900 dark:text-indigo-600" style={{ width: logoSize - 8, height: logoSize - 8 }} />;
      case 'job':
        return <Briefcase className="text-zinc-900 dark:text-emerald-600" style={{ width: logoSize - 8, height: logoSize - 8 }} />;
      case 'part':
        return <Wrench className="text-zinc-900 dark:text-amber-600" style={{ width: logoSize - 8, height: logoSize - 8 }} />;
      default:
        return (
          <span className="text-[10px] font-black text-indigo-600 select-none tracking-tight">
            {businessName ? businessName.slice(0, 3).toUpperCase() : 'OS'}
          </span>
        );
    }
  };

  return (
    <div 
      className="relative flex items-center justify-center bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-sm transition-all hover:shadow-md hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-white select-none"
      style={{ width: size + 24, height: size + 24 }}
    >
      {/* QR Code Graphic */}
      <div className="w-full h-full flex items-center justify-center">
        <QRCode 
          value={value} 
          size={size} 
          level={level} 
          style={{ width: '100%', height: '100%' }}
          bgColor="#ffffff"
          fgColor="#09090b" // Slate-950 color for high-contrast scan
        />
      </div>

      {/* Embedded Logo Overlay Container */}
      <div 
        className="absolute inset-0 m-auto flex items-center justify-center bg-white rounded-xl shadow-md border border-zinc-100"
        style={{ 
          width: logoSize + borderSize * 2, 
          height: logoSize + borderSize * 2,
          padding: borderSize
        }}
      >
        <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg bg-zinc-50">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Remove img src to fallback to icon
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            renderFallbackIcon()
          )}
        </div>
      </div>
    </div>
  );
}
