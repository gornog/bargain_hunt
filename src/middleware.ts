import type { MiddlewareHandler } from 'astro';

const unauthorized = () => new Response('Editor sign-in required.', {
  status: 401,
  headers: { 'WWW-Authenticate': 'Basic realm="Bargain Hunt editor", charset="UTF-8"' },
});

export const onRequest: MiddlewareHandler = async (context, next) => {
  const protectedPath = context.url.pathname.startsWith('/log') || context.url.pathname === '/api/bbc-refresh';
  if (!protectedPath) return next();

  const password = import.meta.env.SITE_EDITOR_PASSWORD;
  if (!password) {
    if (import.meta.env.PROD) return new Response('Editor access is not configured.', { status: 503 });
    return next();
  }

  const auth = context.request.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return unauthorized();
  try {
    const [username, suppliedPassword] = atob(auth.slice(6)).split(':', 2);
    const expectedUser = import.meta.env.SITE_EDITOR_USERNAME || 'editor';
    if (username !== expectedUser || suppliedPassword !== password) return unauthorized();
  } catch {
    return unauthorized();
  }
  return next();
};
