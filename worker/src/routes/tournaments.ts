// Tournaments endpoint. Public — no auth.

import { Hono } from 'hono';
import type { Env } from '../index';
import { tournamentsWithStatus } from '../tournaments';

export const tournamentsRoute = new Hono<{ Bindings: Env }>();

tournamentsRoute.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ tournaments: tournamentsWithStatus() });
});
