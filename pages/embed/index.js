import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react'
import Head from 'next/head'
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  addEdge, BackgroundVariant, Handle, Position, MarkerType, useReactFlow,
  NodeResizer,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Save, Trash2, Type, Code, Link as LinkIcon, FileText, Pencil,
  Square, Circle, Minus, Grid3X3, ChevronDown, ChevronUp, ChevronRight, Copy, Undo2, Redo2,
   Lock, Unlock, ArrowUp, ArrowDown, Maximize, Download, Upload, Eye, Edit3, Code2,
  X, HelpCircle, Share2, Plus, PenTool, Layout, Hand, Search, Check, Settings,
  AlertTriangle, RefreshCw, Plug, Send, UserPlus, List as ListIcon, Play, Home,
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
      { key: 'name', label: 'Nombre de la campaña', help: 'Un nombre para identificar esta campaña. Ej: Lanzamiento julio.', default: 'Campana de prueba' },
      { key: 'subject', label: 'Asunto del correo', help: 'El título que verán quienes reciban el correo.', default: 'Asunto de prueba' },
      { key: 'html', label: 'HTML de la campaña', help: 'El contenido del correo en código HTML.', default: '<h1>Hola</h1>' },
      { key: 'list_names', label: 'Listas por nombre', help: 'A qué listas de contactos enviar. Varias listas, separadas por coma.', default: 'Prospectos comerciales' },
      { key: 'list_ids', label: 'IDs de lista', help: 'Identificadores técnicos de las listas (si tu sistema los usa).', default: '' },
      { key: 'segment_categorias', label: 'Segmentos por categoría', help: 'Filtrar por categoría de contacto.', default: '' },
      { key: 'segment_temperaturas', label: 'Temperaturas', type: 'multiselect', options: ['caliente', 'tibio', 'frio', 'congelado', 'sin_enviar'], default: '', help: 'Qué tan "calientes" están los contactos. Elegí todas las que apliquen.' },
      { key: 'from_email', label: 'Email del remitente', help: 'Desde qué correo se envía. Opcional.', default: '' },
      { key: 'from_name', label: 'Nombre del remitente', help: 'Cómo aparece quien envía. Opcional.', default: '' },
      { key: 'reply_to', label: 'Responder a', help: 'A qué correo llegan las respuestas. Opcional.', default: '' },
    ],
    arrayFields: ['list_names', 'list_ids', 'segment_categorias', 'segment_temperaturas'],
    outputs: ['name', 'subject', 'html', 'list_names', 'list_ids', 'segment_categorias', 'segment_temperaturas', 'from_email', 'from_name', 'reply_to'],
  },
  {
    app: 'wli', action: 'emailer/enroll_contact', label: 'Enrolar contacto', icon: <UserPlus size={14} />,
    fields: [
      { key: 'sequence_id', label: 'ID de la secuencia', help: 'A qué secuencia (secuencia de correos) se agrega el contacto.' },
      { key: 'email', label: 'Email', help: 'El correo del contacto. Podés escribir {email_tarea} para usar el de la tarea.' },
    ],
    outputs: ['sequence_id', 'email'],
  },
  {
    app: 'wli', action: 'emailer/list_sequences', label: 'Listar secuencias', icon: <ListIcon size={14} />,
    fields: [
      { key: 'secuencias', label: 'Secuencias a usar', type: 'seqselect', default: [], help: 'La lista propuesta de secuencias que vas a usar en la campaña. Marcá cuáles activar y completá el contenido de cada una.' },
      { key: 'solo_activas', label: 'Solo activas', type: 'check', help: 'Mostrar únicamente las secuencias que están activas.' },
    ],
    outputs: ['sequences', 'secuencias'],
  },
  {
    app: 'rest', action: 'webhook', label: 'Enviar a API REST', icon: <Plug size={14} />,
    fields: [
      { key: 'url', label: 'Dirección (URL) del servicio', help: 'La dirección web exacta donde tu sistema recibe los datos. Ejemplo: https://miempresa.com/api/contactos' },
      { key: 'method', label: 'Qué acción realizar', type: 'select', help: 'Cómo le decís al sistema qué hacer con los datos. Enviar (POST) y Modificar (PUT) son los más comunes.', options: ['POST', 'PUT', 'PATCH', 'DELETE', 'GET'] },
      { key: 'auth_type', label: 'Cómo se identifica tu sistema', type: 'auth', help: 'Algunos sistemas piden una prueba de identidad para aceptar los datos. Solo elegí una si el servicio te la pidió.' },
      { key: 'headers', label: 'Datos extra de identificación', type: 'fields', help: 'Campos adicionales que algunos sistemas piden. Si no sabés, dejalo vacío.' },
      { key: 'body', label: 'Los datos que envías', type: 'typed', help: 'Los datos que vas a enviar, cada uno con su nombre y su valor. Podés escribir {campo} para usar datos de otro nodo.' },
    ],
  },
]
const CONNECTOR_APPS = [...new Set(CONNECTOR_ACTIONS.map(a => a.app))]

// Nombres de campo que SIEMPRE deben ir como array en el payload REST.
const ARRAY_FIELD_NAMES = ['list_names', 'list_ids', 'segment_categorias', 'segment_temperaturas']

// Referencia {campo} con UNA llave: se resuelve con las salidas de los nodos
// anteriores. Solo cuenta si el contenido es un identificador (letras/numeros/
// guion bajo): {nombre}, {email_tarea}. El contenido de otros nodos que traiga
// llaves de otra cosa (HTML/CSS, plantillas de WLI con {{ .Subscriber.Email }},
// bloques CSS { margin: 0; ... }) se trata como texto plano y NO se valida ni
// se interpola: viaja tal cual hacia WLI.
const REF_SINGLE_BRACE = /(?<!\{)\{([A-Za-z0-9_]+)\}(?!\})/g

/** Config inicial de una accion con sus valores por defecto. */
function defaultConfigFor(def) {
  const cfg = {}
  for (const f of (def?.fields || [])) {
    if (f.default !== undefined) cfg[f.key] = f.default
    else if (f.type === 'check') cfg[f.key] = false
    else if (f.type === 'multiselect') cfg[f.key] = ''
    else if (f.type === 'seqselect') cfg[f.key] = [{ name: 'Secuencia 1', usada: true, html: '' }]
    else if (f.type === 'fields' || f.type === 'typed') cfg[f.key] = []
  }
  return cfg
}

/** Convierte las filas del body del nodo REST al objeto JSON que se envia.
 *  Los campos de ARRAY_FIELD_NAMES siempre salen como array de strings
 *  (aunque la fila este marcada como numero o el valor venga numerico),
 *  y los valores vacios se omiten para no romper la validacion Zod. */
function bodyAPayload(body) {
  const payload = {}
  for (const b of (Array.isArray(body) ? body : [])) {
    if (!b || !b.key || !String(b.key).trim()) continue
    const k = String(b.key).trim()
    const raw = b.value ?? ''
    if (ARRAY_FIELD_NAMES.includes(k) || b.type === 'array') {
      const t = String(raw).trim()
      let arr
      if (t.startsWith('[')) { try { arr = JSON.parse(t) } catch { arr = t.split(',') } }
      else arr = t.split(',')
      const limpio = arr.map(x => (x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))).map(x => x.trim()).filter(Boolean)
      if (limpio.length) payload[k] = limpio
      continue
    }
    if (b.type === 'number') { if (String(raw).trim() !== '') payload[k] = Number(raw) || 0; continue }
    if (b.type === 'boolean') { payload[k] = raw === true || raw === 'true' || raw === '1'; continue }
    if (String(raw) !== '') payload[k] = raw
  }
  return payload
}

/**
 * Devuelve un objeto plano campo -> valor con los "outputs" de cualquier nodo.
 * Sirve para que el nodo REST mapee datos de nodos de texto, HTML, figuras o
 * conectores (WLI) sin importar su tipo.
 */
function getNodeOutputs(node) {
  const d = node?.data || {}
  const out = {}
  // Nodo conector (WLI o REST): usa las salidas de su accion o su config.
  if (d.app && d.action) {
    const def = CONNECTOR_ACTIONS.find(a => a.app === d.app && a.action === d.action)
    const cfg = (d.config && typeof d.config === 'object') ? d.config : {}
    const claves = (def?.outputs && def.outputs.length) ? def.outputs : Object.keys(cfg)
    const esArray = (def?.arrayFields && Array.isArray(def.arrayFields)) ? def.arrayFields : []
    for (const k of claves) {
      const v = cfg[k]
      if (esArray.includes(k) && typeof v === 'string' && v.trim()) {
        out[k] = v.split(',').map(x => x.trim()).filter(Boolean)
      } else {
        out[k] = v
      }
    }
    return out
  }
  // Nodo de contenido (texto, html, url, documento): label + contenido + campos.
  if (d.content) {
    out['label'] = d.label || ''
    out['content'] = d.content.content || ''
    for (const f of (Array.isArray(d.fields) ? d.fields : [])) {
      if (f && f.key) out[f.key] = f.value ?? ''
    }
    return out
  }
  // Figura: label + shape.
  if (d.shape) {
    out['label'] = d.label || ''
    out['shape'] = d.shape
    return out
  }
  return out
}

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

function CustomNode({ data, selected, id }) {
  const ct = data?.content?.contentType || 'text'
  const color = data?.color || ''
  const { resizeNode, resizeNodeEnd } = useContext(FlowContext) || {}
  const nodeW = data?.width || 200
  const borderColor = selected ? '#3b82f6' : color || '#e2e8f0'
  return (
    <div className="bg-white border-2 rounded-lg px-3 py-2 shadow-sm" style={{ width: nodeW, maxWidth: 'none', borderColor, opacity: data?.locked ? 0.7 : 1, ...(selected ? { boxShadow: '0 0 0 2px rgba(59,130,246,.35)' } : {}) }}>
      {selected && <NodeResizer isVisible={selected} minWidth={120} minHeight={36} onResize={(ev, params) => resizeNode?.(id, params.width, params.height)} onResizeEnd={() => resizeNodeEnd?.()} />}
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

function ShapeNode({ data, selected, id }) {
  const s = data?.shape || 'rect'; const w = data?.width || 160; const h = data?.height || 120
  const fill = data?.fill || '#f1f5f9'; const stroke = data?.stroke || '#64748b'
  const label = data?.label || ''; const rows = data?.rows || 3; const cols = data?.cols || 3
  const { resizeNode, resizeNodeEnd } = useContext(FlowContext) || {}
  const sel = selected ? { outline: '2px solid #3b82f6', outlineOffset: '2px' } : {}
  const L = label ? <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fill="#334155" fontSize={13} fontWeight={500} fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>{label}</text> : null
  return <div style={{ width: w, height: h, ...sel, opacity: data?.locked ? 0.6 : 1, position: 'relative' }}>
    {selected && <NodeResizer isVisible={selected} minWidth={40} minHeight={30} onResize={(ev, params) => resizeNode?.(id, params.width, params.height)} onResizeEnd={() => resizeNodeEnd?.()} />}
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
        {data?.app === 'rest' && ((data?.sent_count || 0) === 0 ? (
          <span className="text-[9px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 shrink-0">no enviado</span>
        ) : (
          <span className={`text-[9px] rounded-full px-1.5 py-0.5 shrink-0 ${data?.last_status === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            enviado {data?.sent_count || 0} {(data?.sent_count || 0) === 1 ? 'vez' : 'veces'}
          </span>
        ))}
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
  const enmarcado = typeof window !== 'undefined' && (function() { try { return window.top !== window } catch { return window.parent !== window } })()

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
    setEmbedInfo({ ...raw, enmarcado: typeof window !== 'undefined' && (function() { try { return window.top !== window } catch { return window.parent !== window } })() })
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

// Descarga de JSON. Primero intenta relay por postMessage al padre (para
// iframes sandboxed). Si no hay padre o el relay falla, usa data URI que
// funciona en cualquier contexto incluyendo iframes sandboxed.
function downloadJson(text, filename) {
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'wlo-request-download', filename, content: text }, '*') } catch {}
  }
  const a = document.createElement('a')
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text)
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 100)
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

// Etiqueta reutilizable para campos de formulario, con signo de interrogación
// que explica en lenguaje simple para qué sirve el campo cuando el usuario pasa
// el mouse. Vale para cualquier input del editor, no solo conectores.
function FieldLabel({ label, help, htmlFor, hint }) {
  return (
    <div className="flex items-center gap-1 mb-0.5">
      <label htmlFor={htmlFor} className="text-[11px] text-gray-400 font-medium">{label}</label>
      {help && (
        <span className="group relative inline-flex">
          <HelpCircle size={11} className="text-gray-300 hover:text-blue-500 cursor-help transition" />
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded-md bg-gray-900 text-white text-[10px] leading-relaxed p-2 z-50 opacity-0 group-hover:opacity-100 transition shadow-lg whitespace-normal hidden sm:block">
            {help}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </span>
        </span>
      )}
      {hint && <span className="text-[10px] text-gray-300 ml-auto">{hint}</span>}
    </div>
  )
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
  const [showConfig, setShowConfig] = useState(false)
  const [exportText, setExportText] = useState('')
  const [connections, setConnections] = useState([])
  const [connDraft, setConnDraft] = useState(null)
  const [shares, setShares] = useState([])
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [nodeLabel, setNodeLabel] = useState(''); const [nodeContent, setNodeContent] = useState('')
  const [nodeSubtitle, setNodeSubtitle] = useState(''); const [nodeColor, setNodeColor] = useState('#3b82f6')
  const [nodeTags, setNodeTags] = useState(''); const [nodeLink, setNodeLink] = useState(''); const [nodeOwner, setNodeOwner] = useState('')
  const [nodeFields, setNodeFields] = useState([])
  const [nodeType, setNodeType] = useState('text'); const [previewHtml, setPreviewHtml] = useState(false)
  // Preview HTML a pantalla completa: para apreciar la estrategia completa sin
  // el marco del modal. Overlay fijo y no requestFullscreen porque dentro del
  // iframe de WLO el navegador puede tener la Fullscreen API bloqueada.
  const [previewFull, setPreviewFull] = useState(false)
  const [previewFullHtml, setPreviewFullHtml] = useState('')
  const [previewFullIsCode, setPreviewFullIsCode] = useState(false)
  const [previewFullSource, setPreviewFullSource] = useState(null)
  useEffect(() => {
    if (previewFull || !previewFullSource || !previewFullIsCode) return
    if (previewFullSource.type === 'node') setNodeContent(previewFullHtml)
    else if (previewFullSource.index !== undefined) {
      setConnConfig(prev => {
        const arr = Array.isArray(prev[previewFullSource.field]) ? [...prev[previewFullSource.field]] : []
        if (arr[previewFullSource.index]) arr[previewFullSource.index] = { ...arr[previewFullSource.index], html: previewFullHtml }
        return { ...prev, [previewFullSource.field]: arr }
      })
    }
    else setConnConfig(prev => ({ ...prev, [previewFullSource.field]: previewFullHtml }))
    setPreviewFullSource(null)
  }, [previewFull])
  useEffect(() => {
    if (!previewFull) return
    const onKey = e => { if (e.key === 'Escape') setPreviewFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewFull])
  const [editingConnectorId, setEditingConnectorId] = useState(null)
  const [connApp, setConnApp] = useState('wli'); const [connAction, setConnAction] = useState('emailer/create_campaign')
  const [connLabel, setConnLabel] = useState(''); const [connConfig, setConnConfig] = useState({})
  const [connHtmlPreview, setConnHtmlPreview] = useState(false)
  const [connSeqPreview, setConnSeqPreview] = useState(-1)
  const [connTestResult, setConnTestResult] = useState(null)
  const [connTesting, setConnTesting] = useState(false)
  const [payloadOpen, setPayloadOpen] = useState(false)
  const [payloadErrores, setPayloadErrores] = useState({})
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
  const connectionsRef = useRef(connections)

  useEffect(() => { saveStateRef.current = saveState }, [saveState])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { connectionsRef.current = connections }, [connections])

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
        setConnections(Array.isArray(f.connections) ? f.connections : [])
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
    const body = { title, description, nodes: n || nodes, edges: e || edges, shares, connections: connectionsRef.current }
    doPatch(body).then(res => {
      if (res.ok) { setSaveState('saved'); showToast(res.connectionsSaved ? 'Cambios guardados' : 'Cambios guardados. Las conexiones no se pudieron guardar (revisa la base de datos).', res.connectionsSaved ? 'success' : 'error') }
      else { setSaveState('error'); showToast('Error al guardar. Revisa tu conexión.', 'error') }
    }).finally(() => setSaving(false))
  }
  async function doPatch(body) {
    try {
      const r = await fetch(api(wsId, `/${flowId}`, ident), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) return { ok: true, connectionsSaved: true }
      const tieneConexiones = Array.isArray(body.connections) && body.connections.length >= 0
      if (tieneConexiones) {
        const { connections: _drop, ...rest } = body
        const r2 = await fetch(api(wsId, `/${flowId}`, ident), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) })
        if (r2.ok) return { ok: true, connectionsSaved: false }
      }
      return { ok: false }
    } catch { return { ok: false } }
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
    resizeNode: (id, w, h) => {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, width: Math.round(w), height: Math.round(h) } } : n))
    },
    resizeNodeEnd: () => {
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
  const onDrop = useCallback(e => { e.preventDefault(); if (readOnly) return; const type = e.dataTransfer.getData('application/reactflow'); if (!type) return; const bounds = reactFlowInstance.current?.screenToFlowPosition?.({ x: e.clientX, y: e.clientY }) || { x: e.clientX - 250, y: e.clientY - 100 }; pushHistory(nodes, edges); if (type.startsWith('shape:')) { const shape = type.split(':')[1]; const dims = shape === 'line' ? { w: 200, h: 40 } : shape === 'grid' ? { w: 240, h: 200 } : shape === 'text' ? { w: 160, h: 50 } : { w: 160, h: 120 }; setNodes(nds => [...nds, { id: `shape-${Date.now()}`, type: 'shape', position: bounds, data: { shape, width: dims.w, height: dims.h, fill: '#f1f5f9', stroke: '#64748b', label: shape === 'text' ? 'Texto' : '', cols: 3, rows: 3 } }]) } else if (type.startsWith('connector:')) { const [, app, action] = type.split(':'); const def = CONNECTOR_ACTIONS.find(a => a.app === app && a.action === action); const cfg = defaultConfigFor(def); setNodes(nds => [...nds, { id: `connector-${Date.now()}`, type: 'connector', position: bounds, data: { app, action, label: def?.label || action, config: cfg } }]) } else { setNodes(nds => [...nds, { id: `node-${Date.now()}`, type: 'custom', position: bounds, data: { label: 'Nuevo nodo', content: { contentType: type, content: '' } } }]) } }, [nodes, edges, readOnly])

  function handleNodeDoubleClick(e, node) { const d = node.data || {}; if (d.locked) return; if (d.app && d.action) { openConnectorEdit(node); return } if (d.shape) { setEditingShapeId(node.id); setShapeW(d.width || 160); setShapeH(d.height || 120); setShapeLabel(d.label || ''); setShapeFill(d.fill || '#f1f5f9'); setShapeStroke(d.stroke || '#64748b'); setShapeType(d.shape) } else { setEditingNodeId(node.id); setNodeLabel(d.label || ''); setNodeSubtitle(d.subtitle || ''); setNodeColor(d.color || '#3b82f6'); setNodeTags(Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '')); setNodeLink(d.link || ''); setNodeOwner(d.owner || ''); setNodeFields(Array.isArray(d.fields) ? d.fields.map(f => ({ key: f.key || '', value: f.value || '' })) : []); setNodeType(d.content?.contentType || 'text'); setNodeContent(d.content?.content || ''); setPreviewHtml(false) } }
  function saveNode() { if (!editingNodeId) return; const tags = nodeTags.split(',').map(t => t.trim()).filter(Boolean); const fields = nodeFields.filter(f => (f.key || '').trim() || (f.value || '').trim()).map(f => ({ key: (f.key || '').trim(), value: (f.value || '').trim() })); setNodes(nds => nds.map(n => n.id === editingNodeId ? { ...n, data: { ...n.data, label: nodeLabel, subtitle: nodeSubtitle, color: nodeColor, tags, link: nodeLink, owner: nodeOwner, fields, content: { contentType: nodeType, content: nodeContent } } } : n)); setEditingNodeId(null); autoSave() }
  function openConnectorEdit(node) { const d = node.data || {}; setEditingConnectorId(node.id); setConnApp(d.app || 'wli'); setConnAction(d.action || CONNECTOR_ACTIONS[0].action); setConnLabel(d.label || ''); setConnConfig((d.config && typeof d.config === 'object') ? { ...d.config } : {}); setConnSeqPreview(-1); setConnHtmlPreview(false); setPayloadOpen(false); setPayloadErrores({}) }
  function saveConnector() { if (!editingConnectorId) return; setNodes(nds => nds.map(n => n.id === editingConnectorId ? { ...n, data: { ...n.data, app: connApp, action: connAction, label: connLabel, config: connConfig } } : n)); setEditingConnectorId(null); autoSave() }
  function cambiarAccionConector(action) { setConnAction(action); const def = CONNECTOR_ACTIONS.find(a => a.app === connApp && a.action === action); setConnConfig(defaultConfigFor(def)); setPayloadOpen(false); setPayloadErrores({}) }
  function setConnCfg(key, val) { setConnConfig(cfg => ({ ...cfg, [key]: val })) }
  function guardarConexion(conn) {
    const t = (conn.name || '').trim()
    if (!t) { showToast('Poné un nombre a la conexión', 'error'); return }
    setConnections(prev => {
      const idx = prev.findIndex(c => c.id === conn.id)
      if (idx >= 0) return prev.map((c, i) => i === idx ? conn : c)
      return [...prev, { ...conn, id: conn.id || `conn-${Date.now() }` }]
    })
    autoSave()
    setConnDraft(null)
    showToast('Conexión guardada')
  }
  function eliminarConexion(id) { setConnections(prev => prev.filter(c => c.id !== id)); autoSave(); showToast('Conexión eliminada') }
  function aplicarConexion(conn) {
    if (!conn) return
    setConnCfg('url', conn.url || `https://${conn.url || ''}`)
    setConnCfg('method', conn.method || 'POST')
    setConnCfg('auth_type', conn.auth_type || 'none')
    if (conn.auth_type === 'bearer') setConnCfg('auth_token', conn.auth_token || '')
    else if (conn.auth_type === 'api_key') { setConnCfg('auth_key_name', conn.auth_key_name || ''); setConnCfg('auth_key_value', conn.auth_key_value || '') }
    else if (conn.auth_type === 'basic') { setConnCfg('auth_user', conn.auth_user || ''); setConnCfg('auth_pass', conn.auth_pass || '') }
    setConnCfg('headers', Array.isArray(conn.headers) ? conn.headers.map(h => ({ ...h })) : [])
    showToast(`Conexión "${conn.name}" aplicada`)
  }
  function predecesoresDe(nodeId) {
    return nodes.filter(n => edges.some(e => e.target === nodeId && e.source === n.id))
  }
  function cargarPayload() {
    // Toma el primer predecesor (de cualquier tipo) y copia sus salidas al body.
    const pre = predecesoresDe(editingConnectorId)
    if (!pre.length) { showToast('Conecta primero un nodo de origen a este nodo REST', 'error'); return }
    const src = pre[0]
    const salidas = getNodeOutputs(src)
    const claves = Object.keys(salidas)
    if (!claves.length) { showToast('El nodo de origen no tiene campos que cargar', 'error'); return }
    const body = claves.map(k => {
      const v = salidas[k]
      // Si el valor es un array real, guardarlo como JSON y marcarlo tipo array.
      if (Array.isArray(v)) return { key: k, type: 'array', value: JSON.stringify(v) }
      return { key: k, type: 'text', value: v !== undefined && v !== null ? String(v) : '' }
    })
    setConnCfg('body', body)
    showToast(`Payload cargado desde "${src.data?.label || 'nodo anterior'}"`)
  }
  function construirHeaders(config) {
    const headers = { 'Content-Type': 'application/json' }
    const authType = config.auth_type || 'none'
    if (authType === 'bearer' && config.auth_token) headers['Authorization'] = `Bearer ${config.auth_token}`
    else if (authType === 'api_key' && config.auth_key_name) headers[config.auth_key_name] = config.auth_key_value || ''
    else if (authType === 'basic' && (config.auth_user || config.auth_pass)) headers['Authorization'] = 'Basic ' + (typeof btoa === 'function' ? btoa(`${config.auth_user || ''}:${config.auth_pass || ''}`) : '')
    for (const h of (Array.isArray(config.headers) ? config.headers : [])) {
      if (h && h.key && String(h.key).trim()) headers[String(h.key).trim()] = h.value ?? ''
    }
    return headers
  }

  async function probarConexion() {
    const url = String(connConfig.url || '').trim()
    const method = String(connConfig.method || 'POST').trim().toUpperCase()
    if (!/^https?:\/\//i.test(url)) { showToast('Falta la URL del endpoint', 'error'); return }
    // Validar el payload ANTES de enviar: solo se marcan los renglones con error
    // y se expande el editor para corregirlos.
    if (connApp === 'rest') {
      const validos = new Set()
      for (const p of nodes) {
        if (!edges.some(e => e.target === editingConnectorId && e.source === p.id)) continue
        for (const o of Object.keys(getNodeOutputs(p))) validos.add(o)
      }
      const errores = {}
      ;(connConfig.body || []).forEach((item, i) => {
        const nombre = String(item.key || '').trim()
        const valor = String(item.value ?? '')
        if (!nombre) {
          errores[i] = 'Falta el nombre del campo. Escribí cómo se llama el dato.'
        } else {
          const refs = [...valor.matchAll(REF_SINGLE_BRACE)].map(m => m[1]).filter(r => !r.startsWith('email_tarea'))
          const malas = refs.filter(r => !validos.has(r))
          if (malas.length) errores[i] = `${malas.map(m => `{${m}}`).join(', ')} no disponible. Conectá un nodo que entregue ese dato o escribí el valor a mano.`
        }
      })
      if (Object.keys(errores).length) {
        setPayloadErrores(errores)
        setPayloadOpen(true)
        showToast('Revisá los campos del payload marcados en rojo', 'error')
        return
      }
    }
    setPayloadErrores({})
    const payload = bodyAPayload(connConfig.body)
    const headers = construirHeaders(connConfig)
    setConnTesting(true); setConnTestResult(null)
    let ok = false
    try {
      // El envio va por el SERVIDOR para evitar el bloqueo CORS del navegador.
      const r = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method, headers, body: payload }),
      })
      const res = await r.json().catch(() => null)
      ok = !!res?.ok
      setConnTestResult({
        status: res?.status ?? 0,
        ok: !!res?.ok,
        data: res?.data ?? null,
        error: res?.error || null,
        at: new Date().toISOString(),
      })
    } catch (e) {
      setConnTestResult({ status: 0, ok: false, data: null, error: e.message, at: new Date().toISOString() })
    } finally {
      setConnTesting(false)
    }
    // Cada envio es un intento: incrementa el contador y marca el ultimo estado.
    setNodes(nds => nds.map(n => n.id === editingConnectorId ? { ...n, data: { ...n.data, sent_count: (n.data?.sent_count || 0) + 1, last_status: ok ? 'sent' : 'error' } } : n))
    autoSave()
  }
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
    const filename = `${title || 'flujo'}.wlo.json`
    if (enmarcado && window.parent && window.parent !== window) {
      pedirDescargaAlPadre(text, filename)
      return
    }
    downloadJson(text, filename)
  }
  // Dentro de un iframe con origen opaco los navegadores tratan las descargas
  // de blobs propios como sospechosas aunque el sandbox conceda
  // allow-downloads. En vez de pelear con eso: WLO escucha wlo-request-download
  // y descarga desde SU documento (sin restricciones). Si WLO confirma con
  // wlo-download-ok se avisa; si no responde, respaldo de siempre: el modal
  // con copiar/descargar.
  function pedirDescargaAlPadre(content, filename) {
    let ok = false
    const onAck = e => { if (e.data && e.data.type === 'wlo-download-ok') ok = true }
    window.addEventListener('message', onAck)
    try { window.parent.postMessage({ type: 'wlo-request-download', filename, content }, '*') } catch {}
    setTimeout(() => {
      window.removeEventListener('message', onAck)
      if (ok) { showToast('Flujo exportado'); return }
      setExportText(content)
      setShowExport(true)
    }, 1500)
  }
  const handleImport = () => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.json'; el.onchange = async (ev) => { const file = ev.target.files?.[0]; if (!file) return; try { const text = await file.text(); const data = JSON.parse(text); if (data.nodes) { pushHistory(nodes, edges); setNodes(data.nodes); setEdges(data.edges || []); if (data.title) setTitle(data.title); if (data.description !== undefined) setDescription(data.description); autoSave(data.nodes, data.edges || []); showToast('Flujo importado') } } catch { showToast('Archivo inválido', 'error') } }; el.click() }

  async function publishFlow() {
    if (readOnly) return
    const connNodes = nodes.filter(n => n.type === 'connector')
    if (!connNodes.length) { showToast('No hay acciones de conectores en este flujo', 'error'); return }
    // Mapa de salidas por nodo (cualquier tipo) para resolver referencias {campo}.
    const outputsById = {}
    for (const n of nodes) outputsById[n.id] = getNodeOutputs(n)

    const nodesOut = connNodes.map(n => {
      const config = n.data?.config || {}
      // Resolver referencias {campo} en el body de un nodo REST usando las
      // salidas de los nodos que le conectan (predecesores), sean del tipo que sean.
      if (n.data?.app === 'rest' && Array.isArray(config.body)) {
        const pre = edges.filter(e => e.target === n.id).map(e => outputsById[e.source]).filter(Boolean)
        const merged = Object.assign({}, ...pre)
        const body = config.body.map(item => {
          let v = item.value ?? ''
          if (typeof v === 'string' && v.includes('{')) {
            v = v.replace(REF_SINGLE_BRACE, (_, campo) => (merged[campo] !== undefined ? String(merged[campo]) : ''))
          }
          return { ...item, value: v }
        })
        return { id: n.id, label: n.data?.label || '', app: n.data?.app || '', action: n.data?.action || '', config: { ...config, body } }
      }
      return { id: n.id, label: n.data?.label || '', app: n.data?.app || '', action: n.data?.action || '', config }
    })
    // Los nodos WLI son plantillas: no se envian. Solo se publican los REST.
    const restNodes = nodesOut.filter(n => n.app === 'rest')
    if (!restNodes.length) { showToast('No hay nodos REST para publicar. Los nodos WLI son solo plantillas.', 'error'); return }
    setPublishing(true)
    try {
      const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: wsId, flow_id: flowId, title, connector_nodes: nodesOut }) })
      const body = await r.json().catch(() => null)
      const arr = body && Array.isArray(body.results) ? body.results : []
      setPublishResult(arr)
      setPublishError(!body || typeof body !== 'object' ? `No se pudo publicar (HTTP ${r.status})` : (body.error || null))
      // Marcar el estado de cada nodo conector segun su resultado.
      if (arr.length) {
        const statusById = {}
        for (const res of arr) statusById[res.node_id] = res.ok ? 'sent' : 'error'
        setNodes(nds => nds.map(n => (statusById[n.id] ? { ...n, data: { ...n.data, status: statusById[n.id] } } : n)))
        autoSave()
      }
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
        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm" title="Volver al listado de flujos"><Home size={14} /></button>
        {readOnly ? (
          <span className="h-8 max-w-xs font-semibold text-lg flex-1 truncate">{title || 'Sin titulo'}</span>
        ) : (
          <input value={title} onChange={e => { setTitle(e.target.value); autoSave() }} className="h-8 max-w-xs font-semibold border-0 bg-transparent outline-none text-lg flex-1" placeholder="Titulo del flujo" />
        )}
        {readOnly && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Solo lectura</span>}
        {!readOnly && <>
          <span className="text-xs" style={{ color: saveColor }}>{saveLabel}</span>
          <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Save size={14} />Guardar</button>
        </>}
        <button onClick={handleExport} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Download size={14} />Exportar</button>
        {!readOnly && <button onClick={handleImport} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Upload size={14} />Importar</button>}
        {!readOnly && <button onClick={() => setShowShare(true)} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Share2 size={14} />Compartir</button>}
        {!readOnly && <button onClick={() => setShowConfig(true)} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 h-8 px-3 py-1 text-sm"><Settings size={14} />Configuración</button>}
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
          <div><div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-gray-500">{nodeType === 'url' ? 'URL' : 'Contenido'}</label>{nodeType === 'html' && <span className="flex items-center gap-1"><button onClick={() => { setPreviewFullHtml(nodeContent); setPreviewFullIsCode(!previewHtml); setPreviewFullSource({ type: 'node' }); setPreviewFull(true) }} className="flex items-center gap-1 text-xs rounded px-2 py-0.5 bg-gray-100 hover:bg-gray-200"><Maximize size={12} />Pantalla completa</button><button onClick={() => setPreviewHtml(!previewHtml)} className={`flex items-center gap-1 text-xs rounded px-2 py-0.5 ${previewHtml ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{previewHtml ? <><Edit3 size={12} />Codigo</> : <><Eye size={12} />Preview</>}</button></span>}</div>
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
      {editingConnectorId && <Modal onClose={() => setEditingConnectorId(null)} title={connApp === 'rest' ? 'Conexión REST' : 'Acción de comunicación'}>
        <div className="space-y-4">
          {connApp === 'rest' ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}>
              <Plug size={14} className="text-violet-500" />
              <span className="text-sm font-medium">API REST</span>
              <span className="text-[11px] text-gray-400">conexión directa a un endpoint</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Conexión</label>
                <select value={connApp} onChange={e => { const app = e.target.value; setConnApp(app); const first = CONNECTOR_ACTIONS.find(a => a.app === app); if (first) cambiarAccionConector(first.action) }} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  {CONNECTOR_APPS.filter(a => a !== 'rest').map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Acción</label>
                <select value={connAction} onChange={e => cambiarAccionConector(e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  {CONNECTOR_ACTIONS.filter(a => a.app === connApp).map(a => <option key={a.action} value={a.action}>{a.label}</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nombre del nodo</label>
            <input value={connLabel} onChange={e => setConnLabel(e.target.value)} placeholder={CONNECTOR_ACTIONS.find(a => a.action === connAction)?.label || 'Acción'} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          {(() => { const def = CONNECTOR_ACTIONS.find(a => a.app === connApp && a.action === connAction); if (!def) return null; return (
            <div>
              {connApp === 'rest' && (
                <div className="mb-3 rounded-md border border-dashed border-gray-200 p-2.5">
                  <FieldLabel label="Conexión guardada (opcional)" help="Si ya guardaste este servicio en Configuración, elegilo acá y los datos se cargan solos. Si no, completa los campos manualmente." />
                  {connections.length === 0 ? (
                    <p className="text-[11px] text-gray-400 mt-1">No hay conexiones guardadas. Podés crear una en el botón "Configuración" de arriba.</p>
                  ) : (
                    <select
                      value=""
                      onChange={e => { const c = connections.find(x => x.id === e.target.value); if (c) aplicarConexion(c) }}
                      className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Elegí una conexión guardada...</option>
                      {connections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.method} · {c.url}</option>)}
                    </select>
                  )}
                </div>
              )}
              <label className="text-xs font-medium text-gray-500 mb-1 block">Configuración</label>
              <div className="space-y-2">
                {def.fields.map(f => f.type === 'check' ? (
                  <div key={f.key}>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={!!connConfig[f.key]} onChange={e => setConnCfg(f.key, e.target.checked)} className="w-4 h-4" />
                      {f.label}
                      {f.help && (
                        <span className="group relative inline-flex">
                          <HelpCircle size={11} className="text-gray-300 hover:text-blue-500 cursor-help transition" />
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded-md bg-gray-900 text-white text-[10px] leading-relaxed p-2 z-50 opacity-0 group-hover:opacity-100 transition shadow-lg hidden sm:block">{f.help}</span>
                        </span>
                      )}
                    </label>
                  </div>
                ) : f.type === 'select' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    <select value={connConfig[f.key] || 'POST'} onChange={e => setConnCfg(f.key, e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ) : f.type === 'multiselect' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    <div className="flex flex-wrap gap-1.5">
                      {(f.options || []).map(o => {
                        const activos = String(connConfig[f.key] || '').split(',').map(x => x.trim()).filter(Boolean)
                        const activo = activos.includes(o)
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() => {
                              const sel = activo ? activos.filter(x => x !== o) : [...activos, o]
                              setConnCfg(f.key, sel.join(','))
                            }}
                            className={`px-2 py-1 rounded-md text-[11px] border transition ${activo ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}
                          >
                            {o}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : f.type === 'fields' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    <div className="space-y-1.5">
                      {(connConfig[f.key] || []).map((item, i) => (
                        <div key={i} className="flex gap-1.5">
                          <input value={item.key || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], key: e.target.value }; setConnCfg(f.key, arr) }} placeholder="campo" className="w-2/5 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                          <input value={item.value || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], value: e.target.value }; setConnCfg(f.key, arr) }} placeholder="valor" className="flex-1 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                          <button type="button" title="Quitar campo" onClick={() => setConnCfg(f.key, (connConfig[f.key] || []).filter((_, j) => j !== i))} className="w-8 h-8 rounded-md border hover:bg-gray-50 text-gray-400 flex items-center justify-center shrink-0"><X size={12} /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setConnCfg(f.key, [...(connConfig[f.key] || []), { key: '', value: '' }])} className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed hover:bg-gray-50 text-xs text-gray-500"><Plus size={12} />Agregar campo</button>
                    </div>
                  </div>
                ) : f.type === 'typed' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    {connApp === 'rest' ? (
                      <div>
                        <button type="button" onClick={() => { setPayloadOpen(!payloadOpen); setPayloadErrores({}) }} className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-md border text-xs text-gray-600 hover:bg-gray-50">
                          <span className="flex items-center gap-1.5">
                            {payloadOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>Datos que se envían</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400">{(connConfig[f.key] || []).length || 0} campo{(connConfig[f.key] || []).length === 1 ? '' : 's'}</span>
                          </span>
                          <span className="text-[10px] text-gray-400">{payloadOpen ? 'Ocultar' : 'Editar'}</span>
                        </button>
                        {payloadOpen && (
                          <div className="mt-1.5 space-y-1.5">
                            {(connConfig[f.key] || []).map((item, i) => {
                              const err = payloadErrores[i]
                              return (
                                <div key={i}>
                                  <div className="flex gap-1.5 items-start">
                                    <input value={item.key || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], key: e.target.value }; setConnCfg(f.key, arr); if (payloadErrores[i]) { const n={...payloadErrores}; delete n[i]; setPayloadErrores(n) } }} placeholder="campo" className={`w-[30%] h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono ${err ? 'border-red-400' : ''}`} />
                                    <select value={item.type || 'text'} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], type: e.target.value }; setConnCfg(f.key, arr) }} className="w-[22%] h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200">
                                      <option value="text">texto</option>
                                      <option value="number">numero</option>
                                      <option value="boolean">booleano</option>
                                      <option value="array">array</option>
                                    </select>
                                    <input value={item.value || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], value: e.target.value }; setConnCfg(f.key, arr); if (payloadErrores[i]) { const n={...payloadErrores}; delete n[i]; setPayloadErrores(n) } }} placeholder={item.type === 'array' ? '[1,2,3] o {campo}' : 'valor o {campo}'} className={`flex-1 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono ${err ? 'border-red-400' : ''}`} />
                                    <button type="button" title="Quitar" onClick={() => { setConnCfg(f.key, (connConfig[f.key] || []).filter((_, j) => j !== i)); if (payloadErrores[i]) { const n={...payloadErrores}; delete n[i]; setPayloadErrores(n) } }} className="w-8 h-8 rounded-md border hover:bg-gray-50 text-gray-400 flex items-center justify-center shrink-0"><X size={12} /></button>
                                  </div>
                                  {err && <div className="flex items-start gap-1 text-[10px] text-red-600 mt-0.5"><AlertTriangle size={11} className="shrink-0 mt-px" />{err}</div>}
                                </div>
                              )
                            })}
                            <button type="button" onClick={() => setConnCfg(f.key, [...(connConfig[f.key] || []), { key: '', type: 'text', value: '' }])} className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed hover:bg-gray-50 text-xs text-gray-500"><Plus size={12} />Agregar campo al payload</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {(connConfig[f.key] || []).map((item, i) => {
                          const esArrayRequerido = ARRAY_FIELD_NAMES.includes(String(item.key || '').trim())
                          const tipoMal = esArrayRequerido && (item.type !== 'array')
                          return (
                            <div key={i}>
                              <div className="flex gap-1.5 items-start">
                                <input value={item.key || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], key: e.target.value }; setConnCfg(f.key, arr) }} placeholder="campo" className="w-[30%] h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                                <select value={item.type || 'text'} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], type: e.target.value }; setConnCfg(f.key, arr) }} className={`w-[22%] h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 ${tipoMal ? 'border-red-400 text-red-600' : 'focus:ring-blue-200'}`}>
                                  <option value="text">texto</option>
                                  <option value="number">numero</option>
                                  <option value="boolean">booleano</option>
                                  <option value="array">array</option>
                                </select>
                                <input value={item.value || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], value: e.target.value }; setConnCfg(f.key, arr) }} placeholder={item.type === 'array' ? '[1,2,3] o {campo}' : 'valor o {campo}'} className="flex-1 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                                <button type="button" title="Quitar" onClick={() => setConnCfg(f.key, (connConfig[f.key] || []).filter((_, j) => j !== i))} className="w-8 h-8 rounded-md border hover:bg-gray-50 text-gray-400 flex items-center justify-center shrink-0"><X size={12} /></button>
                              </div>
                              {tipoMal && (
                                <div className="text-[10px] text-red-600 mt-0.5">Este campo debe ser tipo array.</div>
                              )}
                            </div>
                          )
                        })}
                        <button type="button" onClick={() => setConnCfg(f.key, [...(connConfig[f.key] || []), { key: '', type: 'text', value: '' }])} className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed hover:bg-gray-50 text-xs text-gray-500"><Plus size={12} />Agregar campo al payload</button>
                      </div>
                    )}
                  </div>
                ) : f.type === 'auth' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    <select value={connConfig[f.key] || 'none'} onChange={e => setConnCfg(f.key, e.target.value)} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                      <option value="none">Ninguna, acceso público</option>
                      <option value="bearer">Token de acceso (Bearer)</option>
                      <option value="api_key">Clave de API (API Key)</option>
                      <option value="basic">Usuario y contraseña</option>
                    </select>
                    {(connConfig[f.key] || 'none') === 'bearer' && (
                      <div className="mt-1.5">
                        <FieldLabel label="Tu token de acceso" help="La clave que te da el servicio para que te reconozca. Ej: pck_live_..." />
                        <input value={connConfig.auth_token || ''} onChange={e => setConnCfg('auth_token', e.target.value)} placeholder="pck_live_... o tu token" className="w-full h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                      </div>
                    )}
                    {(connConfig[f.key] || 'none') === 'api_key' && (
                      <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                        <div>
                          <FieldLabel label="Nombre de la clave" help="El nombre del campo que pide el servicio. Ej: X-Api-Key" />
                          <input value={connConfig.auth_key_name || ''} onChange={e => setConnCfg('auth_key_name', e.target.value)} placeholder="X-Api-Key" className="w-full h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                        </div>
                        <div>
                          <FieldLabel label="Valor de la clave" help="La clave de acceso en sí, tal como te la dio el servicio." />
                          <input value={connConfig.auth_key_value || ''} onChange={e => setConnCfg('auth_key_value', e.target.value)} placeholder="clave-secreta" className="w-full h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono" />
                        </div>
                      </div>
                    )}
                    {(connConfig[f.key] || 'none') === 'basic' && (
                      <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                        <div>
                          <FieldLabel label="Usuario" />
                          <input value={connConfig.auth_user || ''} onChange={e => setConnCfg('auth_user', e.target.value)} className="w-full h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200" />
                        </div>
                        <div>
                          <FieldLabel label="Contraseña" />
                          <input type="password" value={connConfig.auth_pass || ''} onChange={e => setConnCfg('auth_pass', e.target.value)} className="w-full h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : f.type === 'seqselect' ? (
                  <div key={f.key}>
                    <FieldLabel label={f.label} help={f.help} />
                    <div className="space-y-2">
                      {(connConfig[f.key] || []).map((seq, i) => {
                        const s = (seq && typeof seq === 'object') ? seq : {}
                        const prev = connSeqPreview === i
                        return (
                          <div key={i} className="rounded-md border p-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <label className={`flex items-center gap-1.5 h-8 px-2 rounded-md border cursor-pointer transition ${s.usada ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                                <Check size={12} />
                                <input type="checkbox" checked={!!s.usada} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], usada: e.target.checked }; setConnCfg(f.key, arr) }} className="hidden" />
                              </label>
                              <input value={s.name || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], name: e.target.value }; setConnCfg(f.key, arr) }} placeholder="Nombre de la secuencia" className="flex-1 h-8 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200" />
                              <span className="flex items-center gap-1 shrink-0">
                                <button type="button" title="Pantalla completa" onClick={() => { setPreviewFullHtml(s.html || ''); setPreviewFullIsCode(!prev); setPreviewFullSource({ type: 'connector', field: f.key, index: i }); setPreviewFull(true) }} className="flex items-center gap-1 text-[10px] rounded px-1.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600"><Maximize size={10} /></button>
                                <button type="button" title="Ver preview" onClick={() => setConnSeqPreview(prev ? -1 : i)} className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-1 ${prev ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>{prev ? <Edit3 size={10} /> : <Eye size={10} />}</button>
                                <button type="button" title="Quitar secuencia" onClick={() => setConnCfg(f.key, (connConfig[f.key] || []).filter((_, j) => j !== i))} className="w-6 h-6 rounded border hover:bg-gray-50 text-gray-400 flex items-center justify-center shrink-0"><X size={12} /></button>
                              </span>
                            </div>
                            {prev ? (
                              <iframe srcDoc={s.html || ''} className="w-full min-h-[180px] rounded-md border bg-white" sandbox="allow-scripts" style={{ border: '1px solid #e2e8f0' }} />
                            ) : (
                              <textarea value={s.html || ''} onChange={e => { const arr = [...(connConfig[f.key] || [])]; arr[i] = { ...arr[i], html: e.target.value }; setConnCfg(f.key, arr) }} placeholder={'<p>Hola {nombre}, …</p>'} rows={4} className="w-full rounded-md border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono resize-y" />
                            )}
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => setConnCfg(f.key, [...(connConfig[f.key] || []), { name: `Secuencia ${(connConfig[f.key] || []).length + 1}`, usada: true, html: '' }])} className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed hover:bg-gray-50 text-xs text-gray-500"><Plus size={12} />Agregar secuencia</button>
                    </div>
                  </div>
                ) : (
                  <div key={f.key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="flex items-center gap-1"><FieldLabel label={f.label} help={f.help} /></span>
                      {f.key === 'html' && (
                        <span className="flex items-center gap-1">
                          <button type="button" onClick={() => { setPreviewFullHtml(String(connConfig[f.key] || '')); setPreviewFullIsCode(!connHtmlPreview); setPreviewFullSource({ type: 'connector', field: f.key }); setPreviewFull(true) }} className="flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600"><Maximize size={10} />Pantalla completa</button>
                          <button type="button" onClick={() => setConnHtmlPreview(!connHtmlPreview)} className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ${connHtmlPreview ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                            {connHtmlPreview ? <Edit3 size={10} /> : <Eye size={10} />}{connHtmlPreview ? 'Codigo' : 'Preview'}
                          </button>
                        </span>
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
                        placeholder={f.key === 'html' ? '<p>Hola {nombre}, …</p>' : f.key === 'email' ? '{email_tarea} o correo fijo' : f.key === 'url' ? 'https://api.ejemplo.com/webhook' : f.key === 'list_id' ? 'Si no lo pones, se elige la base al crear la campaña' : ''}
                        rows={f.key === 'html' ? 5 : 1}
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono resize-y"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) })()}
          {(() => {
            // Nodos que conectan HACIA este nodo conector: sus campos de salida
            // se pueden referenciar en el payload con {campo}. Funciona con
            // cualquier tipo de nodo (texto, HTML, figura, conector WLI).
            const predecesores = nodes.filter(n => edges.some(e => e.target === editingConnectorId && e.source === n.id))
            const referencias = []
            for (const p of predecesores) {
              const outs = getNodeOutputs(p)
              for (const o of Object.keys(outs)) referencias.push({ nodo: p.data?.label || p.id, campo: o })
            }
            const payloadPreview = bodyAPayload(connConfig.body)
            return (
              <div className="space-y-2">
                {connApp === 'rest' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={cargarPayload} className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-violet-200 text-xs text-violet-700 hover:bg-violet-50">
                      <Download size={12} /> Cargar payload del nodo anterior
                    </button>
                    <button type="button" onClick={probarConexion} disabled={connTesting} className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                      {connTesting ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />} {connTesting ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                )}
                {connTestResult && (
                  <div className={`rounded-md border p-2 ${connTestResult.ok ? '' : ''}`} style={{ borderColor: connTestResult.ok ? '#bbf7d0' : '#fecaca', background: connTestResult.ok ? '#f0fdf4' : '#fef2f2' }}>
                    <div className="flex items-center gap-2 text-xs">
                      {connTestResult.ok ? <Check size={14} style={{ color: '#16a34a' }} /> : <AlertTriangle size={14} style={{ color: '#dc2626' }} />}
                      <span className={`font-medium ${connTestResult.ok ? 'text-green-700' : 'text-red-700'}`}>
                        {connTestResult.status === 0 ? 'Error de conexión' : `HTTP ${connTestResult.status}`}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">{fmtDate(connTestResult.at)}</span>
                    </div>
                    {connTestResult.error && <div className="text-[11px] text-red-600 mt-1">{connTestResult.error}</div>}
                    {connTestResult.data && <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto" style={{ color: '#374151' }}>{JSON.stringify(connTestResult.data, null, 2)}</pre>}
                  </div>
                )}
                {connApp === 'rest' && referencias.length > 0 && (
                  <div className="rounded-md border p-2" style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}>
                    <div className="text-[11px] font-medium text-gray-500 mb-1">Campos disponibles del nodo anterior:</div>
                    <div className="flex flex-wrap gap-1">
                      {referencias.map((r, i) => (
                        <button key={i} type="button" onClick={() => { setConnCfg('body', [...(connConfig.body || []), { key: r.campo, type: 'text', value: `{${r.campo}}` }]) }} className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 hover:border-blue-400 hover:text-blue-600" title={`${r.nodo} -> ${r.campo}`}>
                          {'{'}{r.campo}{'}'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {connApp === 'rest' && payloadOpen && (connConfig.body || []).length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium text-gray-500 mb-1">Vista previa de lo que se enviará:</div>
                    <pre className="rounded-md border p-2 text-[10px] font-mono whitespace-pre-wrap break-all" style={{ borderColor: '#e2e8f0', background: '#0f172a', color: '#a5f3fc' }}>{JSON.stringify(payloadPreview, null, 2)}</pre>
                  </div>
                )}
              </div>
            )
          })()}
          <p className="text-[11px] leading-relaxed text-gray-400">
            {connApp === 'rest' ? (
              <>Usa el botón <strong>Enviar</strong> para disparar la petición manualmente. Cada envío queda registrado en el nodo como intento (no enviado / enviado N veces).</>
            ) : (
              <>Este nodo es una plantilla para maquetar contenido. Conectalo a un nodo <strong>API REST</strong> para enviar sus datos.</>
            )}
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
      {previewFull && <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 300 }}>
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: '#e2e8f0' }}>
          <span className="text-sm font-medium truncate">{nodeLabel || 'Preview HTML'}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewFullIsCode(!previewFullIsCode)} className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs ${previewFullIsCode ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 hover:bg-gray-200'}`}>{previewFullIsCode ? <><Eye size={14} /> Preview</> : <><Code2 size={14} /> Codigo</>}</button>
            <button onClick={() => setPreviewFull(false)} className="flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs hover:bg-gray-50"><X size={14} />Salir (Esc)</button>
          </div>
        </div>
        {previewFullIsCode ? (
          <textarea
            value={previewFullHtml}
            onChange={e => setPreviewFullHtml(e.target.value)}
            className="flex-1 w-full p-4 font-mono text-xs leading-relaxed border-0 outline-none resize-none bg-gray-900 text-green-400"
            spellCheck={false}
          />
        ) : (
          <iframe key="preview-full" srcDoc={previewFullHtml} className="flex-1 w-full" sandbox="allow-scripts" style={{ border: 0 }} title="Preview pantalla completa" />
        )}
      </div>}
      {showConfig && <Modal onClose={() => setShowConfig(false)} title="Configuración general">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Plug size={14} className="text-violet-500" />Conexiones reutilizables</h3>
              <button onClick={() => setConnDraft({ id: null, name: '', url: '', method: 'POST', auth_type: 'none', auth_token: '', auth_key_name: '', auth_key_value: '', auth_user: '', auth_pass: '', headers: [] })} className="inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 px-3 py-1.5 text-xs"><Plus size={12} />Nueva conexión</button>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">Guardá acá los servicios a los que querés conectar. Después, en cada nodo de conexión elegís uno de estos en vez de escribir todo de nuevo.</p>
            {connections.length === 0 && !connDraft && (
              <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">Todavía no hay conexiones guardadas. Tocá "Nueva conexión" para crear la primera.</div>
            )}
            <div className="space-y-2">
              {connections.map(c => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">{c.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{c.method || 'POST'} · {c.url || 'sin URL'} · {c.auth_type === 'none' ? 'sin identificación' : c.auth_type}</div>
                  </div>
                  <button title="Editar" onClick={() => setConnDraft({ ...c, headers: (c.headers || []).map(h => ({ ...h })) })} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={13} /></button>
                  <button title="Eliminar" onClick={() => eliminarConexion(c.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
          {connDraft && (
            <div className="rounded-md border bg-gray-50 p-3 space-y-2">
              <div className="flex items-center justify-between"><h4 className="text-xs font-semibold text-gray-600">Nueva conexión</h4><button onClick={() => setConnDraft(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button></div>
              <FieldLabel label="Nombre (para reconocerla)" help="Un nombre fácil de recordar, ej: Sistema de facturación" />
              <input value={connDraft.name} onChange={e => setConnDraft({ ...connDraft, name: e.target.value })} placeholder="Ej: CRM principal" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <FieldLabel label="Dirección (URL) del servicio" help="La dirección web donde tu sistema recibe los datos. Si no lleva https://, lo agregamos por vos." />
              <input value={connDraft.url} onChange={e => setConnDraft({ ...connDraft, url: e.target.value })} placeholder="miempresa.com/api/contactos" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel label="Qué acción realiza" help="Cómo le decís al sistema qué hacer." />
                  <select value={connDraft.method} onChange={e => setConnDraft({ ...connDraft, method: e.target.value })} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    {['POST', 'PUT', 'PATCH', 'DELETE', 'GET'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel label="Cómo se identifica" help="Solo elegí una si el servicio te pidió una clave de acceso." />
                  <select value={connDraft.auth_type} onChange={e => setConnDraft({ ...connDraft, auth_type: e.target.value })} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="none">Sin identificación</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="api_key">API Key</option>
                    <option value="basic">Usuario y contraseña</option>
                  </select>
                </div>
              </div>
              {connDraft.auth_type === 'bearer' && (
                <div><FieldLabel label="Token de acceso" help="La clave que te dio el servicio. Ej: pck_live_..." /><input type="password" value={connDraft.auth_token} onChange={e => setConnDraft({ ...connDraft, auth_token: e.target.value })} placeholder="pck_live_..." className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono" /></div>
              )}
              {connDraft.auth_type === 'api_key' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><FieldLabel label="Nombre de la clave" help="El nombre del campo que pide el servicio. Ej: X-Api-Key" /><input value={connDraft.auth_key_name} onChange={e => setConnDraft({ ...connDraft, auth_key_name: e.target.value })} placeholder="X-Api-Key" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono" /></div>
                  <div><FieldLabel label="Valor de la clave" help="La clave de acceso en sí." /><input value={connDraft.auth_key_value} onChange={e => setConnDraft({ ...connDraft, auth_key_value: e.target.value })} placeholder="clave-secreta" className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono" /></div>
                </div>
              )}
              {connDraft.auth_type === 'basic' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><FieldLabel label="Usuario" /><input value={connDraft.auth_user} onChange={e => setConnDraft({ ...connDraft, auth_user: e.target.value })} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
                  <div><FieldLabel label="Contraseña" /><input type="password" value={connDraft.auth_pass} onChange={e => setConnDraft({ ...connDraft, auth_pass: e.target.value })} className="w-full h-9 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" /></div>
                </div>
              )}
              <button onClick={() => guardarConexion(connDraft)} className="w-full h-9 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><Save size={14} className="inline" /> Guardar conexión</button>
            </div>
          )}
        </div>
      </Modal>}
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b"><span className="font-semibold text-sm">{title}</span><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button></div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  </div>
}

const s = {
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' },
}
