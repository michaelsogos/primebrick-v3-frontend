const sites=require('./.lint.tmp.sites.json');
const fs=require('fs'),path=require('path');
const cache={};
const ctx=[];
sites.forEach(s=>{
  const p=path.join('.',s.f.replace(/^\//,''));
  if(!cache[p])cache[p]=fs.readFileSync(p,'utf8').split('\n');
  const line=(cache[p][s.l-1]||'').trim();
  ctx.push(s.f.split('/').pop()+':'+s.l+' | '+line.slice(0,140));
});
ctx.forEach(c=>console.log(c));
