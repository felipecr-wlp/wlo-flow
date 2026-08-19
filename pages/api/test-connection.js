/**
 * POST /api/test-connection
 *
 * Prueba de conexion de un nodo REST desde el SERVIDOR. El navegador no puede
 * hacer fetch directo a endpoints externos sin CORS, y el error "Failed to
 * fetch" no dice nada. Aqui el fetch se hace server-side, sin restriccion CORS,
 * y se devuelve el resultado real con el detalle del error.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' })

  const { url, method, headers, body } = req.body || {}
  const endpoint = String(url || '').trim()
  if (!/^https?:\/\//i.test(endpoint)) {
    return res.status(422).json({ ok: false, error: 'Falta la URL del endpoint' })
  }

  const metodo = String(method || 'POST').trim().toUpperCase()
  const cabeceras = {}
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) cabeceras[k] = String(v ?? '')
  }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 20000)

  try {
    const opts = {
      method: metodo,
      headers: cabeceras,
      signal: control.signal,
      redirect: 'manual',
    }
    if (metodo !== 'GET' && metodo !== 'HEAD') opts.body = JSON.stringify(body ?? {})

    const r = await fetch(endpoint, opts)
    const texto = await r.text()
    let cuerpo = null
    try { cuerpo = JSON.parse(texto) } catch { cuerpo = texto }

    const resultado = {
      ok: r.ok,
      status: r.status,
      statusText: r.statusText,
      data: cuerpo,
      headers: Object.fromEntries(r.headers.entries()),
    }
    return res.status(200).json(resultado)
  } catch (e) {
    return res.status(200).json({
      ok: false,
      status: 0,
      error: e.name === 'AbortError'
        ? 'El endpoint no respondio en 20 segundos.'
        : (e.cause?.code === 'ENOTFOUND'
          ? 'No se pudo resolver el dominio (DNS). Revisa la URL.'
          : (e.cause?.code === 'ECONNREFUSED'
            ? 'El servidor rechazo la conexion.'
            : `No se pudo conectar: ${e.message}`)),
    })
  } finally {
    clearTimeout(reloj)
  }
}
