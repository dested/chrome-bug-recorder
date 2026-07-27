import type { ReactNode } from 'react'
import '~/styles/app.css'

export default function App({ children }: { children: ReactNode }) {
  return <>{children}</>
}
