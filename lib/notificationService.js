const { messaging } = require("./firebase-admin");
const { createLogger } = require("./logger");

const log = createLogger("NotificationService");

const INVALID_TOKEN_CODES = [
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
];

/**
 * Send a FCM push notification to a single token.
 * Returns true on success, false if token is invalid/expired.
 * Throws on unexpected errors.
 */
async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) {
    log.warn("No FCM token — skipping push notification");
    return false;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data,
    webpush: {
      notification: { title, body, icon: "/favicon.ico" },
    },
  };

  try {
    const messageId = await messaging().send(message);
    log.info("Push notification sent", { messageId, title });
    return true;
  } catch (err) {
    if (INVALID_TOKEN_CODES.includes(err.code)) {
      log.warn("FCM token invalid/expired", { code: err.code });
      return false;
    }
    log.error("Failed to send push notification", { error: err.message, code: err.code });
    throw err;
  }
}

module.exports = { sendPushNotification };
