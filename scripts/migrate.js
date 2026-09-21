import { migrate } from '../api/_lib/db-migrate.js';
migrate().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
