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

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('flows')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'No encontrado' })
    return res.json(data)
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
