# INBOX9 Frontend

Independent React + TypeScript frontend for INBOX9.

The frontend is intentionally separate from the existing Node/API implementation.

## Development

Backend:
  npm install
  npm start

Frontend:
  cd frontend
  npm install
  npm run dev

Vite proxies /api requests to http://localhost:4173.

## Current phase

Phase 1 foundation only. The route and API boundaries exist, but the final visual launcher is not implemented yet.

## Planned core flow

Apps
  -> Service
  -> Get Number
  -> Active / OTP
