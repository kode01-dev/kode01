self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' && payload.title
    ? payload.title
    : 'KODE01';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: typeof payload.icon === 'string' ? payload.icon : '/logo.png',
    badge: '/favicon.png',
    data: {
      notificationId: typeof payload.notificationId === 'string' ? payload.notificationId : null,
      url: typeof payload.url === 'string' ? payload.url : '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = self.location.origin;
  }

  event.waitUntil((async () => {
    const notificationId = event.notification.data?.notificationId;
    if (notificationId) {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
        credentials: 'include',
      }).catch(() => null);
    }

    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === targetUrl.origin) {
        await client.focus();
        return client.navigate(targetUrl.href);
      }
    }

    return clients.openWindow(targetUrl.href);
  })());
});
