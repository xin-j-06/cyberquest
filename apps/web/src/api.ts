// 未配置时跟随当前访问主机：127.0.0.1、localhost 和局域网 IP 都能使用同一套本地服务。
export const apiBase=import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:3000/api`;
export function clearStoredSession(){
  sessionStorage.removeItem('cq_token');
  sessionStorage.removeItem('cq_user');
  localStorage.removeItem('cq_token');
  localStorage.removeItem('cq_user');
}
export function apiAuthHeaders(path=''){
  if(path==='/auth/login'||path==='/auth/register') return {};
  const token=sessionStorage.getItem('cq_token');
  return token?{Authorization:`Bearer ${token}`} : {};
}
export async function api<T>(path:string, options:RequestInit={}) :Promise<T>{
  const res=await fetch(apiBase+path,{...options,credentials:'include',headers:{'Content-Type':'application/json',...apiAuthHeaders(path),...(options.headers||{})}});
  const data=await res.json().catch(()=>({message:'服务返回了无法解析的响应。'}));
  if(res.status===401&&path!=='/auth/login'&&path!=='/auth/register'&&['AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','AUTH_FORBIDDEN'].includes(data.code)){
    clearStoredSession();
    window.dispatchEvent(new CustomEvent('cq:session-expired'));
  }
  if(!res.ok)throw new Error(data.message||'Request failed');
  return data as T;
}

type CollectionResponse<T> = T[] | { items: T[] };

export async function apiCollection<T>(path:string, options:RequestInit={}) :Promise<T[]>{
  const data=await api<CollectionResponse<T>>(path,options);
  return Array.isArray(data)?data:data.items;
}
