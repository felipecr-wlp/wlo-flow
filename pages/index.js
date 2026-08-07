import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const { replace, asPath } = useRouter()
  useEffect(() => {
    const search = asPath.includes('?') ? asPath.substring(asPath.indexOf('?')) : ''
    replace('/embed' + search)
  }, [])
  return null
}
