import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  let supabase
  try { supabase = getSupabase() }
  catch (e) { return res.status(500).json({ error: e.message }) }

  const workspaceId = req.query.workspace_id || 'demo'

  // Identidad del usuario que abre la herramienta. WLO la manda como user_id
  // (profile_id) o user_name. La usa el servidor para decidir que flujos ve:
  // los propios mas los compartidos con el.
  const identidad = (req.query.user_id || '').trim() || (req.query.user_name || '').trim()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('flows')
      .select('id, title, nodes, edges, updated_at, owner, shares')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error) return res.status(500).json({ error: error.message })
    let lista = data || []
    // Modo demo (sin WLO) queda abierto para probar el editor. En un workspace
    // real, privado: solo el dueno y los que tiene en shares.
    if (workspaceId !== 'demo') {
      if (!identidad) {
        lista = []
      } else {
        lista = lista.filter(f =>
          f.owner === identidad ||
          (Array.isArray(f.shares) && f.shares.some(s => s && s.profile_id === identidad))
        )
      }
    }
    return res.json(lista)
  }

  if (req.method === 'POST') {
    const { title } = req.body || {}
    const id = 'flow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    const flow = {
      id,
      workspace_id: workspaceId,
      title: title || 'Nuevo flujo',
      nodes: [],
      edges: [],
      shares: [],
      owner: workspaceId === 'demo' ? '' : identidad,
    }
    const { error } = await supabase.from('flows').insert(flow)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(flow)
  }
}
