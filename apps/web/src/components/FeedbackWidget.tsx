import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';

export function FeedbackWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hide the floating help/feedback widget on TV monitor displays
  const isTvRoute = ['/tv', '/parking-tv', '/timeclock-tv', '/conference-tv', '/tv-setup'].some(path => 
    window.location.pathname.startsWith(path)
  );
  if (isTvRoute) return null;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 md:p-3 rounded-full shadow-xl transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center group print-hidden no-print"
        aria-label="Help & Feedback"
      >
        <HelpCircle className="w-5 h-5 md:w-7 md:h-7 transition-transform group-hover:rotate-12" />
      </button>

      {isModalOpen && (
        <FeedbackModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}
