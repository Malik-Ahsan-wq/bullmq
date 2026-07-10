const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = { messaging: () => getMessaging(getApp()) };
