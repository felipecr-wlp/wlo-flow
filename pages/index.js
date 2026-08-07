import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const { replace, asPath } = useRouter()
  useEffect(() => {
    const search = asPath.includes('?') ? asPath.substring(asPath.indexOf('?')) : ''
    replace('/embed' + search)
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', color: '#94a3b8', fontSize: 14 }}>
      Cargando...
    </div>
  )
}
