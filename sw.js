const VERSION='dn-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./data.json','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 const isData=new URL(r.url).pathname.endsWith('/data.json');
 e.respondWith(caches.open(VERSION).then(async c=>{const hit=await c.match(r,{ignoreSearch:true});
  const net=fetch(r,isData?{cache:'no-cache'}:{}).then(x=>{if(x.ok)c.put(isData?'./data.json':r,x.clone());return x}).catch(()=>hit);
  if(isData){try{const x=await net;return x||hit}catch(_){return hit}}  // Daten: erst Netz (neue Daten), sonst Cache
  return hit||net}))});
