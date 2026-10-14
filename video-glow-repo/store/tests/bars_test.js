const fs=require('fs');
const src=fs.readFileSync('/home/claude/video-ambilight/content.js','utf8');
const a=src.indexOf('function detectBars'), b=src.indexOf('// Альфа-маска');
const detectBars=new Function(src.slice(a,b)+';return detectBars;')();
const W=64,H=36;
function mk(fn){const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=fn(x,y);const i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}return d;}
const r=(n,o)=>{const x=detectBars(mk(o),W,H);console.log(n,JSON.stringify({t:+x.t.toFixed(2),b:+x.b.toFixed(2),l:+x.l.toFixed(2),r:+x.r.toFixed(2)}));return x;};
const pic=(x,y)=>90+((x*7+y*13)%120);
const ok=[];
let x=r('letterbox',(x,y)=>y<6||y>=H-6?0:pic(x,y)); ok.push(x.t>0.1&&x.b>0.1);
x=r('pillarbox',(X,y)=>X<8||X>=W-8?0:pic(X,y)); ok.push(x.l>0.1&&x.r>0.1&&x.t==0);
x=r('asymmetric',(X,y)=>y<8?0:pic(X,y)); ok.push(x.t==0&&x.b==0);
x=r('dark scene',()=>3); ok.push(x.t==0&&x.l==0);
x=r('subtitles in bar',(X,y)=>(y<6||y>=H-6)?((y==H-3&&X>20&&X<44)?255:0):pic(X,y)); ok.push(x.t>0.1&&x.b>0.1);
x=r('full picture',(X,y)=>pic(X,y)); ok.push(x.t==0&&x.l==0);
console.log(ok.every(Boolean)?'ALL OK':'FAIL '+ok);
