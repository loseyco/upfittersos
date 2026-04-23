import { useState, useEffect } from 'react';
import { VinScannerModal } from './jobs/VinScannerModal';
import toast from 'react-hot-toast';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export const openGlobalScanner = () => window.dispatchEvent(new CustomEvent('open-global-scanner'));

export function GlobalScannerShortcut() {
    const [isOpen, setIsOpen] = useState(false);
    const { tenantId } = useAuth();

    useEffect(() => {
        const handler = () => setIsOpen(true);
        window.addEventListener('open-global-scanner', handler);
        return () => window.removeEventListener('open-global-scanner', handler);
    }, []);

    const handleScan = async (scannedUrl: string) => {
        try {
            // Is it a valid Upfitters URL?
            if (scannedUrl.includes('/qr/')) {
                const urlParts = scannedUrl.split('/qr/');
                const tagId = urlParts[1].split('/')[0];
                if (tagId) {
                    window.location.href = `/qr/${tagId}`;
                    return;
                }
            } 
            
            // Or is it a raw VIN? (Code39/128)
            if (scannedUrl.length >= 11 && !scannedUrl.includes('http')) {
                if (tenantId) {
                    toast.loading("Verifying vehicle database...", { id: 'vin-query' });
                    const qVehicles = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId), where('vin', '==', scannedUrl.toUpperCase()));
                    const querySnapshot = await getDocs(qVehicles);
                    toast.dismiss('vin-query');
                    
                    if (querySnapshot.empty) {
                        toast.error(`Recognized VIN ${scannedUrl.toUpperCase()}, but it is not saved in your system yet!`, {
                            duration: 5000,
                            icon: '⚠️'
                        });
                        // Still route them there so they can create it!
                        setTimeout(() => {
                            window.location.href = `/business/vehicles?vin=${scannedUrl}`;
                        }, 1000);
                        return;
                    } else {
                        toast.success(`Vehicle recognized! Resolving payload...`, { id: 'vin-success' });
                    }
                }

                window.location.href = `/business/vehicles?vin=${scannedUrl}`;
                return;
            }

            toast.error(`Recognized text but format unsupported: ${scannedUrl.slice(0, 20)}...`);
        } catch (e) {
            toast.error("Failed to parse barcode.");
        }
    };

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 z-[110]">
                    <VinScannerModal 
                        title="Scan Vehicle Tag"
                        description="Point at any pre-printed Tracking Tag (QR) or Vehicle Identification Number (Code39 barcode)."
                        isQrMode={false}
                        onClose={() => setIsOpen(false)}
                        onScan={(val) => {
                            setIsOpen(false);
                            handleScan(val);
                        }}
                    />
                </div>
            )}
        </>
    );
}
