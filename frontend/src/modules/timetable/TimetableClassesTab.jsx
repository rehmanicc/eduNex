import {useState} from 'react';
import TimetableClasses from './TimetableClasses';
import ClassTimetableConstraints from './ClassTimetableConstraints';
import TimetableDivisions from './TimetableDivisions';
export default function TimetableClassesTab({options,assignments}){
 const[sub,setSub]=useState('overview');
 return <><div className="tt-subtabs"><button className={sub==='overview'?'active':''} onClick={()=>setSub('overview')}>Overview</button><button className={sub==='constraints'?'active':''} onClick={()=>setSub('constraints')}>Constraints</button><button className={sub==='divisions'?'active':''} onClick={()=>setSub('divisions')}>Student Divisions</button></div>{sub==='overview'?<TimetableClasses options={options} assignments={assignments}/>:sub==='constraints'?<ClassTimetableConstraints options={options}/>:<TimetableDivisions options={options}/>}</>;
}
