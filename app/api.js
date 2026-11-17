const B='https://make.fun/api',C=new Map();
export const st={req:0,mem:0,hit:0};
async function get(p){const u=B+p,c=C.get(u);if(c&&Date.now()-c.t<3e4){st.mem++;return c.d}const h={};if(c&&c.e)h['If-None-Match']=c.e;st.req++;const r=await fetch(u,{headers:h});if(r.status===304&&c){st.hit++;c.t=Date.now();return c.d}if(!r.ok)throw new Error(r.status);const d=await r.json();C.set(u,{d,e:r.headers.get('ETag'),t:Date.now()});return d}
export const bs=()=>get('/competitions?status=open&activity=times');
export const bo=s=>get('/competitions/'+encodeURIComponent(s));
export const lb=s=>get('/competitions/'+encodeURIComponent(s)+'/leaderboard?limit=100');
export const pf=s=>get('/profiles/'+encodeURIComponent(s));
