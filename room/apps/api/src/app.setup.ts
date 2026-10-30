import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export const DEFAULT_PORT = 3000;

export function configureApp(
  app: INestApplication,
  ports: { webPort: number; apiPort: number } = { webPort: 58241, apiPort: 58242 },
): INestApplication {
  for (const port of [ports.webPort, ports.apiPort])
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Local application ports must be integers from 1 to 65535.');
  app.use(
    ['/api/agents', '/api/speech', '/api/runs', '/api/providers', '/api/maestro'],
    (request: Request, response: Response, next: NextFunction) => {
      const hosts = new Set([
        `127.0.0.1:${ports.webPort}`,
        `localhost:${ports.webPort}`,
        `127.0.0.1:${ports.apiPort}`,
        `localhost:${ports.apiPort}`,
      ]);
      const origins = new Set([...hosts].map((host) => `http://${host}`));
      if (
        !hosts.has(request.headers.host ?? '') ||
        (request.headers.origin && !origins.has(request.headers.origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        response.status(403).json({ message: 'Room commands require the local room origin.' });
        return;
      }
      next();
    },
  );
  app.setGlobalPrefix('api');
  return app;
}

export function resolvePort(raw: string | undefined = process.env.PORT): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}": expected an integer from 1 to 65535`);
  }
  return port;
}
