import { db } from './firebase';
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';

export interface Experience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Reference {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface CareerApplication {
  id?: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
  };
  position: string;
  websiteUrls: string; // Comma separated or multi-line
  coverLetter: string;
  experience: Experience[];
  references: Reference[];
  status: 'Pending' | 'Reviewed' | 'Interviewing' | 'Rejected' | 'Hired';
  submittedAt?: Timestamp;
}

const COLLECTION_NAME = 'career_applications';

export async function submitApplication(appData: Omit<CareerApplication, 'id' | 'status' | 'submittedAt'>) {
    const appsRef = collection(db, COLLECTION_NAME);
    return await addDoc(appsRef, {
        ...appData,
        status: 'Pending',
        submittedAt: serverTimestamp()
    });
}

export async function getApplications(): Promise<CareerApplication[]> {
    const appsRef = collection(db, COLLECTION_NAME);
    const q = query(appsRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
    } as CareerApplication));
}

export async function updateApplicationStatus(id: string, newStatus: CareerApplication['status']) {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, { status: newStatus });
}
