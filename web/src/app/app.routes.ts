import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard as can } from './core/guards';
import { Shell } from './shell/shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [guestGuard], loadComponent: () => import('./pages/landing').then((m) => m.LandingPage), title: 'Fieldwork · Time, invoices and payments for services studios' },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/auth').then((m) => m.LoginPage), title: 'Sign in · Fieldwork', data: { description: 'Sign in to your Fieldwork workspace, or open the demo studio as any role without an account.' } },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/auth').then((m) => m.RegisterPage), title: 'Create workspace · Fieldwork', data: { description: 'Create a Fieldwork workspace for your studio in a minute: time, approvals, invoices and payments in one place.' } },
  { path: 'forgot-password', loadComponent: () => import('./pages/auth').then((m) => m.ForgotPage), title: 'Reset password · Fieldwork' },
  { path: 'reset-password', loadComponent: () => import('./pages/auth').then((m) => m.ResetPage), title: 'Choose a new password · Fieldwork' },
  { path: 'invite/:token', loadComponent: () => import('./pages/auth').then((m) => m.InvitePage), title: 'Join workspace · Fieldwork' },
  {
    path: '',
    component: Shell,
    data: { private: true },
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', loadComponent: () => import('./pages/overview').then((m) => m.OverviewPage), title: 'Overview · Fieldwork' },
      { path: 'projects', loadComponent: () => import('./pages/projects').then((m) => m.ProjectsPage), title: 'Projects · Fieldwork' },
      { path: 'projects/:id', loadComponent: () => import('./pages/project-detail').then((m) => m.ProjectDetailPage), title: 'Project · Fieldwork' },
      { path: 'time', canActivate: [can('time.own', 'time.approve')], loadComponent: () => import('./pages/time').then((m) => m.TimePage), title: 'Time · Fieldwork' },
      { path: 'analytics', canActivate: [can('analytics.view')], loadComponent: () => import('./pages/analytics').then((m) => m.AnalyticsPage), title: 'Analytics · Fieldwork' },
      { path: 'reports', canActivate: [can('reports.view')], loadComponent: () => import('./pages/reports').then((m) => m.ReportsPage), title: 'Reports · Fieldwork' },
      { path: 'chat', canActivate: [can('chat.use')], loadComponent: () => import('./pages/chat').then((m) => m.ChatPage), title: 'Chat · Fieldwork' },
      { path: 'chat/:id', canActivate: [can('chat.use')], loadComponent: () => import('./pages/chat').then((m) => m.ChatPage), title: 'Chat · Fieldwork' },
      { path: 'clients', canActivate: [can('clients.view')], loadComponent: () => import('./pages/clients').then((m) => m.ClientsPage), title: 'Clients · Fieldwork' },
      { path: 'clients/:id', canActivate: [can('clients.view')], loadComponent: () => import('./pages/clients').then((m) => m.ClientDetailPage), title: 'Client · Fieldwork' },
      { path: 'invoices', canActivate: [can('finance.view')], loadComponent: () => import('./pages/invoices').then((m) => m.InvoicesPage), title: 'Invoices · Fieldwork' },
      { path: 'invoices/:id', canActivate: [can('finance.view')], loadComponent: () => import('./pages/invoice-detail').then((m) => m.InvoiceDetailPage), title: 'Invoice · Fieldwork' },
      { path: 'payments', canActivate: [can('finance.view')], loadComponent: () => import('./pages/payments').then((m) => m.PaymentsPage), title: 'Payments · Fieldwork' },
      { path: 'cards', canActivate: [can('finance.view')], loadComponent: () => import('./pages/payments').then((m) => m.CardsPage), title: 'Cards · Fieldwork' },
      { path: 'users', canActivate: [can('users.manage')], loadComponent: () => import('./pages/users').then((m) => m.UsersPage), title: 'Users · Fieldwork' },
      { path: 'staff', canActivate: [can('staff.view')], loadComponent: () => import('./pages/staff').then((m) => m.StaffPage), title: 'Staff · Fieldwork' },
      { path: 'staff/:id', canActivate: [can('staff.view')], loadComponent: () => import('./pages/staff').then((m) => m.StaffDetailPage), title: 'Staff member · Fieldwork' },
      { path: 'notifications', loadComponent: () => import('./pages/notifications').then((m) => m.NotificationsPage), title: 'Notifications · Fieldwork' },
      { path: 'settings', canActivate: [can('workspace.settings')], loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage), title: 'Settings · Fieldwork' },
      { path: 'profile', loadComponent: () => import('./pages/profile').then((m) => m.ProfilePage), title: 'Profile · Fieldwork' },
      { path: 'audit', canActivate: [can('audit.view')], loadComponent: () => import('./pages/audit').then((m) => m.AuditPage), title: 'Audit log · Fieldwork' },
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFoundPage), title: 'Page not found · Fieldwork' },
];
