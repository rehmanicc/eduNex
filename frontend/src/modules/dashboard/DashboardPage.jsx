import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../contexts/AuthContext';
import {overviewModule,tenantModules,canAccessModule} from '../../config/moduleNavigation';

const moduleInitials={
  Overview:'OV',Admissions:'AD',Students:'ST',Employees:'EM','College Profile':'CP',Academics:'AC',Attendance:'AT',Timetable:'TT',Biometric:'BI',Fees:'FE',Finance:'FI',Exams:'EX',Library:'LI',Transport:'TR',Hostel:'HO',Payroll:'PA',Notices:'NO',Events:'EV',Users:'US',Roles:'RO'
};

const iconPaths={
  Overview:[
    <path key="1" d="M4 19V9"/>,<path key="2" d="M10 19V5"/>,<path key="3" d="M16 19v-7"/>,<path key="4" d="M22 19V3"/>,<path key="5" d="M2 19h22"/>
  ],
  Admissions:[
    <path key="1" d="M9 4h6"/>,<path key="2" d="M10 2h4a2 2 0 0 1 2 2v1H8V4a2 2 0 0 1 2-2Z"/>,<rect key="3" x="5" y="5" width="14" height="17" rx="2"/>,<path key="4" d="M9 11h6M9 15h4"/>,<path key="5" d="M17 14v6M14 17h6"/>
  ],
  Students:[
    <path key="1" d="m3 9 9-5 9 5-9 5-9-5Z"/>,<path key="2" d="M7 11.5V16c2.8 2.4 7.2 2.4 10 0v-4.5"/>,<path key="3" d="M21 9v6"/>
  ],
  Employees:[
    <circle key="1" cx="9" cy="8" r="3"/>,<path key="2" d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20"/>,<circle key="3" cx="18" cy="9" r="2.5"/>,<path key="4" d="M16 14h1.5a4 4 0 0 1 4 4v2"/>
  ],
  'College Profile':[
    <path key="1" d="M3 21h18"/>,<path key="2" d="M5 21V8l7-4 7 4v13"/>,<path key="3" d="M9 21v-5h6v5"/>,<path key="4" d="M8 10h2M14 10h2M8 13h2M14 13h2"/>
  ],
  Academics:[
    <path key="1" d="M3 5.5A3.5 3.5 0 0 1 6.5 2H11v18H6.5A3.5 3.5 0 0 0 3 23.5v-18Z"/>,<path key="2" d="M21 5.5A3.5 3.5 0 0 0 17.5 2H13v18h4.5a3.5 3.5 0 0 1 3.5 3.5v-18Z"/>
  ],
  Attendance:[
    <circle key="1" cx="12" cy="12" r="9"/>,<path key="2" d="m8 12 2.5 2.5L16.5 8.5"/>
  ],
  Timetable:[
    <rect key="1" x="3" y="5" width="18" height="16" rx="2"/>,<path key="2" d="M7 3v4M17 3v4M3 10h18"/>,<circle key="3" cx="14.5" cy="15" r="3"/>,<path key="4" d="M14.5 13.5V15l1 1"/>
  ],
  Biometric:[
    <path key="1" d="M8 8.5A5.5 5.5 0 0 1 18 12c0 5-2.5 8-5 10"/>,<path key="2" d="M5.5 12A6.5 6.5 0 0 1 18 9"/>,<path key="3" d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3.8-1.5 6.1-3.2 8"/>,<path key="4" d="M11 13.5c0-1 .7-1.5 1.5-1.5s1.5.7 1.5 1.5c0 2.6-.9 4.5-2 6"/>,<path key="5" d="M5 16c.4 2.2 1.2 4 2.5 5.5"/>
  ],
  Fees:[
    <rect key="1" x="3" y="6" width="18" height="14" rx="2"/>,<path key="2" d="M16 10h5v6h-5a3 3 0 0 1 0-6Z"/>,<circle key="3" cx="16.5" cy="13" r=".8"/>,<path key="4" d="M6 6V4h11v2"/>
  ],
  Finance:[
    <circle key="1" cx="12" cy="12" r="9"/>,<path key="2" d="M15.5 8.5c-.8-.8-1.9-1.2-3.2-1.2-1.8 0-3.1.9-3.1 2.2 0 3.4 6.3 1.6 6.3 5 0 1.4-1.3 2.4-3.4 2.4-1.4 0-2.7-.5-3.6-1.4"/>,<path key="3" d="M12 5.5v13"/>
  ],
  Exams:[
    <path key="1" d="M9 4h6"/>,<path key="2" d="M10 2h4a2 2 0 0 1 2 2v1H8V4a2 2 0 0 1 2-2Z"/>,<rect key="3" x="5" y="5" width="14" height="17" rx="2"/>,<path key="4" d="m9 13 2 2 4-4M9 18h6"/>
  ],
  Library:[
    <path key="1" d="M4 3h4v18H4zM10 3h4v18h-4z"/>,<path key="2" d="m16 4 3-1 4 16-3 1-4-16Z"/>
  ],
  Transport:[
    <rect key="1" x="3" y="5" width="18" height="13" rx="3"/>,<path key="2" d="M6 18v2M18 18v2M3 11h18M7 8h4M14 8h3"/>,<circle key="3" cx="7" cy="15" r="1"/>,<circle key="4" cx="17" cy="15" r="1"/>
  ],
  Hostel:[
    <path key="1" d="M3 21h18M5 21V6h14v15"/>,<path key="2" d="M8 10h3v3H8zM13 10h3v3h-3zM8 15h8v6H8z"/>,<path key="3" d="M9 6V3h6v3"/>
  ],
  Payroll:[
    <rect key="1" x="3" y="5" width="18" height="14" rx="2"/>,<circle key="2" cx="12" cy="12" r="3"/>,<path key="3" d="M7 8H5v2M17 16h2v-2"/>
  ],
  Notices:[
    <path key="1" d="M4 13V9l12-5v14L4 13Z"/>,<path key="2" d="M16 9a4 4 0 0 1 0 4"/>,<path key="3" d="m6 14 1.5 6h4L10 15"/>
  ],
  Events:[
    <rect key="1" x="3" y="5" width="18" height="16" rx="2"/>,<path key="2" d="M7 3v4M17 3v4M3 10h18"/>,<path key="3" d="m12 13 .9 1.8 2 .3-1.5 1.4.4 2-1.8-.9-1.8.9.4-2-1.5-1.4 2-.3.9-1.8Z"/>
  ],
  Users:[
    <circle key="1" cx="9" cy="8" r="3"/>,<path key="2" d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20"/>,<path key="3" d="M17 11v6M14 14h6"/>
  ],
  Roles:[
    <path key="1" d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/>,<path key="2" d="m8.5 12 2.2 2.2 4.8-4.8"/>
  ]
};

function ModuleIcon({label}){
  const paths=iconPaths[label]||iconPaths.Overview;
  return <svg className="module-card-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

export default function Dashboard(){
  const{user}=useAuth();
  const navigate=useNavigate();
  const modules=[overviewModule,...tenantModules.filter(module=>canAccessModule(user,module))];

  return <div className="dashboard-page">
    <section className="dashboard-modules">
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-eyebrow">Workspace</p>
          <h2>Modules</h2>
          <p className="dashboard-subtitle">Open a module to continue your work.</p>
        </div>
      </div>

      <div className="module-card-grid">
        {modules.map(module=><button
          key={module.to}
          type="button"
          className={`module-card module-card-${moduleInitials[module.label]?.toLowerCase()||'default'}`}
          onClick={()=>navigate(module.to)}
        >
          <span className="module-card-icon"><ModuleIcon label={module.label}/></span>
          <span className="module-card-content">
            <strong>{module.label}</strong>
            <small>{module.description}</small>
          </span>
          <span className="module-card-arrow" aria-hidden="true">›</span>
        </button>)}
      </div>
    </section>
  </div>;
}
