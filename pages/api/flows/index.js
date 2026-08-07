import { createClient } from '@supabase/supabase-js'

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const workspaceId = req.query.workspace_id || 'demo'

  if (req.method === 'GET') {
    const { data, error } = await supabase()
      .from('flows')
      .select('id, title, nodes, edges, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data || [])
  }

  if (req.method === 'POST') {
    const { title } = req.body || {}
    const id = 'flow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    const flow = { id, workspace_id: workspaceId, title: title || 'Nuevo flujo', nodes: [], edges: [], shares: [] }
    const { error } = await supabase().from('flows').insert(flow)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(flow)
  }
}
