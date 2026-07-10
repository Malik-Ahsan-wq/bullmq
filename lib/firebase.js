import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

/**
 * Request notification permission, register SW, generate FCM token.
 * Returns null if permission denied or unsupported.
 */
export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const registration = await navigator.serviceWorker.register(
      "/api/firebase-messaging-sw",
      { scope: "/" }
    );

    // Wait for the SW to be active before requesting the token
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (err) {
    console.error("FCM token error:", err);
    return null;
  }
}

/**
 * Listen for foreground messages and call handler(payload).
 */
export function onForegroundMessage(handler) {
  if (typeof window === "undefined") return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, handler);
}
