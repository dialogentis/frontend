import { Navigate, Route, Routes } from 'react-router-dom'
import { CredentialsPage, EmailPage, ResetPage } from './pages/Auth'
import { InvitationPage, OrganizationsPage, RequireSession, WorkspacePage } from './pages/Organizations'

export function Root() {
  return <Routes>
    <Route path="/" element={<Navigate to="/app/organizations" replace/>}/>
    <Route path="/login" element={<CredentialsPage register={false}/>}/>
    <Route path="/register" element={<CredentialsPage register/>}/>
    <Route path="/forgot-password" element={<EmailPage/>}/>
    <Route path="/verify-email" element={<EmailPage verify/>}/>
    <Route path="/reset-password" element={<ResetPage/>}/>
    <Route path="/invitations/accept" element={<InvitationPage/>}/>
    <Route path="/app/organizations" element={<RequireSession><OrganizationsPage/></RequireSession>}/>
    <Route path="/app/o/:orgId" element={<RequireSession><WorkspacePage/></RequireSession>}/>
    <Route path="*" element={<Navigate to="/app/organizations" replace/>}/>
  </Routes>
}
