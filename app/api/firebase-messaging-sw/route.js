export async function GET() {
  const swContent = `
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "New Notification", body: event.data.text() } };
  }

  const notification =
    payload.notification ||
    (payload.data && { title: payload.data.title, body: payload.data.body }) ||
    { title: "New Notification", body: "" };

  event.waitUntil(
    self.registration.showNotification(notification.title || "New Notification", {
      body: notification.body || "",
      icon: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});
`;

  return new Response(swContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store",
    },
  });
}
