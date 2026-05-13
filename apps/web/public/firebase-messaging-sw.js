importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCXCkX5ddcni6L-tYsFHsZIUowwQrvtBwM",
  authDomain: "saegroup-c6487.firebaseapp.com",
  projectId: "saegroup-c6487",
  storageBucket: "saegroup-c6487.firebasestorage.app",
  messagingSenderId: "366321240977",
  appId: "1:366321240977:web:03fa004c71741512dfa830",
  measurementId: "G-HRTHWG1J5N"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'New UpfittersOS Alert';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/vite.svg',
    badge: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
