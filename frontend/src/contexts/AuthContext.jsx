import {createContext,useContext,useEffect,useState} from 'react';
import api from '../api/client';

const C=createContext();

export function AuthProvider({children}){
  const[user,setUser]=useState(null),[college,setCollege]=useState(null),[loading,setLoading]=useState(true);

  async function refresh(){
    try{
      const{data}=await api.get('/auth/me');
      setUser(data.user);setCollege(data.college);
      return data;
    }catch{
      localStorage.removeItem('cms_token');setUser(null);setCollege(null);
    }finally{setLoading(false)}
  }

  useEffect(()=>{if(localStorage.getItem('cms_token'))refresh();else setLoading(false)},[]);

  async function login(payload){
    const{data}=await api.post('/auth/login',payload);
    localStorage.setItem('cms_token',data.token);
    setUser(data.user);setCollege(data.college);
    return data;
  }

  async function changePassword(payload){
    const{data}=await api.post('/auth/change-password',payload);
    setUser(data.user);
    return data;
  }

  function logout(){localStorage.removeItem('cms_token');setUser(null);setCollege(null)}

  return <C.Provider value={{user,college,loading,login,logout,refresh,changePassword}}>{children}</C.Provider>
}

export const useAuth=()=>useContext(C);
