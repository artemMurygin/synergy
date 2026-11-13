import { Navigate, Outlet, Route, Routes } from 'react-router'
import { RequireAuth, RequireRole } from '@/features/auth'
import { NavMenu } from '@/features/shell'
import { AppLayout } from '@/layouts/AppLayout'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { LoginPage } from '@/pages/LoginPage'
import { MyRequestsPage } from '@/pages/MyRequestsPage'
import { NewIdeaPage } from '@/pages/NewIdeaPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { QueuePage } from '@/pages/QueuePage'
import { RequestPage } from '@/pages/RequestPage'
import { SkillsPage } from '@/pages/SkillsPage'

function Shell() {
  return <AppLayout header={<NavMenu />} body={<Outlet />} />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/requests" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route element={<Shell />}>
          <Route path="/ideas/new" element={<NewIdeaPage />} />
          <Route path="/requests" element={<MyRequestsPage />} />
          <Route path="/requests/:id" element={<RequestPage />} />
          <Route element={<RequireRole role="developer" />}>
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/skills" element={<SkillsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
