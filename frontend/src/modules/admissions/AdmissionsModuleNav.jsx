import { NavLink } from 'react-router-dom';

export default function AdmissionsModuleNav(){
  return <>
    <h1 className="admissions-module-title">Admissions</h1>
    <nav className="module-navigation-bar admissions-module-navigation" aria-label="Admissions navigation">
      <NavLink to="/" end>Dashboard</NavLink>
      <NavLink to="/admissions/inquiries">Inquiries</NavLink>
      <NavLink to="/admissions/admissions">Admissions</NavLink>
      <NavLink to="/admissions/reports">Reports</NavLink>
    </nav>
  </>;
}
