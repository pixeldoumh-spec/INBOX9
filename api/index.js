import router from './_router.js';

function forwardedUrl(req) {
  let path = req.query?.__path;
  if (Array.isArray(path)) path = path.join('/');
  if (typeof path === 'string' && path.length) {
    return '/api/' + path.replace(/^\/+/, '');
  }
  return req.url || '/api';
}

export default async function handler(req, res) {
  const routedReq = Object.create(req);
  routedReq.url = forwardedUrl(req);
  routedReq.query = { ...(req.query || {}) };
  delete routedReq.query.__path;
  return router(routedReq, res);
}
