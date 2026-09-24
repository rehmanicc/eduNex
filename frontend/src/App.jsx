import {lazy,Suspense} from 'react';
import {Navigate,Route,Routes} from 'react-router-dom';
import {useAuth} from './contexts/AuthContext';
import AppLayout from './layout/AppLayout';

// Route-level code splitting: keep the initial bundle small and load each
// institutional module only when the user actually opens it.
const Login=lazy(()=>import('./modules/auth/LoginPage'));
const ChangePassword=lazy(()=>import('./modules/auth/ChangePasswordPage'));
const Dashboard=lazy(()=>import('./modules/dashboard/DashboardPage'));
const Overview=lazy(()=>import('./modules/overview/OverviewPage'));
const Students=lazy(()=>import('./modules/students/StudentsPage'));
const Inquiries=lazy(()=>import('./modules/admissions/InquiriesPage'));
const Admissions=lazy(()=>import('./modules/admissions/AdmissionsPage'));
const AdmissionsReports=lazy(()=>import('./modules/admissions/AdmissionsReportsPage'));
const Employees=lazy(()=>import('./modules/employees/EmployeesPage'));
const Academics=lazy(()=>import('./modules/academics/AcademicsPage'));
const Attendance=lazy(()=>import('./modules/attendance/AttendancePage'));
const Timetable=lazy(()=>import('./modules/timetable/TimetablePage'));
const CollegeProfile=lazy(()=>import('./modules/collegeProfile/CollegeProfilePage'));
const Biometric=lazy(()=>import('./modules/biometric/BiometricPage'));
const Fees=lazy(()=>import('./modules/fees/FeesPage'));
const Finance=lazy(()=>import('./modules/finance/FinancePage'));
const Exams=lazy(()=>import('./modules/exams/ExamsPage'));
const Library=lazy(()=>import('./modules/library/LibraryPage'));
const Transport=lazy(()=>import('./modules/transport/TransportPage'));
const Hostel=lazy(()=>import('./modules/hostel/HostelPage'));
const Payroll=lazy(()=>import('./modules/payroll/PayrollPage'));
const Notices=lazy(()=>import('./modules/notices/NoticesPage'));
const Users=lazy(()=>import('./modules/users/UsersPage'));
const Roles=lazy(()=>import('./modules/roles/RolesPage'));
const Events=lazy(()=>import('./modules/events/EventsPage'));
const Platform=lazy(()=>import('./modules/platform/PlatformPage'));
const Feedback=lazy(()=>import('./modules/feedback/FeedbackPage'));

function RouteLoading(){
  return <p style={{padding:'24px'}}>Loading...</p>;
}

export default function App(){
  const{user,loading}=useAuth();
  if(loading)return <p>Loading...</p>;
  if(!user)return <Suspense fallback={<RouteLoading/>}><Routes><Route path="*" element={<Login/>}/></Routes></Suspense>;
  if(user.mustChangePassword)return <Suspense fallback={<RouteLoading/>}><Routes><Route path="/change-password" element={<ChangePassword/>}/><Route path="*" element={<Navigate to="/change-password" replace/>}/></Routes></Suspense>;
  const owner=user?.systemRole==='platform_owner';
  return <Suspense fallback={<RouteLoading/>}><Routes>
    <Route element={<AppLayout/>}>
      {owner?<>
        <Route path="/" element={<Navigate to="/platform" replace/>}/>
        <Route path="/platform" element={<Platform/>}/>
      </>:<>
        <Route path="/" element={<Dashboard/>}/>
        <Route path="/overview" element={<Overview/>}/>
        <Route path="/admissions" element={<Navigate to="/admissions/inquiries" replace/>}/>
        <Route path="/admissions/inquiries" element={<Inquiries/>}/>
        <Route path="/admissions/admissions" element={<Admissions/>}/>
        <Route path="/admissions/reports" element={<AdmissionsReports/>}/>
        <Route path="/students" element={<Students/>}/>
        <Route path="/employees" element={<Employees/>}/>
        <Route path="/college-profile" element={<CollegeProfile/>}/>
        <Route path="/wings" element={<Navigate to="/college-profile" replace/>}/>
        <Route path="/academics" element={<Academics/>}/>
        <Route path="/attendance" element={<Attendance/>}/>
        <Route path="/timetable" element={<Timetable/>}/>
        <Route path="/biometric" element={<Biometric/>}/>
        <Route path="/fees" element={<Fees/>}/>
        <Route path="/finance" element={<Finance/>}/>
        <Route path="/exams" element={<Exams/>}/>
        <Route path="/library" element={<Library/>}/>
        <Route path="/transport" element={<Transport/>}/>
        <Route path="/hostel" element={<Hostel/>}/>
        <Route path="/payroll" element={<Payroll/>}/>
        <Route path="/notices" element={<Notices/>}/>
        <Route path="/events" element={<Events/>}/>
        <Route path="/feedback" element={<Feedback/>}/>
        <Route path="/users" element={<Users/>}/>
        <Route path="/roles" element={<Roles/>}/>
      </>}
    </Route>
    <Route path="*" element={<Navigate to={owner?'/platform':'/'} replace/>}/>
  </Routes></Suspense>;
}
