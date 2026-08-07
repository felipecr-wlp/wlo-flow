export async function getServerSideProps({ res }) {
  res.writeHead(302, { Location: '/embed' })
  res.end()
  return { props: {} }
}

export default function Home() {
  return null
}
