const a=app,f=ft;
const L=()=>Promise.all([import('./views.js'),import('./api.js')]);
const S=v=>window.__shotReady=v,T=s=>`req ${s.req}|mem ${s.mem}|304 ${s.hit}`;
async function go(){S(false);const p=location.hash.slice(2).split('/'),[v,x]=await L();try{if(p[0]=='bounty'&&p[2]){const[b,l]=await Promise.all([x.bo(p[1]),x.lb(p[1])]);v.lead(a,l,b)}else if(p[0]=='bounty')v.one(a,await x.bo(p[1]));else if(p[0]=='u')v.prof(a,await x.pf(p[1]));else v.list(a,await x.bs())}catch(e){a.textContent=e}f.textContent=T(x.st);S(true)}
onhashchange=go;
setInterval(async()=>{if(!location.hash[2]){const[v,x]=await L();v.patch(a,await x.bs());f.textContent=T(x.st)}},6e4);
go();
