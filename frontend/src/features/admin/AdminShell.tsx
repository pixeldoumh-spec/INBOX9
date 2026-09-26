import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../../api/auth';
import { useSessionStore } from '../../state/session';

function AdminSplash(){
  return <div className="admin-splash" role="status" aria-live="polite"><div className="admin-splash-mark">I9</div><strong>Loading admin console…</strong></div>;
}

function AdminDenied(){
  return <section className="admin-denied"><div className="admin-lock-mark">!</div><span className="admin-eyebrow">ADMIN ONLY</span><h1>Admin access required</h1><p>This area is isolated from the customer application. Your account does not have the admin role.</p><Link className="primary-button" to="/apps">Return to customer app</Link></section>;
}

function AdminShell(){
  const user=useSessionStore(s=>s.user);
  const setUser=useSessionStore(s=>s.setUser);
  const setBootstrap=useSessionStore(s=>s.setBootstrap);
  const navigate=useNavigate();
  const [signingOut,setSigningOut]=useState(false);
  async function signOut(){
    setSigningOut(true);
    try{await logout()}finally{setUser(null);setBootstrap('signed-out');setSigningOut(false);navigate('/login',{replace:true});}
  }
  const items=[['/admin','Dashboard'],['/admin/users','Users'],['/admin/services','Services & routing'],['/admin/activations','Activation operations'],['/admin/payments','Payment operations'],['/admin/support','Support'],['/admin/notifications','Notifications']] as const;
  return <div className="admin-shell">
    <header className="admin-topbar">
      <Link className="admin-brand" to="/admin"><span className="admin-brand-mark">I9</span><span><strong>INBOX9</strong><small>ADMIN CONSOLE</small></span></Link>
      <div className="admin-topbar-meta"><span className="admin-role-pill">ADMIN</span><span className="admin-email">{user?.email}</span><button className="admin-signout" type="button" onClick={()=>void signOut()} disabled={signingOut}>{signingOut?'Signing out…':'Sign out'}</button></div>
    </header>
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-label">Operations</div>
        <nav className="admin-nav">{items.map(([to,label])=><NavLink end={to==='/admin'} key={to} to={to} className={state=>'admin-nav-link'+(state.isActive?' is-active':'')}>{label}</NavLink>)}</nav>
        <div className="admin-boundary-card"><span>Customer UI is separate</span><small>No Buy, service marketplace, wallet or OTP workspace is mounted in this console.</small></div>
      </aside>
      <main className="admin-main"><Outlet/></main>
    </div>
  </div>;
}

export function AdminAccessGate(){
  const bootstrap=useSessionStore(s=>s.bootstrap);
  const user=useSessionStore(s=>s.user);
  const location=useLocation();
  if(bootstrap==='idle'||bootstrap==='loading')return <AdminSplash/>;
  if(!user)return <Navigate to={'/login?next='+encodeURIComponent(location.pathname+location.search)} replace/>;
  if(user.role!=='admin')return <AdminDenied/>;
  return <AdminShell/>;
}
