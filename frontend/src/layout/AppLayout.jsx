import {Link,NavLink,Outlet,useLocation} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {overviewModule,tenantModules,canAccessModule} from '../config/moduleNavigation';

export default function AppLayout(){
  const{user,college,logout}=useAuth();
  const location=useLocation();
  const isOwner=user?.systemRole==='platform_owner';

  // Default eduNex branding.
  // College-specific branding overrides these images automatically.
  const defaultLogo='/branding/edunex-default-logo.png';
  const defaultBanner='/branding/edunex-default-banner.png';

  const logoSrc=college?.logoUrl||defaultLogo;
  const bannerSrc=college?.bannerUrl||defaultBanner;

  const roleLabel=isOwner
    ?'Platform Owner'
    :(user?.roles||[]).map(r=>r.name).join(' + ')||user?.systemRole||'User';

  const navigationModules=[
    overviewModule,
    ...tenantModules.filter(module=>canAccessModule(user,module))
  ];

  const currentModule=!isOwner
    ? navigationModules.find(
        module=>
          location.pathname===module.to||
          location.pathname.startsWith(`${module.to}/`)
      )
    : null;

  const searchParams=new URLSearchParams(location.search);
  const activeTab=searchParams.get('tab')||currentModule?.defaultTab||'';

  const isSubnavActive=item=>item.tab
    ? activeTab===item.tab
    : location.pathname===item.to||
      location.pathname.startsWith(`${item.to}/`);

  const pageTitle=isOwner
    ? 'Platform Administration'
    : location.pathname==='/'
      ? 'Dashboard'
      : currentModule?.label||'Dashboard';

  const bannerSubtitle=isOwner
    ? 'Manage institutions, platform access and high-level configuration.'
    : pageTitle==='Dashboard'
      ? `Welcome to ${college?.name||'your institution'} workspace.`
      : `${pageTitle} • ${college?.name||'CollegeCMS'}`;

  return <div className="app-shell">

    {/* Logo area */}
    <section
      className="app-logo-pane"
      aria-label={isOwner?'Platform logo':'College logo'}
    >
      {!isOwner
        ? <img
            src={logoSrc}
            alt={`${college?.name||'eduNex'} logo`}
            onError={e=>{
              if(e.currentTarget.src.endsWith(defaultLogo)) return;
              e.currentTarget.src=defaultLogo;
            }}
          />
        : <div className="sidebar-logo-placeholder">
            <span>COLLEGECMS</span>
            <small>Platform</small>
          </div>
      }
    </section>

    {/* Banner area */}
    {!isOwner ? (
      <header
        className="app-top-banner app-top-banner-custom"
        aria-label="College banner"
      >
        <img
          className="app-custom-banner-image"
          src={bannerSrc}
          alt=""
          onError={e=>{
            if(e.currentTarget.src.endsWith(defaultBanner)) return;
            e.currentTarget.src=defaultBanner;
          }}
        />
      </header>
    ) : (
      <header
        className="app-top-banner"
        style={{
          backgroundImage:
            `linear-gradient(115deg, ${
              college?.theme?.primaryColor||'#1d4ed8'
            }, ${
              college?.theme?.secondaryColor||'#4f46e5'
            })`
        }}
      >
        <div className="app-top-banner-copy">
          <p className="dashboard-eyebrow dashboard-eyebrow-light">
            {pageTitle}
          </p>

          <h1>
            {pageTitle==='Dashboard'
              ? `Welcome back, ${roleLabel}!`
              : pageTitle}
          </h1>

          <p>{bannerSubtitle}</p>
        </div>

        <div
          className="dashboard-banner-art"
          aria-hidden="true"
        >
          <div className="campus-roof"></div>

          <div className="campus-building">
            <span></span>
            <span></span>
            <span></span>
          </div>

          <div className="campus-ground"></div>
        </div>
      </header>
    )}

    {/* Navigation */}
    <aside className="app-navigation-pane">

      <div className="brand">
        <strong>{college?.name||'CollegeCMS Platform'}</strong>
        <small>{roleLabel}</small>
      </div>

      <nav className="sidebar-navigation">

        {isOwner
          ? <NavLink to="/platform">
              Platform Administration
            </NavLink>

          : <>
              <NavLink to="/" end>
                Dashboard
              </NavLink>

              {currentModule?.subnav?.length

                ? <div className="sidebar-module-group">

                    <div className="sidebar-module-title">
                      {currentModule.label}
                    </div>

                    {currentModule.subnav.map(item=>{
                      const to=
                        item.to||
                        `${currentModule.to}?tab=${item.tab}`;

                      return <Link
                        key={to}
                        className={
                          `sidebar-child-link${
                            isSubnavActive(item)
                              ? ' active'
                              : ''
                          }`
                        }
                        to={to}
                      >
                        {item.label}
                      </Link>;
                    })}

                  </div>

                : currentModule&&
                  <NavLink to={currentModule.to}>
                    {currentModule.label}
                  </NavLink>
              }
            </>
        }

      </nav>

      <button
        className="sidebar-logout"
        onClick={logout}
      >
        Logout
      </button>

    </aside>

    {/* Main application content */}
    <main className="app-page-area">

      {!isOwner&&
        <div
          className="cms-global-print-brand"
          aria-hidden="true"
        >

          {college?.logoUrl&&
            <img
              src={college.logoUrl}
              alt=""
              onError={e=>{
                e.currentTarget.style.display='none';
              }}
            />
          }

          <div>
            <strong>
              {String(
                college?.name||'CollegeCMS'
              ).toUpperCase()}
            </strong>

            <span>College Management System</span>
          </div>

        </div>
      }

      <Outlet/>

    </main>

    {/* Footer */}
    <footer className="app-footer app-footer-full">
      <span>
        © {new Date().getFullYear()}{' '}
        {college?.name||'CollegeCMS'}. All rights reserved.
      </span>

      <span>CollegeCMS</span>
    </footer>

  </div>;
}