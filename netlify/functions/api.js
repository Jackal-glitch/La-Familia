'use strict';
/* Point d'entrée Netlify : convertit la requête Netlify en requête Node classique, appelle la même logique que Vercel,
   puis renvoie la réponse au format Netlify. */
const { Readable } = require('stream');
const handle = require('../../api/[...slug].js');

exports.handler = async event => {
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;

  // Adresse d'origine (avec ou sans la redirection /api/* -> /.netlify/functions/api/*)
  let raw;
  try { raw = new URL(event.rawUrl || ('http://local' + (event.path || '/'))); } catch { raw = new URL('http://local/api'); }
  let pathname = raw.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '/api');
  if (pathname !== '/api' && !pathname.startsWith('/api/')) pathname = '/api' + (pathname.startsWith('/') ? '' : '/') + pathname;
  const search = raw.search || (event.rawQuery ? '?' + event.rawQuery : '');

  const buf = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0);
  const req = Readable.from(buf.length ? [buf] : []);
  req.method = event.httpMethod;
  req.url = pathname + search;
  req.headers = headers;
  req.socket = { remoteAddress: headers['x-nf-client-connection-ip'] || '' };

  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {}, headersSent: false,
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
      write() { /* non utilisé : les réponses sont envoyées en une fois */ },
      end(body) { resolve({ statusCode: this.statusCode, headers: this.headers, body: body == null ? '' : String(body) }); }
    };
    Promise.resolve(handle(req, res)).catch(e => { console.error(e); resolve({ statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Erreur interne du serveur' }) }); });
  });
};
