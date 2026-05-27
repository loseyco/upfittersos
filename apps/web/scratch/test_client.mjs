import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCXCkX5ddcni6L-tYsFHsZIUowwQrvtBwM",
  authDomain: "saegroup-c6487.firebaseapp.com",
  projectId: "saegroup-c6487",
  storageBucket: "saegroup-c6487.firebasestorage.app",
  messagingSenderId: "366321240977",
  appId: "1:366321240977:web:03fa004c71741512dfa830"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Signing in...");
    const cred = await signInWithEmailAndPassword(auth, "monitor@saegrp.com", "ShopDisplay2026!");
    console.log("Signed in as", cred.user.uid);
    
    // Force token refresh to get latest claims
    const token = await cred.user.getIdTokenResult(true);
    console.log("Claims:", token.claims);

    const tenantId = "7jlg4IA2G6lvDJ0S5Vbp";
    
    console.log("Fetching business doc...");
    const bDoc = await getDoc(doc(db, "businesses", tenantId));
    console.log("Business exists:", bDoc.exists(), bDoc.exists() ? bDoc.data().name : "");

    console.log("Fetching zones...");
    const snap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
    console.log("Found zones:", snap.size);
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

test();
