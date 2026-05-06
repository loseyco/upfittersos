import { db } from './lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

async function checkSync() {
  const tenantId = '7Jlg4lA2G6lvDJ0S5Vbp'; // From screenshot URL
  const snap = await getDoc(doc(db, 'businesses', tenantId));
  if (snap.exists()) {
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("No business found");
  }
}

checkSync();
