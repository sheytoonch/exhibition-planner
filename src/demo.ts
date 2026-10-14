import { addRoom, emptyProject, uid, type Project } from './model';
function art(bg:string,shapes:string){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750"><rect width="600" height="750" fill="${bg}"/>${shapes}</svg>`);}
export function demo():Project {
 const p=addRoom(emptyProject('Przestrzenie wspólne'));
 p.artworks=[
 {id:uid(),title:'Cisza / 01',description:'Studium przestrzeni — akryl na płótnie, 80 × 100 cm',width:80,height:100,image:art('#ddd8c9','<path d="M80 680V210Q80 40 250 40H480V680Z" fill="#233f35"/><path d="M250 680V290Q250 160 380 160H480V680Z" fill="#bdc7ad"/><rect x="0" y="620" width="600" height="130" fill="#a7a89a"/>')},
 {id:uid(),title:'Równowaga',description:'Akryl na płótnie 70x90cm',width:70,height:90,image:art('#eee4d1','<circle cx="300" cy="270" r="180" fill="#bd573c"/><rect x="120" y="425" width="360" height="170" fill="#343b32"/><path d="M70 620H530" stroke="#ad9d7e" stroke-width="3"/>')},
 {id:uid(),title:'Między liniami',description:'Technika mieszana, 60 cm x 80 cm',width:60,height:80,image:art('#e8e3d8','<path d="M-70 670L340 20M90 790L500 140M230 800L640 150" stroke="#363e38" stroke-width="48"/><circle cx="430" cy="520" r="95" fill="#c9a56b"/>')},
 {id:uid(),title:'Punkt odniesienia',description:'Akryl 80 na 80 cm',width:80,height:80,image:art('#bfc8be','<rect x="80" y="100" width="440" height="550" fill="#e8e2d4"/><circle cx="300" cy="350" r="138" fill="#364c44"/><circle cx="355" cy="310" r="75" fill="#c2956d"/>')},
 {id:uid(),title:'Światło popołudnia',description:'Olej na płótnie 100x120',width:100,height:120,image:art('#ddd1b9','<path d="M0 0H600V350L0 600Z" fill="#dbb977"/><path d="M0 600L600 350V750H0Z" fill="#8b987d"/><rect x="120" y="100" width="32" height="550" fill="#eee5d2"/>')}
 ];
 p.placements=p.artworks.slice(0,4).map((a,i)=>({id:uid(),artworkId:a.id,wallId:p.walls[i===3?1:0].id,t:i===3?260:190+i*250,side:1,x:0,y:0,elevation:150,rotation:0,tilt:0}));
 p.openings=[{id:uid(),wallId:p.walls[2].id,kind:'door',t:220,width:110,height:220,sill:0},{id:uid(),wallId:p.walls[3].id,kind:'window',t:310,width:180,height:140,sill:90}];
 return p;
}
