/**
 * POST /api/publish
 *
 * Punto de salida del editor de wlo-flow.
 *
 * Solo los nodos REST (app === 'rest') se envian. Los nodos WLI (crear
 * campana, enrolar, listar secuencias) son plantillas: se usan para armar
 * contenido y sus campos se pueden mapear a un nodo REST, pero no se envian
 * directo a ningun proveedor.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' })

  const { connector_nodes } = req.body || {}
  if (!Array.isArray(connector_nodes) || connector_nodes.length === 0) {
    return res.status(422).json({ error: 'No hay acciones de conectores para publicar' })
  }

  const results = []
  for (const node of connector_nodes) {
    // Los nodos WLI son plantillas: no se envian.
    if (node.app !== 'rest') {
      continue
    }

    const config = node.config && typeof node.config === 'object' ? node.config : {}
    const url = String(config.url || '').trim()
    const method = String(config.method || 'POST').trim().toUpperCase()
    // Body tipado: cada campo puede ser texto, numero, booleano o array.
    const payload = {}
    for (const b of (Array.isArray(config.body) ? config.body : [])) {
      if (!b || !b.key || !String(b.key).trim()) continue
      const k = String(b.key).trim()
      const raw = b.value ?? ''
      if (b.type === 'number') payload[k] = Number(raw) || 0
      else if (b.type === 'boolean') payload[k] = raw === true || raw === 'true' || raw === '1'
      else if (b.type === 'array') {
        const t = String(raw).trim()
        if (t.startsWith('[')) { try { payload[k] = JSON.parse(t) } catch { payload[k] = t.split(',').map(x => x.trim()) } }
        else payload[k] = t.split(',').map(x => x.trim()).filter(Boolean)
      } else payload[k] = raw
    }
    // Headers configurables + autenticacion.
    const headers = { 'Content-Type': 'application/json' }
    const authType = config.auth_type || 'none'
    if (authType === 'bearer' && config.auth_token) headers['Authorization'] = `Bearer ${config.auth_token}`
    else if (authType === 'api_key' && config.auth_key_name) headers[config.auth_key_name] = config.auth_key_value || ''
    else if (authType === 'basic' && (config.auth_user || config.auth_pass)) headers['Authorization'] = 'Basic ' + Buffer.from(`${config.auth_user || ''}:${config.auth_pass || ''}`).toString('base64')
    for (const h of (Array.isArray(config.headers) ? config.headers : [])) {
      if (h && h.key && String(h.key).trim()) headers[String(h.key).trim()] = h.value ?? ''
    }
    if (!/^https?:\/\//i.test(url)) {
      results.push({ node_id: node.id, label: node.label, action: node.action, ok: false, status: 422, error: 'Falta la URL del endpoint' })
      continue
    }
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), 15000)
    try {
      const opts = {
        method,
        headers,
        signal: control.signal,
        redirect: 'manual',
      }
      if (method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(payload)
      const r = await fetch(url, opts)
      const cuerpo = await r.json().catch(() => null)
      results.push({
        node_id: node.id,
        label: node.label,
        action: node.action,
        ok: r.ok,
        status: r.status,
        data: cuerpo,
        error: r.ok ? null : (cuerpo?.error || `Fallo la llamada REST (${r.status})`),
      })
    } catch (e) {
      results.push({ node_id: node.id, label: node.label, action: node.action, ok: false, status: 502, error: e.name === 'AbortError' ? 'El endpoint no respondio a tiempo.' : 'No se pudo contactar el endpoint REST.' })
    } finally {
      clearTimeout(reloj)
    }
  }

  const todosOk = results.every((r) => r.ok)
  return res.status(todosOk ? 200 : 207).json({ results })
}
