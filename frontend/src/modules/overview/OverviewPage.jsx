import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../api/client';

function safeNumber(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n:0;
}

export default function OverviewPage(){
  const[data,setData]=useState(null);
  const[error,setError]=useState('');
  const navigate=useNavigate();

  useEffect(()=>{
    let active=true;
    api.get('/reports/dashboard')
      .then(r=>{if(active)setData(r.data||{});})
      .catch(()=>{if(active)setError('Unable to load overview analytics.');});
    return()=>{active=false;};
  },[]);

  const metrics=useMemo(()=>[
    {label:'Active Students',value:safeNumber(data?.students),icon:'🎓',tone:'blue',caption:'Total Enrolled Students'},
    {label:'Employees',value:safeNumber(data?.employees),icon:'♟',tone:'green',caption:'Active Staff Members'},
    {label:'Books Issued',value:safeNumber(data?.libraryIssued),icon:'▤',tone:'purple',caption:'Currently Issued Books'},
    {label:'Fees Collected',value:safeNumber(data?.fees?.paid),icon:'₨',tone:'orange',caption:'Current Period Collection'}
  ],[data]);

  const maxValue=Math.max(...metrics.map(m=>m.value),1);

  return <div className="overview-page">
    <div className="overview-page-header">
      <div>
        <p className="dashboard-eyebrow">Analytics</p>
        <h1>Overview</h1>
        <p className="dashboard-subtitle">Institution-level activity, counts and quick trends.</p>
      </div>
      <button className="overview-back-btn" type="button" onClick={()=>navigate('/')}>← Dashboard</button>
    </div>

    {error&&<div className="overview-message error">{error}</div>}
    {!data&&!error&&<p className="muted">Loading analytics...</p>}

    {data&&<>
      <div className="analytics-card-grid">
        {metrics.map(metric=><article className={`analytics-card analytics-card-${metric.tone}`} key={metric.label}>
          <div className="analytics-card-watermark" aria-hidden="true">{metric.icon}</div>
          <div className="analytics-card-icon" aria-hidden="true">{metric.icon}</div>
          <span className="analytics-card-label">{metric.label}</span>
          <strong>{metric.value.toLocaleString()}</strong>
          <p className="analytics-card-caption">{metric.caption}</p>
          <div className="analytics-card-bottom">
            <span className="analytics-card-trend">▲ +0% <em>vs last month</em></span>
            <span className="analytics-card-arrow" aria-hidden="true">→</span>
          </div>
          <div className="analytics-card-wave analytics-card-wave-one" aria-hidden="true"></div>
          <div className="analytics-card-wave analytics-card-wave-two" aria-hidden="true"></div>
        </article>)}
      </div>

      <section className="analytics-panel">
        <div className="analytics-panel-heading">
          <div>
            <h2>Institution Snapshot</h2>
            <p>Relative view of the current dashboard metrics.</p>
          </div>
        </div>
        <div className="analytics-bar-chart" role="img" aria-label="Bar chart of current institution metrics">
          {metrics.map(metric=><div className="analytics-bar-row" key={metric.label}>
            <span className="analytics-bar-label">{metric.label}</span>
            <div className="analytics-bar-track"><span style={{width:`${Math.max((metric.value/maxValue)*100,metric.value?4:0)}%`}}></span></div>
            <strong>{metric.value.toLocaleString()}</strong>
          </div>)}
        </div>
      </section>

      <section className="analytics-panel analytics-note-panel">
        <h2>Overview workspace</h2>
        <p>This page is now the home for dashboard analytics. Additional charts such as admissions trends, attendance percentage, fee collection by month and student strength by program can be added here without crowding the main Dashboard.</p>
      </section>
    </>}
  </div>;
}
