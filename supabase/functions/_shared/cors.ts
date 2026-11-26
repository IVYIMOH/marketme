// Bearer-token verification and database policies also apply to non-browser clients.
export function responsesFor(req: Request) {
  const origin = req.headers.get('Origin');
  const configured = Deno.env.get('APP_ORIGINS') ?? Deno.env.get('SITE_URL')
    ?? 'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001';
  const allowed = origin === null || configured.split(',').some(value => value.trim() === origin);
  const corsHeaders = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  function jsonResponse(body: unknown, status = 200) {
    return Response.json(body, { status, headers: corsHeaders });
  }
  return { allowed, corsHeaders, jsonResponse };
}
