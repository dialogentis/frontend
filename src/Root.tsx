import { Navigate, Route, Routes } from 'react-router-dom'
import { EmailPage, LoginPage, PasswordPage } from './pages/Auth'
import { InvitationPage, OrganizationsPage, RequireSession, WorkspacePage } from './pages/Organizations'
import { DeletionStatusPage } from './pages/Deletion'

export function Root() {
  return <Routes>
    <Route path="/" element={<Navigate to="/app/organizations" replace/>}/>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/register" element={<EmailPage key="register" mode="register"/>}/>
    <Route path="/forgot-password" element={<EmailPage key="reset-request" mode="reset"/>}/>
    <Route path="/verify-email" element={<PasswordPage key="verify" verify/>}/>
    <Route path="/reset-password" element={<PasswordPage key="reset"/>}/>
    <Route path="/invitations/accept" element={<InvitationPage/>}/>
    <Route path="/app/organizations" element={<RequireSession><OrganizationsPage/></RequireSession>}/>
    <Route path="/app/deletions/:jobId" element={<RequireSession><DeletionStatusPage/></RequireSession>}/>
    <Route path="/app/o/:orgId" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/overview" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/agents" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/agents/:agentId/:section?" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/members" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/settings" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/integrations" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/conversations" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/analytics" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="/app/o/:orgId/audit" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="*" element={<Navigate to="/app/organizations" replace/>}/>
  </Routes>
}
