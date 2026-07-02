import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { AdminLeadsPage } from './components/AdminLeadsPage'
import { AppPage, HomePage, RootLayout } from './pages'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppPage,
})

const adminLeadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/leads',
  component: AdminLeadsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, appRoute, adminLeadsRoute])

const routerBasepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createRouter({ routeTree, basepath: routerBasepath })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
