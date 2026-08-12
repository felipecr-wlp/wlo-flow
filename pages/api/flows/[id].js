import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id required' })

  const supabase = getSupabase()

  const { data: flow, error } = await supabase
    .from('flows')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!flow) return res.status(404).json({ error: 'No encontrado' })

  // Quien pide: WLO manda user_id (profile_id) y user_name. El dueno se guardo
  // con el profile_id al crear el flujo; el nombre respalda flujos viejos.
  const uid = (req.query.user_id || '').trim()
  const uname = (req.query.user_name || '').trim()

  // Modo demo abierto para probar. En un workspace real, privado: el dueno
  // puede todo, un compartido solo ver. Si el embed no trae identidad, se
  // degrada a abierto igual que la lista: sin saber quien abre no se puede
  // exigir propiedad.
  const demo = flow.workspace_id === 'demo'
  const sinIdentidad = !uid && !uname
  const esDueno = demo || sinIdentidad ||
    (!!uid && flow.owner === uid) ||
    (!!uname && flow.owner === uname)
  const esCompartido = demo ||
    (!!uid && Array.isArray(flow.shares) && flow.shares.some(s => s && s.profile_id === uid)) ||
    (!!uname && Array.isArray(flow.shares) && flow.shares.some(s => s && s.profile_id === uname))

  if (!demo && !esDueno && !esCompartido) {
    return res.status(403).json({ error: 'No tienes acceso a este flujo' })
  }

  if (req.method === 'GET') {
    return res.json(flow)
  }

  // Editar y borrar son del dueno. Un compartido lee nada mas.
  if (!esDueno) {
    return res.status(403).json({ error: 'Solo el dueno puede modificar este flujo' })
  }

  if (req.method === 'PATCH') {
    const patch = {}
    if (req.body.title !== undefined) patch.title = req.body.title
    if (req.body.description !== undefined) patch.description = req.body.description
    if (req.body.nodes !== undefined) patch.nodes = req.body.nodes
    if (req.body.edges !== undefined) patch.edges = req.body.edges
    if (req.body.shares !== undefined) patch.shares = req.body.shares
    patch.updated_at = new Date().toISOString()

    const { error } = await supabase.from('flows').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('flows').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }
}
