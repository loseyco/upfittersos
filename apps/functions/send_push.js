const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'saegroup-c6487'
});

async function run() {
    const token = 'dbNeSXJ_4VscZSjMAgC7qV:APA91bEClaLQrppWij91CBCXi-or1HLGJJjxFiMyq74cgws5AHpAMvlPRtL-xuqhnvYO2iAsN42ek7ifjcgOT5bIJCyzL4wLySCy_iuNy5bMInOXTOcCZHw';
    
    const message = {
      notification: {
        title: 'UpfittersOS Test',
        body: 'Boom! Push notifications are working perfectly.'
      },
      token: token
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}
run().catch(console.error);
