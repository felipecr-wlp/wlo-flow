import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react'
import Head from 'next/head'
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  addEdge, BackgroundVariant, Handle, Position, MarkerType, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Save, Trash2, Type, Code, Link as LinkIcon, FileText, Pencil,
  Square, Circle, Minus, Grid3X3, ChevronDown, ChevronUp, Copy, Undo2, Redo2,
  Lock, Unlock, ArrowUp, ArrowDown, Maximize, Download, Upload, Eye, Edit3,
  X, HelpCircle, Share2, Plus, PenTool, Layout, Hand, Search, Check,
  AlertTriangle, RefreshCw, Plug, Send, UserPlus, List as ListIcon, Play,
} from 'lucide-react'

const CONTENT_TYPES = ['text', 'html', 'url', 'document']
const SHAPES = ['rect', 'circle', 'line', 'grid', 'text']
const SN = { rect: 'Rect', circle: 'Circ', line: 'Linea', grid: 'Grid', text: 'Texto' }
const NI = { text: <Type size={14} />, html: <Code size={14} />, url: <LinkIcon size={14} />, document: <FileText size={14} /> }
const SI = { rect: <Square size={14} />, circle: <Circle size={14} />, line: <Minus size={14} />, grid: <Grid3X3 size={14} />, text: <Type size={14} /> }

/**
 * Acciones de comunicacion con terceros que este editor puede dibujar.
 *
 * Cada entrada corresponde a una accion del contrato de conectores del ecosistema
 * (las mismas que usa el motor de automatizaciones de WLO). Este editor NO ejecuta
 * la accion: dibuja la intencion con su configuracion. Cuando el flujo corra en el
 * motor, el nodo llama a la app remota con estos datos.
 */
const CONNECTOR_ACTIONS = [
  {
    app: 'wli', action: 'emailer/create_campaign', label: 'Crear campaña', icon: <Send size={14} />,
    fields: [
      { key: 'title', label: 'Nombre de la campaña' },
      { key: 'subject', label: 'Asunto del correo' },
      { key: 'html', label: 'HTML de la campaña' },
      { key: 'list_id', label: 'ID de la base (lista) (opcional)' },
      { key: 'send', label: 'Enviar de inmediato (si no, queda en borrador)', type: 'check' },
    ],
  },
  {
    app: 'wli', action: 'emailer/enroll_contact', label: 'Enrolar contacto', icon: <UserPlus size={14} />,
    fields: [
      { key: 'sequence_id', label: 'ID de secuencia' },
      { key: 'email', label: 'Email o {email_tarea}' },
    ],
  },
  {
    app: 'wli', action: 'emailer/list_sequences', label: 'Listar secuencias', icon: <ListIcon size={14} />,
    fields: [
      { key: 'solo_activas', label: 'Solo activas', type: 'check' },
    ],
  },
]
const CONNECTOR_APPS = [...new Set(CONNECTOR_ACTIONS.map(a => a.app))]

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 0) return 'ahora'
  if (diff < 60000) return 'ahora mismo'
  if (diff < 3600000) return `${Math.round(diff / 60000)}m`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const days = Math.round((today - day) / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function CustomNode({ data, selected }) {
  const ct = data?.content?.contentType || 'text'
  const color = data?.color || ''
  const borderColor = selected ? '#3b82f6' : color || '#e2e8f0'
  return (
    <div className="bg-white border-2 rounded-lg px-3 py-2 shadow-sm min-w-[160px] max-w-[240px]" style={{ borderColor, opacity: data?.locked ? 0.7 : 1, ...(selected ? { boxShadow: '0 0 0 2px rgba(59,130,246,.35)' } : {}) }}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center gap-2">
        <span className="text-blue-500 shrink-0">{NI[ct]}</span>
        <span className="text-xs font-semibold truncate flex-1">{data?.label || 'Nodo'}</span>
        {data?.locked && <Lock size={12} className="text-amber-500 shrink-0" />}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
}

function ShapeNode({ data, selected }) {
  const s = data?.shape || 'rect'; const w = data?.width || 160; const h = data?.height || 120
  const fill = data?.fill || '#f1f5f9'; const stroke = data?.stroke || '#64748b'
  const label = data?.label || ''; const rows = data?.rows || 3; const cols = data?.cols || 3
  const sel = selected ? { outline: '2px solid #3b82f6', outlineOffset: '2px' } : {}
  const L = label ? <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fill="#334155" fontSize={13} fontWeight={500} fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>{label}</text> : null
  return <div style={{ width: w, height: h, ...sel, opacity: data?.locked ? 0.6 : 1, position: 'relative' }}>
    {s === 'circle' && <svg width={w} height={h}><ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} fill={fill} stroke={stroke} strokeWidth={2} />{L}</svg>}
    {s === 'line' && <svg width={w} height={h}><line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={3} /><polygon points={`${w - 8},${h / 2 - 5} ${w},${h / 2} ${w - 8},${h / 2 + 5}`} fill={stroke} />{L}</svg>}
    {s === 'grid' && (() => { const cw = w / cols, rh = h / rows; const ls = []; for (let i = 1; i < cols; i++) ls.push(<line key={`v${i}`} x1={i * cw} y1={0} x2={i * cw} y2={h} stroke={stroke} strokeWidth={1} strokeDasharray="4 2" />); for (let i = 1; i < rows; i++) ls.push(<line key={`h${i}`} x1={0} y1={i * rh} x2={w} y2={i * rh} stroke={stroke} strokeWidth={1} strokeDasharray="4 2" />); return <svg width={w} height={h}><rect x={0} y={0} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={2} rx={2} />{ls}{L}</svg> })()}
    {s === 'text' && <svg width={w} height={h}><text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fill={stroke} fontSize={14} fontWeight={500} fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>{label || 'Texto'}</text></svg>}
    {!['circle', 'line', 'grid', 'text'].includes(s) && <svg width={w} height={h}><rect x={0} y={0} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={2} rx={6} />{L}</svg>}
  </div>
}

function ConnectorNode({ data, selected }) {
  const def = CONNECTOR_ACTIONS.find(a => a.app === data?.app && a.action === data?.action)
  const cfg = (data?.config && typeof data.config === 'object') ? data.config : {}
  const label = data?.label || def?.label || 'Acción de terceros'
  const borderColor = selected ? '#3b82f6' : '#8b5cf6'
  const fields = def?.fields || []
  return (
    <div className="bg-white border-2 rounded-lg px-3 py-2 shadow-sm min-w-[200px] max-w-[280px]" style={{ borderColor, opacity: data?.locked ? 0.7 : 1, ...(selected ? { boxShadow: '0 0 0 2px rgba(139,92,246,.35)' } : {}) }}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center gap-2">
        <span className="text-violet-500">{def?.icon || <Plug size={14} />}</span>
        <span className="text-xs font-semibold truncate flex-1">{label}</span>
        {data?.locked && <Lock size={12} className="text-amber-500" />}
      </div>
      <div className="text-[10px] text-gray-400 truncate mt-0.5">{(data?.app || '').toUpperCase()} · {data?.action || ''}</div>
      {fields.filter(f => cfg[f.key] !== undefined && cfg[f.key] !== null && String(cfg[f.key]).trim() !== '').length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {fields.filter(f => cfg[f.key] !== undefined && cfg[f.key] !== null && String(cfg[f.key]).trim() !== '').map(f => (
            <div key={f.key} className="text-[10px] text-gray-500 truncate"><span className="text-gray-400">{f.label}:</span> {String(cfg[f.key])}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
}

const FLOWS_KEY = 'wlo_flows_index'
const FlowContext = createContext(null)

// API helpers. ident = { id, name }: el id es la identidad efectiva (el
// profile_id que manda WLO, o el id resuelto desde la lista de miembros), y el
// nombre sirve de respaldo para flujos viejos guardados con el nombre.
function api(wsId, path, ident) {
  const q = [`workspace_id=${encodeURIComponent(wsId)}`]
  if (ident && ident.id) q.push(`user_id=${encodeURIComponent(ident.id)}`)
  if (ident && ident.name) q.push(`user_name=${encodeURIComponent(ident.name)}`)
  return `/api/flows${path || ''}?${q.join('&')}`
}

function esDuenoDe(f, wsId, ident) {
  if (wsId === 'demo') return true
  // Sin ninguna identidad en el embed, el modo es abierto (igual que el API):
  // sin saber quien abre no hay propiedad que exigir.
  if (!ident || (!ident.id && !ident.name)) return true
  if (!f || !f.owner) return false
  if (ident.id && f.owner === ident.id) return true
  if (ident.name && f.owner === ident.name) return true
  return false
}

export default function FlowApp() {
  const [view, setView] = useState('list')
  const [flowId, setFlowId] = useState(null)
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const enmarcado = typeof window !== 'undefined' && window.top !== window

  const [wsId, setWsId] = useState('demo')
  const [instId, setInstId] = useState('')
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState('')
  const [membersList, setMembersList] = useState([])
  const [embedInfo, setEmbedInfo] = useState({})
  const flowParam = useRef(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setWsId(p.get('workspace_id') || 'demo')
    setInstId(p.get('install_id') || '')
    setUserName(p.get('user_name') || '')
    setUserId(p.get('user_id') || '')
    setUserRole(p.get('user_role') || '')
    flowParam.current = p.get('flow') || null
    try { const m = p.get('members'); if (m) setMembersList(JSON.parse(m)) } catch { }
    // Lo que llego en la URL del embed, para diagnosticar que manda WLO y en
    // que modo cae la herramienta. Se muestra como etiqueta en la UI.
    const raw = {}
    for (const k of ['workspace_id', 'workspace_slug', 'install_id', 'user_id', 'user_name', 'user_role', 'path', 'flow']) {
      const v = p.get(k)
      if (v) raw[k] = v
    }
    setEmbedInfo({ ...raw, enmarcado: typeof window !== 'undefined' && window.top !== window })
  }, [])

  // Identidad efectiva del usuario. Prioridad: el user_id (profile_id) que
  // manda WLO; si no lo manda (deploy viejo), se resuelve cruzando el nombre
  // con la lista de miembros del workspace que tambien manda WLO; y como ultimo
  // respaldo, el nombre. El id es el que se guarda como dueno y en shares, asi
  // compartir por perfil coincide con los flujos de cada uno.
  const ident = useMemo(() => {
    const nombre = userName || ''
    const yo = membersList.find(m => m && m.name && m.name === userName)
    return { id: userId || (yo && yo.id) || nombre, name: nombre }
  }, [userId, userName, membersList])

  // Modo efectivo: que puede hacer la herramienta segun lo que mando el embed.
  // demo abierto para probar, abierto sin sesion (WLO no mando identidad) y
  // privado cuando si la mando.
  const modo = wsId === 'demo' ? 'demo' : (!ident.id && !ident.name) ? 'abierto' : 'privado'

  const doLoadFlows = useCallback(async () => {
    try {
      const r = await fetch(api(wsId, '', ident))
      if (r.ok) {
        const data = await r.json()
        setFlows(Array.isArray(data) ? data : [])
      }
    } catch { }
    setLoading(false)
  }, [wsId, ident])

  useEffect(() => { doLoadFlows() }, [doLoadFlows])

  useEffect(() => {
    if (!loading && flowParam.current) {
      const id = flowParam.current
      flowParam.current = null
      openFlow(id)
    }
  }, [loading])

  useEffect(() => {
    if (!enmarcado) return
    const notify = () => window.parent.postMessage({ type: 'wlo-resize', height: document.body.scrollHeight + 40 }, '*')
    notify(); const ro = new ResizeObserver(notify); ro.observe(document.body); return () => ro.disconnect()
  }, [view])

  async function createFlow() {
    setCreating(true); setError(null)
    try {
      const r = await fetch(api(wsId, '', ident), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Nuevo flujo' }) })
      if (r.ok) { const f = await r.json(); setCreating(false); openFlow(f.id) }
      else { const e = await r.json().catch(() => ({})); setError('Error al crear: ' + (e.error || r.status)); setCreating(false) }
    } catch (err) { setError('Error de red: ' + err.message); setCreating(false) }
  }

  async function deleteFlow(id) {
    if (!confirm('Eliminar este flujo?')) return
    await fetch(api(wsId, `/${id}`, ident), { method: 'DELETE' })
    doLoadFlows()
  }

  async function renameFlow(id, title) {
    const t = (title || '').trim()
    if (!t) return
    const r = await fetch(api(wsId, `/${id}`, ident), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) })
    if (r.ok) doLoadFlows()
  }

  function openFlow(id) { setFlowId(id); setView('editor') }
  function backToList() { setFlowId(null); setView('list'); doLoadFlows() }

  return (
    <>
      <Head><title>Flows - WLO</title></Head>
      {view === 'list' ? (
        <ListView
          flows={flows} loading={loading} creating={creating} wsId={wsId} error={error}
          enmarcado={enmarcado} userName={userName} membersList={membersList} ident={ident}
          embedInfo={embedInfo} modo={modo}
          onCreate={createFlow} onDelete={deleteFlow} onOpen={openFlow} onRename={renameFlow}
        />
      ) : (
        <EditorView
          flowId={flowId} wsId={wsId} instId={instId} ident={ident}
          enmarcado={enmarcado} membersList={membersList} embedInfo={embedInfo} modo={modo}
          onBack={backToList}
        />
      )}
    </>
  )
}

// Descarga de JSON por enlace. Funciona standalone; dentro del iframe sandbox
// de WLO (sin allow-downloads) el navegador la bloquea, por eso el embed usa el
// modal con copiado como respaldo.
function downloadJson(text, filename) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function copyTextoLegacy(texto) {
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Copia al portapapeles con respaldo, para que funcione tambien dentro del
// iframe sandbox donde la Clipboard API puede estar bloqueada por policy.
function copyTexto(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto).catch(() => copyTextoLegacy(texto))
  }
  return Promise.resolve(copyTextoLegacy(texto))
}

// Etiqueta de diagnostico: muestra que mando el embed (WLO) y en que modo cae
// la herramienta. Sirve para saber con que datos se puede trabajar mientras WLO
// de produccion no mande la sesion.
function EmbedInfoLabel({ embedInfo, modo, membersList, wsId }) {
  const resumen = [
    embedInfo.enmarcado ? 'iframe' : 'standalone',
    `ws: ${embedInfo.workspace_id || embedInfo.workspace_slug || 'demo'}`,
    `user: ${embedInfo.user_name || 'sin user_name'}`,
    `id: ${embedInfo.user_id ? embedInfo.user_id.slice(0, 8) : '—'}`,
    `rol: ${embedInfo.user_role || '—'}`,
    `miembros: ${(membersList || []).length}`,
    `modo: ${modo}`,
  ].join(' · ')
  const explicacion = {
    demo: 'Demo abierto, todo editable, sin sesion',
    abierto: 'Abierto, sin sesion de WLO (no se puede exigir propiedad)',
    privado: 'Privado, solo tus flujos y los compartidos',
  }[modo] || modo
  return (
    <div style={{ padding: '6px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
      <div
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', fontSize: 10, color: '#475569', background: '#eef2f7', border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 8px', cursor: 'help' }}
        title={`Parametros recibidos del embed:\n${JSON.stringify(embedInfo, null, 2)}\n\n${explicacion}`}
      >
        <span style={{ fontWeight: 600, color: '#334155' }}>embed</span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resumen}</span>
      </div>
    </div>
  )
}

function ListView({ flows, loading, creating, wsId, error, enmarcado, userName, membersList, ident, embedInfo, modo, onCreate, onDelete, onOpen, onRename }) {
  const [q, setQ] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const filtered = (flows || []).filter(f => !q.trim() || (f.title || '').toLowerCase().includes(q.trim().toLowerCase()))

  function startRename(f) {
    setRenamingId(f.id)
    setRenameValue(f.title || '')
  }
  function commitRename() {
    if (renamingId) { onRename(renamingId, renameValue); setRenamingId(null) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Layout size={20} style={{ color: '#3b82f6' }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Flows</h1>
          <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>{filtered.length}</span>
          {wsId !== 'demo' && <span style={{ fontSize: 10, color: '#3b82f6', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>{userName || (enmarcado ? 'WLO' : 'standalone')}</span>}
        </div>
      </div>
      <EmbedInfoLabel embedInfo={embedInfo} modo={modo} membersList={membersList} wsId={wsId} />
      {!enmarcado && wsId === 'demo' && (
        <div style={{ padding: '14px 24px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 900 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>Instalar en WLO</div>
              <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
                Esta aplicacion esta lista para instalarse como herramienta externa en WLO. Copia estos datos en el formulario <strong>Publicar herramienta</strong> del Marketplace:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                {[
                  { label: 'URL base', value: typeof window !== 'undefined' ? window.location.origin : '' },
                  { label: 'Ruta embed', value: '/embed' },
                  { label: 'Tipo', value: 'Pantalla (embed)' },
                  { label: 'Permisos', value: 'Ninguno requerido' },
                ].map((item, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 12, color: '#1e40af', fontFamily: 'monospace' }}>{item.value}</code>
                      {(item.label === 'URL base' || item.label === 'Ruta embed') && (
                        <button onClick={() => { navigator.clipboard.writeText(item.value) }} style={{ padding: '2px 6px', fontSize: 10, border: '1px solid #bfdbfe', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#64748b' }}>Copiar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div style={{ margin: '12px 24px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
          {error}
        </div>
      )}
      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Cargando...</div> :
        (flows || []).length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
            <PenTool size={48} style={{ color: '#cbd5e1', marginBottom: 16 }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>No hay flujos</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>{wsId === 'demo' ? 'Modo demo. Crea tu primer flujo.' : 'Crea tu primer diagrama.'}</p>
            <button onClick={onCreate} disabled={creating} style={{ ...s.btnPrimary, opacity: creating ? 0.5 : 1 }}><Plus size={14} /> {creating ? 'Creando...' : 'Crear flujo'}</button>
          </div>
        ) : (
          <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar flujo..." style={{ width: '100%', height: 34, border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 10px 0 32px', fontSize: 13, outline: 'none', background: '#fff' }} />
              </div>
              <button onClick={onCreate} disabled={creating} style={{ ...s.btnPrimary, opacity: creating ? 0.5 : 1 }}><Plus size={14} /> {creating ? 'Creando...' : 'Nuevo flujo'}</button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                No hay flujos que coincidan con "{q}"
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {filtered.map(f => {
                  const esDueno = esDuenoDe(f, wsId, ident)
                  const ownerName = membersList.find(m => m.id === f.owner)?.name
                  return (
                  <div key={f.id} onClick={() => onOpen(f.id)} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, cursor: 'pointer', transition: 'box-shadow .15s', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {renamingId === f.id ? (
                          <input
                            autoFocus value={renameValue}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                            onBlur={commitRename}
                            style={{ width: '100%', fontSize: 14, fontWeight: 600, border: '1px solid #3b82f6', borderRadius: 6, padding: '4px 8px', outline: 'none' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title || 'Sin titulo'}</div>
                            {esDueno && <button title="Renombrar" onClick={e => { e.stopPropagation(); startRename(f) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}><Pencil size={12} /></button>}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{(f.nodes || []).length} nodos · {(f.edges || []).length} conexiones</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {f.updated_at && <span style={{ fontSize: 11, color: '#cbd5e1' }}>Editado {fmtDate(f.updated_at)}</span>}
                          {f.owner && (
                            esDueno
                              ? <span style={{ fontSize: 10, color: '#3b82f6', background: '#eff6ff', padding: '1px 8px', borderRadius: 99 }}>Tuyo</span>
                              : <span style={{ fontSize: 10, color: '#9333ea', background: '#f5f3ff', padding: '1px 8px', borderRadius: 99 }}>{ownerName || 'Compartido'}</span>
                          )}
                        </div>
                      </div>
                      {esDueno && <button title="Eliminar" onClick={e => { e.stopPropagation(); onDelete(f.id) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        )}
    </div>
  )
}

function EditorView({ flowId, wsId, instId, ident, enmarcado, membersList, embedInfo, modo, onBack }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loaded, setLoaded] = useState(false)
  const [topBarCollapsed, setTopBarCollapsed] = useState(false)
  const [toolCollapsed, setToolCollapsed] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportText, setExportText] = useState('')
  const [shares, setShares] = useState([])
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [nodeLabel, setNodeLabel] = useState(''); const [nodeContent, setNodeContent] = useState('')
  const [nodeSubtitle, setNodeSubtitle] = useState(''); const [nodeColor, setNodeColor] = useState('#3b82f6')
  const [nodeTags, setNodeTags] = useState(''); const [nodeLink, setNodeLink] = useState(''); const [nodeOwner, setNodeOwner] = useState('')
  const [nodeFields, setNodeFields] = useState([])
  const [nodeType, setNodeType] = useState('text'); const [previewHtml, setPreviewHtml] = useState(false)
  const [editingConnectorId, setEditingConnectorId] = useState(null)
  const [connApp, setConnApp] = useState('wli'); const [connAction, setConnAction] = useState('emailer/create_campaign')
  const [connLabel, setConnLabel] = useState(''); const [connConfig, setConnConfig] = useState({})
  const [connHtmlPreview, setConnHtmlPreview] = useState(false)
  const [editingShapeId, setEditingShapeId] = useState(null)
  const [shapeW, setShapeW] = useState(160); const [shapeH, setShapeH] = useState(120)
  const [shapeLabel, setShapeLabel] = useState(''); const [shapeFill, setShapeFill] = useState('#f1f5f9')
  const [shapeStroke, setShapeStroke] = useState('#64748b'); const [shapeType, setShapeType] = useState('rect')
  const [editingEdgeId, setEditingEdgeId] = useState(null)
  const [edgeLabel, setEdgeLabel] = useState(''); const [edgeColor, setEdgeColor] = useState('#64748b')
  const [edgeWidth, setEdgeWidth] = useState(2); const [edgeType, setEdgeType] = useState('default')
  const [ctxMenu, setCtxMenu] = useState(null); const [ctxEdgeMenu, setCtxEdgeMenu] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const [toast, setToast] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState(null)
  const [publishError, setPublishError] = useState(null)
  const reactFlowInstance = useRef(null)
  const history = useRef([]); const historyIdx = useRef(-1); const clipboard = useRef([])
  const saveTimer = useRef(null); const toastTimer = useRef(null)
  const nodesRef = useRef([])
  const saveStateRef = useRef(saveState)

  useEffect(() => { saveStateRef.current = saveState }, [saveState])
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!flowId) return
    fetch(api(wsId, `/${flowId}`, ident)).then(async r => {
      const f = await r.json().catch(() => null)
      if (r.ok && f && f.id) {
        setTitle(f.title || '')
        setDescription(f.description || '')
        setNodes(f.nodes || [])
        setEdges(f.edges || [])
        setShares(f.shares || [])
        // Solo lectura cuando el flujo no es del usuario y no estamos en demo:
        // un compartido lee pero no edita.
        setReadOnly(!esDuenoDe(f, wsId, ident))
        setLoadError(false)
      } else {
        setLoadError(true)
      }
      setLoaded(true)
    }).catch(() => { setLoadError(true); setLoaded(true) })
  }, [flowId, wsId, ident])

  function save(n, e) {
    if (readOnly) return
    setSaving(true)
    setSaveState('saving')
    const body = { title, description, nodes: n || nodes, edges: e || edges, shares }
    fetch(api(wsId, `/${flowId}`, ident), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); setSaveState('saved'); showToast('Cambios guardados') })
      .catch(() => { setSaveState('error'); showToast('Error al guardar. Revisa tu conexión.', 'error') })
      .finally(() => setSaving(false))
  }
  function autoSave(n, e) { setSaveState('dirty'); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => save(n, e), 800) }

  useEffect(() => {
    const onBefore = (e) => {
      if (saveStateRef.current === 'dirty' || saveStateRef.current === 'saving') {
        e.preventDefault(); e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [])

  const flowCtx = {
    updateField: (id, idx, field, val) => {
      setNodes(nds => nds.map(n => {
        if (n.id !== id) return n
        const fields = Array.isArray(n.data?.fields) ? n.data.fields.map(f => ({ ...f })) : []
        while (fields.length <= idx) fields.push({ key: '', value: '' })
        if (field === 'key') fields[idx].key = val; else fields[idx].value = val
        return { ...n, data: { ...n.data, fields } }
      }))
      autoSave()
    },
    addField: (id) => {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, fields: [...(Array.isArray(n.data?.fields) ? n.data.fields : []), { key: '', value: '' }] } } : n))
      autoSave()
    },
    removeField: (id, idx) => {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, fields: (Array.isArray(n.data?.fields) ? n.data.fields : []).filter((_, j) => j !== idx) } } : n))
      autoSave()
    },
  }

  function pushHistory(n, e) { const h = history.current; h.length = historyIdx.current + 1; h.push({ nodes: JSON.parse(JSON.stringify(n)), edges: JSON.parse(JSON.stringify(e)) }); if (h.length > 50) h.shift(); else historyIdx.current++ }
  function undo() { if (historyIdx.current <= 0) return; historyIdx.current--; const s = history.current[historyIdx.current]; setNodes(s.nodes); setEdges(s.edges); autoSave(s.nodes, s.edges) }
  function redo() { if (historyIdx.current >= history.current.length - 1) return; historyIdx.current++; const s = history.current[historyIdx.current]; setNodes(s.nodes); setEdges(s.edges); autoSave(s.nodes, s.edges) }
  function copySelected() { const sel = nodes.filter(n => n.selected); clipboard.current = sel.map(n => ({ ...n, id: `node-${Date.now()}` })); if (sel.length) showToast(`${sel.length} copiado(s)`) }
  function pasteSelected() { if (!clipboard.current.length) return; pushHistory(nodes, edges); const pasted = clipboard.current.map(n => ({ ...n, id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, position: { x: n.position.x + 40, y: n.position.y + 40 } })); setNodes(nds => [...nds, ...pasted]); autoSave() }
  const onConnect = useCallback((conn) => { pushHistory(nodes, edges); setEdges(eds => addEdge({ ...conn, style: { stroke: '#64748b', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' } }, eds)) }, [nodes, edges, setEdges])
  function deleteSelected() { const sel = nodes.filter(n => n.selected && !n.data?.locked); if (!sel.length) return; pushHistory(nodes, edges); const ids = new Set(sel.map(n => n.id)); const rest = nodes.filter(n => !ids.has(n.id)); setTimeout(() => { setNodes(rest); setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target))) }, 0) }
  const onNodesChangeSafe = useCallback((changes) => {
    if (readOnly) return
    onNodesChange(changes.filter(c => c.type !== 'position' || !nodesRef.current.find(n => n.id === c.id)?.data?.locked))
  }, [onNodesChange, readOnly])
  const onKeyDown = useCallback((e) => {
    if (readOnly) return
    if (e.altKey && e.key === 'm') { setAltHeld(h => !h); e.preventDefault(); return } if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (e.key === 'Delete') deleteSelected(); else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() } else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo() } else if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copySelected() } else if (e.ctrlKey && e.key === 'v') { e.preventDefault(); pasteSelected() } }, [nodes, edges, readOnly])
  const onDragOver = useCallback(e => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [readOnly])
  const onDrop = useCallback(e => { e.preventDefault(); if (readOnly) return; const type = e.dataTransfer.getData('application/reactflow'); if (!type) return; const bounds = reactFlowInstance.current?.screenToFlowPosition?.({ x: e.clientX, y: e.clientY }) || { x: e.clientX - 250, y: e.clientY - 100 }; pushHistory(nodes, edges); if (type.startsWith('shape:')) { const shape = type.split(':')[1]; const dims = shape === 'line' ? { w: 200, h: 40 } : shape === 'grid' ? { w: 240, h: 200 } : shape === 'text' ? { w: 160, h: 50 } : { w: 160, h: 120 }; setNodes(nds => [...nds, { id: `shape-${Date.now()}`, type: 'shape', position: bounds, data: { shape, width: dims.w, height: dims.h, fill: '#f1f5f9', stroke: '#64748b', label: shape === 'text' ? 'Texto' : '', cols: 3, rows: 3 } }]) } else if (type.startsWith('connector:')) { const [, app, action] = type.split(':'); const def = CONNECTOR_ACTIONS.find(a => a.app === app && a.action === action); const cfg = {}; (def?.fields || []).forEach(f => { if (f.type === 'check') cfg[f.key] = false }); setNodes(nds => [...nds, { id: `connector-${Date.now()}`, type: 'connector', position: bounds, data: { app, action, label: def?.label || action, config: cfg } }]) } else { setNodes(nds => [...nds, { id: `node-${Date.now()}`, type: 'custom', position: bounds, data: { label: 'Nuevo nodo', content: { contentType: type, content: '' } } }]) } }, [nodes, edges, readOnly])

  function handleNodeDoubleClick(e, node) { const d = node.data || {}; if (d.locked) return; if (d.app && d.action) { openConnectorEdit(node); return } if (d.shape) { setEditingShapeId(node.id); setShapeW(d.width || 160); setShapeH(d.height || 120); setShapeLabel(d.label || ''); setShapeFill(d.fill || '#f1f5f9'); setShapeStroke(d.stroke || '#64748b'); setShapeType(d.shape) } else { setEditingNodeId(node.id); setNodeLabel(d.label || ''); setNodeSubtitle(d.subtitle || ''); setNodeColor(d.color || '#3b82f6'); setNodeTags(Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '')); setNodeLink(d.link || ''); setNodeOwner(d.owner || ''); setNodeFields(Array.isArray(d.fields) ? d.fields.map(f => ({ key: f.key || '', value: f.value || '' })) : []); setNodeType(d.content?.contentType || 'text'); setNodeContent(d.content?.content || ''); setPreviewHtml(false) } }
  function saveNode() { if (!editingNodeId) return; const tags = nodeTags.split(',').map(t => t.trim()).filter(Boolean); const fields = nodeFields.filter(f => (f.key || '').trim() || (f.value || '').trim()).map(f => ({ key: (f.key || '').trim(), value: (f.value || '').trim() })); setNodes(nds => nds.map(n => n.id === editingNodeId ? { ...n, data: { ...n.data, label: nodeLabel, subtitle: nodeSubtitle, color: nodeColor, tags, link: nodeLink, owner: nodeOwner, fields, content: { contentType: nodeType, content: nodeContent } } } : n)); setEditingNodeId(null); autoSave() }
  function openConnectorEdit(node) { const d = node.data || {}; setEditingConnectorId(node.id); setConnApp(d.app || 'wli'); setConnAction(d.action || CONNECTOR_ACTIONS[0].action); setConnLabel(d.label || ''); setConnConfig((d.config && typeof d.config === 'object') ? { ...d.config } : {}) }
  function saveConnector() { if (!editingConnectorId) return; setNodes(nds => nds.map(n => n.id === editingConnectorId ? { ...n, data: { ...n.data, app: connApp, action: connAction, label: connLabel, config: connConfig } } : n)); setEditingConnectorId(null); autoSave() }
  function cambiarAccionConector(action) { setConnAction(action); const def = CONNECTOR_ACTIONS.find(a => a.app === connApp && a.action === action); const cfg = {}; (def?.fields || []).forEach(f => { if (f.type === 'check') cfg[f.key] = false }); setConnConfig(cfg) }
  function setConnCfg(key, val) { setConnConfig(cfg => ({ ...cfg, [key]: val })) }
  function saveShape() { if (!editingShapeId) return; setNodes(nds => nds.map(n => n.id === editingShapeId ? { ...n, data: { ...n.data, shape: shapeType, width: shapeW, height: shapeH, label: shapeLabel, fill: shapeFill, stroke: shapeStroke } } : n)); setEditingShapeId(null); autoSave() }
  function saveEdge() { if (!editingEdgeId) return; setEdges(eds => eds.map(e => e.id === editingEdgeId ? { ...e, label: edgeLabel || undefined, style: { ...e.style, stroke: edgeColor, strokeWidth: edgeWidth }, type: edgeType === 'default' ? undefined : edgeType, markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor } } : e)); setEditingEdgeId(null); autoSave() }
  function toggleLock(nodeId) { setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, locked: !n.data?.locked } } : n)); autoSave(); setCtxMenu(null) }
  function bringToFront(nodeId) { setNodes(nds => { const idx = nds.findIndex(n => n.id === nodeId); if (idx < 0) return nds; const u = [...nds]; u.push(u.splice(idx, 1)[0]); return u }); setCtxMenu(null) }
  function sendToBack(nodeId) { setNodes(nds => { const idx = nds.findIndex(n => n.id === nodeId); if (idx < 0) return nds; const u = [...nds]; u.unshift(u.splice(idx, 1)[0]); return u }); setCtxMenu(null) }
  function duplicateNode(nodeId) { const node = nodes.find(n => n.id === nodeId); if (!node) return; setNodes(nds => [...nds, { ...node, id: `node-${Date.now()}`, position: { x: node.position.x + 40, y: node.position.y + 40 }, selected: false, data: { ...node.data } }]); setCtxMenu(null) }
  function handleNodeContextMenu(e, node) { e.preventDefault(); setCtxEdgeMenu(null); setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }) }
  function handleEdgeContextMenu(e, edge) { e.preventDefault(); setCtxMenu(null); setCtxEdgeMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id }) }
  function handleEdgeClick() { const edge = edges.find(e => e.id === ctxEdgeMenu?.edgeId); if (edge) { setEditingEdgeId(edge.id); setEdgeLabel(edge.label || ''); setEdgeColor(edge.style?.stroke || '#64748b'); setEdgeWidth(edge.style?.strokeWidth || 2); setEdgeType(edge.type || 'default'); setCtxEdgeMenu(null) } }
  const handleExport = () => {
    const data = { title, description, nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
    const text = JSON.stringify(data, null, 2)
    if (enmarcado) {
      // Dentro del iframe sandbox de WLO el enlace de descarga se bloquea
      // (sin allow-downloads). Se muestra el JSON para copiarlo, con un boton de
      // descarga por si el ambiente igual la permite.
      setExportText(text)
      setShowExport(true)
    } else {
      downloadJson(text, `${title || 'flujo'}.wlo.json`)
    }
  }
  const handleImport = () => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.json'; el.onchange = async (ev) => { const file = ev.target.files?.[0]; if (!file) return; try { const text = await file.text(); const data = JSON.parse(text); if (data.nodes) { pushHistory(nodes, edges); setNodes(data.nodes); setEdges(data.edges || []); if (data.title) setTitle(data.title); if (data.description !== undefined) setDescription(data.description); autoSave(data.nodes, data.edges || []); showToast('Flujo importado') } } catch { showToast('Archivo inválido', 'error') } }; el.click() }

  async function publishFlow() {
    if (readOnly) return
    const connNodes = nodes.filter(n => n.type === 'connector')
    if (!connNodes.length) { showToast('No hay acciones de conectores en este flujo', 'error'); return }
    const nodesOut = connNodes.map(n => ({ id: n.id, label: n.data?.label || '', app: n.data?.app || '', action: n.data?.action || '', config: n.data?.config || {} }))
    const campanas = nodesOut.filter(n => n.action === 'emailer/create_campaign')
    const faltantes = campanas.filter(n => !String(n.config?.html || '').trim())
    if (faltantes.length) { showToast('Falta el HTML de la campaña en un nodo', 'error'); return }
    setPublishing(true)
    try {
      const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: wsId, flow_id: flowId, title, connector_nodes: nodesOut }) })
      const body = await r.json().catch(() => null)
      const arr = body && Array.isArray(body.results) ? body.results : []
      setPublishResult(arr)
      setPublishError(!body || typeof body !== 'object' ? `No se pudo publicar (HTTP ${r.status})` : (body.error || null))
      if (arr.length && arr.every(x => x.ok)) showToast('Campaña publicada')
      else if (arr.length) showToast('Hubo errores al publicar', 'error')
    } catch (e) {
      showToast('Error de red al publicar', 'error')
    } finally {
      setPublishing(false)
    }
  }

  function toggleShare(profileId) {
    if (readOnly) return
    const already = shares.find(s => s.profile_id === profileId)
    const newShares = already ? shares.filter(s => s.profile_id !== profileId) : [...shares, { profile_id: profileId, permission: 'view' }]
    setShares(newShares)
    fetch(api(wsId, `/${flowId}`, ident), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shares: newShares }) })
  }

  const selCount = nodes.filter(n => n.selected).length

  const saveLabel = saveState === 'saving' ? 'Guardando...' : saveState === 'dirty' ? 'Sin guardar' : saveState === 'error' ? 'Error al guardar' : 'Guardado'
  const saveColor = saveState === 'error' ? '#dc2626' : saveState === 'dirty' ? '#d97706' : saveState === 'saving' ? '#64748b' : '#16a34a'

  if (!loaded) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#94a3b8' }}>Cargando...</div>
  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b', gap: 12, padding: 24, textAlign: 'center' }}>
      <AlertTriangle size={40} style={{ color: '#f59e0b' }} />
      <div style={{ fontSize: 15, fontWeight: 600 }}>No se pudo cargar el flujo</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>Puede que haya sido eliminado o que la conexión falle.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 text-sm">← Volver</button>
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 text-sm"><RefreshCw size={14} />Reintentar</button>
      </div>
    </div>
  )

  return (
    <FlowContext.Provider value={flowCtx}>
    <div className="flex flex-col h-screen" tabIndex={0} onKeyDown={onKeyDown} onClick={() => { setCtxMenu(null); setCtxEdgeMenu(null) }}>
      <header className="flex items-center gap-3 px-4 py-2 border-b bg-white shrink-0">
        {!enmarcado && <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>}
        {readOnly ? (
          <span className="h-8 max-w-xs font-semibold text-lg flex-1 truncate">{title || 'Sin titulo'}</span>
        ) : (
          <input value={title} onChange={e => { setTitle(e.target.value); autoSave() }} className="h-8 max-w-xs font-semibold border-0 bg-transparent outline-none text-lg flex-1" placeholder="Titulo del flujo" />
        )}
        {readOnly && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Solo lectura</span>}
        {!readOnly && <>
          <span className="text-xs" style={{ color: saveColor }}>{saveLabel}</span>
          <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Save size={14} />Guardar</button>
          <button onClick={publishFlow} disabled={publishing} style={{ ...s.btnPrimary, opacity: publishing ? 0.5 : 1 }}><Play size={14} />{publishing ? 'Publicando...' : 'Publicar'}</button>
        </>}
        <button onClick={handleExport} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Download size={14} />Exportar</button>
        {!readOnly && <button onClick={handleImport} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Upload size={14} />Importar</button>}
        {!readOnly && <button onClick={() => setShowShare(true)} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Share2 size={14} />Compartir</button>}
        <div
          title={`Parametros recibidos del embed:\n${JSON.stringify(embedInfo, null, 2)}`}
          style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240, cursor: 'help' }}
        >embed: {embedInfo.enmarcado ? 'iframe' : 'standalone'} · {modo}</div>
      </header>
      {!readOnly && <div className="flex items-center gap-1 px-2 py-1 border-b bg-gray-50 shrink-0">
        <button onClick={() => setTopBarCollapsed(!topBarCollapsed)} className="p-1 hover:bg-gray-200 rounded text-gray-500"><ChevronDown size={14} className={`transition-transform ${topBarCollapsed ? '-rotate-90' : ''}`} /></button>
        {!topBarCollapsed && <>
          <button onClick={undo} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Undo2 size={14} /></button>
          <button onClick={redo} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Redo2 size={14} /></button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={copySelected} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Copy size={14} /></button>
          <button onClick={pasteSelected} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><FileText size={14} /></button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={() => { nodes.filter(n => n.selected).forEach(n => toggleLock(n.id)) }} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Lock size={14} /></button>
          <button onClick={() => { nodes.filter(n => n.selected).forEach(n => bringToFront(n.id)) }} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><ArrowUp size={14} /></button>
          <button onClick={() => { nodes.filter(n => n.selected).forEach(n => sendToBack(n.id)) }} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><ArrowDown size={14} /></button>
          <div className="flex-1" />
          <button onClick={() => setAltHeld(!altHeld)} className={`p-1.5 rounded ${altHeld ? 'bg-blue-100 text-blue-600' : 'text-gray-500'}`}><Hand size={14} /></button>
          <button onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() }} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Maximize size={14} /></button>
          <button onClick={() => setShowHelp(true)} className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><HelpCircle size={14} /></button>
        </>}
      </div>}
      <div className="flex-1 relative">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChangeSafe} onEdgesChange={onEdgesChange}
          onConnect={(conn) => { if (!readOnly) onConnect(conn) }} onNodesDelete={(del) => { const ids = new Set(del.filter(n => !n.data?.locked).map(n => n.id)); setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target))) }}
          onNodeDoubleClick={(e, n) => { if (!readOnly) handleNodeDoubleClick(e, n) }} onNodeContextMenu={(e, n) => { if (!readOnly) handleNodeContextMenu(e, n) }} onEdgeContextMenu={(e, ed) => { if (!readOnly) handleEdgeContextMenu(e, ed) }}
          onPaneClick={() => { setCtxMenu(null); setCtxEdgeMenu(null) }} onDragOver={onDragOver} onDrop={onDrop}
          onInit={(rf) => { reactFlowInstance.current = rf }} nodeTypes={{ custom: CustomNode, shape: ShapeNode, connector: ConnectorNode }}
          minZoom={0.1} maxZoom={4} panOnDrag={readOnly || altHeld} panActivationKeyCode="Alt"
          nodesDraggable={!readOnly} nodesConnectable={!readOnly}
          selectionKeyCode="Control" multiSelectionKeyCode="Control" deleteKeyCode={null} fitView className="bg-gray-50">
          <Controls /><Background variant={BackgroundVariant.Dots} gap={20} size={1} /><MiniMap />
          {selCount > 1 && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">{selCount} seleccionados</div>}
        </ReactFlow>
        {ctxMenu && <div className="fixed z-50 bg-white border rounded-lg shadow-xl p-1 min-w-[160px]" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded" onClick={() => toggleLock(ctxMenu.nodeId)}>{nodes.find(n => n.id === ctxMenu.nodeId)?.data?.locked ? <><Unlock size={12} />Desbloquear</> : <><Lock size={12} />Bloquear</>}</button>
          <hr className="my-1" /><button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded" onClick={() => bringToFront(ctxMenu.nodeId)}><ArrowUp size={12} />Al frente</button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded" onClick={() => sendToBack(ctxMenu.nodeId)}><ArrowDown size={12} />Al fondo</button>
          <hr className="my-1" /><button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded" onClick={() => duplicateNode(ctxMenu.nodeId)}><Copy size={12} />Duplicar</button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded text-red-600" onClick={() => { if (nodes.find(n => n.id === ctxMenu.nodeId)?.data?.locked) { setCtxMenu(null); return } setNodes(nds => nds.filter(n => n.id !== ctxMenu.nodeId)); setEdges(eds => eds.filter(e => e.source !== ctxMenu.nodeId && e.target !== ctxMenu.nodeId)); setCtxMenu(null); autoSave() }}><Trash2 size={12} />Eliminar</button>
        </div>}
        {ctxEdgeMenu && <div className="fixed z-50 bg-white border rounded-lg shadow-xl p-1 min-w-[160px]" style={{ left: ctxEdgeMenu.x, top: ctxEdgeMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded" onClick={handleEdgeClick}><Pencil size={12} />Propiedades</button>
          <hr className="my-1" /><button className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-100 rounded text-red-600" onClick={() => { setEdges(eds => eds.filter(e => e.id !== ctxEdgeMenu.edgeId)); setCtxEdgeMenu(null); autoSave() }}><Trash2 size={12} />Eliminar</button>
        </div>}
        {!readOnly && <div className="absolute top-3 left-3 bg-white border rounded-lg shadow-lg z-20" style={{ width: toolCollapsed ? 40 : 180 }}>
          <div className="flex items-center justify-between px-2 py-1.5 border-b">
            <span className="text-[10px] font-medium text-gray-400">{toolCollapsed ? '' : 'Herramientas'}</span>
            <button onClick={() => setToolCollapsed(!toolCollapsed)} className="p-0.5 hover:bg-gray-100 rounded"><ChevronUp size={12} className={`transition-transform ${toolCollapsed ? 'rotate-180' : ''}`} /></button>
          </div>
          {!toolCollapsed && <div className="p-2 flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 px-1">Contenido</span>
            {CONTENT_TYPES.map(t => <button key={t} draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow', t); e.dataTransfer.effectAllowed = 'move' }} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-gray-100 cursor-grab">{NI[t]} {t === 'text' ? 'Texto' : t === 'html' ? 'HTML' : t === 'url' ? 'URL' : 'Doc'}</button>)}
            <hr className="my-0.5" /><span className="text-[10px] font-medium text-gray-400 px-1">Dibujo</span>
            {SHAPES.map(s => <button key={s} draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow', `shape:${s}`); e.dataTransfer.effectAllowed = 'move' }} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-gray-100 cursor-grab">{SI[s]} {SN[s]}</button>)}
            <hr className="my-0.5" /><span className="text-[10px] font-medium text-gray-400 px-1">Conectores</span>
            {CONNECTOR_ACTIONS.map(a => <button key={a.action} draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow', `connector:${a.app}:${a.action}`); e.dataTransfer.effectAllowed = 'move' }} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-gray-100 cursor-grab">{a.icon} {a.label}<span className="text-gray-400">· {a.app.toUpperCase()}</span></button>)}
          </div>}
        </div>}
      </div>
      <footer className="px-4 py-2 border-t bg-white shrink-0">
        {readOnly ? (
          <div className="h-8 text-xs text-gray-400 flex items-center">{description || 'Sin descripcion'}</div>
        ) : (
          <input value={description} onChange={e => { setDescription(e.target.value); autoSave() }} className="h-8 w-full border-0 bg-transparent outline-none text-xs text-gray-400" placeholder="Descripcion (opcional)" />
        )}
      </footer>

      {editingNodeId && <Modal onClose={() => setEditingNodeId(null)} title="Editar nodo">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Nombre</label><input value={nodeLabel} onChange={e => setNodeLabel(e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Subtitulo</label><input value={nodeSubtitle} onChange={e => setNodeSubtitle(e.target.value)} placeholder="Texto secundario del nodo" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Campos personalizados</label>
            <div className="space-y-2">
              {nodeFields.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input value={f.key} onChange={e => setNodeFields(fs => fs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} placeholder="Campo" className="w-1/3 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200" />
                  <input value={f.value} onChange={e => setNodeFields(fs => fs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Valor" className="flex-1 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200" />
                  <button title="Quitar campo" onClick={() => setNodeFields(fs => fs.filter((_, j) => j !== i))} className="w-8 h-8 rounded-md border hover:bg-gray-50 text-gray-400 flex items-center justify-center shrink-0"><X size={12} /></button>
                </div>
              ))}
              <button onClick={() => setNodeFields(fs => [...fs, { key: '', value: '' }])} className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed hover:bg-gray-50 text-xs text-gray-500"><Plus size={12} />Agregar campo</button>
            </div>
          </div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Color del nodo</label><div className="flex gap-2"><input type="color" value={nodeColor || '#3b82f6'} onChange={e => setNodeColor(e.target.value)} className="w-9 h-9 rounded border cursor-pointer" /><input value={nodeColor} onChange={e => setNodeColor(e.target.value)} placeholder="#3b82f6" className="flex-1 h-9 rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200" />{nodeColor && <button title="Quitar color" onClick={() => setNodeColor('')} className="w-9 h-9 rounded-md border hover:bg-gray-50 text-gray-400 flex items-center justify-center"><X size={14} /></button>}</div></div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Tags</label><input value={nodeTags} onChange={e => setNodeTags(e.target.value)} placeholder="tag1, tag2, tag3" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />{nodeTags.trim() && <div className="flex flex-wrap gap-1 mt-1.5">{nodeTags.split(',').map(t => t.trim()).filter(Boolean).map(t => <span key={t} className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">{t}</span>)}</div>}</div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Responsable</label><input value={nodeOwner} onChange={e => setNodeOwner(e.target.value)} placeholder="Persona asignada" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Enlace de referencia</label><input value={nodeLink} onChange={e => setNodeLink(e.target.value)} placeholder="https://..." className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Tipo</label><div className="flex gap-1">{CONTENT_TYPES.map(t => <button key={t} onClick={() => { setNodeType(t); setPreviewHtml(false) }} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${nodeType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{NI[t]} {t}</button>)}</div></div>
          <div><div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-gray-500">{nodeType === 'url' ? 'URL' : 'Contenido'}</label>{nodeType === 'html' && <button onClick={() => setPreviewHtml(!previewHtml)} className={`flex items-center gap-1 text-xs rounded px-2 py-0.5 ${previewHtml ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{previewHtml ? <Edit3 size={12} /> : <Eye size={12} />}{previewHtml ? 'Codigo' : 'Preview'}</button>}</div>
          {nodeType === 'html' && previewHtml ? <iframe key="preview" srcDoc={nodeContent} className="w-full min-h-[200px] rounded-md border bg-white" sandbox="allow-scripts" style={{ border: 0 }} /> : <textarea value={nodeContent} onChange={e => setNodeContent(e.target.value)} className="w-full min-h-[200px] rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200 resize-y" />}</div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEditingNodeId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button><button onClick={saveNode} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Save size={14} />Guardar</button></div>
      </Modal>}
      {editingShapeId && <Modal onClose={() => setEditingShapeId(null)} title="Propiedades">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium text-gray-500 mb-1 block">Ancho</label><input type="number" value={shapeW} onChange={e => setShapeW(Number(e.target.value))} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div><div><label className="text-xs font-medium text-gray-500 mb-1 block">Alto</label><input type="number" value={shapeH} onChange={e => setShapeH(Number(e.target.value))} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div></div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Etiqueta</label><input value={shapeLabel} onChange={e => setShapeLabel(e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium text-gray-500 mb-1 block">Relleno</label><div className="flex gap-2"><input type="color" value={shapeFill} onChange={e => setShapeFill(e.target.value)} className="w-9 h-9 rounded border cursor-pointer" /><input value={shapeFill} onChange={e => setShapeFill(e.target.value)} className="flex-1 h-9 rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200" /></div></div><div><label className="text-xs font-medium text-gray-500 mb-1 block">Borde</label><div className="flex gap-2"><input type="color" value={shapeStroke} onChange={e => setShapeStroke(e.target.value)} className="w-9 h-9 rounded border cursor-pointer" /><input value={shapeStroke} onChange={e => setShapeStroke(e.target.value)} className="flex-1 h-9 rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200" /></div></div></div>
          <div className="flex gap-1">{SHAPES.map(t => <button key={t} onClick={() => setShapeType(t)} className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${shapeType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{SI[t]}{SN[t]}</button>)}</div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEditingShapeId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button><button onClick={saveShape} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Save size={14} />Guardar</button></div>
      </Modal>}
      {editingConnectorId && <Modal onClose={() => setEditingConnectorId(null)} title="Acción de comunicación">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Conexión</label>
              <select value={connApp} onChange={e => { const app = e.target.value; setConnApp(app); const first = CONNECTOR_ACTIONS.find(a => a.app === app); if (first) cambiarAccionConector(first.action) }} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                {CONNECTOR_APPS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Acción</label>
              <select value={connAction} onChange={e => cambiarAccionConector(e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                {CONNECTOR_ACTIONS.filter(a => a.app === connApp).map(a => <option key={a.action} value={a.action}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nombre del nodo</label>
            <input value={connLabel} onChange={e => setConnLabel(e.target.value)} placeholder={CONNECTOR_ACTIONS.find(a => a.action === connAction)?.label || 'Acción'} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          {(() => { const def = CONNECTOR_ACTIONS.find(a => a.app === connApp && a.action === connAction); if (!def) return null; return (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Configuración</label>
              <div className="space-y-2">
                {def.fields.map(f => f.type === 'check' ? (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={!!connConfig[f.key]} onChange={e => setConnCfg(f.key, e.target.checked)} className="w-4 h-4" />
                    {f.label}
                  </label>
                ) : (
                  <div key={f.key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] text-gray-400">{f.label}</label>
                      {f.key === 'html' && (
                        <button type="button" onClick={() => setConnHtmlPreview(!connHtmlPreview)} className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ${connHtmlPreview ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                          {connHtmlPreview ? <Edit3 size={10} /> : <Eye size={10} />}{connHtmlPreview ? 'Codigo' : 'Preview'}
                        </button>
                      )}
                    </div>
                    {f.key === 'html' && connHtmlPreview ? (
                      <iframe
                        srcDoc={String(connConfig[f.key] || '')}
                        className="w-full min-h-[180px] rounded-md border bg-white"
                        sandbox="allow-scripts"
                        style={{ border: '1px solid #e2e8f0' }}
                      />
                    ) : (
                      <textarea
                        value={connConfig[f.key] !== undefined && connConfig[f.key] !== null ? String(connConfig[f.key]) : ''}
                        onChange={e => setConnCfg(f.key, e.target.value)}
                        placeholder={f.key === 'html' ? '<p>Hola {nombre}, …</p>' : f.key === 'email' ? '{email_tarea} o correo fijo' : f.key === 'list_id' ? 'Si no lo pones, se elige la base al crear la campaña' : ''}
                        rows={f.key === 'html' ? 5 : 1}
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono resize-y"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) })()}
          <p className="text-[11px] leading-relaxed text-gray-400">
            Con el botón <strong>Publicar</strong> de arriba, wlo-flow reenvía esta acción a WLO
            y WLO llama a {connApp.toUpperCase()} con estos datos (el secreto nunca sale del servidor).
            El resultado de la campaña se muestra en pantalla.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEditingConnectorId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button><button onClick={saveConnector} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Save size={14} />Guardar</button></div>
      </Modal>}
      {editingEdgeId && <Modal onClose={() => setEditingEdgeId(null)} title="Propiedades de linea">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Etiqueta</label><input value={edgeLabel} onChange={e => setEdgeLabel(e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium text-gray-500 mb-1 block">Color</label><div className="flex gap-2"><input type="color" value={edgeColor} onChange={e => setEdgeColor(e.target.value)} className="w-9 h-9 rounded border cursor-pointer" /><input value={edgeColor} onChange={e => setEdgeColor(e.target.value)} className="flex-1 h-9 rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200" /></div></div><div><label className="text-xs font-medium text-gray-500 mb-1 block">Grosor</label><input type="number" value={edgeWidth} onChange={e => setEdgeWidth(Number(e.target.value))} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div></div>
          <div className="flex gap-1">{['default', 'straight', 'step', 'smoothstep'].map(t => <button key={t} onClick={() => setEdgeType(t)} className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium ${edgeType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{t}</button>)}</div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={() => setEditingEdgeId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button><button onClick={saveEdge} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Save size={14} />Guardar</button></div>
      </Modal>}
      {(publishResult || publishError) && <Modal onClose={() => { setPublishResult(null); setPublishError(null) }} title="Resultado de la publicación">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Resultado de enviar las acciones del flujo a WLI vía WLO:</p>
          {publishError && <div className="rounded-lg border p-3 text-xs text-red-600" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>{publishError}</div>}
          {publishResult && publishResult.length === 0 && <p className="text-xs text-gray-400">Sin resultados.</p>}
          {publishResult.map((r) => (
            <div key={r.node_id} className="rounded-lg border p-3" style={{ borderColor: r.ok ? '#bbf7d0' : '#fecaca', background: r.ok ? '#f0fdf4' : '#fef2f2' }}>
              <div className="flex items-center gap-2 text-sm">
                {r.ok ? <Check size={14} style={{ color: '#16a34a' }} /> : <AlertTriangle size={14} style={{ color: '#dc2626' }} />}
                <span className="font-medium flex-1 truncate">{r.label || r.action}</span>
                <span className="text-[10px] text-gray-400 truncate">{r.action}</span>
              </div>
              {r.ok ? (
                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                  <div>Campaña: <code className="font-mono">{r.data?.campaign_id || '-'}</code></div>
                  <div>Estado: {r.data?.status || '-'} · Envíos: {r.data?.sent_count ?? '-'}</div>
                  {r.data?.published_at && <div>Publicado: {fmtDate(r.data.published_at)}</div>}
                  {r.data?.list_name && <div>Base: {r.data.list_name}</div>}
                </div>
              ) : (
                <div className="text-xs text-red-600 mt-1">{r.error} (HTTP {r.status})</div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4"><button onClick={() => setPublishResult(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cerrar</button></div>
      </Modal>}
      {showHelp && <Modal onClose={() => setShowHelp(false)} title="Ayuda">
        <div className="space-y-3 text-xs text-gray-500">
          <div><div className="font-medium text-blue-600 mb-1">Movimiento</div><div>Click + Arrastrar: mover | Alt+M: mover area | Rueda: zoom</div></div>
          <div><div className="font-medium text-blue-600 mb-1">Teclado</div><div>Ctrl+Z: deshacer | Ctrl+Y: rehacer | Ctrl+C: copiar | Ctrl+V: pegar | Delete: eliminar</div></div>
          <div><div className="font-medium text-blue-600 mb-1">Interaccion</div><div>Doble click: editar | Click derecho: menu | Arrastrar toolbar: crear</div></div>
        </div>
      </Modal>}
      {showShare && <Modal onClose={() => setShowShare(false)} title="Compartir">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">Enlace directo</p>
            <div className="flex gap-2"><code className="flex-1 text-xs bg-gray-100 rounded px-3 py-2 break-all font-mono">{typeof window !== 'undefined' ? `${window.location.origin}/embed?workspace_id=${wsId}&flow=${flowId}` : ''}</code><button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/embed?workspace_id=${wsId}&flow=${flowId}`) }} className="shrink-0 px-3 py-2 text-xs border rounded-lg hover:bg-gray-50">Copiar</button></div>
          </div>
          {membersList.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Miembros del workspace ({membersList.length})</p>
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-1">
                {membersList.map(m => {
                  const isShared = shares.some(s => s.profile_id === m.id)
                  const soyYo = !!ident && ident.name && m.name === ident.name
                  return (
                    <button key={m.id} onClick={() => { if (!soyYo) toggleShare(m.id) }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${isShared ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'} ${soyYo ? 'cursor-default opacity-80' : ''}`}>
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">{(m.name || '?')[0].toUpperCase()}</div>
                      <span className="flex-1 truncate">{m.name}{soyYo ? ' (tú)' : ''}</span>
                      <span className="text-[10px] text-gray-400">{m.role}</span>
                      {isShared && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">compartido</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-xs text-gray-500 leading-relaxed">
              No se pudo cargar la lista de miembros. Para ver a los usuarios del workspace y compartir con ellos, abre esta herramienta dentro de WLO.
            </div>
          )}
        </div>
      </Modal>}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg" style={{ background: toast.type === 'error' ? '#dc2626' : '#16a34a' }}>
          {toast.type === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}
          {toast.msg}
        </div>
      )}
      {showExport && <Modal onClose={() => setShowExport(false)} title="Exportar flujo">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Copiá el contenido o descargá el archivo JSON:</p>
          <textarea
            readOnly value={exportText}
            onClick={e => e.target.select()}
            className="w-full min-h-[220px] rounded-md border px-3 py-2 text-[11px] font-mono outline-none resize-y bg-gray-50"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { copyTexto(exportText).then(ok => showToast(ok ? 'Copiado al portapapeles' : 'No se pudo copiar, copialo a mano', ok ? 'success' : 'error')) }}
              className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 px-3 py-2 text-sm"
            ><Copy size={14} />Copiar</button>
            <button
              onClick={() => downloadJson(exportText, `${title || 'flujo'}.wlo.json`)}
              className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 px-3 py-2 text-sm"
            ><Download size={14} />Descargar</button>
          </div>
          <p className="text-[11px] text-gray-400">Dentro de WLO el navegador puede bloquear la descarga directa; la opción segura es copiar el JSON.</p>
        </div>
      </Modal>}
    </div>
    </FlowContext.Provider>
  )
}

function Modal({ onClose, title, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="bg-white border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-3 border-b"><span className="font-semibold text-sm">{title}</span><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button></div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  </div>
}

const s = {
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' },
}
