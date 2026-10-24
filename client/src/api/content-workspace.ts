async function request(url:string,method='GET',body?:unknown) {
  const response=await fetch(`/api/${url}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if (!response.ok || data.error) throw new Error(data.error || 'Workspace request failed');return data;
}
export const contentWorkspaceApi={
  assistant:(path:string,method='GET',body?:unknown)=>request(`assistant/${path}`,method,body),
  groups:(path='',method='GET',body?:unknown)=>request(`groups/${path}`,method,body),
  publishingDraft:(body:unknown)=>request('publishing/drafts','POST',body),
};
