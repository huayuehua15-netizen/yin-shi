import 'dotenv/config';
import { createApp } from './server/app';
import { APP_VERSION } from './server/config';

const PORT = Number(process.env.PORT || 3000);

async function main(): Promise<void> {
  const app = await createApp();

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.info(`Cadence v${APP_VERSION} listening on http://0.0.0.0:${PORT}`);
  });

  // Drain in-flight requests on container stop instead of dropping connections.
  const shutdown = (signal: NodeJS.Signals) => {
    console.info(`${signal} received — closing the HTTP server.`);
    httpServer.close((error) => {
      if (error) {
        console.error('Failed to close the HTTP server cleanly:', error);
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
