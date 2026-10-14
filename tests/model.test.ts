import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addRoom,attach,deleteSelection,distance,emptyProject,parseDimensions,position,uid,validateProject,wallPoints} from '../src/model.ts';
test('rozpoznaje warianty wymiarów z opisów i jednostki',()=>{
 for(const s of ['80x100cm','80 × 100 cm','80 cm x 100 cm','80cmx100','80 na 100 cm','80x100','80 X 100 CM','800x1000 mm','0,8 × 1 m'])assert.deepEqual(parseDimensions(s),{width:80,height:100,assumed:['80x100'].includes(s)},s);
 assert.deepEqual(parseDimensions('Nihongo - Akryl na płótnie 80x80cm - prawdopodobnie 2018'),{width:80,height:80,assumed:false});
 assert.deepEqual(parseDimensions('80.5 x 100,2 cm'),{width:80.5,height:100.2,assumed:false});
 assert.equal(parseDimensions('rok 2018, akryl'),null);assert.equal(parseDimensions('0x100cm'),null);
 assert.deepEqual(parseDimensions('100x80cm',.8),{width:80,height:100,assumed:false});
});
test('mocowanie i pozycja obrazu podążają za obrotem ściany',()=>{
 const p=addRoom(emptyProject());const item=attach(p,{id:uid(),artworkId:'a',t:0,side:1,x:0,y:0,elevation:150,rotation:0,tilt:0},{x:200,y:5});assert.equal(item.wallId,p.walls[0].id);assert.equal(item.t,200);assert.equal(position(p,item).x,200);
 const [a,b]=wallPoints(p,p.walls[0]);b.x=a.x;b.y=a.y+900;const pos=position(p,item);assert.ok(Math.abs(pos.x+10)<.001);assert.equal(pos.y,200);assert.equal(pos.angle,90);
 assert.equal(attach(p,item,{x:450,y:400},false).wallId,undefined);
});
test('walidacja wykrywa uszkodzoną geometrię i brakujące odwołania',()=>{
 const p=addRoom(emptyProject());validateProject(p);p.walls[0].b='missing';assert.throws(()=>validateProject(p));
 const q=addRoom(emptyProject());q.vertices[0].x=NaN;assert.throws(()=>validateProject(q));
});
test('usunięcie ściany zachowuje bibliotekę prac i pozostałą geometrię',()=>{
 const p=addRoom(emptyProject());p.artworks=[{id:'a',title:'A',description:'',width:80,height:100,image:''}];p.placements=[{id:'b',artworkId:'a',wallId:p.walls[0].id,t:100,side:1,x:0,y:0,elevation:150,rotation:0,tilt:0}];
 const next=deleteSelection(p,{kind:'wall',id:p.walls[0].id});assert.equal(next.placements.length,0);assert.equal(next.artworks.length,1);assert.equal(next.walls.length,3);validateProject(next);assert.equal(distance(...wallPoints(next,next.walls[0])),650);
});
