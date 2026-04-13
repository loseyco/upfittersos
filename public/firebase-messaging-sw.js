importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
const firebaseConfig = {
    apiKey: "AIzaSyCXCkX5ddcni6L-tYsFHsZIUowwQrvtBwM",
    authDomain: "saegroup-c6487.firebaseapp.com",
    projectId: "saegroup-c6487",
    storageBucket: "saegroup-c6487.firebasestorage.app",
    messagingSenderId: "366321240977",
    appId: "1:366321240977:web:1011248f3ce26ca6dfa830",
    measurementId: "G-YE512JER64"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw.js] Received background message ", payload);
    // Customize notification here
    const notificationTitle = payload.notification?.title || "New Message in UpfitterOS";
    const notificationOptions = {
        body: payload.notification?.body || "Unread message.",
        icon: "/vite.svg", // Fallback to your primary web logo
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
