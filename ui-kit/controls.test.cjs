const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(readyState='complete', inputs=[]) {
  const self={},listeners={};
  const document={readyState,addEventListener:(type,fn)=>{listeners[type]=fn;},querySelectorAll:()=>inputs};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'controls.js'),'utf8'),{self,document});
  return {self,listeners};
}
function input(min,max,value){const values={};return {min,max,value,type:'range',style:{setProperty:(key,value)=>{values[key]=value;}},values};}
test('range tracks support nonzero and negative minima, clamp and degenerate ranges',()=>{
  const {self}=load();
  for(const [min,max,value,expected] of [['.25','4','1','20%'],['-12','12','0','50%'],['0','100','125','100%'],['0','100','-1','0%'],['2','2','2','0%'],['','','50','50%']]){
    const el=input(min,max,value);self.VkUI.fillRange(el);assert.equal(el.values['--p'],expected);
  }
});
test('initial tracks and dynamically added inputs use the same helper',()=>{
  const first=input('0','10','2'),{listeners}=load('loading',[first]);
  assert.equal(first.values['--p'],undefined);listeners.DOMContentLoaded();assert.equal(first.values['--p'],'20%');
  const later=input('0','10','8');listeners.input({target:later});assert.equal(later.values['--p'],'80%');
  listeners.input({target:{type:'text'}});
});
