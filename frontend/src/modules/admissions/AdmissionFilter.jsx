import { FILTER_OPTIONS } from './admissionsUtils';

export default function AdmissionFilter({field,value,onFieldChange,onValueChange}){
  return <div className="admission-filterbar">
    <label>
      <span>Filter</span>
      <select value={field} onChange={e=>onFieldChange(e.target.value)}>
        {FILTER_OPTIONS.map(([optionValue,label])=><option key={optionValue} value={optionValue}>{label}</option>)}
      </select>
    </label>
    <label className="admission-filter-value">
      <span>Value</span>
      <input type="search" value={value} onChange={e=>onValueChange(e.target.value)} placeholder="Type to find nearest match"/>
    </label>
    {value&&<button type="button" className="admission-filter-clear" onClick={()=>onValueChange('')}>Clear</button>}
  </div>;
}
