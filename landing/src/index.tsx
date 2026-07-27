import ReactDOM from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import App from './App'
import { routes } from './app/routes'

const router = createBrowserRouter(routes)

ReactDOM.hydrateRoot(
  document.getElementById('app') as HTMLElement,
  <App>
    <RouterProvider router={router} />
  </App>
)
