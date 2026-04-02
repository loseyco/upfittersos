export function MapBackgroundNode({ data }: any) {
    const { src } = data;
    console.warn("RENDERED MAP BACKGROUND NODE WITH SRC:", src);
    
    if (!src) return null;

    if (src.startsWith('address:')) {
        const addressString = src.replace('address:', '');
        return (
            <div style={{ width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' }} className="w-full h-full rounded-xl overflow-hidden shadow-2xl bg-indigo-500/20 border-8 border-indigo-500 flex items-center justify-center pointer-events-none">
                <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(addressString)}&t=k&z=20&output=embed`}
                    style={{ border: 0, pointerEvents: 'none' }}
                    allowFullScreen={false}
                    aria-hidden="false" 
                    tabIndex={-1}
                />
            </div>
        );
    }

    return (
        <img 
            src={src} 
            alt="Floor Base" 
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.7 }} 
            className="rounded-xl shadow-2xl pointer-events-none" 
        />
    );
}
