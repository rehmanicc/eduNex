export const overviewModule={
  to:'/overview',
  label:'Overview',
  description:'Analytics and insights of the institution.'
};

const tab=(key,label)=>({tab:key,label});
const path=(to,label)=>({to,label});

export const tenantModules = [
  {to:'/admissions', label:'Admissions', permission:'VIEW_ADMISSIONS', description:'Manage inquiries, applications and admissions.', subnav:[path('/admissions/inquiries','Inquiries'),path('/admissions/admissions','Admissions')]},
  {to:'/students', label:'Students', permission:'VIEW_STUDENTS', description:'Manage student records and profiles.', defaultTab:'list', subnav:[tab('list','Student List'),tab('sections','Sections'),tab('change-class','Change Class'),tab('suspend','Suspend Student'),tab('promotion','Promote Class')]},
  {to:'/employees', label:'Employees', permission:'VIEW_EMPLOYEES', description:'Manage faculty and staff records.'},
  {to:'/college-profile', label:'College Profile', roles:['director','admin'], permission:'MANAGE_COLLEGE', description:'Manage college profile, branches, wings, designations and operating rules.', defaultTab:'profile', subnav:[tab('profile','College Profile'),tab('branches','Branches'),tab('wings','Wings'),tab('designations','Designations')]},
  {to:'/academics', label:'Academics', permission:'VIEW_ACADEMICS', description:'Manage classes, programs and academic structure.', defaultTab:'sessions', subnav:[tab('sessions','Sessions'),tab('programs','Classes / Programs'),tab('courses','Courses / Subjects')]},
  {to:'/attendance', label:'Attendance', permission:'VIEW_ATTENDANCE', description:'Record and review attendance.', defaultTab:'student', subnav:[tab('student','Student Attendance'),tab('staff','Staff Attendance'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/timetable', label:'Timetable', permission:'VIEW_ACADEMICS', description:'Teacher assignments, rooms and section timetables.', defaultTab:'assignments', subnav:[tab('assignments','Data & Assignments'),tab('teachers','Teachers'),tab('classes','Classes'),tab('rooms','Rooms'),tab('generate','Generate'),tab('verification','Verification'),tab('timetable','Timetable'),tab('settings','Settings')]},
  {to:'/biometric', label:'Biometric', permission:'MANAGE_BIOMETRIC', description:'Manage biometric devices and synchronization.'},
  {to:'/fees', label:'Fees', permission:'VIEW_FEES', description:'Manage fee structures, vouchers and collections.', defaultTab:'student-details', subnav:[tab('student-details','Student Fee Details'),tab('generate-vouchers','Vouchers & Postings'),tab('reports','Reports'),tab('structures','Fee Structure')]},
  {to:'/finance', label:'Finance', permission:'VIEW_FINANCE_REPORTS', description:'Manage income, expenses, accounts and financial reports.', defaultTab:'overview', subnav:[tab('overview','Overview'),tab('income','Income'),tab('expenses','Expenses'),tab('accounts','Accounts'),tab('transactions','Transactions'),tab('reports','Reports')]},
  {to:'/exams', label:'Exams', permission:'VIEW_EXAMS', description:'Manage exams, results and assessment setup.', defaultTab:'exams', subnav:[tab('exams','Exams'),tab('schedule','Date Sheet'),tab('marks','Marks Entry'),tab('results','Results')]},
  {to:'/library', label:'Library', permission:'VIEW_LIBRARY', description:'Manage books, physical copies and circulation.', defaultTab:'books', subnav:[tab('books','Books & Copies'),tab('issue','Issue / Return'),tab('reservations','Reservations'),tab('fines','Fines'),tab('dashboard','Reports'),tab('settings','Settings')]},
  {to:'/transport', label:'Transport', permission:'VIEW_TRANSPORT', description:'Manage routes, vehicles and transport assignments.', defaultTab:'dashboard', subnav:[tab('dashboard','Dashboard'),tab('vehicles','Vehicles'),tab('routes','Routes & Stops'),tab('assignments','Assignments'),tab('maintenance','Maintenance'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/hostel', label:'Hostel', permission:'VIEW_HOSTEL', description:'Manage hostel rooms and allocations.', defaultTab:'dashboard', subnav:[tab('dashboard','Dashboard'),tab('hostels','Hostels'),tab('rooms','Rooms & Beds'),tab('allocations','Allocations'),tab('fees','Hostel Fees'),tab('attendance','Attendance'),tab('visitors','Visitors'),tab('complaints','Complaints'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/payroll', label:'Payroll', permission:'VIEW_PAYROLL', description:'Manage employee payroll and salary processing.', defaultTab:'dashboard', subnav:[tab('dashboard','Dashboard'),tab('salary','Salary Structure'),tab('payroll','Payroll'),tab('adjustments','Adjustments'),tab('payments','Payments'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/notices', label:'Notices', permission:'VIEW_NOTICES', description:'Publish and manage institutional notices.', defaultTab:'dashboard', subnav:[tab('dashboard','Dashboard'),tab('notices','Notices'),tab('categories','Categories'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/events', label:'Events', permission:'VIEW_EVENTS', description:'Manage calendar events and activities.', defaultTab:'dashboard', subnav:[tab('dashboard','Dashboard'),tab('events','Events'),tab('calendar','Calendar'),tab('reports','Reports'),tab('settings','Settings')]},
  {to:'/feedback', label:'Feedback', roles:['director','admin'], description:'Create feedback, collect responses and review analytics.', defaultTab:'list', subnav:[tab('list','Feedback List'),tab('create','Create Feedback'),tab('analytics','Analytics')]},
  {to:'/users', label:'Users', permission:'MANAGE_USERS', description:'Manage user accounts and access.'},
  {to:'/roles', label:'Roles', permission:'MANAGE_ROLES', description:'Configure roles and permissions.'},
];

export function canAccessModule(user,module){
  if(user?.systemRole==='platform_owner')return true;
  const owned=new Set(user?.permissions||[]);
  const roleCodes=new Set((user?.roles||[]).map(r=>r.code).filter(Boolean));
  if((module.roles||[]).some(role=>roleCodes.has(role)))return true;
  return !module.permission||owned.has('*')||owned.has(module.permission);
}
