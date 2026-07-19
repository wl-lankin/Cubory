// Paddle-Client-Konfiguration (öffentlich - kein Geheimnis).
// Client-side Token aus dem Paddle-Dashboard: Developer Tools › Authentication
// › Client-side tokens. Sandbox-Token beginnen mit "test_", Live mit "live_".
window.CUBORY_PADDLE = {
  token: '',              // z. B. 'live_abc123…'
  environment: 'production', // 'sandbox' während der Tests
};
