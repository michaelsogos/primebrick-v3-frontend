const sites=require('./.lint.tmp.sites.json');
const fs=require('fs'),path=require('path');
const cache={};
const buckets={cast:0,record:0,arr:0,state:0,param:0,prop:0,other:0};
const propLines=[],castLines=[];
sites.forEach(s=>{
  const p=path.join('.',s.f.replace(/^\//,''));
  if(!cache[p])cache[p]=fs.readFileSync(p,'utf8').split('\n');
  const line=cache[p][s.l-1]||'';
  if(/as any\b/.test(line)){buckets.cast++;castLines.push(s.f.split('/').pop()+':'+s.l)}
  else if(/Record<string,\s*any>/.test(line))buckets.record++;
  else if(/:\s*any\[\]|<any\[\]>/.test(line))buckets.arr++;
  else if(/\$state<any>/.test(line))buckets.state++;
  else if(/[{(\s,]\w+\??:\s*any\b/.test(line)){
    if(/\(/.test(line)&&!/[<>{]/.test(line.split(':')[0]))buckets.param++;
    else {buckets.prop++;propLines.push(s.f.split('/').pop()+':'+s.l)}
  }
  else buckets.other++;
});
console.log(JSON.stringify(buckets));
console.log('CASTS:',castLines.join(' '));
