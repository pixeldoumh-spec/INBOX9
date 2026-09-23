import { startServer } from './server.js';

startServer({ port: Number(process.env.PORT || 3000) });
