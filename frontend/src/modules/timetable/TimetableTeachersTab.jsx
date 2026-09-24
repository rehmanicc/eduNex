import {useState} from 'react';
import TimetableTeachers from './TimetableTeachers';
import TimetableConstraints from './TimetableConstraints';

export default function TimetableTeachersTab({options}){
 const[sub,setSub]=useState('workload');
 return <><div className="tt-subtabs"><button className={sub==='workload'?'active':''} onClick={()=>setSub('workload')}>Workload</button><button className={sub==='constraints'?'active':''} onClick={()=>setSub('constraints')}>Constraints</button></div>{sub==='workload'?<TimetableTeachers options={options}/>:<TimetableConstraints options={options}/>}</>;
}
