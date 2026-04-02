import { useState } from 'react';
import { 
    ExternalLink, 
    FileText, 
    Clock, 
    Link as LinkIcon, 
    Users, 
    CreditCard, 
    Network, 
    Truck, 
    Wrench,
    Search
} from 'lucide-react';

interface Resource {
    id: string;
    title: string;
    description: string;
    url: string;
    icon: React.ElementType;
    category: 'Intake & Service' | 'HR & Payroll' | 'FAST Operations';
}

const resourcesData: Resource[] = [
    {
        id: 'r1',
        title: 'Vehicle Drop Off Form',
        description: 'Complete this form when taking custody of a new client vehicle.',
        url: 'https://forms.gle/r2HWjY5EbGV3hrYf7',
        icon: Truck,
        category: 'Intake & Service'
    },
    {
        id: 'r2',
        title: 'Vehicle Check Intake Form',
        description: 'Detailed inspection form for vehicle intake processing.',
        url: 'https://forms.gle/r2HWjY5EbGV3hrYf7',
        icon: FileText,
        category: 'Intake & Service'
    },
    {
        id: 'r3',
        title: 'Time Clock Correction Form',
        description: 'Submit missed punches or hours adjustments to HR.',
        url: 'https://docs.google.com/forms/d/e/1FAIpQLSdTx0toyT5O8ILmbZ5JqcdAROEeridYONIGSMpWDS2XN2dY6Q/viewform',
        icon: Clock,
        category: 'HR & Payroll'
    },
    {
        id: 'r4',
        title: 'Employee Directory',
        description: 'Internal contact list and department assignments.',
        url: 'https://docs.google.com/spreadsheets/d/19oob8WzAHwaavnampjBh7ZjmxRcthsROd5nfrkcqsrk/edit',
        icon: Users,
        category: 'HR & Payroll'
    },
    {
        id: 'r5',
        title: 'OnPay (Payroll)',
        description: 'Access your pay stubs and tax documents.',
        url: 'https://app.onpay.com/app/login',
        icon: CreditCard,
        category: 'HR & Payroll'
    },
    {
        id: 'r6',
        title: 'Company Org Chart',
        description: 'Visual map of SAE Group reporting structure.',
        url: 'https://miro.com/welcomeonboard/dmNlNFg1bXBWZkF3ampxSXlESXRhUFk4NStGNEtydGpkNDdVaHRNS0ZySGZDVmpxeVZxNDFTK2ZzK0lZRnhQTGF4NVg2Wml1cmNOaFZvU2tTR3pnVGZQUWtQdzJGM3RHKzlRcjdRWmliUi9wblphcXBLbVcrQTNubHZrMnhhWTBBd044SHFHaVlWYWk0d3NxeHNmeG9BPT0hdjE=',
        icon: Network,
        category: 'HR & Payroll'
    },
    {
        id: 'r7',
        title: 'FAST Pump Test Scheduling',
        description: 'Book certification and maintenance blocks for FAST trucks.',
        url: 'https://forms.gle/crPPiQ3xLdwDVWZr8',
        icon: Wrench,
        category: 'FAST Operations'
    },
    {
        id: 'r8',
        title: 'FAST Customer / Lead Form',
        description: 'Capture new business pipeline opportunities for FAST.',
        url: 'https://forms.gle/boVDwhmjKMWqKRCw6',
        icon: LinkIcon,
        category: 'FAST Operations'
    }
];

export function CompanyResources() {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredResources = resourcesData.filter(resource => 
        resource.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        resource.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const categories = ['Intake & Service', 'HR & Payroll', 'FAST Operations'] as const;

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 overflow-y-auto">
            {/* Header */}
            <div className="shrink-0 bg-zinc-900 border-b border-zinc-800 p-6 md:p-8">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 text-emerald-500 mb-2">
                            <LinkIcon className="w-5 h-5" />
                            <span className="text-sm font-bold tracking-wider uppercase">SAE Group Directory</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Company Resources</h1>
                        <p className="text-zinc-400 mt-2 max-w-2xl text-sm md:text-base">
                            A centralized hub for all operational forms, payroll portals, and internal directories. 
                            Click any card to securely access the requested system.
                        </p>
                    </div>

                    <div className="relative w-full md:w-72 mt-4 md:mt-0">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-zinc-500" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search forms and links..."
                            className="bg-zinc-950/50 border border-zinc-800 text-white text-sm rounded-lg focus:ring-accent focus:border-accent block w-full pl-10 p-2.5 transition-colors placeholder:text-zinc-600"
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
                {filteredResources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
                        <Search className="w-12 h-12 mb-4 opacity-20" />
                        <h3 className="text-lg font-bold text-white mb-2">No resources found</h3>
                        <p>We couldn't find any forms or links matching your search.</p>
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Clear Search
                        </button>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {categories.map(category => {
                            const categoryResources = filteredResources.filter(r => r.category === category);
                            
                            if (categoryResources.length === 0) return null;

                            return (
                                <div key={category} className="space-y-4">
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-zinc-800 pb-2">
                                        {category}
                                        <span className="bg-zinc-800 text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium ml-2">
                                            {categoryResources.length}
                                        </span>
                                    </h2>
                                    
                                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categoryResources.map(resource => (
                                            <a 
                                                key={resource.id}
                                                href={resource.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-emerald-500/50 hover:bg-zinc-800/80 transition-all cursor-pointer overflow-hidden shadow-sm"
                                            >
                                                {/* Hover Glow Effect */}
                                                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/40 group-hover:via-emerald-400 group-hover:to-emerald-500/40 transition-all duration-500" />
                                                
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="p-3 bg-zinc-950 rounded-lg text-emerald-500 group-hover:scale-110 group-hover:bg-emerald-500/10 transition-transform">
                                                        <resource.icon className="w-6 h-6" />
                                                    </div>
                                                    <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                                                </div>
                                                
                                                <h3 className="text-white font-bold text-lg mb-1 group-hover:text-emerald-400 transition-colors">
                                                    {resource.title}
                                                </h3>
                                                
                                                <p className="text-zinc-400 text-sm leading-relaxed mt-1 line-clamp-2">
                                                    {resource.description}
                                                </p>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
