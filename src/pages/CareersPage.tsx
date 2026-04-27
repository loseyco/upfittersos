import { useState } from 'react';
import { Briefcase, ArrowRight, CheckCircle, PlusCircle, Trash2, Building, ScanFace } from 'lucide-react';
import { submitApplication } from '../lib/careers';
import type { Experience, Reference } from '../lib/careers';
import toast from 'react-hot-toast';

export function CareersPage() {
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Form State
    const [personalInfo, setPersonalInfo] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: ''
    });
    const [position, setPosition] = useState('Upfitter Technician');
    const [websiteUrls, setWebsiteUrls] = useState('');
    const [coverLetter, setCoverLetter] = useState('');
    
    // Dynamic Arrays
    const [experience, setExperience] = useState<Experience[]>([]);
    const [references, setReferences] = useState<Reference[]>([]);

    const handleAddExperience = () => {
        setExperience([...experience, { company: '', title: '', startDate: '', endDate: '', description: '' }]);
    };

    const handleRemoveExperience = (index: number) => {
        setExperience(experience.filter((_, i) => i !== index));
    };

    const handleExperienceChange = (index: number, field: keyof Experience, value: string) => {
        const newExp = [...experience];
        newExp[index][field] = value;
        setExperience(newExp);
    };

    const handleAddReference = () => {
        setReferences([...references, { name: '', relationship: '', phone: '', email: '' }]);
    };

    const handleRemoveReference = (index: number) => {
        setReferences(references.filter((_, i) => i !== index));
    };

    const handleReferenceChange = (index: number, field: keyof Reference, value: string) => {
        const newRef = [...references];
        newRef[index][field] = value;
        setReferences(newRef);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Basic validation
        if (!personalInfo.firstName || !personalInfo.lastName || !personalInfo.email) {
            toast.error("Please fill out your name and email.");
            return;
        }

        setSubmitting(true);
        try {
            await submitApplication({
                personalInfo,
                position,
                websiteUrls,
                coverLetter,
                experience,
                references
            });
            setSubmitted(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            console.error(error);
            toast.error("Failed to submit application. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle className="w-16 h-16 text-emerald-500 mb-6" />
                <h1 className="text-3xl font-black text-white mb-4 tracking-tight">Application Received</h1>
                <p className="text-zinc-400 max-w-md mx-auto mb-8">
                    Thank you for your interest in joining our team. We've received your application and will be in touch if your qualifications match our current openings.
                </p>
                <button 
                    onClick={() => window.location.href = '/'}
                    className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 text-white font-bold py-3 px-6 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition"
                >
                    Return Home <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 selection:bg-accent/30 sm:py-12 md:py-24 font-sans">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
                
                <div className="mb-12 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-bold text-xs uppercase tracking-widest mb-6 shadow-glow">
                        <Briefcase className="w-4 h-4" /> Join Our Team
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">
                        Careers at <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">SAE Group</span>
                    </h1>
                    <p className="text-zinc-400 text-lg md:text-xl max-w-2xl leading-relaxed">
                        We are fundamentally changing how the upfitting industry works. Join us on our mission to build world-class operational tools and deliver exceptional results.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8 bg-zinc-900/40 p-6 md:p-10 rounded-3xl border border-zinc-800 backdrop-blur-md shadow-2xl">
                    
                    {/* Position Applied For */}
                    <div className="space-y-3">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                            <ScanFace className="w-5 h-5 text-indigo-400" /> Position
                        </h2>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Role Applying For <span className="text-red-500">*</span></label>
                            <select 
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                            >
                                <option value="Upfitter Technician">Upfitter Technician</option>
                                <option value="Operations Manager">Operations Manager</option>
                                <option value="Field Specialist">Field Specialist</option>
                                <option value="Sales / Account Manager">Sales / Account Manager</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>

                    <hr className="border-zinc-800/80" />

                    {/* Personal Information */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-white mb-4">Personal Information</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">First Name <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" required
                                    value={personalInfo.firstName} onChange={(e) => setPersonalInfo({ ...personalInfo, firstName: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Last Name <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" required
                                    value={personalInfo.lastName} onChange={(e) => setPersonalInfo({ ...personalInfo, lastName: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Email <span className="text-red-500">*</span></label>
                                <input 
                                    type="email" required
                                    value={personalInfo.email} onChange={(e) => setPersonalInfo({ ...personalInfo, email: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Phone</label>
                                <input 
                                    type="tel"
                                    value={personalInfo.phone} onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Current Address</label>
                                <input 
                                    type="text"
                                    value={personalInfo.address} onChange={(e) => setPersonalInfo({ ...personalInfo, address: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                                    placeholder="City, State, ZIP"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-zinc-800/80" />

                    {/* Links & Cover Letter */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-white mb-4">Background summary</h2>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Website / Social Media Links</label>
                            <input 
                                type="text"
                                placeholder="LinkedIn, Portfolio, etc."
                                value={websiteUrls} onChange={(e) => setWebsiteUrls(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Why SAE Group?</label>
                            <textarea 
                                rows={4}
                                placeholder="Tell us why you want to join our team, and attach a brief summary of your background if you do not have a public portfolio link."
                                value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 text-white py-3 px-4 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition resize-none"
                            ></textarea>
                        </div>
                    </div>

                    <hr className="border-zinc-800/80" />

                    {/* Experience Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Building className="w-5 h-5 text-indigo-400" /> Work Experience
                            </h2>
                            <button 
                                type="button" onClick={handleAddExperience}
                                className="flex items-center gap-2 text-sm font-bold text-accent hover:text-white transition-colors"
                            >
                                <PlusCircle className="w-4 h-4" /> Add Experience
                            </button>
                        </div>

                        {experience.length === 0 ? (
                            <div className="p-6 border border-dashed border-zinc-700/50 rounded-xl text-center">
                                <p className="text-zinc-500 text-sm">No experience added yet. Tell us about your past roles.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {experience.map((exp, index) => (
                                    <div key={index} className="relative p-5 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                                        <button 
                                            type="button" onClick={() => handleRemoveExperience(index)}
                                            className="absolute top-4 right-4 text-zinc-600 hover:text-red-500 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Company</label>
                                                <input type="text" value={exp.company} onChange={(e) => handleExperienceChange(index, 'company', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Job Title</label>
                                                <input type="text" value={exp.title} onChange={(e) => handleExperienceChange(index, 'title', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition text-sm" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Start Date</label>
                                                    <input type="text" placeholder="e.g. Jan 2020" value={exp.startDate} onChange={(e) => handleExperienceChange(index, 'startDate', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">End Date</label>
                                                    <input type="text" placeholder="e.g. Present" value={exp.endDate} onChange={(e) => handleExperienceChange(index, 'endDate', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition text-sm" />
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Description / Responsibilities</label>
                                                <textarea rows={2} value={exp.description} onChange={(e) => handleExperienceChange(index, 'description', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition text-sm resize-none"></textarea>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <hr className="border-zinc-800/80" />

                    {/* References Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-indigo-400" /> References
                            </h2>
                            <button 
                                type="button" onClick={handleAddReference}
                                className="flex items-center gap-2 text-sm font-bold text-accent hover:text-white transition-colors"
                            >
                                <PlusCircle className="w-4 h-4" /> Add Reference
                            </button>
                        </div>

                        {references.length === 0 ? (
                            <div className="p-6 border border-dashed border-zinc-700/50 rounded-xl text-center">
                                <p className="text-zinc-500 text-sm">No references added. (Optional but recommended)</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {references.map((ref, index) => (
                                    <div key={index} className="relative p-5 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                                        <button 
                                            type="button" onClick={() => handleRemoveReference(index)}
                                            className="absolute top-4 right-4 text-zinc-600 hover:text-red-500 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="space-y-3 mt-2 pr-6">
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Name</label>
                                                <input type="text" value={ref.name} onChange={(e) => handleReferenceChange(index, 'name', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent transition text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Relationship</label>
                                                <input type="text" placeholder="e.g. Former Manager" value={ref.relationship} onChange={(e) => handleReferenceChange(index, 'relationship', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent transition text-sm" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Phone</label>
                                                    <input type="tel" value={ref.phone} onChange={(e) => handleReferenceChange(index, 'phone', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent transition text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Email</label>
                                                    <input type="email" value={ref.email} onChange={(e) => handleReferenceChange(index, 'email', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white py-2 px-3 rounded-lg focus:outline-none focus:border-accent transition text-sm" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-8">
                        <button 
                            type="submit" 
                            disabled={submitting}
                            className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg transition-all ${
                                submitting 
                                ? 'bg-indigo-600/50 text-white/50 cursor-not-allowed' 
                                : 'bg-accent hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-1'
                            }`}
                        >
                            {submitting ? 'Submitting Application...' : 'Submit Application'} <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
