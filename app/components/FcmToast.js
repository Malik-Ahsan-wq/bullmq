"use client";

import { useState, useEffect, useCallback } from "react";

async function initFcm(token) {
  try {
    const { requestNotificationPermission, onForegroundMessage } = await import("../../lib/firebase");

    const fcmToken = await requestNotificationPermission();
    if (!fcmToken) return;

    await fetch("/api/fcm/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fcmToken }),
    });

    onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        window.dispatchEvent(new CustomEvent("fcm-toast", { detail: { title, body: body || "" } }));
      }
    });

    window.dispatchEvent(
      new CustomEvent("fcm-toast", {
        detail: {
          title: "Notifications Active",
          body: "You will receive real-time push notifications.",
        },
      })
    );
  } catch (err) {
    console.warn("FCM init failed (non-critical):", err.message);
  }
}

export default function FcmToast() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const { title, body } = e.detail;
      const id = Date.now();
      setToasts((prev) => [...prev, { id, title, body, exiting: false }]);
      setTimeout(() => dismiss(id), 5000);
    };
    window.addEventListener("fcm-toast", handler);
    return () => window.removeEventListener("fcm-toast", handler);
  }, [dismiss]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    // Defer Firebase init until browser is idle — don't block page startup
    const id = requestIdleCallback
      ? requestIdleCallback(() => initFcm(token), { timeout: 3000 })
      : setTimeout(() => initFcm(token), 2000);
    return () => {
      if (requestIdleCallback) cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.exiting ? " toast-exit" : ""}`}>
          <div className="toast-icon">🔔</div>
          <div className="toast-body">
            <p className="toast-title">{t.title}</p>
            {t.body && <p className="toast-message">{t.body}</p>}
          </div>
          <button
            className="toast-close"
            onClick={() => dismiss(t.id)}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
