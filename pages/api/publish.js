/**
 * POST /api/publish
 *
 * Punto de salida del editor de wlo-flow hacia el ecosistema.
 *
 * El editor dibuja la intencion (nodos conector) y este endpoint la ejecuta:
 * reenvia cada accion al conector entrante de WLO con la key de wlo-flow, y WLO
 * llama a la app remota (WLI) con su propio token. La key de WLO vive en este
 * servidor, nunca en el navegador.
 *
 * Mapeo de la intencion dibujada al contrato entrante de WLO:
 *   wli/emailer/create_campaign  ->  WLO emailer/send_campaign
 *
 * Variables requeridas en el servidor de wlo-flow:
 *   WLO_CONNECTOR_URL   https://wlo.vercel.app
 *   WLO_CONNECTOR_KEY   key creada en Configuracion -> Conectores con
 *                       target_app 'wlo' y scope emailer:relay_campaign
 */
const RELAY_MAP = {
  'emailer/create_campaign': { wloAction: 'emailer/send_campaign', requires: ['html', 'list_id'] },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' })

  const baseUrl = (process.env.WLO_CONNECTOR_URL || '').trim().replace(/\/+$/, '')
  const key = (process.env.WLO_CONNECTOR_KEY || '').trim()
  if (!baseUrl || !key) {
    return res.status(503).json({
      error: 'Falta configurar WLO_CONNECTOR_URL y WLO_CONNECTOR_KEY en el servidor de wlo-flow.',
    })
  }

  const { workspace_id, flow_id, title, connector_nodes } = req.body || {}
  if (!Array.isArray(connector_nodes) || connector_nodes.length === 0) {
    return res.status(422).json({ error: 'No hay acciones de conectores para publicar' })
  }

  const results = []
  for (const node of connector_nodes) {
    const map = RELAY_MAP[node.action]
    if (!map) {
      results.push({
        node_id: node.id,
        label: node.label,
        action: node.action,
        ok: false,
        status: 422,
        error: `Accion sin relevo en WLO: ${node.action}`,
      })
      continue
    }

    const config = node.config && typeof node.config === 'object' ? node.config : {}
    const faltan = map.requires.filter((k) => !String(config[k] || '').trim())
    if (faltan.length) {
      results.push({
        node_id: node.id,
        label: node.label,
        action: node.action,
        ok: false,
        status: 422,
        error: `Faltan campos obligatorios: ${faltan.join(', ')}`,
      })
      continue
    }

    const payload = {
      title: String(config.title || '').trim().slice(0, 160) || (title || 'Campana desde flujo').slice(0, 160),
      subject: String(config.subject || '').trim().slice(0, 300) || undefined,
      html: String(config.html),
      list_id: String(config.list_id).trim(),
      send: config.send === true,
      task_id: flow_id || undefined,
      task_title: title ? String(title).slice(0, 300) : undefined,
    }

    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), 15000)
    try {
      const r = await fetch(`${baseUrl}/api/connectors/call/${map.wloAction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'X-Pavific-App': 'wlo-flow',
        },
        body: JSON.stringify(payload),
        signal: control.signal,
      })
      const cuerpo = await r.json().catch(() => null)
      const data = cuerpo && typeof cuerpo === 'object' && cuerpo.ok ? (cuerpo.data ?? null) : null
      results.push({
        node_id: node.id,
        label: node.label,
        action: node.action,
        ok: r.ok && !!data,
        status: r.status,
        data,
        error: !r.ok || !data ? (cuerpo?.error || `Fallo la llamada a WLO (${r.status})`) : null,
      })
    } catch (e) {
      results.push({
        node_id: node.id,
        label: node.label,
        action: node.action,
        ok: false,
        status: 502,
        error: e.name === 'AbortError' ? 'WLO no respondio a tiempo.' : 'No se pudo contactar a WLO.',
      })
    } finally {
      clearTimeout(reloj)
    }
  }

  const todosOk = results.every((r) => r.ok)
  return res.status(todosOk ? 200 : 207).json({ results })
}
