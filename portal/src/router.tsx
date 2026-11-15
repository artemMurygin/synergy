import { Navigate, Outlet, Route, Routes } from 'react-router'
import { RequireAuth, RequireRole } from '@/features/auth'
import { NavMenu } from '@/features/shell'
import { AppLayout } from '@/layouts/AppLayout'
import { AgentPage } from '@/pages/AgentPage'
import { ArchivePage } from '@/pages/ArchivePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { BugPage } from '@/pages/BugPage'
import { BugQueuePage } from '@/pages/BugQueuePage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { DepartmentsPage } from '@/pages/DepartmentsPage'
import { EmployeeCreatePage } from '@/pages/EmployeeCreatePage'
import { EmployeePage } from '@/pages/EmployeePage'
import { EmployeesPage } from '@/pages/EmployeesPage'
import { LoginPage } from '@/pages/LoginPage'
import { MyBugsPage } from '@/pages/MyBugsPage'
import { MyRequestsPage } from '@/pages/MyRequestsPage'
import { NewBugPage } from '@/pages/NewBugPage'
import { NewIdeaPage } from '@/pages/NewIdeaPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { QueuePage } from '@/pages/QueuePage'
import { RequestPage } from '@/pages/RequestPage'
import { RoadmapPage } from '@/pages/RoadmapPage'
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
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/agents/:id" element={<AgentPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/bugs" element={<MyBugsPage />} />
          <Route path="/bugs/new" element={<NewBugPage />} />
          <Route path="/bugs/:id" element={<BugPage />} />
          <Route element={<RequireRole role="developer" />}>
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/bugs/queue" element={<BugQueuePage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/archive" element={<ArchivePage />} />
          </Route>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin/employees" element={<EmployeesPage />} />
            <Route path="/admin/employees/new" element={<EmployeeCreatePage />} />
            <Route path="/admin/employees/:id" element={<EmployeePage />} />
            <Route path="/admin/departments" element={<DepartmentsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
