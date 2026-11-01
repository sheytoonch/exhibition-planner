"use strict";

// Samodzielny wykrywacz: zakresy znaków służą również do oznaczania tekstu.
const ArtworkMetadata = (() => {
  const fold = text => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
  const overlap = (a, b) => a.start < b.end && b.start < a.end;
  const key = (y, m, d) => y * 10000 + m * 100 + d;
  const monthDays = (y, m) => [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const round = n => Math.round(n * 1e6) / 1e6;
  const num = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)";
  const unit = '(?:pixels?|px|inches|inch|ins|in|cm|mm|m|["″])';
  const axis = "(?:wysokosc|szerokosc|glebokosc|wys\\.?|szer\\.?|gl\\.?|h|w|d)";
  const component = `(?:(${axis})\\s*:?\\s*)?(${num})\\s*(${unit})?`;
  const pairPattern = new RegExp(`(?<![\\p{L}\\p{N}.,])${component}\\s*(x|×|\\*|na|_)\\s*${component}(?:\\s*(?:x|×|\\*|na|_)\\s*${component})?(?![\\p{L}\\p{N}]|[.,]\\d)`, "gu");
  // Tablica ISO A/B w mm; wartości sprawdzone w tabeli formatów Adobe.
  const paper = {
    a: [[841,1189],[594,841],[420,594],[297,420],[210,297],[148,210],[105,148],[74,105],[52,74],[37,52],[26,37]],
    b: [[1000,1414],[707,1000],[500,707],[353,500],[250,353],[176,250],[125,176],[88,125],[62,88],[44,62],[31,44]],
  };
  function number(text) {
    const parts = text.trim().split(/\s+/);
    const fraction = value => { const [a,b] = value.split('/').map(Number); return b ? a / b : NaN; };
    return parts.length === 2 ? Number(parts[0]) + fraction(parts[1]) : text.includes('/') ? fraction(text) : Number(text.replace(',', '.'));
  }
  const axisName = value => !value ? null : /^(w$|szer)/.test(value) ? 'widthCm' : /^(h|wys)/.test(value) ? 'heightCm' : 'depthCm';
  const factor = value => value === 'mm' ? .1 : value === 'm' ? 100 : /^(in|"|″)/.test(value || '') ? 2.54 : 1;

  function extractDimensions(text, aspect = 1) {
    const normalized = fold(text);
    const results = [];
    const protectedDates = [...normalized.matchAll(/(?<!\d)(?:\d{4}[-_]\d{2}[-_]\d{2}(?:[_t ]\d{2}[-:]?\d{2}[-:]?\d{2})?|\d{8}[_t ]\d{6})(?!\d)/g)]
      .filter(match => parseDateRecord(match[0])).map(match => ({ start: match.index, end: match.index + match[0].length }));
    function record(match, parts, separator, labeled = false) {
      const span = { start: match.index, end: match.index + match[0].length, text: text.slice(match.index, match.index + match[0].length) };
      if (separator === '_' && protectedDates.some(date => overlap(date, span))) return;
      const values = parts.map(part => number(part.number));
      const inherited = [...parts].reverse().find(part => part.unit)?.unit;
      if (values.some(n => !Number.isFinite(n) || n <= 0)) { results.push({ ...span, kind: 'invalid' }); return; }
      const digital = parts.some(part => /^(px|pixel)/.test(part.unit || '')) || separator === '_';
      const hasUnit = Boolean(inherited);
      const broadcast = ['1920:1080','1080:1920','3840:2160','7680:4320','1280:720','720:1280','1024:768','800:600','640:480'].includes(values.slice(0,2).join(':'));
      const ratio = !hasUnit && ['16:9','9:16','4:3','3:4','1:1'].includes(values.slice(0,2).join(':'));
      if (ratio) { results.push({ ...span, kind: 'ratio', ratio: values.slice(0,2) }); return; }
      if (digital || (!hasUnit && (broadcast || (values[0] >= 1000 && values[1] >= 1000) || /\d+\s*_?\s*dpi\b/i.test(text)))) {
        results.push({ ...span, kind: 'digital', pixelWidth: values[0], pixelHeight: values[1] }); return;
      }
      const converted = parts.map((part, i) => round(values[i] * factor(part.unit || inherited)));
      const assigned = {};
      parts.forEach((part, i) => { if (part.axis) assigned[axisName(part.axis)] = converted[i]; });
      let widthCm, heightCm;
      if (assigned.widthCm && assigned.heightCm) {
        ({widthCm, heightCm} = assigned);
      } else if (labeled || parts.some(part => part.axis)) {
        // Nie zgadujemy brakującej osi ani dwóch powtórzonych osi.
        results.push({ ...span, kind: 'invalid' }); return;
      } else {
        [heightCm, widthCm] = converted;
        if ((aspect > 1.05 && widthCm < heightCm) || (aspect < .95 && widthCm > heightCm)) [widthCm,heightCm] = [heightCm,widthCm];
      }
      const isFrame = /(?:rama|frame|framed|z rama)\s*[:(]?\s*$/.test(normalized.slice(Math.max(0, span.start-25), span.start));
      results.push({ ...span, kind: 'physical', widthCm, heightCm, depthCm: assigned.depthCm || converted[2] || null, isFrame });
    }
    for (const match of normalized.matchAll(pairPattern)) {
      const parts = [{axis:match[1],number:match[2],unit:match[3]}, {axis:match[5],number:match[6],unit:match[7]}];
      if (match[9]) parts.push({axis:match[8],number:match[9],unit:match[10]});
      record(match, parts, match[4]);
    }
    const labels = [...normalized.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])(${axis})\\s*:?\\s*(${num})\\s*(${unit})?(?![\\p{L}\\p{N}])`, 'gu'))];
    for (let i=0; i<labels.length-1; i++) {
      const first=labels[i], second=labels[i+1];
      const span={start:first.index,end:second.index+second[0].length};
      const gap=normalized.slice(first.index+first[0].length,second.index);
      if (results.some(r=>overlap(r,span)) || gap.length>30 || !/^[\s,;x×*]+$/.test(gap)) continue;
      if (axisName(first[1])===axisName(second[1])) continue;
      record({index:first.index,0:normalized.slice(span.start,span.end)}, [first,second].map(m=>({axis:m[1],number:m[2],unit:m[3]})), 'x', true);
      i++;
    }
    for (const match of normalized.matchAll(/(?<![\p{L}\p{N}])([ab])\s*(10|[0-9])(?![\p{L}\p{N}])/gu)) {
      const span={start:match.index,end:match.index+match[0].length};
      if(results.some(r=>overlap(r,span)))continue;
      let [w,h]=paper[match[1]][Number(match[2])].map(n=>n/10);
      if(aspect>1.05)[w,h]=[h,w];
      results.push({...span,text:text.slice(span.start,span.end),kind:'physical',widthCm:w,heightCm:h,depthCm:null,paper:match[0].replace(/\s/g,'').toUpperCase(),isFrame:false});
    }
    for (const match of normalized.matchAll(/(?<![\p{L}\p{N}])(?:(\d+)\s*_?\s*(px|pixels?|dpi)|(\d+)(p|k))(?![\p{L}\p{N}])/gu)) {
      const span={start:match.index,end:match.index+match[0].length};
      if(results.some(r=>overlap(r,span))||protectedDates.some(r=>overlap(r,span)))continue;
      const parsedUnit=match[2]||match[4];
      results.push({...span,text:text.slice(span.start,span.end),kind:/^(px|pixel)/.test(parsedUnit)?'digital':'resolution',value:Number(match[1]||match[3]),unit:parsedUnit});
    }
    return results.sort((a,b)=>a.start-b.start);
  }
  function dimensions(text, aspect) {
    const matches=extractDimensions(text,aspect);
    const explicit=matches.filter(m=>m.kind==='physical'&&!m.isFrame&&!m.paper);
    const physical=explicit.length?explicit:matches.filter(m=>m.kind==='physical'&&!m.isFrame);
    const distinct=new Map(physical.map(m=>[`${m.widthCm}:${m.heightCm}:${m.depthCm}`,m]));
    if(matches.some(m=>m.kind==='invalid')||distinct.size>1)return null;
    if(distinct.size===1){const result={...[...distinct.values()][0]};result.frame=matches.find(m=>m.isFrame)||null;return result;}
    return matches.length?null:undefined;
  }

  const monthNames=[
    ['styczen','stycznia','styczniu','sty','january','jan'],['luty','lutego','lutym','lut','february','feb'],
    ['marzec','marca','marcu','mar','march'],['kwiecien','kwietnia','kwietniu','kwi','april','apr'],
    ['maj','maja','maju','may'],['czerwiec','czerwca','czerwcu','cze','june','jun'],
    ['lipiec','lipca','lipcu','lip','july','jul'],['sierpien','sierpnia','sierpniu','sie','august','aug'],
    ['wrzesien','wrzesnia','wrzesniu','wrz','september','sep','sept'],['pazdziernik','pazdziernika','pazdzierniku','paz','october','oct'],
    ['listopad','listopada','listopadzie','lis','november','nov'],['grudzien','grudnia','grudniu','gru','december','dec'],
  ];
  const months=new Map(monthNames.flatMap((names,i)=>names.map(name=>[name,i+1])));
  const monthWord=[...months.keys()].sort((a,b)=>b.length-a.length).join('|');
  function period(y,m=null,d=null) {
    if(!Number.isInteger(y)||y<1||y>9999||(m!==null&&(m<1||m>12))||(d!==null&&(d<1||d>monthDays(y,m))))return null;
    const pad=n=>String(n).padStart(2,'0'), year=String(y).padStart(4,'0');
    return {display:d!==null?`${pad(d)}.${pad(m)}.${year}`:m!==null?`${pad(m)}.${year}`:year,details:{start:key(y,m||1,d||1),end:key(y,m||12,d||monthDays(y,m||12)),precision:d!==null?'day':m!==null?'month':'year'}};
  }
  const romanValues={i:1,v:5,x:10,l:50,c:100};
  function roman(text) {let result=0;for(let i=0;i<text.length;i++){const n=romanValues[text[i]];if(!n)return null;result+=n<(romanValues[text[i+1]]||0)?-n:n;}if(result<1||result>30)return null;let rest=result,canonical='';for(const[n,s]of[[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]){while(rest>=n){canonical+=s;rest-=n;}}return canonical===text?result:null;}
  function historical(text) {
    let m;
    if((m=/^(\d{1,4})\s*(?:p\.?\s*n\.?\s*e\.?|bce|bc)$/.exec(text))){const n=Number(m[1]);if(!n)return null;return {display:`${n} p.n.e.`,details:{start:key(1-n,1,1),end:key(1-n,12,31),precision:'year',era:'BCE'}};}
    if((m=/^(?:lata\s+)?(\d{3}0)(?:s|'s|-te)$/.exec(text))){const y=Number(m[1]);return {display:`${y}s`,details:{start:key(y,1,1),end:key(y+9,12,31),precision:'decade'}};}
    if((m=/^lata\s+(\d{2})\.?\s+([ivxlc]+)\s*w\.?$/.exec(text))){const c=roman(m[2]),dec=Number(m[1]);if(!c||dec%10)return null;const y=(c-1)*100+dec;return {display:`lata ${dec}. ${m[2].toUpperCase()} w.`,details:{start:key(y,1,1),end:key(y+9,12,31),precision:'decade'}};}
    m=/^(?:(i|ii|1|2)\s*pol\.?\s*|(poczatek|koniec)\s*)?([ivxlc]+)\s*(?:w\.?|wiek)$/.exec(text);
    let century,part,display=text;
    if(m){century=roman(m[3]);part=m[1]?(m[1]==='i'||m[1]==='1'?'first-half':'second-half'):m[2]==='poczatek'?'early':m[2]==='koniec'?'late':null;display=text.replace(/[ivxlc]+(?=\s*(?:w\.?|wiek)$)/,s=>s.toUpperCase()).replace('pol.','poł.').replace('poczatek','początek');}
    else if((m=/^(?:(early|mid|late)[ -])?(\d{1,2})(?:st|nd|rd|th)\s*(?:century|c\.?)$/.exec(text))){century=Number(m[2]);part=m[1];}
    if(!century||century>30)return null;
    let start=(century-1)*100+1,end=century*100;
    if(part==='first-half')end=start+49;
    if(part==='second-half')start+=50;
    if(part==='early')end=start+32;
    if(part==='mid'){start+=33;end=start+32;}
    if(part==='late')start+=66;
    return {display,details:{start:key(start,1,1),end:key(end,12,31),precision:part?'century-part':'century',...(part?{approximate:true}:{} )}};
  }
  function parseDateRecord(raw) {
    let text=fold(raw).trim().replace(/(?<!\d)(\d{4})_(\d{2})_(\d{2})(?!\d)/g,'$1-$2-$3').replace(/_/g,' ').replace(/[–—]/g,'-').replace(/\s+/g,' '),m;
    if(!text)return null;
    const approximate=/^(?:ca\.?|c\.|circa|ok\.?|okolo|prawdopodobnie)\s*/.test(text);
    text=text.replace(/^(?:ca\.?|c\.|circa|ok\.?|okolo|prawdopodobnie)\s*/,'');
    const uncertain=/\?(?:\))?$/.test(text)||/^\[.*\]$/.test(text);
    text=text.replace(/\(\?\)$|\?$/,'').replace(/^\[(.*)\]$/,'$1').replace(/\s*(?:r\.?|rok|roku)$/,'').trim();
    function finish(result){if(!result)return null;if(approximate){result.details.approximate=true;result.display=`ok. ${result.display}`;}if(uncertain){result.details.uncertain=true;result.display+= '?';}return result;}
    if((m=/^(wiosna|lato|jesien|zima)\s+(\d{4})$/.exec(text))){
      const year=Number(m[2]),month={wiosna:3,lato:6,jesien:9,zima:12}[m[1]];
      const a=period(year,month),b=period(year+(month===12?1:0),month===12?2:month+2);
      if(!a||!b)return null;
      return finish({display:`${a.display}–${b.display}`,details:{start:a.details.start,end:b.details.end,endStart:b.details.start,precision:'range'}});
    }
    if((m=/^(przed|wczesniej niz|po|pozniej niz)\s+(.+)$/.exec(text))){const b=parseDateRecord(m[2]);if(!b)return null;const before=['przed','wczesniej niz'].includes(m[1]);return finish({display:`${m[1]==='wczesniej niz'?'wcześniej niż':m[1]==='pozniej niz'?'później niż':m[1]} ${b.display}`,details:before?{start:null,end:b.details.start,endExclusive:true,precision:'before',boundaryPrecision:b.details.precision}:{start:b.details.end,end:null,startExclusive:true,precision:'after',boundaryPrecision:b.details.precision}});}
    const hist=historical(text);if(hist)return finish(hist);
    if((m=/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ t](\d{2})[-:](\d{2})[-:](\d{2}))?$/.exec(text))){if(m[4]&&(Number(m[4])>23||Number(m[5])>59||Number(m[6])>59))return null;return finish(period(Number(m[1]),Number(m[2]),Number(m[3])));}
    if((m=/^(\d{4})(\d{2})(\d{2})(?:[ t](\d{2})(\d{2})(\d{2}))?$/.exec(text))){if(m[4]&&(Number(m[4])>23||Number(m[5])>59||Number(m[6])>59))return null;return finish(period(Number(m[1]),Number(m[2]),Number(m[3])));}
    if((m=/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/.exec(text))){let d=Number(m[1]),mo=Number(m[3]);if(m[2]==='-'){if(d<=12&&mo<=12&&d!==mo)return null;if(mo>12)[d,mo]=[mo,d];}return finish(period(Number(m[4]),mo,d));}
    if((m=new RegExp(`^(\\d{1,2})\\s+(${monthWord})\\.?\\s+(\\d{4})$`).exec(text)))return finish(period(Number(m[3]),months.get(m[2]),Number(m[1])));
    if((m=new RegExp(`^(${monthWord})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`).exec(text)))return finish(period(Number(m[3]),months.get(m[1]),Number(m[2])));
    if((m=new RegExp(`^(${monthWord})\\.?\\s+(\\d{4})$`).exec(text)))return finish(period(Number(m[2]),months.get(m[1])));
    if((m=/^(\d{1,2})[./](\d{4})$/.exec(text)))return finish(period(Number(m[2]),Number(m[1])));
    if((m=/^(\d{4})-(\d{2})$/.exec(text))&&Number(m[2])>=1&&Number(m[2])<=12)return finish(period(Number(m[1]),Number(m[2])));
    if(/^\d{4}$/.test(text))return finish(period(Number(text)));
    if((m=/^(\d{4})\s*[-/]\s*(\d{2})$/.exec(text))){const start=Number(m[1]);let end=Math.floor(start/100)*100+Number(m[2]);if(end<start)end+=100;return finish({display:`${start}–${end}`,details:{start:key(start,1,1),end:key(end,12,31),endStart:key(end,1,1),precision:'range'}});}
    const parts=/^(?:od )?(.+?)\s+do\s+(.+)$/.exec(text);
    const split=parts?[parts[1],parts[2]]:text.split(/\s*[-/]\s*/);
    if(split.length===2){const a=parseDateRecord(split[0]),b=parseDateRecord(split[1]);if(a&&b&&a.details.start!==null&&b.details.end!==null&&a.details.start<=b.details.start)return finish({display:`${parts?'od ':''}${a.display}${parts?' do ':'–'}${b.display}`,details:{start:a.details.start,end:b.details.end,endStart:b.details.endStart??b.details.start,precision:'range'}});}
    return null;
  }

  const historicalToken="(?:(?:i{1,2}|[12])\\s*pol\\.?\\s*|(?:poczatek|koniec)\\s*)?[ivxlc]+\\s*(?:w\\.?|wiek)|(?:lata\\s+\\d{2}\\.?\\s+[ivxlc]+\\s*w\\.?)|(?:(?:early|mid|late)[ -])?\\d{1,2}(?:st|nd|rd|th)\\s*(?:century|c\\.?)|(?:lata\\s+)?\\d{3}0(?:s|'s|-te)|\\d{1,4}\\s*(?:p\\.?\\s*n\\.?\\s*e\\.?|bce|bc)";
  const namedToken=`(?:\\d{1,2}\\s+)?(?:${monthWord})\\.?\\s+\\d{4}|(?:${monthWord})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}`;
  const numericToken="\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}(?:[ t]\\d{2}[-:]\\d{2}[-:]\\d{2})?|\\d{8}(?:[ t]\\d{6})?|\\d{1,2}([./-])\\d{1,2}\\1\\d{4}|\\d{1,2}[./]\\d{4}|\\d{4}-\\d{2}|\\d{4}(?:\\s*(?:r\\.?|rok|roku))?";
  // Pasujące fragmenty wyłapujemy osobnymi regułami, dłuższe mają pierwszeństwo.
  const base=`(?:(?:wiosna|lato|jesien|zima)\\s+\\d{4}|${historicalToken}|${namedToken}|${numericToken.replace('([./-])','[./-]').replace('\\1','[./-]')})`;
  const datePattern=new RegExp(`(?<![\\p{L}\\p{N}.,/])(?:ca\\.?|c\\.|circa|ok\\.?|okolo|prawdopodobnie)?\\s*\\[?(?:(?:przed|po|wczesniej niz|pozniej niz)\\s+${base}|(?:od\\s+)?${base}\\s*(?:[-–—/]|do)\\s*(?:${base}|\\d{2})(?!\\d)|${base})\\]?(?:\\(\\?\\)|\\?)?(?![\\p{L}\\p{N}]|[.,/]\\d)`, 'gu');
  function extractDates(text) {
    const mask=fold(text).split('');
    for(const range of extractDimensions(text)){for(let i=range.start;i<range.end;i++)mask[i]=' ';}
    let normalized=mask.join('').replace(/(?<!\d)(\d{4})_(\d{2})_(\d{2})(?!\d)/g,'$1-$2-$3').replace(/_/g,' ');
    normalized=normalized.replace(/\b(?:\d+\s*(?:px|pixels?|dpi)|\d+(?:p|k))\b/g,match=>' '.repeat(match.length));
    const results=[];
    for(const m of normalized.matchAll(datePattern)){
      let start=m.index,end=start+m[0].length;
      while(start<end&&/\s/.test(text[start]))start++;
      if(/\b(?:wiosna|lato|jesien|zima)\s*$/.test(normalized.slice(0,start)))continue;
      const original=text.slice(start,end);
      const record=parseDateRecord(original);
      results.push({start,end,text:original,...(record||{display:null,details:null})});
    }
    return results;
  }
  function date(text){const all=extractDates(text);if(all.some(m=>!m.details))return null;const found=new Map(all.map(m=>[JSON.stringify(m.details),m.display]));return found.size===1?[...found.values()][0]:found.size?null:undefined;}
  return {extractDimensions,dimensions,extractDates,date,parseDate:text=>parseDateRecord(text)?.details||null};
})();

const ArtworkImageTools = (() => {
  const fullCorners = () => [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  function validQuad(points) {
    if(points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1))return false;
    let area=0;
    for(let i=0;i<4;i++){
      const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
      if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=.00001)return false;
      area+=a.x*b.y-b.x*a.y;
    }
    return area>.002;
  }
  function homography(points) {
    const [p0,p1,p2,p3]=points;
    const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
    const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
    const denominator=dx1*dy2-dx2*dy1;
    let g=0,h=0;
    if(Math.abs(dx3)+Math.abs(dy3)>1e-10){
      if(Math.abs(denominator)<1e-12)throw Error('Narożniki nie tworzą poprawnego czworokąta.');
      g=(dx3*dy2-dx2*dy3)/denominator;
      h=(dx1*dy3-dx3*dy1)/denominator;
    }
    return [p1.x-p0.x+g*p1.x,p3.x-p0.x+h*p3.x,p0.x,p1.y-p0.y+g*p1.y,p3.y-p0.y+h*p3.y,p0.y,g,h];
  }
  function rotate(source, degrees) {
    const radians=degrees*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(source.width*cos+source.height*sin-1e-8));
    canvas.height=Math.max(1,Math.ceil(source.width*sin+source.height*cos-1e-8));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(radians);
    ctx.drawImage(source,-source.width/2,-source.height/2);
    return canvas;
  }
  function rectify(source, points, aspect=null, maxSide=1600) {
    if(!validQuad(points))throw Error('Ustaw cztery narożniki kolejno wokół obrazu, bez krzyżowania krawędzi.');
    const pixelPoints=points.map(p=>({x:p.x*(source.width-1),y:p.y*(source.height-1)}));
    const length=(a,b)=>Math.hypot((a.x-b.x)*source.width,(a.y-b.y)*source.height);
    let width=(length(points[0],points[1])+length(points[3],points[2]))/2;
    let height=(length(points[0],points[3])+length(points[1],points[2]))/2;
    if(aspect&&Number.isFinite(aspect)&&aspect>0){const area=width*height;width=Math.sqrt(area*aspect);height=width/aspect;}
    const scale=Math.min(1,maxSide/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(width*scale));canvas.height=Math.max(2,Math.round(height*scale));
    const sourceData=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data;
    const ctx=canvas.getContext('2d'),result=ctx.createImageData(canvas.width,canvas.height),data=result.data;
    const [a,b,c,d,e,f,g,h]=homography(pixelPoints),sw=source.width,sh=source.height;
    for(let y=0;y<canvas.height;y++){
      const v=(y+.5)/canvas.height;
      for(let x=0;x<canvas.width;x++){
        const u=(x+.5)/canvas.width,den=g*u+h*v+1;
        const sx=Math.max(0,Math.min(sw-1,(a*u+b*v+c)/den)),sy=Math.max(0,Math.min(sh-1,(d*u+e*v+f)/den));
        const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
        const p00=(iy*sw+ix)*4,p10=(iy*sw+Math.min(sw-1,ix+1))*4,p01=(Math.min(sh-1,iy+1)*sw+ix)*4,p11=(Math.min(sh-1,iy+1)*sw+Math.min(sw-1,ix+1))*4;
        const out=(y*canvas.width+x)*4;
        for(let channel=0;channel<4;channel++)data[out+channel]=(sourceData[p00+channel]*(1-fx)+sourceData[p10+channel]*fx)*(1-fy)+(sourceData[p01+channel]*(1-fx)+sourceData[p11+channel]*fx)*fy;
      }
    }
    ctx.putImageData(result,0,0);return canvas;
  }
  return {fullCorners,validQuad,homography,rotate,rectify};
})();


const PlanLayers=(()=>{
  function normalize(geometry){
    if(!Array.isArray(geometry.layers))geometry.layers=[];
    if(!geometry.layers.some(layer=>layer.id==='default'))geometry.layers.unshift({id:'default',name:'default',visible:true,locked:false});
    geometry.layers.find(layer=>layer.id==='default').name='default';
    const ids=new Set(geometry.layers.map(layer=>layer.id));
    geometry.activeLayerId='default';
    for(const object of [...geometry.lines||[],...geometry.shapes||[],...geometry.surfaces||[]])if(!ids.has(object.layerId))object.layerId='default';
    return geometry;
  }
  const layer=(geometry,object)=>geometry.layers?.find(layer=>layer.id===object.layerId);
  const visible=(geometry,object)=>layer(geometry,object)?.visible!==false;
  const locked=(geometry,object)=>Boolean(layer(geometry,object)?.locked);
  const boundaries=geometry=>[...geometry.lines||[],...geometry.shapes||[]].filter(object=>!object.construction);
  function remove(geometry,id,mode){
    if(id==='default')throw Error('Nie można usunąć warstwy default.');
    if(!geometry.layers.some(layer=>layer.id===id)||!['move','delete'].includes(mode))throw Error('Nieprawidłowa operacja na warstwie.');
    for(const key of ['lines','shapes','surfaces'])if(Array.isArray(geometry[key])){
      if(mode==='move')for(const object of geometry[key]){if(object.layerId===id)object.layerId='default';}
      else geometry[key]=geometry[key].filter(object=>object.layerId!==id);
    }
    geometry.layers=geometry.layers.filter(layer=>layer.id!==id);geometry.activeLayerId='default';if(mode==='delete')PlanTopology.prune(geometry);
    return geometry;
  }
  return{normalize,visible,locked,boundaries,remove};
})();
const PlanTopology=(()=>{
  let serial=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`cad-${Date.now()}-${++serial}`;
  const same=(a,b)=>a?.nodeId&&b?.nodeId?a.nodeId===b.nodeId:Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
  const points=geometry=>[...(geometry.lines||[]).flatMap(line=>[line.a,line.b]),...(geometry.shapes||[]).flatMap(shape=>shape.type==='circle'?[shape.center]:[shape.a,shape.b,shape.via])].filter(Boolean);
  function normalize(geometry){
    geometry.lines??=[];geometry.shapes??=[];geometry.relations??=[];geometry.dimensions??=[];geometry.fixedNodes??=[];
    PlanLayers.normalize(geometry);
    const legacy=geometry.topologyVersion!==1,known=points(geometry).filter(point=>point.nodeId);
    const ids=new Set();
    for(const object of [...geometry.lines,...geometry.shapes]){if(!object.id||ids.has(object.id))object.id=uid();ids.add(object.id);}
    for(const point of points(geometry)){
      if(!point.nodeId){const match=legacy&&known.find(other=>Math.hypot(point.x-other.x,point.y-other.y)<1e-6);point.nodeId=match?.nodeId||uid();known.push(point);}
    }
    geometry.topologyVersion=1;return geometry;
  }
  function connect(geometry,source,target){
    const from=source.nodeId,to=target.nodeId;if(!from||!to)return;
    const canonical=geometry.fixedNodes?.includes(from)?source:target;
    for(const point of points(geometry))if(point.nodeId===from||point.nodeId===to){point.nodeId=to;point.x=canonical.x;point.y=canonical.y;}
    if(geometry.fixedNodes?.includes(from))geometry.fixedNodes=[...new Set(geometry.fixedNodes.map(id=>id===from?to:id))];
  }
  function detach(geometry,point){point.nodeId=uid();return point;}
  function prune(geometry){
    const ids=new Set([...geometry.lines,...geometry.shapes].map(object=>object.id));
    geometry.relations=(geometry.relations||[]).filter(relation=>relation.objects.every(id=>ids.has(id)));
    geometry.angles=(geometry.angles||[]).filter(item=>ids.has(item.a)&&ids.has(item.b));
    geometry.dimensions=(geometry.dimensions||[]).filter(item=>item.objects?.every(id=>ids.has(id)));
    const dimensions=new Set(geometry.dimensions.map(item=>item.id));geometry.relations=geometry.relations.filter(relation=>!relation.dimensionId||dimensions.has(relation.dimensionId));
    const nodeIds=new Set(points(geometry).map(point=>point.nodeId));geometry.fixedNodes=(geometry.fixedNodes||[]).filter(id=>nodeIds.has(id));
    for(const line of geometry.lines)if(line.fixedAngle?.referenceId&&!ids.has(line.fixedAngle.referenceId))line.fixedAngle=null;
  }
  function components(geometry,groupId){
    const remaining=new Set([...geometry.lines,...geometry.shapes||[]].filter(object=>object.polylineId===groupId));let first=true;
    while(remaining.size){const seed=remaining.values().next().value,group=[seed],id=first?groupId:uid();first=false;remaining.delete(seed);for(let i=0;i<group.length;i++)for(const other of remaining)if([group[i].a,group[i].b].some(point=>[other.a,other.b].some(candidate=>same(point,candidate)))){group.push(other);remaining.delete(other);}group.forEach(object=>object.polylineId=id);}
  }
  function vertices(geometry){
    const grouped=new Map();
    for(const [kind,objects] of [['line',geometry.lines||[]],['shape',geometry.shapes||[]]])for(const [index,object]of objects.entries()){
      if(!PlanLayers.visible(geometry,object))continue;
      for(const key of object.type==='circle'?['center']:['a','b']){
        const point=object[key];if(!point)continue;let vertex=grouped.get(point.nodeId);if(!vertex){vertex={nodeId:point.nodeId,point,references:[]};grouped.set(point.nodeId,vertex);}vertex.references.push({kind,index,key,object});
      }
    }
    return [...grouped.values()];
  }
  return {uid,same,points,vertices,normalize,connect,detach,prune,components};
})();

const PlanConstraints=(()=>{
  const wrap=value=>((value+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  function solve(source,changes,scale,anchors=[],options={}){
    const lines=structuredClone(source),shapes=structuredClone(options.shapes||[]),nodes=[],edges=[],shapeNodes=[];
    const matches=(a,b)=>a.nodeId&&b.nodeId?a.nodeId===b.nodeId:Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
    const find=point=>{let index=nodes.findIndex(node=>matches(node,point));if(index<0){index=nodes.length;nodes.push({...point,fixed:false,fixedX:false,fixedY:false});}return index;};
    for(const line of lines)edges.push({line,a:find(line.a),b:find(line.b)});
    for(const shape of shapes){const entry={shape,points:{}};for(const key of shape.type==='circle'?['center']:['a','b','via'])entry.points[key]=find(shape[key]);if(shape.type==='circle')entry.points.radial=find({x:shape.center.x+shape.radius,y:shape.center.y,nodeId:`${shape.id}:radius`});shapeNodes.push(entry);}
    const original=nodes.map(node=>({...node}));
    if(options.moveConnected){
      const parents=nodes.map((node,index)=>index);
      const root=index=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
      const join=(a,b)=>{parents[root(a)]=root(b);};
      for(const edge of edges)join(edge.a,edge.b);
      for(const entry of shapeNodes){const ids=Object.values(entry.points);for(const id of ids)join(ids[0],id);}
      const polylines=new Map();
      for(const edge of edges){
        const referenceId=edge.line.fixedAngle?.referenceId,reference=referenceId&&edges.find(other=>other.line.id===referenceId);if(reference)join(edge.a,reference.a);
        if(edge.line.polylineId){const first=polylines.get(edge.line.polylineId);if(first!==undefined)join(edge.a,first);else polylines.set(edge.line.polylineId,edge.a);}
      }
      const representatives=new Map([...edges.map(edge=>[edge.line.id,edge.a]),...shapeNodes.map(entry=>[entry.shape.id,Object.values(entry.points)[0]])]);
      for(const relation of options.relations||[]){const ids=relation.objects.map(id=>representatives.get(id)).filter(id=>id!==undefined);for(const id of ids)join(ids[0],id);}
      const deltas=new Map();
      for(const change of changes){const index=original.findIndex(node=>matches(node,change.from));if(index>=0)deltas.set(root(index),{x:change.to.x-change.from.x,y:change.to.y-change.from.y});}
      for(let index=0;index<nodes.length;index++){const delta=deltas.get(root(index));if(delta){nodes[index].x+=delta.x;nodes[index].y+=delta.y;}}
    }
    function pin(index,to,axes=['x','y']){const node=nodes[index];for(const axis of axes){const field=axis==='x'?'fixedX':'fixedY';if(node[field]&&Math.abs(node[axis]-to[axis])>1e-5)return false;node[axis]=to[axis];node[field]=true;}node.fixed=node.fixedX&&node.fixedY;return true;}
    for(const edge of edges)if(edge.line.locked||edge.line.fixed||PlanLayers.locked({layers:options.layers},edge.line)){if(!pin(edge.a,original[edge.a])||!pin(edge.b,original[edge.b]))return null;}
    for(const entry of shapeNodes)if(entry.shape.locked||entry.shape.fixed||PlanLayers.locked({layers:options.layers},entry.shape))for(const index of Object.values(entry.points))if(!pin(index,original[index]))return null;
    for(const id of options.fixedNodes||[]){const index=original.findIndex(node=>node.nodeId===id);if(index>=0&&!pin(index,original[index]))return null;}
    for(const point of anchors){const index=original.findIndex(node=>matches(node,point));if(index>=0&&!pin(index,point))return null;}
    for(const change of changes){const index=original.findIndex(node=>matches(node,change.from));if(index>=0&&!pin(index,change.to,change.axes))return null;}
    // When a connected element is dragged, keep the curve's remote end in place.
    // Moving the whole connected assembly remains an explicit alternative.
    if(changes.length&&!options.moveConnected)for(const relation of options.relations||[]){
      if(!['collinear','smooth'].includes(relation.type))continue;
      for(let side=0;side<2;side++){
        const entry=shapeNodes.find(entry=>entry.shape.id===relation.objects[side]);
        if(!entry||!['arc','bezier'].includes(entry.shape.type))continue;
        const key=(side===0?relation.keyA:relation.keyB)||'a',remote=entry.points[key==='a'?'b':'a'];
        const directlyMoved=Object.values(entry.points).filter(index=>index!==entry.points[key]).some(index=>changes.some(change=>matches(original[index],change.from)));
        if(!directlyMoved&&!pin(remote,original[remote]))return null;
      }
    }
    const constraints=[];
    for(const edge of edges){
      if(edge.line.fixedLength>0&&scale>0)constraints.push({kind:'length',edge,target:edge.line.fixedLength/scale});
      const angle=edge.line.fixedAngle;
      if(angle){const ref=angle.referenceId?edges.find(other=>other.line.id===angle.referenceId):null;if(!angle.referenceId||ref)constraints.push({kind:'angle',edge,ref,angle});}
      const direction=edge.line.directionBinding;
      if(direction){
        if(['horizontal','vertical'].includes(direction.mode)){
          const coord=direction.mode==='horizontal'?'y':'x';
          constraints.push({kind:'numeric',ids:[...new Set([edge.a,edge.b])],fn:()=>nodes[edge.b][coord]-nodes[edge.a][coord],tolerance:1e-5});
        }else constraints.push({kind:'angle',edge,angle:{degrees:direction.degrees,anchorKey:'a'}});
      }
    }
    const objects=new Map([...edges.map(edge=>[edge.line.id,{kind:'line',value:edge.line,points:{a:edge.a,b:edge.b},edge}]),...shapeNodes.map(entry=>[entry.shape.id,{kind:entry.shape.type,value:entry.shape,points:entry.points}])]);
    const p=(object,key)=>nodes[object.points[key]],vector=object=>({x:p(object,'b').x-p(object,'a').x,y:p(object,'b').y-p(object,'a').y});
    const length=object=>Math.hypot(vector(object).x,vector(object).y);
    function circle(object){
      if(object.kind==='circle'){const center=p(object,'center'),radial=p(object,'radial');return {x:center.x,y:center.y,r:Math.hypot(radial.x-center.x,radial.y-center.y)};}
      if(object.kind!=='arc')return null;
      const a=p(object,'a'),v=p(object,'via'),b=p(object,'b'),ux=v.x-a.x,uy=v.y-a.y,vx=b.x-a.x,vy=b.y-a.y,d=2*(ux*vy-uy*vx);
      if(Math.abs(d)<1e-10)return null;const u2=ux*ux+uy*uy,v2=vx*vx+vy*vy,x=a.x+(vy*u2-uy*v2)/d,y=a.y+(ux*v2-vx*u2)/d;return{x,y,r:Math.hypot(x-a.x,y-a.y)};
    }
    const numeric=(involved,fn,tolerance=1e-5)=>constraints.push({kind:'numeric',ids:[...new Set(involved.flatMap(object=>Object.values(object.points)))],fn,tolerance});
    const directedAngle=(a,b)=>{const u=vector(a),v=vector(b);return Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);};
    const offset=(object,point)=>{const a=p(object,'a'),v=vector(object);return ((point.x-a.x)*v.y-(point.y-a.y)*v.x)/Math.hypot(v.x,v.y);};
    function endTangent(object,key='a'){
      if(object.kind==='line'){const v=vector(object);return key==='a'?v:{x:-v.x,y:-v.y};}
      if(object.kind==='bezier'){const end=p(object,key),control=p(object,'via');return{x:2*(control.x-end.x),y:2*(control.y-end.y)};}
      const c=circle(object),end=p(object,key),a=p(object,'a'),b=p(object,'b'),via=p(object,'via');if(!c)return{x:NaN,y:NaN};
      const rx=end.x-c.x,ry=end.y-c.y,orientation=(via.x-a.x)*(b.y-a.y)-(via.y-a.y)*(b.x-a.x),sign=(orientation>=0?1:-1)*(key==='a'?1:-1);
      return{x:-ry*sign,y:rx*sign};
    }
    function endCurvature(object,key='a'){
      if(object.kind==='line')return 0;
      const tangent=endTangent(object,key),speed=Math.hypot(tangent.x,tangent.y);
      if(object.kind==='bezier'){const a=p(object,'a'),b=p(object,'b'),v=p(object,'via'),ddx=2*(a.x-2*v.x+b.x),ddy=2*(a.y-2*v.y+b.y);return(tangent.x*ddy-tangent.y*ddx)/(speed**3);}
      const c=circle(object),end=p(object,key);return(tangent.x*(c.y-end.y)-tangent.y*(c.x-end.x))>=0?1/c.r:-1/c.r;
    }
    // Seed the exact circle instead of asking the iterative solver to cross
    // a straight/major-arc transition by moving the intermediate point.
    for(const relation of options.relations||[]){
      if(relation.type!=='collinear')continue;
      const pair=relation.objects.map(id=>objects.get(id)),arc=pair.find(object=>object?.kind==='arc'),line=pair.find(object=>object?.kind==='line');
      if(!arc||!line)continue;
      const arcKey=(pair[0]===arc?relation.keyA:relation.keyB)||'a',lineKey=(pair[0]===line?relation.keyA:relation.keyB)||'a';
      const joint=p(arc,arcKey),remote=p(arc,arcKey==='a'?'b':'a'),via=p(arc,'via');
      const lineEnd=p(line,lineKey==='a'?'b':'a'),lineJoint=p(line,lineKey);
      if(joint.fixed&&remote.fixed&&via.fixed&&lineJoint===joint&&!lineEnd.fixed){
        const tangent=endTangent(arc,arcKey),speed=Math.hypot(tangent.x,tangent.y),oldA=original[line.points.a],oldB=original[line.points.b],size=Math.hypot(oldB.x-oldA.x,oldB.y-oldA.y);
        if(speed>1e-10){if(!lineEnd.fixedX)lineEnd.x=joint.x-tangent.x*size/speed;if(!lineEnd.fixedY)lineEnd.y=joint.y-tangent.y*size/speed;}
      }
      if(!joint.fixed||!remote.fixed||via.fixed||!p(line,'a').fixed||!p(line,'b').fixed)continue;
      const tangent=endTangent(line,lineKey),nx=-tangent.y,ny=tangent.x,dx=remote.x-joint.x,dy=remote.y-joint.y,den=2*(nx*dx+ny*dy);
      if(Math.abs(den)<1e-10)continue;
      const t=(dx*dx+dy*dy)/den,cx=joint.x+nx*t,cy=joint.y+ny*t,rx=joint.x-cx,ry=joint.y-cy;
      const direction=rx*(-tangent.y)-ry*(-tangent.x)>=0?1:-1,start=Math.atan2(ry,rx),end=Math.atan2(remote.y-cy,remote.x-cx),tau=2*Math.PI;
      const sweep=direction*((direction*(end-start)%tau+tau)%tau),angle=start+sweep/2,radius=Math.hypot(rx,ry);
      if(!via.fixedX)via.x=cx+radius*Math.cos(angle);
      if(!via.fixedY)via.y=cy+radius*Math.sin(angle);
    }
    for(const object of objects.values()){
      if(object.kind==='circle'&&!(options.relations||[]).some(relation=>['equal','tangent'].includes(relation.type)&&relation.objects.includes(object.value.id)))numeric([object],()=>circle(object).r-object.value.radius);
      if(object.value.fixedRadius>0&&scale>0)numeric([object],()=>{const c=circle(object);return c?c.r-object.value.fixedRadius/scale:NaN;});
      if(object.kind==='line'&&object.value.fixedDeltaX!=null)numeric([object],()=>vector(object).x-object.value.fixedDeltaX/scale);
      if(object.kind==='line'&&object.value.fixedDeltaY!=null)numeric([object],()=>vector(object).y-object.value.fixedDeltaY/scale);
    }
    for(const relation of options.relations||[]){
      const involved=relation.objects.map(id=>objects.get(id));if(involved.some(object=>!object))continue;
      const [a,b,axis]=involved,type=relation.type;
      if(type==='collinear'&&(a.kind!=='line'||b.kind!=='line')){
        for(const coord of['x','y'])numeric(involved,()=>p(a,relation.keyA||'a')[coord]-p(b,relation.keyB||'a')[coord]);
        numeric(involved,()=>{const u=endTangent(a,relation.keyA),v=endTangent(b,relation.keyB);return Math.atan2(u.x*v.y-u.y*v.x,-(u.x*v.x+u.y*v.y));},1e-7);
      }else if(['parallel','perpendicular','collinear','angle'].includes(type)){
        const target=type==='perpendicular'?Math.PI/2:type==='angle'?-relation.degrees*Math.PI/180:0;
        numeric(involved,()=>{let error=wrap(directedAngle(a,b)-target);if(type!=='angle'){if(error>Math.PI/2)error-=Math.PI;if(error< -Math.PI/2)error+=Math.PI;}return error;},1e-7);
        if(type==='collinear')numeric(involved,()=>offset(a,p(b,'a')));
      }else if(type==='equal')numeric(involved,()=>a.kind==='line'?length(a)-length(b):(circle(a)?.r??NaN)-(circle(b)?.r??NaN));
      else if(type==='distance')numeric(involved,()=>Math.abs(offset(a,p(b,'a')))-relation.value/scale);
      else if(type==='concentric')for(const coord of['x','y'])numeric(involved,()=>{const ca=circle(a),cb=circle(b);return ca&&cb?ca[coord]-cb[coord]:NaN;});
      else if(type==='coincident')for(const coord of['x','y'])numeric(involved,()=>p(a,relation.keyA||'a')[coord]-p(b,relation.keyB||'a')[coord]);
      else if(type==='pointOn')numeric(involved,()=>{const point=p(a,relation.keyA||'a');if(b.kind==='line')return offset(b,point);if(b.kind==='bezier')return PlanTrimming.path({type:'bezier',a:p(b,'a'),via:p(b,'via'),b:p(b,'b')},'shape',0).hit(point).distance;const c=circle(b);return c?Math.hypot(point.x-c.x,point.y-c.y)-c.r:NaN;});
      else if(type==='tangent'&&(a.kind==='circle'&&b.kind==='bezier'||b.kind==='circle'&&a.kind==='bezier')){
        const curve=a.kind==='bezier'?a:b,ring=a.kind==='circle'?a:b,key=curve===a?relation.keyA:relation.keyB;
        numeric(involved,()=>{const end=p(curve,key||'a'),c=circle(ring);return Math.hypot(end.x-c.x,end.y-c.y)-c.r;});
        numeric(involved,()=>{const end=p(curve,key||'a'),c=circle(ring),v=endTangent(curve,key),rx=end.x-c.x,ry=end.y-c.y;return(v.x*rx+v.y*ry)/(Math.hypot(v.x,v.y)*Math.hypot(rx,ry));},1e-7);
      }
      else if(type==='smooth'||type==='tangent'&&(a.kind==='bezier'||b.kind==='bezier')){
        numeric(involved,()=>{const u=endTangent(a,relation.keyA),v=endTangent(b,relation.keyB);return(u.x*v.y-u.y*v.x)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y));},1e-7);
        if(type==='smooth'){
          for(const coord of['x','y'])numeric(involved,()=>p(a,relation.keyA||'a')[coord]-p(b,relation.keyB||'a')[coord]);
          numeric(involved,()=>endCurvature(a,relation.keyA)+endCurvature(b,relation.keyB),1e-7);
        }
      }else if(type==='tangent'){
        if(a.kind==='line'||b.kind==='line'){const line=a.kind==='line'?a:b,curve=a.kind==='line'?b:a;numeric(involved,()=>{const c=circle(curve);return c?Math.abs(offset(line,c))-c.r:NaN;});}
        else numeric(involved,()=>{const ca=circle(a),cb=circle(b);return ca&&cb?Math.hypot(ca.x-cb.x,ca.y-cb.y)-(relation.internal?Math.abs(ca.r-cb.r):ca.r+cb.r):NaN;});
      }else if(type==='symmetric'&&axis){
        for(const pair of[['a','a'],['b','b']])for(const coord of['x','y'])numeric(involved,()=>{const point=p(a,pair[0]),origin=p(axis,'a'),v=vector(axis),t=((point.x-origin.x)*v.x+(point.y-origin.y)*v.y)/(v.x*v.x+v.y*v.y);return 2*(origin[coord]+v[coord]*t)-point[coord]-p(b,pair[1])[coord];});
      }
    }
    function evaluate(constraint){
      if(constraint.kind==='numeric'){
        const error=constraint.fn();if(!Number.isFinite(error))return null;const gradients=new Map();
        for(const id of constraint.ids){const node=nodes[id],gradient={x:0,y:0};for(const coord of['x','y']){const old=node[coord],h=Math.max(1e-5,Math.abs(old)*1e-7);node[coord]=old+h;const plus=constraint.fn();node[coord]=old-h;const minus=constraint.fn();node[coord]=old;gradient[coord]=(plus-minus)/(2*h);}gradients.set(id,gradient);}
        return{error,gradients,tolerance:constraint.tolerance};
      }
      const {edge}=constraint,a=nodes[edge.a],b=nodes[edge.b],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,gradients=new Map();
      const add=(id,x,y)=>{const previous=gradients.get(id)||{x:0,y:0};gradients.set(id,{x:previous.x+x,y:previous.y+y});};
      if(constraint.kind==='length'){
        const length=Math.sqrt(len2);if(length<1e-9)return null;add(edge.a,-dx/length,-dy/length);add(edge.b,dx/length,dy/length);return {error:length-constraint.target,gradients,tolerance:1e-5};
      }
      if(len2<1e-12)return null;
      add(edge.a,dy/len2,-dx/len2);add(edge.b,-dy/len2,dx/len2);
      let angle=Math.atan2(dy,dx)+(constraint.angle.anchorKey==='b'?Math.PI:0),referenceAngle=0;
      if(constraint.ref){const ref=constraint.ref,p=nodes[ref.a],q=nodes[ref.b],rx=q.x-p.x,ry=q.y-p.y,r2=rx*rx+ry*ry;if(r2<1e-12)return null;referenceAngle=Math.atan2(ry,rx)+(constraint.angle.referenceAnchorKey==='b'?Math.PI:0);add(ref.a,-ry/r2,rx/r2);add(ref.b,ry/r2,-rx/r2);}
      let error=wrap(angle-referenceAngle+constraint.angle.degrees*Math.PI/180);if(constraint.undirected){if(error>Math.PI/2)error-=Math.PI;if(error< -Math.PI/2)error+=Math.PI;}
      return {error,gradients,tolerance:1e-7};
    }
    for(let iteration=0;iteration<600;iteration++){
      let satisfied=true;
      for(const constraint of constraints){const value=evaluate(constraint);if(!value)return null;if(Math.abs(value.error)<=value.tolerance)continue;satisfied=false;
        let denominator=0;for(const [id,g] of value.gradients){if(!nodes[id].fixedX)denominator+=g.x*g.x;if(!nodes[id].fixedY)denominator+=g.y*g.y;}
        if(denominator<1e-16)return null;
        const correction=.85*value.error/denominator;for(const [id,g] of value.gradients){if(!nodes[id].fixedX)nodes[id].x-=correction*g.x;if(!nodes[id].fixedY)nodes[id].y-=correction*g.y;}
      }
      if(satisfied)break;
    }
    for(const constraint of constraints){const value=evaluate(constraint);if(!value||Math.abs(value.error)>value.tolerance*10)return null;}
    for(const edge of edges){const a=nodes[edge.a],b=nodes[edge.b];if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||Math.hypot(a.x-b.x,a.y-b.y)<1e-5)return null;edge.line.a={...edge.line.a,x:a.x,y:a.y};edge.line.b={...edge.line.b,x:b.x,y:b.y};}
    for(const entry of shapeNodes){for(const [key,index] of Object.entries(entry.points)){if(key==='radial')continue;const node=nodes[index];entry.shape[key]={...entry.shape[key],x:node.x,y:node.y};}if(entry.shape.type==='circle')entry.shape.radius=circle(objects.get(entry.shape.id)).r;else if(entry.shape.type==='arc'&&!circle(objects.get(entry.shape.id)))return null;}
    Object.defineProperty(lines,'shapes',{value:shapes});
    return lines;
  }
  return {solve};
})();

const PlanTrimming=(()=>{
  const tau=Math.PI*2,epsilon=1e-7;
  const normalize=value=>(value%tau+tau)%tau;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function arc(a,via,b){
    const ux=via.x-a.x,uy=via.y-a.y,vx=b.x-a.x,vy=b.y-a.y,d=2*(ux*vy-uy*vx);
    if(Math.abs(d)<1e-7*Math.max(1,Math.hypot(ux,uy)*Math.hypot(vx,vy)))return null;
    const u2=ux*ux+uy*uy,v2=vx*vx+vy*vy,cx=a.x+(vy*u2-uy*v2)/d,cy=a.y+(ux*v2-vx*u2)/d;
    const angle=p=>Math.atan2(p.y-cy,p.x-cx);
    return {cx,cy,radius:Math.hypot(a.x-cx,a.y-cy),startAngle:angle(a),endAngle:angle(b),anticlockwise:normalize(angle(via)-angle(a))>normalize(angle(b)-angle(a))};
  }
  function path(item,kind,index){
    if(item.type==='bezier'){
      const at=t=>{const u=1-t;return{x:u*u*item.a.x+2*u*t*item.via.x+t*t*item.b.x,y:u*u*item.a.y+2*u*t*item.via.y+t*t*item.b.y};};
      const hit=point=>{let t=0,nearest=Infinity;for(let i=0;i<=64;i++){const value=i/64,d=distance(at(value),point);if(d<nearest){nearest=d;t=value;}}for(let i=0;i<12;i++){const p=at(t),dx=2*((1-t)*(item.via.x-item.a.x)+t*(item.b.x-item.via.x)),dy=2*((1-t)*(item.via.y-item.a.y)+t*(item.b.y-item.via.y)),ddx=2*(item.b.x-2*item.via.x+item.a.x),ddy=2*(item.b.y-2*item.via.y+item.a.y),den=dx*dx+dy*dy+(p.x-point.x)*ddx+(p.y-point.y)*ddy;if(Math.abs(den)<1e-12)break;t=Math.max(0,Math.min(1,t-((p.x-point.x)*dx+(p.y-point.y)*dy)/den));}return{t,distance:distance(at(t),point)};};
      return{item,kind,index,bezier:true,closed:false,at,hit,parameter:point=>hit(point).t};
    }
    if(kind==='line'){
      const dx=item.b.x-item.a.x,dy=item.b.y-item.a.y,length2=dx*dx+dy*dy;if(length2<epsilon)return null;
      const at=t=>({x:item.a.x+dx*t,y:item.a.y+dy*t}),parameter=p=>((p.x-item.a.x)*dx+(p.y-item.a.y)*dy)/length2;
      return {item,kind,index,at,parameter,closed:false,hit(p){const t=Math.max(0,Math.min(1,parameter(p)));return{t,distance:distance(p,at(t))};}};
    }
    const data=item.type==='circle'?{cx:item.center.x,cy:item.center.y,radius:item.radius,startAngle:0,endAngle:0,anticlockwise:false}:arc(item.a,item.via,item.b);
    if(!data||data.radius<=epsilon)return null;
    const closed=item.type==='circle',direction=data.anticlockwise?-1:1,sweep=closed?tau:normalize(direction*(data.endAngle-data.startAngle));
    if(sweep<epsilon)return null;
    const at=t=>({x:data.cx+data.radius*Math.cos(data.startAngle+direction*sweep*t),y:data.cy+data.radius*Math.sin(data.startAngle+direction*sweep*t)});
    const parameter=p=>{const angle=normalize(direction*(Math.atan2(p.y-data.cy,p.x-data.cx)-data.startAngle));return angle>tau-epsilon?0:angle/sweep;};
    return {item,kind,index,closed,data,at,parameter,hit(p){const t=parameter(p);if(t<=1+epsilon)return {t:Math.min(1,t),distance:Math.abs(distance(p,{x:data.cx,y:data.cy})-data.radius)};const a=distance(p,at(0)),b=distance(p,at(1));return {t:a<b?0:1,distance:Math.min(a,b)};}};
  }
  function intersections(a,b){
    if(a.bezier||b.bezier){
      const result=[],stepsA=a.bezier?64:a.kind==='line'?1:96,stepsB=b.bezier?64:b.kind==='line'?1:96;
      for(let i=0;i<stepsA;i++)for(let j=0;j<stepsB;j++){
        const p=a.at(i/stepsA),q=b.at(j/stepsB),endA=a.at((i+1)/stepsA),endB=b.at((j+1)/stepsB),rx=endA.x-p.x,ry=endA.y-p.y,sx=endB.x-q.x,sy=endB.y-q.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)continue;
        const ta=((q.x-p.x)*sy-(q.y-p.y)*sx)/den,tb=((q.x-p.x)*ry-(q.y-p.y)*rx)/den;if(ta<-1e-7||ta>1+1e-7||tb<-1e-7||tb>1+1e-7)continue;
        let t=(i+ta)/stepsA,u=(j+tb)/stepsB;
        for(let k=0;k<10;k++){const p=a.at(t),q=b.at(u),h=1e-5,pa=a.at(t+h),qa=b.at(u+h),ax=(pa.x-p.x)/h,ay=(pa.y-p.y)/h,bx=(qa.x-q.x)/h,by=(qa.y-q.y)/h,d=ax*(-by)-ay*(-bx);if(Math.abs(d)<1e-12)break;const ex=p.x-q.x,ey=p.y-q.y;t-=((-by)*ex+bx*ey)/d;u-=(-ay*ex+ax*ey)/d;}
        const candidate=a.at(t);if(t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6&&distance(candidate,b.at(u))<1e-4&&!result.some(other=>distance(candidate,other)<1e-5))result.push(candidate);
      }
      return result;
    }
    if(a.kind==='line'&&b.kind==='line'){
      const p=a.item.a,q=b.item.a,rx=a.item.b.x-p.x,ry=a.item.b.y-p.y,sx=b.item.b.x-q.x,sy=b.item.b.y-q.y,cross=rx*sy-ry*sx;
      if(Math.abs(cross)<epsilon){if(Math.abs((q.x-p.x)*ry-(q.y-p.y)*rx)>epsilon)return [];return[a.item.a,a.item.b,b.item.a,b.item.b];}
      const t=((q.x-p.x)*sy-(q.y-p.y)*sx)/cross;return[a.at(t)];
    }
    if(a.kind==='line'||b.kind==='line'){
      const line=a.kind==='line'?a:b,circle=a.kind==='line'?b:a,p=line.item.a,c=circle.data,dx=line.item.b.x-p.x,dy=line.item.b.y-p.y,fx=p.x-c.cx,fy=p.y-c.cy;
      const aa=dx*dx+dy*dy,bb=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-c.radius*c.radius,discriminant=bb*bb-4*aa*cc;
      if(discriminant<=epsilon)return [];const root=Math.sqrt(discriminant);return[line.at((-bb-root)/(2*aa)),line.at((-bb+root)/(2*aa))];
    }
    const p=a.data,q=b.data,dx=q.cx-p.cx,dy=q.cy-p.cy,d=Math.hypot(dx,dy);
    if(d<epsilon||d>=p.radius+q.radius-epsilon||d<=Math.abs(p.radius-q.radius)+epsilon)return [];
    const along=(p.radius*p.radius-q.radius*q.radius+d*d)/(2*d),height=Math.sqrt(Math.max(0,p.radius*p.radius-along*along)),x=p.cx+dx*along/d,y=p.cy+dy*along/d;
    return[{x:x-dy*height/d,y:y+dx*height/d},{x:x+dy*height/d,y:y-dx*height/d}];
  }
  function trim(geometry,point,tolerance){
    const paths=[...(geometry.lines||[]).map((item,index)=>path(item,'line',index)),...(geometry.shapes||[]).map((item,index)=>path(item,'shape',index))].filter(entry=>entry&&PlanLayers.visible(geometry,entry.item));
    let target=null,hit=null;
    for(const candidate of paths){const current=candidate.hit(point);if(current.distance<=tolerance&&(!hit||current.distance<hit.distance)){target=candidate;hit=current;}}
    if(!target)return {changed:false,message:'Kliknij fragment linii, łuku lub koła.'};
    if(target.item.locked||target.item.fixed||PlanLayers.locked(geometry,target.item))return {changed:false,message:'Najpierw odblokuj lub zwolnij tę linię.'};
    if(target.item.fixedLength||target.item.fixedAngle||target.item.directionBinding||target.item.fixedRadius||target.item.fixedDeltaX!=null||target.item.fixedDeltaY!=null||(geometry.relations||[]).some(relation=>relation.objects.includes(target.item.id))||(geometry.lines||[]).some(line=>line.fixedAngle?.referenceId&&line.fixedAngle.referenceId===target.item.id))return{changed:false,message:'Ten element ma wiązania. Zwolnij je przed przycięciem — ustalone wartości nie zostaną zmienione automatycznie.'};
    const cuts=[];
    for(const other of paths){if(other===target)continue;for(const p of intersections(target,other)){
      const t=target.parameter(p),u=other.parameter(p);
      if(t<-epsilon||t>1+epsilon||u<-epsilon||u>1+epsilon)continue;
      if(target.hit(p).distance>1e-4||other.hit(p).distance>1e-4)continue;
      const value=Math.max(0,Math.min(1,t));if(!cuts.some(cut=>Math.abs(cut-value)<epsilon))cuts.push(value);
    }}
    cuts.sort((a,b)=>a-b);
    let intervals=[];
    if(target.closed){
      if(cuts.length<2)return {changed:false,message:'Koło wymaga co najmniej dwóch przecięć.'};
      let index=cuts.findIndex((cut,i)=>hit.t>=cut-epsilon&&hit.t<(cuts[i+1]??cuts[0]+1)-epsilon);
      if(index<0)index=cuts.length-1;
      const left=cuts[index],right=cuts[index+1]??cuts[0]+1;intervals=[[right,left+1]];
    }else{
      const interior=cuts.filter(t=>t>epsilon&&t<1-epsilon);
      if(!interior.length)return {changed:false,message:'Ten fragment nie ma przecięć, przy których można go przyciąć.'};
      const boundaries=[0,...interior,1];let index=boundaries.findIndex((value,i)=>i<boundaries.length-1&&hit.t<boundaries[i+1]-epsilon);if(index<0)index=boundaries.length-2;
      const left=boundaries[index],right=boundaries[index+1];intervals=[[0,left],[right,1]].filter(([a,b])=>b-a>epsilon);
    }
    const endpoint=t=>Math.abs(t)<epsilon&&target.item.a?{...target.item.a}:Math.abs(t-1)<epsilon&&target.item.b?{...target.item.b}:{...target.at(t),nodeId:PlanTopology.uid()};
    const pieces=intervals.map(([a,b],index)=>{const base={...target.item,id:index?PlanTopology.uid():target.item.id,a:endpoint(a),b:endpoint(b)};if(target.kind==='line')return base;if(target.bezier){const derivative={x:2*((1-a)*(target.item.via.x-target.item.a.x)+a*(target.item.b.x-target.item.via.x)),y:2*((1-a)*(target.item.via.y-target.item.a.y)+a*(target.item.b.y-target.item.via.y))};return{...base,via:{x:base.a.x+(b-a)*derivative.x/2,y:base.a.y+(b-a)*derivative.y/2,nodeId:PlanTopology.uid()}};}return{...base,type:'arc',via:{...target.at((a+b)/2),nodeId:PlanTopology.uid()}};});
    const oldPoints=target.item.type==='circle'?[target.item.center]:[target.item.a,target.item.b,target.item.via].filter(Boolean),newPoints=pieces.flatMap(item=>[item.a,item.b,item.via].filter(Boolean));
    if(oldPoints.some(point=>(geometry.fixedNodes||[]).includes(point.nodeId)&&!newPoints.some(other=>other.nodeId===point.nodeId)))return{changed:false,message:'Przycięcie usunęłoby unieruchomiony punkt. Najpierw zwolnij jego wiązanie.'};
    if(target.kind==='line')geometry.lines.splice(target.index,1,...pieces);else geometry.shapes.splice(target.index,1,...pieces);
    geometry.angles=(geometry.angles||[]).filter(item=>item.a!==target.item.id&&item.b!==target.item.id);
    if(target.item.polylineId){const members=geometry.lines.filter(line=>line.polylineId===target.item.polylineId),remaining=new Set(members);let first=true;while(remaining.size){const seed=remaining.values().next().value,group=[seed],id=first?target.item.polylineId:PlanTopology.uid();first=false;remaining.delete(seed);for(let i=0;i<group.length;i++)for(const other of remaining)if([group[i].a,group[i].b].some(point=>[other.a,other.b].some(candidate=>PlanTopology.same(point,candidate)))){group.push(other);remaining.delete(other);}group.forEach(line=>line.polylineId=id);}}
    return {changed:true,message:'Przycięto fragment pomiędzy przecięciami.'};
  }
  return {arc,trim,path,intersections};
})();

const PlanSnap=(()=>{
  function candidates(geometry,point,origin,range=Infinity){
    let activeId=null;const result=[],add=(value,kind,objectIds)=>{if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))result.push({point:value,kind,objectId:activeId,objectIds});};
    const paths=[];
    for(const [kind,items] of [['line',geometry.lines||[]],['shape',geometry.shapes||[]]])for(const [index,item] of items.entries()){
      if(!PlanLayers.visible(geometry,item))continue;
      activeId=item.id;
      if(item.type!=='circle'){add(item.a,'Koniec');add(item.b,'Koniec');}
      const path=PlanTrimming.path(item,kind,index);if(path)paths.push(path);
      if(kind==='line'){
        add({x:(item.a.x+item.b.x)/2,y:(item.a.y+item.b.y)/2},'Środek');
        const dx=item.b.x-item.a.x,dy=item.b.y-item.a.y,len2=dx*dx+dy*dy;
        if(len2){const t=Math.max(0,Math.min(1,((point.x-item.a.x)*dx+(point.y-item.a.y)*dy)/len2));add({x:item.a.x+t*dx,y:item.a.y+t*dy},'Na linii');
          if(origin){const t=((origin.x-item.a.x)*dx+(origin.y-item.a.y)*dy)/len2;add({x:item.a.x+t*dx,y:item.a.y+t*dy},'Prostopadle');}
        }
      }else if(path?.data){
        const data=path.data,center={x:data.cx,y:data.cy};add(center,'Środek okręgu');if(!path.closed)add(path.at(.5),'Środek łuku');
        const angle=Math.atan2(point.y-center.y,point.x-center.x),nearest={x:center.x+Math.cos(angle)*data.radius,y:center.y+Math.sin(angle)*data.radius};
        if(path.closed||path.hit(nearest).distance<1e-5)add(nearest,'Na krzywej');
        for(let i=0;i<4;i++){const p={x:center.x+Math.cos(i*Math.PI/2)*data.radius,y:center.y+Math.sin(i*Math.PI/2)*data.radius};if(path.closed||path.hit(p).distance<1e-5)add(p,'Ćwiartka');}
        if(origin){const distance=Math.hypot(origin.x-center.x,origin.y-center.y);if(distance>=data.radius){const angle=Math.atan2(origin.y-center.y,origin.x-center.x),delta=Math.acos(data.radius/distance);for(const direction of[-1,1]){const p={x:center.x+Math.cos(angle+direction*delta)*data.radius,y:center.y+Math.sin(angle+direction*delta)*data.radius};if(path.closed||path.hit(p).distance<1e-5)add(p,'Stycznie');}}}
      }else if(item.type==='bezier')for(let i=1;i<96;i++){const t=i/96,u=1-t;add({x:u*u*item.a.x+2*u*t*item.via.x+t*t*item.b.x,y:u*u*item.a.y+2*u*t*item.via.y+t*t*item.b.y},'Na krzywej');}
    }
    activeId=null;const nearby=paths.filter(path=>path.hit(point).distance<=range);
    for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++)for(const p of PlanTrimming.intersections(nearby[i],nearby[j]))if(nearby[i].hit(p).distance<1e-5&&nearby[j].hit(p).distance<1e-5)add(p,'Przecięcie',[nearby[i].item.id,nearby[j].item.id]);
    return result;
  }
  return {candidates};
})();

const PlanEditing=(()=>{
  function guard(geometry,object){
    if(object.locked||PlanLayers.locked(geometry,object)||object.fixed||object.fixedLength||object.fixedAngle||object.directionBinding||object.fixedRadius||object.fixedDeltaX!=null||object.fixedDeltaY!=null||geometry.relations.some(relation=>relation.objects.includes(object.id))||geometry.lines.some(line=>line.fixedAngle?.referenceId&&line.fixedAngle.referenceId===object.id))throw Error('Zwolnij wiązania i blokady tego elementu przed zmianą jego struktury.');
  }
  function split(geometry,object,point,disconnect=false){
    guard(geometry,object);if(object.type==='circle')throw Error('Najpierw przytnij okrąg do łuku.');const kind=object.type?'shape':'line',items=kind==='line'?geometry.lines:geometry.shapes,path=PlanTrimming.path(object,kind,items.indexOf(object));if(!path)throw Error('Ten typ krzywej nie obsługuje tej operacji.');
    const t=Math.max(0,Math.min(1,path.hit(point).t));if(t<1e-5||t>1-1e-5)throw Error('Wskaż punkt wewnątrz segmentu.');
    const cut={...path.at(t),nodeId:PlanTopology.uid()},other=disconnect?{...cut,nodeId:PlanTopology.uid()}:cut;
    const a={...object,b:cut},b={...object,id:PlanTopology.uid(),a:other};
    if(kind==='shape'){if(object.type==='bezier'){a.via={x:object.a.x+(object.via.x-object.a.x)*t,y:object.a.y+(object.via.y-object.a.y)*t,nodeId:PlanTopology.uid()};b.via={x:object.via.x+(object.b.x-object.via.x)*t,y:object.via.y+(object.b.y-object.via.y)*t,nodeId:PlanTopology.uid()};}else{a.via={...path.at(t/2),nodeId:PlanTopology.uid()};b.via={...path.at((1+t)/2),nodeId:PlanTopology.uid()};}}
    if(kind==='line')for(const dimension of geometry.dimensions||[])if(dimension.points?.some(ref=>ref.objectId===object.id&&ref.key==='b')){
      for(const ref of dimension.points)if(ref.objectId===object.id&&ref.key==='b')ref.objectId=b.id;
      dimension.objects=[...new Set(dimension.points.map(ref=>ref.objectId))];
    }
    items.splice(items.indexOf(object),1,a,b);if(object.polylineId)PlanTopology.components(geometry,object.polylineId);return[a,b];
  }
  function removeVertex(geometry,object,key){
    if(object.type)throw Error('Usuwanie wierzchołka jest dostępne dla odcinków prostych.');guard(geometry,object);const vertex=object[key],neighbors=geometry.lines.filter(line=>line!==object&&[line.a,line.b].some(point=>PlanTopology.same(point,vertex)));
    if(geometry.fixedNodes.includes(vertex.nodeId))throw Error('Najpierw zwolnij unieruchomienie tego punktu.');
    if(neighbors.length!==1)throw Error('Wierzchołek musi łączyć dokładnie dwa proste segmenty.');const other=neighbors[0];guard(geometry,other);
    const group=geometry.lines.filter(line=>line.polylineId&&line.polylineId===object.polylineId),closed=group.length&&group.every(line=>[line.a,line.b].every(point=>group.filter(candidate=>[candidate.a,candidate.b].some(p=>PlanTopology.same(p,point))).length===2));if(closed&&group.length<=3)throw Error('Zamknięty obrys musi mieć co najmniej trzy wierzchołki.');
    const end=PlanTopology.same(other.a,vertex)?other.b:other.a;object[key]={...end};geometry.lines=geometry.lines.filter(line=>line!==other);PlanTopology.prune(geometry);
  }
  function join(geometry,first,second,tolerance){
    guard(geometry,first);guard(geometry,second);if(first.type==='circle'||second.type==='circle')throw Error('Okręgu nie można włączyć w otwartą polilinię.');
    let pair=null,nearest=tolerance;for(const a of[first.a,first.b])for(const b of[second.a,second.b]){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<=nearest){nearest=d;pair=[a,b];}}
    if(!pair)throw Error('Końce elementów muszą się stykać.');if(pair.every(point=>geometry.fixedNodes.includes(point.nodeId))&&Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)>1e-6)throw Error('Nie można połączyć dwóch różnych unieruchomionych punktów.');PlanTopology.connect(geometry,pair[1],pair[0]);const group=first.polylineId||PlanTopology.uid(),oldA=first.polylineId,oldB=second.polylineId;
    for(const item of[...geometry.lines,...geometry.shapes])if(item===first||item===second||oldA&&item.polylineId===oldA||oldB&&item.polylineId===oldB)item.polylineId=group;
  }
  function extend(geometry,object,boundary,key){
    guard(geometry,object);if(object.type)throw Error('Wydłużanie jest dostępne dla prostych odcinków.');
    const path=PlanTrimming.path(object,'line',0),edge=PlanTrimming.path(boundary,boundary.type?'shape':'line',0);if(!edge)throw Error('Wskaż prostą, łuk albo okrąg jako granicę.');
    const options=PlanTrimming.intersections(path,edge).filter(point=>edge.hit(point).distance<1e-5&&(key==='b'?path.parameter(point)>1+1e-7:path.parameter(point)<-1e-7)).sort((a,b)=>Math.hypot(a.x-object[key].x,a.y-object[key].y)-Math.hypot(b.x-object[key].x,b.y-object[key].y));
    if(!options.length)throw Error('W tym kierunku nie ma przecięcia z wybraną granicą.');return{from:{...object[key]},to:options[0]};
  }
  return {guard,split,removeVertex,join,extend};
})();

const PlanDimensions=(()=>{
  // 14 px text, its hit area and clearance fit between 36 px dimension rows.
  const offsetStep=36;
  function snapOffset(pixels){return (pixels<0?-1:1)*Math.max(1,Math.round(Math.abs(pixels)/offsetStep))*offsetStep;}
  function point(geometry,ref){
    const object=[...geometry.lines,...geometry.shapes].find(item=>item.id===ref.objectId);if(!object)return null;
    if(object.type==='circle'&&ref.key!=='center'){const directions={right:[1,0],top:[0,-1],left:[-1,0],bottom:[0,1]},axis=directions[ref.key];return axis?{x:object.center.x+axis[0]*object.radius,y:object.center.y+axis[1]*object.radius}:null;}
    return object[ref.key]||null;
  }
  function references(geometry){return [...geometry.lines,...geometry.shapes].filter(object=>PlanLayers.visible(geometry,object)).flatMap(object=>(object.type==='circle'?['center','right','top','left','bottom']:object.via?['a','via','b']:['a','b']).map(key=>({objectId:object.id,key})));}
  function line(geometry,dimension){
    if(['pointDistance','pointHorizontal','pointVertical'].includes(dimension.type)){
      const [a,b]=dimension.points.map(ref=>point(geometry,ref));if(!a||!b)return null;
      const mode=dimension.type==='pointHorizontal'?'horizontal':dimension.type==='pointVertical'?'vertical':'aligned';
      return {id:dimension.id,a:{...a},b:mode==='horizontal'?{x:b.x,y:a.y}:mode==='vertical'?{x:a.x,y:b.y}:{...b},originA:{...a},originB:{...b},dimensionType:mode,dimensionRecord:dimension,dimensionOffset:dimension.dimensionOffset};
    }
    if(dimension.type==='partialArcLength')return null;
    const objects=dimension.objects.map(id=>[...geometry.lines,...geometry.shapes].find(object=>object.id===id));if(objects.some(object=>!object))return null;
    if(dimension.type==='distance'){
      const [first,second]=objects;if(first.type||second.type)return null;
      const dx=first.b.x-first.a.x,dy=first.b.y-first.a.y,ex=second.b.x-second.a.x,ey=second.b.y-second.a.y,len2=dx*dx+dy*dy;
      if(len2<1e-12||Math.abs(dx*ey-dy*ex)>1e-6*Math.sqrt(len2)*Math.hypot(ex,ey))return null;
      const t=((second.a.x-first.a.x)*dx+(second.a.y-first.a.y)*dy)/len2;
      return {id:dimension.id,a:{...first.a},b:{x:second.a.x-t*dx,y:second.a.y-t*dy},originA:{...first.a},originB:{...second.a},dimensionRecord:dimension,dimensionOffset:dimension.dimensionOffset};
    }
    const points=objects.flatMap(object=>object.type==='circle'?[{x:object.center.x-object.radius,y:object.center.y-object.radius},{x:object.center.x+object.radius,y:object.center.y+object.radius}]:[object.a,object.b,...object.via?[object.via]:[]]);
    if(!points.length)return null;const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const vertical=dimension.type==='totalVertical';
    return {id:dimension.id,a:{x:minX,y:vertical?maxY:minY},b:{x:vertical?minX:maxX,y:minY},dimensionRecord:dimension,dimensionOffset:dimension.dimensionOffset};
  }
  function arcLength(shape,from='a',to='b'){const arc=PlanTrimming.arc(shape.a,shape.via,shape.b);if(!arc)return null;const sign=arc.anticlockwise?-1:1,sweep=((sign*(arc.endAngle-arc.startAngle))%(2*Math.PI)+2*Math.PI)%(2*Math.PI),parameter=key=>key==='a'?0:key==='b'?sweep:((sign*(Math.atan2(shape.via.y-arc.cy,shape.via.x-arc.cx)-arc.startAngle))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);return arc.radius*Math.abs(parameter(to)-parameter(from));}
  return {line,arcLength,snapOffset,offsetStep,point,references};
})();

// Sketch coordinates belong to a support plane; faces are bounded regions on that plane.
const PlanSketch=(()=>{
  function normalize(plan){
    plan.planes??=[{id:'xy',name:'XY',origin:{x:0,y:0,z:0},u:{x:1,y:0,z:0},v:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}}];
    if(!plan.planes.length)plan.planes.push({id:'xy',name:'XY',origin:{x:0,y:0,z:0},u:{x:1,y:0,z:0},v:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}});
    if(!plan.planes.some(plane=>plane.id===plan.outline.planeId))plan.outline.planeId=plan.planes[0].id;
  }
  function world(plane,p){return{x:plane.origin.x+plane.u.x*p.x+plane.v.x*p.y,y:plane.origin.y+plane.u.y*p.x+plane.v.y*p.y,z:plane.origin.z+plane.u.z*p.x+plane.v.z*p.y};}
  return{normalize,world};
})();
const PlanFacesLegacy=(()=>{
  const eps=1e-6,cross=(a,b)=>a.x*b.y-a.y*b.x,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const area=points=>points.reduce((sum,a,i)=>sum+cross(a,points[(i+1)%points.length]),0)/2;
  function contains(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
  function paths(objects){
    const endpoints=objects.flatMap(o=>o.a?[o.a,o.b]:[]),result=[];
    for(const o of objects){
      if(!o.type){result.push({id:o.id,points:[o.a,o.b]});continue;}
      if(o.type==='rectangle'){result.push({id:o.id,points:[o.a,{x:o.b.x,y:o.a.y},o.b,{x:o.a.x,y:o.b.y},o.a]});continue;}
      if(o.type==='bezier'){
        const points=Array.from({length:257},(_,i)=>{const t=i/256,u=1-t;return{x:u*u*o.a.x+2*u*t*o.via.x+t*t*o.b.x,y:u*u*o.a.y+2*u*t*o.via.y+t*t*o.b.y};});
        result.push({id:o.id,points});continue;
      }
      const arc=o.type==='circle'?{cx:o.center.x,cy:o.center.y,radius:o.radius,startAngle:0,endAngle:0,anticlockwise:false}:PlanTrimming.arc(o.a,o.via,o.b);
      if(!arc)continue;
      const sign=arc.anticlockwise?-1:1,tau=2*Math.PI,wrap=a=>(a%tau+tau)%tau,sweep=o.type==='circle'?tau:wrap(sign*(arc.endAngle-arc.startAngle));
      const steps=Math.max(8,Math.ceil(sweep/Math.min(Math.PI/96,Math.sqrt(.08/Math.max(arc.radius,eps))))),ts=Array.from({length:steps+1},(_,i)=>i/steps);
      for(const p of endpoints){if(Math.abs(Math.hypot(p.x-arc.cx,p.y-arc.cy)-arc.radius)>eps)continue;const t=wrap(sign*(Math.atan2(p.y-arc.cy,p.x-arc.cx)-arc.startAngle))/sweep;if(t>eps&&t<1-eps)ts.push(t);}
      ts.sort((a,b)=>a-b);const points=ts.map(t=>({x:arc.cx+arc.radius*Math.cos(arc.startAngle+sign*sweep*t),y:arc.cy+arc.radius*Math.sin(arc.startAngle+sign*sweep*t)}));
      if(o.type!=='circle'){points[0]=o.a;points[points.length-1]=o.b;}else points[points.length-1]=points[0];
      result.push({id:o.id,points});
    }
    return result;
  }
  function detect(geometry){
    const objects=[...geometry.lines||[],...geometry.shapes||[]].filter(o=>!o.construction&&PlanLayers.visible(geometry,o)),segments=[];
    for(const path of paths(objects))for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];if(Math.hypot(b.x-a.x,b.y-a.y)>eps)segments.push({a,b,cuts:[0,1]});}
    const cut=(s,p)=>{const d=sub(s.b,s.a),len=d.x*d.x+d.y*d.y,t=((p.x-s.a.x)*d.x+(p.y-s.a.y)*d.y)/len;if(t>=-eps&&t<=1+eps&&Math.abs(cross(sub(p,s.a),d))/Math.sqrt(len)<eps)s.cuts.push(Math.max(0,Math.min(1,t)));};
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const a=segments[i],b=segments[j];
      if(Math.max(a.a.x,a.b.x)+eps<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)+eps<Math.min(a.a.x,a.b.x)||Math.max(a.a.y,a.b.y)+eps<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)+eps<Math.min(a.a.y,a.b.y))continue;
      const r=sub(a.b,a.a),s=sub(b.b,b.a),q=sub(b.a,a.a),den=cross(r,s);
      if(Math.abs(den)>eps*eps){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-eps&&t<=1+eps&&u>=-eps&&u<=1+eps){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));}}
      else{cut(a,b.a);cut(a,b.b);cut(b,a.a);cut(b,a.b);}
    }
    const nodes=[],buckets=new Map(),edges=new Map();
    function node(p){const x=Math.round(p.x/eps),y=Math.round(p.y/eps);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const n=buckets.get(`${x+dx},${y+dy}`);if(n&&Math.hypot(p.x-n.p.x,p.y-n.p.y)<eps*2)return n;}const n={id:nodes.length,p,links:[]};nodes.push(n);buckets.set(`${x},${y}`,n);return n;}
    for(const s of segments){s.cuts.sort((a,b)=>a-b);for(let i=1;i<s.cuts.length;i++){
      const at=t=>({x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t}),a=node(at(s.cuts[i-1])),b=node(at(s.cuts[i]));if(a===b)continue;
      const key=[a.id,b.id].sort((a,b)=>a-b).join(':');if(edges.has(key))continue;edges.set(key,true);
      const ab={from:a,to:b},ba={from:b,to:a};ab.twin=ba;ba.twin=ab;a.links.push(ab);b.links.push(ba);
    }}
    // Remove open branches: they cannot bound a surface.
    const queue=nodes.filter(n=>n.links.length<2);for(let i=0;i<queue.length;i++){const n=queue[i];for(const e of [...n.links]){e.to.links=e.to.links.filter(other=>other!==e.twin);if(e.to.links.length===1)queue.push(e.to);}n.links=[];}
    for(const n of nodes)n.links.sort((a,b)=>Math.atan2(a.to.p.y-n.p.y,a.to.p.x-n.p.x)-Math.atan2(b.to.p.y-n.p.y,b.to.p.x-n.p.x));
    const loops=[];
    for(const n of nodes)for(const start of n.links){if(start.used)continue;let e=start;const points=[];do{if(e.used)break;e.used=true;points.push(e.from.p);const links=e.to.links,index=links.indexOf(e.twin);e=links[(index+links.length-1)%links.length];}while(e!==start);
      const size=area(points);if(e===start&&size>eps)loops.push({points,area:size,holes:[]});
    }
    for(const loop of loops){const a=loop.points[0],b=loop.points[1],len=Math.hypot(b.x-a.x,b.y-a.y),p={x:(a.x+b.x)/2-(b.y-a.y)/len*eps*4,y:(a.y+b.y)/2+(b.x-a.x)/len*eps*4};
      const parent=loops.filter(other=>other!==loop&&other.area>loop.area+eps&&contains(other.points,p)).sort((a,b)=>a.area-b.area)[0];if(parent)parent.holes.push(loop.points);
    }
    const key=points=>{const tokens=points.map(p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`);let min=0;for(let i=1;i<tokens.length;i++)if(tokens[i]<tokens[min])min=i;return tokens.slice(min).concat(tokens.slice(0,min)).join(';');};
    return loops.map(loop=>({...loop,id:key(loop.points),planeId:geometry.planeId,thickness:0,area:loop.area-loop.holes.reduce((sum,h)=>sum+area(h),0)}));
  }
  const hit=(face,p)=>contains(face.points,p)&&!face.holes.some(hole=>contains(hole,p));
  return{detect,contains,hit,area};
})();

// Analytic sketch boundaries. Display polylines are derived separately from these curves.
const PlanCurves=(()=>{
  const tau=2*Math.PI,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),cross=(a,b)=>a.x*b.y-a.y*b.x;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),wrap=a=>(a%tau+tau)%tau;
  function trim(p){const scale=Math.max(1,...p.map(Math.abs));while(p.length>1&&Math.abs(p.at(-1))<scale*1e-13)p.pop();return p;}
  const add=(a,b)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0)));
  const mul=(a,b)=>{const p=Array(a.length+b.length-1).fill(0);a.forEach((v,i)=>b.forEach((w,j)=>p[i+j]+=v*w));return trim(p);};
  const value=(p,t)=>p.reduceRight((v,c)=>v*t+c,0),derivative=p=>p.slice(1).map((v,i)=>v*(i+1));
  function roots(poly,lo=0,hi=1){
    const p=trim([...poly]),scale=Math.max(...p.map(Math.abs));if(!scale||p.length<2)return [];
    if(p.length===2){const t=-p[0]/p[1];return t>=lo-1e-10&&t<=hi+1e-10?[Math.max(lo,Math.min(hi,t))]:[];}
    const knots=[lo,...roots(derivative(p),lo,hi),hi].sort((a,b)=>a-b),result=[],put=t=>{if(!result.some(v=>Math.abs(v-t)<1e-9))result.push(t);};
    for(const t of knots)if(Math.abs(value(p,t))<=scale*1e-11)put(t);
    for(let i=1;i<knots.length;i++){let a=knots[i-1],b=knots[i],va=value(p,a),vb=value(p,b);if(va*vb>=0)continue;
      for(let j=0;j<60;j++){const m=(a+b)/2,v=value(p,m);if(va*v<=0){b=m;vb=v;}else{a=m;va=v;}}put((a+b)/2);
    }
    return result.sort((a,b)=>a-b);
  }
  function coefficients(c){return c.kind==='line'?{x:[c.a.x,c.b.x-c.a.x],y:[c.a.y,c.b.y-c.a.y]}:{x:[c.a.x,2*(c.via.x-c.a.x),c.a.x-2*c.via.x+c.b.x],y:[c.a.y,2*(c.via.y-c.a.y),c.a.y-2*c.via.y+c.b.y]};}
  function point(c,t){if(c.kind==='arc'){const a=c.start+c.sweep*t;return{x:c.center.x+c.radius*Math.cos(a),y:c.center.y+c.radius*Math.sin(a)};}const p=coefficients(c);return{x:value(p.x,t),y:value(p.y,t)};}
  function tangent(c,t){if(c.kind==='arc'){const a=c.start+c.sweep*t;return{x:-c.radius*c.sweep*Math.sin(a),y:c.radius*c.sweep*Math.cos(a)};}const p=coefficients(c);return{x:value(derivative(p.x),t),y:value(derivative(p.y),t)};}
  function parameters(c,p,eps){
    if(c.kind==='arc'){
      if(Math.abs(distance(p,c.center)-c.radius)>eps*4)return [];
      const angle=wrap(Math.sign(c.sweep)*(Math.atan2(p.y-c.center.y,p.x-c.center.x)-c.start)),span=Math.abs(c.sweep),result=[];
      for(const a of [angle,angle-tau,angle+tau]){const t=a/span;if(t>=-1e-9&&t<=1+1e-9&&!result.some(v=>Math.abs(v-t)<1e-9))result.push(Math.max(0,Math.min(1,t)));}return result;
    }
    const xy=coefficients(c),axis=Math.max(...xy.x.slice(1).map(Math.abs))>=Math.max(...xy.y.slice(1).map(Math.abs))?'x':'y',poly=[...xy[axis]];poly[0]-=p[axis];
    return roots(poly).filter(t=>distance(point(c,t),p)<=eps*4);
  }
  function primitives(g){
    const result=[],objects=[...(g.lines||[]).map((o,i)=>({o,id:o.id||`line:${i}`})),...(g.shapes||[]).map((o,i)=>({o,id:o.id||`shape:${i}`}))];
    for(const {o,id}of objects){if(o.construction||!PlanLayers.visible(g,o))continue;
      if(!o.type)result.push({id,kind:'line',a:{...o.a},b:{...o.b}});
      else if(o.type==='rectangle'){const pts=[o.a,{x:o.b.x,y:o.a.y},o.b,{x:o.a.x,y:o.b.y}];for(let i=0;i<4;i++)result.push({id:`${id}:${i}`,kind:'line',a:{...pts[i]},b:{...pts[(i+1)%4]}});}
      else if(o.type==='bezier'){
        const ab=sub(o.b,o.a),av=sub(o.via,o.a),straight=Math.abs(cross(ab,av))<1e-12*Math.max(1,distance(o.a,o.b)**2);
        if(straight&&av.x*ab.x+av.y*ab.y>=0&&av.x*ab.x+av.y*ab.y<=ab.x*ab.x+ab.y*ab.y)result.push({id,kind:'line',a:{...o.a},b:{...o.b}});
        else result.push({id,kind:'bezier',a:{...o.a},via:{...o.via},b:{...o.b}});
      }else if(o.type==='arc'||o.type==='circle'){
        const arc=o.type==='circle'?{cx:o.center.x,cy:o.center.y,radius:o.radius,startAngle:0,endAngle:0,anticlockwise:false}:PlanTrimming.arc(o.a,o.via,o.b);if(!arc||arc.radius<=0)continue;
        const sign=arc.anticlockwise?-1:1,sweep=o.type==='circle'?tau:wrap(sign*(arc.endAngle-arc.startAngle));
        result.push({id,kind:'arc',center:{x:arc.cx,y:arc.cy},radius:arc.radius,start:arc.startAngle,sweep:sign*sweep});
      }
    }return result.sort((a,b)=>a.id.localeCompare(b.id));
  }
  function intersections(a,b,eps){
    const result=[],put=p=>{if(!result.some(q=>distance(p,q)<eps*4)&&parameters(a,p,eps).length&&parameters(b,p,eps).length)result.push(p);};
    for(const c of [a,b])for(const t of [0,1])put(point(c,t));
    if(a.kind==='line'&&b.kind==='line'){
      const r=sub(a.b,a.a),s=sub(b.b,b.a),den=cross(r,s);if(Math.abs(den)>eps*Math.max(distance(a.a,a.b),distance(b.a,b.b))){const t=cross(sub(b.a,a.a),s)/den;put(point(a,t));}return result;
    }
    if(a.kind==='arc'&&b.kind==='arc'){
      const d=distance(a.center,b.center);if(d<=eps)return result;
      if(d>a.radius+b.radius+eps||d<Math.abs(a.radius-b.radius)-eps)return result;
      const u=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d),h2=a.radius*a.radius-u*u;if(h2<-eps*Math.max(1,a.radius))return result;
      const h=Math.sqrt(Math.max(0,h2)),dx=(b.center.x-a.center.x)/d,dy=(b.center.y-a.center.y)/d;
      for(const sign of [-1,1])put({x:a.center.x+u*dx-sign*h*dy,y:a.center.y+u*dy+sign*h*dx});return result;
    }
    if(a.kind==='line'||b.kind==='line'){
      const line=a.kind==='line'?a:b,c=line===a?b:a,r=sub(line.b,line.a);
      if(c.kind==='arc'){
        const q=sub(line.a,c.center);for(const t of roots([q.x*q.x+q.y*q.y-c.radius*c.radius,2*(q.x*r.x+q.y*r.y),r.x*r.x+r.y*r.y]))put(point(line,t));
      }else{const xy=coefficients(c),poly=add(xy.x.map(v=>v*r.y),xy.y.map(v=>-v*r.x));poly[0]-=line.a.x*r.y-line.a.y*r.x;for(const t of roots(poly))put(point(c,t));}return result;
    }
    if(a.kind==='arc'||b.kind==='arc'){
      const arc=a.kind==='arc'?a:b,c=arc===a?b:a,xy=coefficients(c),x=[...xy.x],y=[...xy.y];x[0]-=arc.center.x;y[0]-=arc.center.y;const poly=add(mul(x,x),mul(y,y));poly[0]-=arc.radius*arc.radius;for(const t of roots(poly))put(point(c,t));return result;
    }
    // Eliminate the second quadratic parameter with a Sylvester resultant.
    const aa=coefficients(a),bb=coefficients(b),minus=(p,q)=>add(p,q.map(v=>-v)),z=[0],bx=[bb.x[2]||0],by=[bb.y[2]||0],dx=[bb.x[1]||0],dy=[bb.y[1]||0],cx=minus([bb.x[0]],aa.x),cy=minus([bb.y[0]],aa.y),matrix=[[bx,dx,cx,z],[z,bx,dx,cx],[by,dy,cy,z],[z,by,dy,cy]];
    let polynomial=[0];function determinant(cols,used){if(cols.length===4){let inversions=0,term=[1];for(let i=0;i<4;i++){term=mul(term,matrix[i][cols[i]]);for(let j=i+1;j<4;j++)if(cols[i]>cols[j])inversions++;}polynomial=add(polynomial,term.map(v=>inversions%2?-v:v));return;}for(let c=0;c<4;c++)if(!used.has(c))determinant([...cols,c],new Set([...used,c]));}determinant([],new Set());
    for(const t of roots(polynomial))put(point(a,t));return result;
  }
  function integral(edge){
    const c=edge.curve,a=edge.t0,b=edge.t1;
    if(c.kind==='arc'){const p=point(c,a),q=point(c,b);return(c.center.x*(q.y-p.y)-c.center.y*(q.x-p.x)+c.radius*c.radius*c.sweep*(b-a))/2;}
    const xy=coefficients(c),poly=add(mul(xy.x,derivative(xy.y)),mul(xy.y,derivative(xy.x)).map(v=>-v));return poly.reduce((sum,v,i)=>sum+v*(b**(i+1)-a**(i+1))/(i+1),0)/2;
  }
  function yRoots(c,y){
    if(c.kind!=='arc'){const p=[...coefficients(c).y];p[0]-=y;return roots(p);}
    const v=(y-c.center.y)/c.radius;if(v<-1-1e-12||v>1+1e-12)return [];const angle=Math.asin(Math.max(-1,Math.min(1,v))),result=[];
    for(const a of [angle,Math.PI-angle])for(const t of parameters(c,{x:c.center.x+c.radius*Math.cos(a),y},Math.max(1,c.radius)*1e-8))if(!result.some(v=>Math.abs(v-t)<1e-9))result.push(t);return result;
  }
  function winding(loop,p){
    let n=0;for(const e of loop){const direction=Math.sign(e.t1-e.t0),lo=Math.min(e.t0,e.t1),hi=Math.max(e.t0,e.t1);
      for(const t of yRoots(e.curve,p.y)){if(t<lo-1e-9||t>hi+1e-9)continue;const q=point(e.curve,t),dy=tangent(e.curve,t).y*direction;if(q.x<=p.x||Math.abs(dy)<1e-10)continue;
        const start=Math.abs(t-e.t0)<1e-9,end=Math.abs(t-e.t1)<1e-9;if(start&&dy<0||end&&dy>0)continue;n+=Math.sign(dy);
      }
    }return n;
  }
  function polyline(edge,tolerance=.02){
    const c=edge.curve,a=edge.t0,b=edge.t1,result=[point(c,a)];tolerance=Math.max(1e-9,tolerance);
    if(c.kind==='line')return [...result,point(c,b)];
    if(c.kind==='arc'){const angle=Math.min(Math.PI/8,2*Math.acos(Math.max(-1,1-tolerance/c.radius))),steps=Math.max(1,Math.ceil(Math.abs(c.sweep*(b-a))/Math.max(1e-7,angle)));for(let i=1;i<=steps;i++)result.push(point(c,a+(b-a)*i/steps));return result;}
    function split(a,b,depth){const p=point(c,a),q=point(c,b),m=(a+b)/2,r=point(c,m),d=sub(q,p),len=d.x*d.x+d.y*d.y,t=len?Math.max(0,Math.min(1,((r.x-p.x)*d.x+(r.y-p.y)*d.y)/len)):0,error=distance(r,{x:p.x+t*d.x,y:p.y+t*d.y});if(error<=tolerance||depth>=24){result.push(q);return;}split(a,m,depth+1);split(m,b,depth+1);}split(a,b,0);return result;
  }
  function bounds(c){
    const points=[point(c,0),point(c,1)];if(c.kind==='arc'){for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const p={x:c.center.x+c.radius*Math.cos(angle),y:c.center.y+c.radius*Math.sin(angle)};if(parameters(c,p,Math.max(1,c.radius)*1e-9).length)points.push(p);}}
    else if(c.kind==='bezier')for(const axis of ['x','y']){const den=c.a[axis]-2*c.via[axis]+c.b[axis],t=den?(c.a[axis]-c.via[axis])/den:-1;if(t>0&&t<1)points.push(point(c,t));}
    return{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  }
  return{point,tangent,parameters,primitives,intersections,integral,winding,polyline,distance,cross,sub,bounds};
})();
const PlanFaces=(()=>{
  const meshCache=new WeakMap(),migrationCache=new WeakMap(),area=PlanFacesLegacy.area,contains=PlanFacesLegacy.contains;
  function detect(geometry,sourceCurves=null){
    const curves=sourceCurves||PlanCurves.primitives(geometry),samples=curves.flatMap(c=>[PlanCurves.point(c,0),PlanCurves.point(c,.5),PlanCurves.point(c,1)]),extent=samples.length?Math.max(1,...samples.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)])):1,eps=extent*1e-9,cuts=curves.map(()=>[0,1]);
    const boxes=curves.map(PlanCurves.bounds),order=curves.map((_,i)=>i).sort((a,b)=>boxes[a].minX-boxes[b].minX);let active=[];
    for(const current of order){const box=boxes[current];active=active.filter(i=>boxes[i].maxX>=box.minX-eps);for(const other of active){const b=boxes[other];if(b.maxY<box.minY-eps||b.minY>box.maxY+eps)continue;const i=Math.min(current,other),j=Math.max(current,other);for(const p of PlanCurves.intersections(curves[i],curves[j],eps)){cuts[i].push(...PlanCurves.parameters(curves[i],p,eps));cuts[j].push(...PlanCurves.parameters(curves[j],p,eps));}}active.push(current);}
    // The solver accepts point-on residuals up to 1e-5 * 10 sketch units.
    // Join only explicitly constrained endpoints; unrelated gaps retain the
    // much tighter intersection tolerance. Original sketch coordinates stay intact.
    const joins=[],objects=new Map([...(geometry.lines||[]),...(geometry.shapes||[])].map(o=>[o.id,o])),indices=new Map(curves.map((c,i)=>[c.id,i]));
    if(!sourceCurves)for(const relation of geometry.relations||[]){
      if(relation.type!=='pointOn')continue;
      const source=objects.get(relation.objects?.[0]),index=indices.get(relation.objects?.[1]),target=curves[index],key=relation.keyA||'a',p=source?.[key];
      if(!p||!['a','b'].includes(key)||!indices.has(source.id)||target?.kind!=='line')continue;
      const dx=target.b.x-target.a.x,dy=target.b.y-target.a.y,length2=dx*dx+dy*dy;if(!length2)continue;
      const t=((p.x-target.a.x)*dx+(p.y-target.a.y)*dy)/length2;
      // A constraint on an extension does not connect to the finite segment.
      if(t<0||t>1)continue;
      const q=PlanCurves.point(target,t);if(PlanCurves.distance(p,q)>1e-4)continue;
      cuts[index].push(t);joins.push({from:p,to:q});
    }
    const nodes=[],buckets=new Map(),unique=new Map();
    function node(p){for(const join of joins)if(PlanCurves.distance(p,join.from)<eps*4){p=join.to;break;}const x=Math.round(p.x/eps),y=Math.round(p.y/eps);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const n=buckets.get(`${x+dx},${y+dy}`);if(n&&PlanCurves.distance(n.p,p)<eps*4)return n;}const n={id:nodes.length,p,links:[]};nodes.push(n);buckets.set(`${x},${y}`,n);return n;}
    for(const [index,c]of curves.entries()){
      const ts=cuts[index].sort((a,b)=>a-b).filter((v,i,array)=>!i||v-array[i-1]>1e-9);
      for(let i=1;i<ts.length;i++){
        const t0=ts[i-1],t1=ts[i],a=node(PlanCurves.point(c,t0)),b=node(PlanCurves.point(c,t1)),mid=PlanCurves.point(c,(t0+t1)/2);
        if(a===b&&PlanCurves.distance(mid,a.p)<eps)continue;
        const key=[a.id,b.id].sort((a,b)=>a-b).join(':')+`/${Math.round(mid.x/eps)},${Math.round(mid.y/eps)}`;
        if(unique.has(key))continue;unique.set(key,true);
        const id=`${encodeURIComponent(c.id)}#${i-1}`,ab={from:a,to:b,curve:c,t0,t1,edgeId:id},ba={from:b,to:a,curve:c,t0:t1,t1:t0,edgeId:id};ab.twin=ba;ba.twin=ab;a.links.push(ab);b.links.push(ba);
      }
    }
    const queue=nodes.filter(n=>n.links.length<2);for(let i=0;i<queue.length;i++){const n=queue[i];for(const e of [...n.links]){e.to.links=e.to.links.filter(other=>other!==e.twin);if(e.to.links.length===1)queue.push(e.to);}n.links=[];}
    // The near-start tangent separates branches at circular and B?zier tangencies.
    function angle(e){const dt=(e.t1-e.t0)*1e-5,p=PlanCurves.point(e.curve,e.t0+dt),d=PlanCurves.sub(p,e.from.p);return Math.atan2(d.y,d.x);}
    for(const n of nodes)n.links.sort((a,b)=>angle(a)-angle(b));
    const loops=[];
    for(const n of nodes)for(const start of n.links){if(start.used)continue;let e=start;const edges=[];do{if(e.used)break;e.used=true;edges.push({edgeId:e.edgeId,curve:e.curve,t0:e.t0,t1:e.t1});const links=e.to.links,at=links.indexOf(e.twin);e=links[(at+links.length-1)%links.length];}while(e!==start);
      const signed=edges.reduce((sum,e)=>sum+PlanCurves.integral(e),0);if(e===start&&signed>eps*eps*10)loops.push({edges,area:signed,inner:[],bounds:edges.map(e=>PlanCurves.bounds(e.curve)).reduce((a,b)=>({minX:Math.min(a.minX,b.minX),maxX:Math.max(a.maxX,b.maxX),minY:Math.min(a.minY,b.minY),maxY:Math.max(a.maxY,b.maxY)}))});
    }
    for(const loop of loops){const e=loop.edges[0],t=(e.t0+e.t1)/2,p=PlanCurves.point(e.curve,t),d=PlanCurves.tangent(e.curve,t),sign=Math.sign(e.t1-e.t0),len=Math.hypot(d.x,d.y),inside={x:p.x-sign*d.y/(len||1)*eps*16,y:p.y+sign*d.x/(len||1)*eps*16};
      const parent=loops.filter(other=>other!==loop&&other.area>loop.area+eps*eps&&inside.x>=other.bounds.minX-eps&&inside.x<=other.bounds.maxX+eps&&inside.y>=other.bounds.minY-eps&&inside.y<=other.bounds.maxY+eps&&PlanCurves.winding(other.edges,inside)!==0).sort((a,b)=>a.area-b.area)[0];if(parent)parent.inner.push(loop);
    }
    const key=edges=>{const tokens=edges.map(e=>`${e.edgeId}${e.t1>e.t0?'+':'-'}`),rotations=[];for(const list of [tokens,[...tokens].reverse().map(t=>t.slice(0,-1)+(t.at(-1)==='+'?'-':'+'))])for(let i=0;i<list.length;i++)rotations.push(list.slice(i).concat(list.slice(0,i)).join('|'));return rotations.sort()[0];};
    return loops.map(loop=>({id:`face:${geometry.planeId||'xy'}:${key(loop.edges)}`,planeId:geometry.planeId,thickness:0,outer:loop.edges,inner:loop.inner.map(h=>h.edges),holes:loop.inner.map(h=>h.edges),area:loop.area-loop.inner.reduce((sum,h)=>sum+h.area,0)}));
  }
  function mesh(face,tolerance=.02){
    let cache=meshCache.get(face);if(!cache){cache=new Map();meshCache.set(face,cache);}if(cache.has(tolerance))return cache.get(tolerance);
    const sample=loop=>{const points=loop.flatMap(e=>PlanCurves.polyline(e,tolerance).slice(0,-1));return points;},result={points:sample(face.outer),holes:face.inner.map(sample)};cache.set(tolerance,result);return result;
  }
  const hit=(face,p)=>face.outer?PlanCurves.winding(face.outer,p)!==0&&!face.inner.some(loop=>PlanCurves.winding(loop,p)!==0):PlanFacesLegacy.hit(face,p);
  function migrate(g){
    if(!g.extrusions?.some(group=>group.faceIds.some(id=>!id.startsWith('face:'))))return false;
    const revision=JSON.stringify([g.planeId,g.lines,g.shapes,g.extrusions]);if(migrationCache.get(g)===revision)return false;
    const faces=detect(g),old=PlanFacesLegacy.detect(g),mapping=new Map();
    for(const before of old){const a=before.points[0],b=before.points[1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),p={x:(a.x+b.x)/2-dy/len*1e-5,y:(a.y+b.y)/2+dx/len*1e-5},next=faces.find(face=>hit(face,p));if(next)mapping.set(before.id,next.id);}
    let changed=false;for(const group of g.extrusions)group.faceIds=group.faceIds.map(id=>{if(mapping.has(id)){changed=true;return mapping.get(id);}return id;});migrationCache.set(g,JSON.stringify([g.planeId,g.lines,g.shapes,g.extrusions]));return changed;
  }
  return{detect,mesh,hit,area,contains,migrate,legacy:PlanFacesLegacy.detect};
})();

const PlanExtrusions=(()=>{
  function reconcile(geometry,before=null){
    if(!geometry.extrusions?.length)return false;
    const original=JSON.stringify(geometry.extrusions),faces=PlanFaces.detect(geometry),current=new Map(faces.map(f=>[f.id,f])),owners=new Map(),oldFaces=before?PlanFaces.detect(before):[];
    for(const group of geometry.extrusions)for(const id of group.faceIds)if(current.has(id))owners.set(id,group.id);
    const tokens=id=>new Set((id.startsWith('face:')?id.split(':').slice(2).join(':').split('|'):[]).map(token=>{const match=token.match(/^(.*)#\d+([+-])$/);return match?decodeURIComponent(match[1])+match[2]:token;}));
    const signature=face=>new Set(face.outer.map(e=>e.curve.id+(e.t1>e.t0?'+':'-')));
    function shared(oldId,face,region){const old=region?signature(region):tokens(oldId),next=signature(face);let count=0;for(const token of next){if(old.has(token.slice(0,-1)+(token.endsWith('+')?'-':'+')))return false;if(old.has(token))count++;}return count>=Math.max(1,Math.ceil(old.size/2));}
    let sourceCurves=null;const recovered=new Map();
    function recoverRegion(id){
      if(recovered.has(id))return recovered.get(id);
      sourceCurves??=PlanCurves.primitives(geometry);const sources=new Set([...tokens(id)].map(token=>token.slice(0,-1))),curves=sourceCurves.filter(curve=>sources.has(curve.id));
      // Rebuild the old closed outline without newly intersecting objects.
      // Its actual winding is reliable; canonical face-id winding is not.
      const regions=curves.length?PlanFaces.detect(geometry,curves):[],region=regions.length===1?regions[0]:null;
      recovered.set(id,region);return region;
    }
    function probes(face){
      const eps=Math.max(1e-8,Math.sqrt(Math.abs(face.area))*1e-6),points=[];
      for(const e of face.outer)for(const fraction of [.25,.5,.75]){const t=e.t0+(e.t1-e.t0)*fraction,p=PlanCurves.point(e.curve,t),d=PlanCurves.tangent(e.curve,t),length=Math.hypot(d.x,d.y)||1,sign=Math.sign(e.t1-e.t0),inside={x:p.x-sign*d.y/length*eps,y:p.y+sign*d.x/length*eps};if(PlanFaces.hit(face,inside))points.push(inside);}
      return points;
    }
    const claims=new Map(),pending=[];
    for(const group of geometry.extrusions){
      const regions=new Map([...(group.regions||[]),...oldFaces].map(f=>[f.id,f]));
      for(const id of group.faceIds)if(!current.has(id)){
        const old=regions.get(id)||recoverRegion(id),candidates=faces.filter(face=>{
          if(owners.has(face.id)||face.planeId!==(old?.planeId||geometry.planeId))return false;
          const sources=new Set(old?old.outer.map(e=>e.curve.id):[...tokens(id)].map(token=>token.slice(0,-1)));
          if(!face.outer.some(e=>sources.has(e.curve.id)))return false;
          const points=old?probes(face):[];
          // Geometric descendants survive splits; source curves also identify
          // edited or moved boundaries and recover older projects without regions.
          return Boolean(old&&points.length&&points.every(p=>PlanFaces.hit(old,p)))||shared(id,face,old);
        });
        pending.push({group,id,old,candidates});for(const face of candidates){if(!claims.has(face.id))claims.set(face.id,new Set());claims.get(face.id).add(group.id);}
      }
    }
    for(const {group,id,candidates}of pending){const replacements=candidates.filter(face=>claims.get(face.id).size===1);if(replacements.length)group.faceIds=group.faceIds.filter(value=>value!==id).concat(replacements.map(face=>face.id));}
    for(const group of geometry.extrusions){
      group.faceIds=[...new Set(group.faceIds)];
      const previous=new Map([...(group.regions||[]),...oldFaces].map(face=>[face.id,face]));
      group.regions=group.faceIds.map(id=>current.get(id)||previous.get(id)).filter(Boolean).map(face=>structuredClone(face));
    }
    return JSON.stringify(geometry.extrusions)!==original;
  }
  function preview(before,faceIds,height,id){
    if(!Number.isFinite(height))throw Error('Invalid extrusion height');
    const selected=new Set(faceIds),groups=structuredClone(before||[]).map(group=>({...group,faceIds:group.faceIds.filter(faceId=>!selected.has(faceId))})).filter(group=>group.faceIds.length);
    if(selected.size)groups.push({id,faceIds:[...selected],height});return groups;
  }
  function boundary(faces){
    if(faces.every(face=>face.outer)){
      const edges=new Map();for(const face of faces)for(const [index,loop]of [face.outer,...face.inner].entries())for(const source of loop){
        const edge=index?{...source,t0:source.t1,t1:source.t0}:source;
        if(edges.has(edge.edgeId))edges.delete(edge.edgeId);else edges.set(edge.edgeId,{...edge,a:PlanCurves.point(edge.curve,edge.t0),b:PlanCurves.point(edge.curve,edge.t1),faceId:face.id});
      }return [...edges.values()];
    }
    const edges=new Map(),key=p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`;
    for(const face of faces)for(const [index,source]of [face.points,...face.holes].entries()){
      const ring=(PlanFaces.area(source)>0)===(index===0)?source:[...source].reverse();
      for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],k=[key(a),key(b)].sort().join('|');if(edges.has(k))edges.delete(k);else edges.set(k,{a,b,faceId:face.id});}
    }
    return [...edges.values()];
  }
  function surfaces(faces,height){
    const planeId=faces[0]?.planeId,base={kind:'plane',planeId,height:0,faces:faces.map(face=>face.id)};if(!height)return [base];
    return [base,{...base,height},...boundary(faces).map(edge=>({kind:edge.curve?.kind==='arc'?'cylinder':edge.curve?.kind==='bezier'?'extrudedCurve':'plane',planeId,height,edge}))];
  }
  function displayBoundary(faces,tolerance=.02){
    return boundary(faces).flatMap(edge=>{
      if(!edge.curve)return [{...edge,start:true,end:true}];
      const points=PlanCurves.polyline(edge,tolerance),closed=edge.curve.kind==='arc'&&Math.abs(edge.curve.sweep*(edge.t1-edge.t0))>=2*Math.PI-1e-9;
      return points.slice(1).map((b,i)=>({a:points[i],b,faceId:edge.faceId,start:!closed&&i===0,end:!closed&&i===points.length-2}));
    });
  }
  return{preview,boundary,surfaces,displayBoundary,reconcile};
})();

const Plan3DStats={frames:0,sceneBuilds:0,uploads:0,drawCalls:0,triangles:0,vertices:0,cpuSamples:[],pickCandidates:0,culled:0,instances:0,profiling:false,gpuSamples:[],gpuSupported:false};
const PlanSketchTools=(()=>{
  const tau=Math.PI*2,wrap=a=>(a%tau+tau)%tau;
  function circle(method,points,value=null){
    const [a,b,c]=points;if(!a)return null;
    if(method==='three'){if(!c)return null;const data=PlanTrimming.arc(a,b,c);return data?{type:'circle',center:{x:data.cx,y:data.cy},radius:data.radius}:null;}
    if(method==='two'){if(!b)return null;return{type:'circle',center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},radius:Math.hypot(b.x-a.x,b.y-a.y)/2};}
    const length=value??(b?Math.hypot(b.x-a.x,b.y-a.y):0),radius=method==='diameter'?length/2:length;
    return radius>1e-9?{type:'circle',center:{...a},radius}:null;
  }
  function centerArc(center,a,point,angle=null){
    const radius=Math.hypot(a.x-center.x,a.y-center.y);if(radius<1e-9)return null;
    const start=Math.atan2(a.y-center.y,a.x-center.x),end=point?Math.atan2(point.y-center.y,point.x-center.x):start,delta=angle??(wrap(end-start+Math.PI)-Math.PI);
    if(Math.abs(delta)<1e-8||Math.abs(delta)>=tau-1e-8)return null;
    const at=t=>({x:center.x+radius*Math.cos(start+delta*t),y:center.y+radius*Math.sin(start+delta*t)});
    return{type:'arc',a:{...a},via:at(.5),b:at(1)};
  }
  function tangentArc(a,b,tangent){
    if(!a||!b||!tangent)return null;const length=Math.hypot(tangent.x,tangent.y);if(length<1e-9)return null;
    const nx=-tangent.y/length,ny=tangent.x/length,dx=b.x-a.x,dy=b.y-a.y,den=2*(dx*nx+dy*ny);if(Math.abs(den)<1e-9)return null;
    const r=(dx*dx+dy*dy)/den,center={x:a.x+nx*r,y:a.y+ny*r},start=Math.atan2(a.y-center.y,a.x-center.x),end=Math.atan2(b.y-center.y,b.x-center.x),delta=r>0?wrap(end-start):-wrap(start-end);
    return{type:'arc',a:{...a},b:{...b},via:{x:center.x+Math.abs(r)*Math.cos(start+delta/2),y:center.y+Math.abs(r)*Math.sin(start+delta/2)}};
  }
  function radiusArc(a,b,r){
    if(!a||!b||!(r>0))return null;const dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);if(chord<1e-9||chord>2*r+1e-8)return null;
    const offset=Math.sqrt(Math.max(0,r*r-chord*chord/4)),center={x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset};
    return centerArc(center,a,b,wrap(Math.atan2(b.y-center.y,b.x-center.x)-Math.atan2(a.y-center.y,a.x-center.x)));
  }
  function tangentCircle(lines,clicks,radius=null){
    const equations=lines.map(line=>{const dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,length=Math.hypot(dx,dy);return length>1e-9?{x:-dy/length,y:dx/length,c:(dy*line.a.x-dx*line.a.y)/length}:null;});if(equations.some(e=>!e))return null;
    const candidates=[];
    for(let mask=0;mask<(1<<lines.length);mask++){
      const rows=equations.map((e,i)=>radius==null?[e.x,e.y,mask&(1<<i)?-1:1,-e.c]:[e.x,e.y,-e.c+(mask&(1<<i)?1:-1)*radius]),n=radius==null?3:2;
      let valid=rows.length===n;for(let i=0;valid&&i<n;i++){let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;if(Math.abs(rows[pivot][i])<1e-10){valid=false;break;}[rows[i],rows[pivot]]=[rows[pivot],rows[i]];const d=rows[i][i];rows[i]=rows[i].map(v=>v/d);for(let j=0;j<n;j++)if(j!==i){const factor=rows[j][i];rows[j]=rows[j].map((v,k)=>v-factor*rows[i][k]);}}
      let center=valid?{x:rows[0][n],y:rows[1][n]}:null;
      if(!valid&&radius!=null&&equations.length===2){const [a,b]=equations,guess={x:(clicks[0].x+clicks[1].x)/2,y:(clicks[0].y+clicks[1].y)/2},target=-a.c+(mask&1?1:-1)*radius,offset=target-a.x*guess.x-a.y*guess.y,p={x:guess.x+a.x*offset,y:guess.y+a.y*offset};if(Math.abs(b.x*p.x+b.y*p.y+b.c-(mask&2?1:-1)*radius)<1e-7)center=p;}
      if(!center)continue;const r=radius??rows[2][n];if(!(r>1e-9))continue;
      const score=equations.reduce((sum,e,i)=>{const distance=e.x*center.x+e.y*center.y+e.c;return sum+Math.hypot(center.x-e.x*distance-clicks[i].x,center.y-e.y*distance-clicks[i].y);},0);candidates.push({type:'circle',center,radius:r,score});
    }
    candidates.sort((a,b)=>a.score-b.score);const result=candidates[0];if(!result)return null;delete result.score;return result;
  }
  return{circle,centerArc,tangentArc,radiusArc,tangentCircle};
})();
const PlanLighting=(()=>{
  const source=[-.45,-.6,.8],length=Math.hypot(...source),direction=source.map(v=>v/length),size=2048;
  // Broad studio fill preserves shape on faces outside the key light hemisphere.
  const fillSource=[-.8,.35,.48],fillLength=Math.hypot(...fillSource),fillDirection=fillSource.map(v=>v/fillLength);
  const ambient=normal=>.32+.36*(.5+.5*normal.reduce((sum,v,i)=>sum+v*fillDirection[i],0));
  function matrix(bounds){
    const z=direction,uLength=Math.hypot(z[0],z[1]),u=[-z[1]/uLength,z[0]/uLength,0],v=[-z[2]*u[1],z[2]*u[0],z[0]*u[1]-z[1]*u[0]],axes=[u,v,z.map(n=>-n)],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let corner=0;corner<8;corner++){const p=[0,1,2].map(i=>bounds[corner&(1<<i)?'max':'min'][i]);for(let i=0;i<3;i++){const value=axes[i].reduce((sum,n,j)=>sum+n*p[j],0);lo[i]=Math.min(lo[i],value);hi[i]=Math.max(hi[i],value);}}
    const padding=Math.max(1e-3,...hi.map((n,i)=>(n-lo[i])*.02)),scale=hi.map((n,i)=>2/(n-lo[i]+2*padding)),offset=hi.map((n,i)=>-(n+lo[i])*scale[i]/2);
    return new Float32Array([axes[0][0]*scale[0],axes[1][0]*scale[1],axes[2][0]*scale[2],0,axes[0][1]*scale[0],axes[1][1]*scale[1],axes[2][1]*scale[2],0,axes[0][2]*scale[0],axes[1][2]*scale[1],axes[2][2]*scale[2],0,...offset,1]);
  }
  return{direction,size,matrix,ambient};
})();
const PlanMesh=(()=>{
  // Horizontal slabs triangulate outer contours and holes with the same even/odd rule.
  function triangulate(rings){
    const edges=[],ys=[];for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];ys.push(a.y);if(Math.abs(a.y-b.y)>1e-12)edges.push({a,b});}
    ys.sort((a,b)=>a-b);const levels=ys.filter((y,i)=>!i||Math.abs(y-ys[i-1])>1e-9),triangles=[],xAt=(e,y)=>e.a.x+(y-e.a.y)*(e.b.x-e.a.x)/(e.b.y-e.a.y);
    for(let i=1;i<levels.length;i++){const y0=levels[i-1],y1=levels[i],mid=(y0+y1)/2,active=edges.filter(e=>(e.a.y>mid)!==(e.b.y>mid)).sort((a,b)=>xAt(a,mid)-xAt(b,mid));
      for(let j=0;j+1<active.length;j+=2){const a={x:xAt(active[j],y0),y:y0},b={x:xAt(active[j+1],y0),y:y0},c={x:xAt(active[j+1],y1),y:y1},d={x:xAt(active[j],y1),y:y1};
        for(const t of [[a,b,c],[a,c,d]])if(Math.abs((t[1].x-t[0].x)*(t[2].y-t[0].y)-(t[2].x-t[0].x)*(t[1].y-t[0].y))>1e-12)triangles.push(t);
      }
    }return triangles;
  }
  function build(scene){
    const direction=PlanLighting.direction;
    const data=[],irradiance=[],ambient=[],vertexMap=new Map(),opaque=[],transparent=[],sourceLines=[],edgeLines=[],triangleRecords=[],faceIds=scene.faces.map(f=>f.id),faceIndex=new Map(faceIds.map((id,i)=>[id,i]));
    const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    function vertex(p,color,alpha,face,role,light=0,fill=0){const values=[p.x,p.y,p.height||0,...color,alpha,face,role],key=values.join(',')+','+light+','+fill;if(vertexMap.has(key))return vertexMap.get(key);const id=data.length/9;data.push(...values);irradiance.push(light);ambient.push(fill);vertexMap.set(key,id);return id;}
    function lines(edges,color,role,target){for(const [a,b]of edges)target.push(vertex(a,color,1,-1,role),vertex(b,color,1,-1,role));}
    for(const model of scene.models){const color=rgb(model.color),role=model.alpha<1?0:model.side?1.1:1,target=model.alpha<1?transparent:opaque;
      for(const pick of model.picks){
        const height=pick.rings[0][0]?.height||0,face=faceIndex.get(pick.faceId)??-1,rings=pick.rings;
        if(model.side){const ring=rings[0];for(const t of [[ring[0],ring[1],ring[2]],[ring[0],ring[2],ring[3]]])emit(t,face);}
        else for(const t of triangulate(rings))emit(t.map(p=>({...p,height})),face);
        function emit(t,face){
          let normal=model.normal?[model.normal.x,model.normal.y,model.normal.z]:cross(sub(xyz(t[1]),xyz(t[0])),sub(xyz(t[2]),xyz(t[0]))),length=Math.hypot(...normal);normal=normal.map(v=>v/(length||1));
          if(!model.side&&!model.normal&&normal[2]<0)normal=normal.map(v=>-v);
          const diffuse=Math.max(0,dot(normal,direction));
          const ids=t.map(p=>vertex(p,color,model.alpha,face,role,diffuse,PlanLighting.ambient(normal)));target.push(...ids);triangleRecords.push({pickable:model.pickable!==false,a:t[0],b:t[1],c:t[2],face,role,center:[0,1,2].map(i=>(xyz(t[0])[i]+xyz(t[1])[i]+xyz(t[2])[i])/3),min:[0,1,2].map(i=>Math.min(xyz(t[0])[i],xyz(t[1])[i],xyz(t[2])[i])),max:[0,1,2].map(i=>Math.max(xyz(t[0])[i],xyz(t[1])[i],xyz(t[2])[i]))});}
      }
      lines(model.edges||[],[.24,.24,.24],4,edgeLines);
    }
    for(const path of scene.paths)lines(path.points.slice(1).map((p,i)=>[path.points[i],p]),[.7,.7,.7],path.item.value.construction?3:2,sourceLines);
    const indices=[],ranges=[];for(const [name,array]of [['source',sourceLines],['opaque',opaque],['transparent',transparent],['edges',edgeLines]]){
      const size=name==='source'||name==='edges'?2:3,batches=new Map();for(let i=0;i<array.length;i+=size){const face=data[array[i]*9+7],key=face<0?Math.floor(i/size/1024):Math.floor(face/128);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(...array.slice(i,i+size));}
      for(const batch of batches.values()){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of batch)for(let j=0;j<3;j++){min[j]=Math.min(min[j],data[id*9+j]);max[j]=Math.max(max[j],data[id*9+j]);}ranges.push({name,start:indices.length,count:batch.length,bounds:{min,max}});for(const id of batch)indices.push(id);}
    }
    let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<data.length;i+=9)for(let a=0;a<3;a++){min[a]=Math.min(min[a],data[i+a]);max[a]=Math.max(max[a],data[i+a]);}if(!data.length)min=max=[0,0,0];
    const mesh={vertices:new Float32Array(data),irradiance:new Float32Array(irradiance),ambient:new Float32Array(ambient),indices:new Uint32Array(indices),ranges,faceIds,faceIndex,triangles:triangleRecords,bounds:{min,max}};mesh.tree=tree(triangleRecords.map((_,i)=>i),triangleRecords);mesh.lighting={enabled:Boolean(scene.lighting),method:'shadow-map'};return mesh;
  }
  const xyz=p=>[p.x,p.y,p.height||0];
  function tree(ids,triangles){
    if(!ids.length)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of ids)for(let i=0;i<3;i++){min[i]=Math.min(min[i],triangles[id].min[i]);max[i]=Math.max(max[i],triangles[id].max[i]);}
    if(ids.length<=12)return{min,max,ids};const axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];ids.sort((a,b)=>{return triangles[a].center[axis]-triangles[b].center[axis];});const mid=ids.length>>1;return{min,max,left:tree(ids.slice(0,mid),triangles),right:tree(ids.slice(mid),triangles)};
  }
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function raycast(mesh,origin,direction,surfaceMode,detailed=false){
    let best=Infinity,face=null,candidates=0,triangle=null;
    function visit(node){if(!node)return;let lo=0,hi=best;for(let a=0;a<3;a++){if(Math.abs(direction[a])<1e-12){if(origin[a]<node.min[a]-1e-7||origin[a]>node.max[a]+1e-7)return;}else{let t0=(node.min[a]-origin[a])/direction[a],t1=(node.max[a]-origin[a])/direction[a];if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(hi<lo)return;}}
      if(node.ids)for(const id of node.ids){const t=mesh.triangles[id];if(t.pickable===false||t.role===0&&!surfaceMode)continue;candidates++;const a=xyz(t.a),e1=sub(xyz(t.b),a),e2=sub(xyz(t.c),a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-12)continue;const q=sub(origin,a),u=dot(q,h)/det;if(u< -1e-7||u>1+1e-7)continue;const r=cross(q,e1),v=dot(direction,r)/det;if(v< -1e-7||u+v>1+1e-7)continue;const distance=dot(e2,r)/det;if(distance>=-1e-7&&distance<best){best=distance;face=mesh.faceIds[t.face];triangle=t;}}
      else{visit(node.left);visit(node.right);}
    }visit(mesh.tree);Plan3DStats.pickCandidates=candidates;return detailed?(face?{faceId:face,triangle,point:{x:origin[0]+best*direction[0],y:origin[1]+best*direction[1],height:origin[2]+best*direction[2]}}:null):face;
  }
  return{triangulate,build,raycast};
})();
const PlanGpu=(()=>{
  function create(canvas,onRestore,onLost=()=>{}){
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!gl)return null;let timer=null,queries=[];
    let program,vao,vbo,ibo,lightBuffer,selection,uniforms,mesh=null,selectionKey=null,lost=false,imageProgram,imageVao,imageBuffer,imageMatrix,imageSampler,imageScene=null,imageCache=new Map(),lineProgram,lineVao,lineBuffer,lineUniforms,shadowProgram,shadowTexture,shadowFramebuffer,shadowMatrix,shadowMatrixUniform,shadowBuilds=0;
    function shader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
    function init(){
      timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');Plan3DStats.gpuSupported=Boolean(timer);
      program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,`#version 300 es
      layout(location=0)in vec3 position;layout(location=1)in vec4 color;layout(location=2)in vec2 meta;layout(location=3)in vec2 irradiance;uniform mat4 matrix;uniform mat4 lightMatrix;out vec4 vColor;flat out int vFace;flat out float vRole;out float vLight;out float vFill;out vec3 vShadow;void main(){gl_Position=matrix*vec4(position,1.);vColor=color;vFace=int(meta.x);vRole=meta.y;vLight=irradiance.x;vFill=irradiance.y;vShadow=(lightMatrix*vec4(position,1.)).xyz*.5+.5;}`),fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;precision highp int;in vec4 vColor;flat in int vFace;flat in float vRole;in float vLight;in float vFill;in vec3 vShadow;uniform sampler2D selection;uniform sampler2D shadowMap;uniform bool lighting;uniform bool surfaces;uniform bool dark;out vec4 result;
      float visibility(){
        if(any(lessThan(vShadow,vec3(0.)))||any(greaterThan(vShadow,vec3(1.))))return 1.;
        vec3 dx=dFdx(vShadow),dy=dFdy(vShadow);float det=dx.x*dy.y-dx.y*dy.x;
        vec2 slope=abs(det)>1.e-12?vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/det:vec2(0.);
        vec2 size=vec2(textureSize(shadowMap,0)),cell=floor(vShadow.xy*size);float light=0.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 uv=(cell+vec2(x,y)+.5)/size;float depth=vShadow.z+dot(slope,uv-vShadow.xy)-.00003;light+=depth<=texture(shadowMap,uv).r?1.:0.;}
        return light/9.;
      }
      void main(){if(vRole<.5&&!surfaces)discard;if(vRole>2.5&&vRole<3.5&&mod(gl_FragCoord.x+gl_FragCoord.y,12.)>7.)discard;bool selected=vFace>=0&&texelFetch(selection,ivec2(vFace%1024,vFace/1024),0).r>.5;vec4 c=vColor;if(lighting&&vRole>=1.&&vRole<2.)c.rgb*=vFill+.40*vLight*(vLight>.001?visibility():0.);if(selected)c=vec4(vRole>1.05?vec3(.263,.51,.659):vec3(.384,.725,.922),vRole<.5?.8:1.);if(vRole>=2.&&vRole<3.5)c=vec4(dark?vec3(.7):vec3(.3),1.);result=c;}`);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);
      vao=gl.createVertexArray();vbo=gl.createBuffer();ibo=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);for(const [i,size,offset]of [[0,3,0],[1,4,12],[2,2,28]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,36,offset);}lightBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,lightBuffer);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,2,gl.FLOAT,false,8,0);selection=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,selection);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);uniforms=Object.fromEntries(['matrix','lightMatrix','lighting','shadowMap','selection','surfaces','dark'].map(name=>[name,gl.getUniformLocation(program,name)]));mesh=null;selectionKey=null;
      lineProgram=gl.createProgram();const lv=shader(gl.VERTEX_SHADER,`#version 300 es
      layout(location=0)in vec3 a;layout(location=1)in vec3 b;layout(location=2)in vec4 color;layout(location=3)in float role;uniform mat4 matrix;out vec4 vColor;flat out int vFace;flat out float vRole;out float vLight;out float vFill;out vec3 vShadow;void main(){gl_Position=matrix*vec4(gl_VertexID==0?a:b,1.);vColor=color;vFace=-1;vRole=role;vLight=0.;vFill=0.;vShadow=vec3(0.);}`);gl.attachShader(lineProgram,lv);gl.attachShader(lineProgram,fs);gl.linkProgram(lineProgram);if(!gl.getProgramParameter(lineProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(lineProgram));gl.deleteShader(lv);gl.deleteShader(fs);lineVao=gl.createVertexArray();lineBuffer=gl.createBuffer();gl.bindVertexArray(lineVao);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribDivisor(i,1);}lineUniforms=Object.fromEntries(['matrix','dark','selection','surfaces','shadowMap'].map(name=>[name,gl.getUniformLocation(lineProgram,name)]));
      shadowProgram=gl.createProgram();const sv=shader(gl.VERTEX_SHADER,`#version 300 es
      layout(location=0)in vec3 position;uniform mat4 matrix;void main(){gl_Position=matrix*vec4(position,1.);}`),sf=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;void main(){}`);gl.attachShader(shadowProgram,sv);gl.attachShader(shadowProgram,sf);gl.linkProgram(shadowProgram);if(!gl.getProgramParameter(shadowProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(shadowProgram));gl.deleteShader(sv);gl.deleteShader(sf);shadowMatrixUniform=gl.getUniformLocation(shadowProgram,'matrix');
      shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,PlanLighting.size,PlanLighting.size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowTexture,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete shadow framebuffer');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      imageProgram=gl.createProgram();const iv=shader(gl.VERTEX_SHADER,`#version 300 es
      layout(location=0)in vec3 position;layout(location=1)in vec2 uv;uniform mat4 matrix;out vec2 texcoord;void main(){gl_Position=matrix*vec4(position,1.);texcoord=uv;}`),iff=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;in vec2 texcoord;uniform sampler2D image;out vec4 result;void main(){result=texture(image,texcoord);if(result.a<.01)discard;}`);gl.attachShader(imageProgram,iv);gl.attachShader(imageProgram,iff);gl.linkProgram(imageProgram);if(!gl.getProgramParameter(imageProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(imageProgram));gl.deleteShader(iv);gl.deleteShader(iff);
      imageVao=gl.createVertexArray();imageBuffer=gl.createBuffer();gl.bindVertexArray(imageVao);gl.bindBuffer(gl.ARRAY_BUFFER,imageBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);imageMatrix=gl.getUniformLocation(imageProgram,'matrix');imageSampler=gl.getUniformLocation(imageProgram,'image');imageScene=null;imageCache=new Map();
    }
    init();canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;queries=[];onLost();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;init();onRestore();});
    function visible(bounds,m){
      if(!bounds)return true;let flags=63;for(let i=0;i<8;i++){const x=bounds[i&1?'max':'min'][0],y=bounds[i&2?'max':'min'][1],z=bounds[i&4?'max':'min'][2],a=m[0]*x+m[4]*y+m[8]*z+m[12],b=m[1]*x+m[5]*y+m[9]*z+m[13],c=m[2]*x+m[6]*y+m[10]*z+m[14],w=m[3]*x+m[7]*y+m[11]*z+m[15];flags&=(a< -w?1:0)|(a>w?2:0)|(b< -w?4:0)|(b>w?8:0)|(c< -w?16:0)|(c>w?32:0);if(!flags)return true;}return !flags;
    }
    function draw(next,matrix,selected,surfaceMode,dark,images=[]){
      if(lost)return;
      let query=null;if(timer&&Plan3DStats.profiling){const ready=queries[0];if(ready&&gl.getQueryParameter(ready,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(timer.GPU_DISJOINT_EXT)){Plan3DStats.gpuSamples.push(gl.getQueryParameter(ready,gl.QUERY_RESULT)/1e6);if(Plan3DStats.gpuSamples.length>120)Plan3DStats.gpuSamples.shift();}gl.deleteQuery(ready);queries.shift();}if(queries.length<4&&Plan3DStats.frames%15===0){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}}
      gl.bindVertexArray(vao);gl.useProgram(program);if(mesh!==next){mesh=next;gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,lightBuffer);const lightData=new Float32Array(mesh.irradiance.length*2);for(let i=0;i<mesh.irradiance.length;i++){lightData[i*2]=mesh.irradiance[i];lightData[i*2+1]=mesh.ambient[i];}gl.bufferData(gl.ARRAY_BUFFER,lightData,gl.STATIC_DRAW);selectionKey=null;const instances=[];for(const range of mesh.ranges)if(range.name==='source'||range.name==='edges'){range.instanceStart=instances.length/11;for(let i=range.start;i<range.start+range.count;i+=2){const a=mesh.indices[i]*9,b=mesh.indices[i+1]*9;instances.push(...mesh.vertices.slice(a,a+3),...mesh.vertices.slice(b,b+3),...mesh.vertices.slice(a+3,a+7),mesh.vertices[a+8]);}}gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(instances),gl.STATIC_DRAW);Plan3DStats.instances=instances.length/11;Plan3DStats.uploads++;
        shadowMatrix=PlanLighting.matrix(mesh.bounds);
        if(mesh.lighting.enabled){
          gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFramebuffer);gl.viewport(0,0,PlanLighting.size,PlanLighting.size);gl.clearDepth(1);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.POLYGON_OFFSET_FILL);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);gl.uniformMatrix4fv(shadowMatrixUniform,false,shadowMatrix);
          for(const range of mesh.ranges)if(range.name==='opaque')gl.drawElements(gl.TRIANGLES,range.count,gl.UNSIGNED_INT,range.start*4);
          gl.bindFramebuffer(gl.FRAMEBUFFER,null);shadowBuilds++;
        }
        gl.useProgram(program);
      }
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,selection);const key=[...selected].join('|');if(selectionKey!==key){const rows=Math.max(1,Math.ceil(mesh.faceIds.length/1024)),data=new Uint8Array(1024*rows);for(const id of selected){const i=mesh.faceIndex.get(id);if(i!==undefined)data[i]=255;}gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1024,rows,0,gl.RED,gl.UNSIGNED_BYTE,data);selectionKey=key;}
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(...(dark?[.141,.141,.141,1]:[.98,.98,.98,1]));gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      if(!images.length&&imageScene!==images){for(const record of imageCache.values())gl.deleteTexture(record.texture);imageCache.clear();imageScene=images;}
      if(images.length){
        gl.useProgram(imageProgram);gl.bindVertexArray(imageVao);gl.bindBuffer(gl.ARRAY_BUFFER,imageBuffer);gl.uniformMatrix4fv(imageMatrix,false,matrix);gl.uniform1i(imageSampler,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true);
        if(imageScene!==images){const vertices=[];for(const image of images)for(const i of [0,1,2,0,2,3])vertices.push(image.corners[i].x,image.corners[i].y,image.corners[i].height||0,i===1||i===2?1:0,i>=2?1:0);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);imageScene=images;
          const ids=new Set(images.map(image=>image.id));for(const [id,record]of imageCache)if(!ids.has(id)){gl.deleteTexture(record.texture);imageCache.delete(id);}
        }
        for(const [i,image]of images.entries()){const photo=image.photo;if(!photo?.complete||!photo.naturalWidth)continue;let record=imageCache.get(image.id);if(!record||record.src!==photo.src){if(record)gl.deleteTexture(record.texture);record={texture:gl.createTexture(),src:photo.src};imageCache.set(image.id,record);gl.bindTexture(gl.TEXTURE_2D,record.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,photo);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);}else gl.bindTexture(gl.TEXTURE_2D,record.texture);gl.drawArrays(gl.TRIANGLES,i*6,6);}
        gl.depthMask(true);gl.disable(gl.BLEND);
      }
      gl.useProgram(program);gl.bindVertexArray(vao);gl.bindTexture(gl.TEXTURE_2D,selection);gl.uniformMatrix4fv(uniforms.matrix,false,matrix);gl.uniformMatrix4fv(uniforms.lightMatrix,false,shadowMatrix);gl.uniform1i(uniforms.lighting,mesh.lighting.enabled);gl.uniform1i(uniforms.shadowMap,1);gl.uniform1i(uniforms.selection,0);gl.uniform1i(uniforms.surfaces,surfaceMode);gl.uniform1i(uniforms.dark,dark);let calls=0;
      Plan3DStats.culled=0;for(const range of mesh.ranges){if(!range.count||range.name==='transparent'&&!surfaceMode)continue;if(!visible(range.bounds,matrix)){Plan3DStats.culled++;continue;}
        const lines=range.name==='source'||range.name==='edges';gl.depthMask(range.name!=='source'&&range.name!=='transparent');if(range.name==='transparent'){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);
        if(!lines){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);}else gl.disable(gl.POLYGON_OFFSET_FILL);if(lines){gl.useProgram(lineProgram);gl.bindVertexArray(lineVao);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);for(const [i,size,offset]of [[0,3,0],[1,3,12],[2,4,24],[3,1,40]])gl.vertexAttribPointer(i,size,gl.FLOAT,false,44,range.instanceStart*44+offset);gl.uniformMatrix4fv(lineUniforms.matrix,false,matrix);gl.uniform1i(lineUniforms.dark,dark);gl.uniform1i(lineUniforms.surfaces,surfaceMode);gl.uniform1i(lineUniforms.selection,0);gl.uniform1i(lineUniforms.shadowMap,1);gl.drawArraysInstanced(gl.LINES,0,2,range.count/2);}else{gl.useProgram(program);gl.bindVertexArray(vao);gl.drawElements(gl.TRIANGLES,range.count,gl.UNSIGNED_INT,range.start*4);}calls++;
      }gl.depthMask(true);gl.disable(gl.BLEND);if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}Plan3DStats.drawCalls=calls;Plan3DStats.triangles=mesh.triangles.length;Plan3DStats.vertices=mesh.vertices.length/9;Plan3DStats.lighting={...mesh.lighting,shadowBuilds};
    }
    return{draw,get lost(){return lost;}};
  }
  return{create};
})();

const PlanOrbit=(()=>{
  function rotate(point,yaw,pitch,roll=0){const x=point.x*Math.cos(yaw)-point.y*Math.sin(yaw),y=point.x*Math.sin(yaw)+point.y*Math.cos(yaw),z=point.z||0,v=y*Math.cos(pitch)-z*Math.sin(pitch);return{x:x*Math.cos(roll)-v*Math.sin(roll),y:x*Math.sin(roll)+v*Math.cos(roll),z:y*Math.sin(pitch)+z*Math.cos(pitch)};}
  function plane(name){return name==='default'?{yaw:-Math.PI/4,pitch:Math.acos(1/Math.sqrt(3))}:name==='xy'?{yaw:0,pitch:0}:name==='xz'?{yaw:0,pitch:Math.PI/2}:name==='yz'?{yaw:Math.PI/2,pitch:Math.PI/2}:null;}
  function drag(camera,dx,dy){const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));return{yaw:wrap(camera.yaw+dx*.01),pitch:wrap(camera.pitch+dy*.01),roll:camera.roll||0};}
  function turn(camera,axis,angle){
    const c=Math.cos(angle),s=Math.sin(angle),q=axis==='x'?[[1,0,0],[0,c,-s],[0,s,c]]:axis==='y'?[[c,0,s],[0,1,0],[-s,0,c]]:[[c,-s,0],[s,c,0],[0,0,1]],basis=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(p=>rotate(p,camera.yaw,camera.pitch,camera.roll)),r=['x','y','z'].map(key=>basis.map(p=>p[key])),m=r.map(row=>[0,1,2].map(j=>row.reduce((sum,v,k)=>sum+v*q[k][j],0))),pitch=Math.acos(Math.max(-1,Math.min(1,m[2][2])));
    if(Math.abs(Math.sin(pitch))<1e-8)return{yaw:Math.atan2((m[2][2]>0?1:-1)*m[1][0],m[0][0]),pitch,roll:0};
    return{yaw:Math.atan2(m[2][0],m[2][1]),pitch,roll:Math.atan2(m[0][2],-m[1][2])};
  }
  function rotationArc(axis){
    // A positive quadrant, extended by 22.5 degrees at each end. The Y basis
    // reverses Z to preserve the same right-handed rotation as turn().
    const start=axis==='y'?-5*Math.PI/8:-Math.PI/8;
    return Array.from({length:49},(_,i)=>{const angle=start+i*Math.PI/64,a=1.55*Math.cos(angle),b=1.55*Math.sin(angle);return axis==='x'?{x:0,y:a,z:b}:axis==='y'?{x:a,y:0,z:-b}:{x:a,y:b,z:0};});
  }
  function rotationArrow(axis,direction){const arc=rotationArc(axis);return direction>0?arc.slice(-9):arc.slice(0,9).reverse();}
  function rotationHead(axis,direction){
    const tip=rotationArrow(axis,direction).at(-1),r=Math.hypot(tip.x,tip.y,tip.z),radial={x:tip.x/r,y:tip.y/r,z:tip.z/r},velocity=axis==='x'?{x:0,y:-tip.z,z:tip.y}:axis==='y'?{x:tip.z,y:0,z:-tip.x}:{x:-tip.y,y:tip.x,z:0};
    // Construct both corners before projection, so the entire head stays in
    // the rotation plane and foreshortens together with its arc.
    return[tip,...[-1,1].map(side=>Object.fromEntries(['x','y','z'].map(key=>[key,tip[key]-.43*direction*velocity[key]/r+side*.24*radial[key]])))];
  }
  return{rotate,plane,drag,turn,rotationArrow,rotationArc,rotationHead};
})();
const PlanExhibition=(()=>{
  const dot=(a,b)=>a.x*b.x+a.y*b.y+(a.height||0)*(b.height||0);
  function surfaces(g,faces){
    const result=[],cm=g.metersPerUnit*100,key=p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`;
    function cap(face,id,height,normal){
      const xs=face.points.map(p=>p.x),ys=face.points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),originX=normal>0?minX:maxX;
      result.push({id,name:'Powierzchnia',origin:{x:originX,y:maxY,height},u:{x:normal,y:0,height:0},v:{x:0,y:-1,height:0},normal:{x:0,y:0,height:normal},widthCm:(maxX-minX)*cm,heightCm:(maxY-minY)*cm,cm,rings:[face.points,...face.holes].map(r=>r.map(p=>({x:(p.x-originX)*normal*cm,y:(maxY-p.y)*cm})))});
    }
    for(const group of g.extrusions||[]){
      const members=faces.filter(f=>group.faceIds.includes(f.id)),h=group.height/g.metersPerUnit;if(!members.length||Math.abs(h)<1e-8)continue;
      for(const edge of PlanExtrusions.boundary(members)){
        if(edge.curve&&edge.curve.kind!=='line')continue;
        const length=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y);if(length<1e-8)continue;
        const u={x:(edge.a.x-edge.b.x)/length,y:(edge.a.y-edge.b.y)/length,height:0},v={x:0,y:0,height:1};
        result.push({id:`${group.id}:side:${edge.edgeId||[key(edge.a),key(edge.b)].sort().join('|')}`,name:'Ściana',origin:{...edge.b,height:Math.min(0,h)},u,v,normal:{x:-u.y,y:u.x,height:0},widthCm:length*cm,heightCm:Math.abs(h)*cm,cm,rings:[[{x:0,y:0},{x:length*cm,y:0},{x:length*cm,y:Math.abs(h)*cm},{x:0,y:Math.abs(h)*cm}]]});
      }
      for(const face of members){cap(face,`${group.id}:${face.id}:top`,h,Math.sign(h));cap(face,`${group.id}:${face.id}:base`,0,-Math.sign(h));}
    }
    for(const face of faces)if(!(g.extrusions||[]).some(group=>Math.abs(group.height)>1e-9&&group.faceIds.includes(face.id)))cap(face,`flat:${face.id}`,0,1);
    return result;
  }
  function world(surface,x,y,depth=0){return{x:surface.origin.x+(surface.u.x*x+surface.v.x*y+surface.normal.x*depth)/surface.cm,y:surface.origin.y+(surface.u.y*x+surface.v.y*y+surface.normal.y*depth)/surface.cm,height:surface.origin.height+((surface.u.height||0)*x+(surface.v.height||0)*y+(surface.normal.height||0)*depth)/surface.cm};}
  function local(surface,p){const q={x:p.x-surface.origin.x,y:p.y-surface.origin.y,height:(p.height||0)-surface.origin.height};return{x:dot(q,surface.u)*surface.cm,y:dot(q,surface.v)*surface.cm,distance:dot(q,surface.normal)*surface.cm};}
  function combine(parts,id){
    if(!parts.length)return null;const first=parts[0];
    if(parts.some(part=>dot(first.normal,part.normal)<1-1e-7||Math.abs(local(first,part.origin).distance)>.01))return null;
    if(parts.length===1)return{...first,id:id||first.id,sourceIds:[first.id]};
    const rings=parts.flatMap(part=>part.rings.map(ring=>ring.map(p=>local(first,world(part,p.x,p.y))))),lines=[];
    for(const [r,ring]of rings.entries())for(let i=0;i<ring.length;i++)lines.push({id:`union:${r}:${i}`,a:{x:ring[i].x,y:ring[i].y},b:{x:ring[(i+1)%ring.length].x,y:ring[(i+1)%ring.length].y}});
    const occupied=p=>parts.some(part=>{const q=local(part,world(first,p.x,p.y));return contains(part,q);});
    const facesFor=edges=>PlanFaces.detect({planeId:'xy',lines:edges,shapes:[]}).map(face=>({...face,...PlanFaces.mesh(face,.001)})).filter(face=>{const triangle=PlanMesh.triangulate([face.points,...face.holes])[0];return triangle&&occupied({x:triangle.reduce((s,p)=>s+p.x,0)/3,y:triangle.reduce((s,p)=>s+p.y,0)/3});});
    const pieces=facesFor(lines);if(!pieces.length)return null;
    const boundary=PlanExtrusions.boundary(pieces).map((edge,i)=>({id:`boundary:${i}`,a:edge.a,b:edge.b})),union=facesFor(boundary);if(union.length!==1)return null;
    const outline=union[0],minX=Math.min(...outline.points.map(p=>p.x)),minY=Math.min(...outline.points.map(p=>p.y)),maxX=Math.max(...outline.points.map(p=>p.x)),maxY=Math.max(...outline.points.map(p=>p.y));
    return{...first,id:id||`wall:${parts.map(p=>p.id).sort().join('|')}`,sourceIds:parts.map(p=>p.id),origin:world(first,minX,minY),widthCm:maxX-minX,heightCm:maxY-minY,rings:[outline.points,...outline.holes].map(ring=>ring.map(p=>({x:p.x-minX,y:p.y-minY})))};
  }
  function designated(layout){return Boolean(layout&&(layout.designated||layout.items?.length||layout.name?.trim()||layout.lines?.length||layout.guides?.length||layout.dimensions?.length));}
  function walls(candidates,exhibition){return Object.entries(exhibition?.surfaces||{}).filter(([,layout])=>designated(layout)).map(([id,layout])=>{
    const ids=layout.sourceIds||[id],parts=ids.map(id=>candidates.find(part=>part.id===id));return parts.every(Boolean)?combine(parts,id):null;
  }).filter(Boolean);}
  function contains(surface,p){
    const boundary=ring=>ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<1e-6;});
    return(PlanFaces.contains(surface.rings[0],p)||boundary(surface.rings[0]))&&!surface.rings.slice(1).some(ring=>PlanFaces.contains(ring,p)&&!boundary(ring));
  }
  function fits(surface,item){
    if(![item.x,item.y,item.widthCm,item.heightCm].every(Number.isFinite)||item.widthCm<=0||item.heightCm<=0)return false;
    const corners=[{x:item.x,y:item.y},{x:item.x+item.widthCm,y:item.y},{x:item.x+item.widthCm,y:item.y+item.heightCm},{x:item.x,y:item.y+item.heightCm}];
    if(!corners.every(p=>p.x>=-1e-6&&p.y>=-1e-6&&p.x<=surface.widthCm+1e-6&&p.y<=surface.heightCm+1e-6&&contains(surface,p)))return false;
    for(const ring of surface.rings){
      if(ring.some(p=>p.x>item.x+1e-7&&p.x<item.x+item.widthCm-1e-7&&p.y>item.y+1e-7&&p.y<item.y+item.heightCm-1e-7))return false;
      for(let i=0;i<ring.length;i++)for(let j=0;j<4;j++){
        const a=ring[i],b=ring[(i+1)%ring.length],c=corners[j],d=corners[(j+1)%4],cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
        if(cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9)return false;
      }
    }return true;
  }
  function snap(surface,item,items,guides,tolerance){
    const targets={x:[0,surface.widthCm/2,surface.widthCm],y:[0,surface.heightCm/2,surface.heightCm]};
    for(const other of items)if(other.id!==item.id){targets.x.push(other.x,other.x+other.widthCm/2,other.x+other.widthCm);targets.y.push(other.y,other.y+other.heightCm/2,other.y+other.heightCm);}
    for(const guide of guides)if(Math.abs(guide.a.x-guide.b.x)<1e-6)targets.x.push(guide.a.x);else if(Math.abs(guide.a.y-guide.b.y)<1e-6)targets.y.push(guide.a.y);
    const result={...item},marks=[];for(const axis of ['x','y']){let best=tolerance+1,delta=0,target;const length=axis==='x'?item.widthCm:item.heightCm;
      for(const offset of [0,length/2,length])for(const value of targets[axis]){const d=value-item[axis]-offset;if(Math.abs(d)<best){best=Math.abs(d);delta=d;target=value;}}
      if(best<=tolerance){result[axis]+=delta;marks.push({axis,value:target});}
    }
    return{item:result,marks};
  }
  function step(angle,direction){const unit=Math.PI/4,value=angle/unit;return(direction>0?Math.floor(value+1e-8)+1:Math.ceil(value-1e-8)-1)*unit;}
  function reference(surface,data,ref){
    if(ref.kind==='point')return{x:ref.x,y:ref.y};
    if(ref.kind==='wall')return{x:ref.edge==='right'?surface.widthCm:ref.edge==='left'?0:ref.at??surface.widthCm/2,y:ref.edge==='top'?surface.heightCm:ref.edge==='bottom'?0:ref.at??surface.heightCm/2};
    if(ref.kind==='item'){const item=data.items.find(item=>item.id===ref.id);if(!item)return null;return{x:item.x+(ref.edge==='right'?item.widthCm:ref.edge==='left'?0:item.widthCm/2),y:item.y+(ref.edge==='top'?item.heightCm:ref.edge==='bottom'?0:item.heightCm/2)};}
    if(ref.kind==='line'){const line=[...data.lines||[],...data.guides||[]].find(line=>line.id===ref.id);if(!line)return null;if(Number.isFinite(ref.at)){const x=Math.max(Math.min(line.a.x,line.b.x),Math.min(Math.max(line.a.x,line.b.x),ref.at));return{x,y:line.a.y+(line.b.y-line.a.y)*(x-line.a.x)/(line.b.x-line.a.x||1)};}return{...line[ref.edge==='b'?'b':'a']};}
    return null;
  }
  function measurement(surface,data,dimension){const a=reference(surface,data,dimension.a),b=reference(surface,data,dimension.b);return a&&b?{a,b,value:Math.abs(b[dimension.axis]-a[dimension.axis])}:null;}
  function attached(dimension){return[dimension.a,dimension.b].every(ref=>ref&&['wall','line','item'].includes(ref.kind));}
  function placed(exhibition,imageId){return Boolean(imageId)&&(Array.isArray(exhibition)?exhibition.some(plan=>placed(plan.exhibition,imageId)):Object.values(exhibition?.surfaces||{}).some(wall=>(wall.items||[]).some(item=>item.imageId===imageId)));}
  function wallDimensionChains(surface){
    const ring=surface.rings?.[0]||[],epsilon=Math.max(1,surface.widthCm,surface.heightCm)*1e-8;
    const corners=ring.filter((b,i)=>{const a=ring[(i+ring.length-1)%ring.length],c=ring[(i+1)%ring.length];return Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>epsilon*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y),Math.hypot(c.x-b.x,c.y-b.y));});
    const result={x:[],y:[]};
    for(const axis of ['x','y']){
      const size=axis==='x'?surface.widthCm:surface.heightCm,other=axis==='x'?'y':'x',positions=[0,size,...corners.map(p=>Math.max(0,Math.min(size,p[axis])))].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>epsilon);
      if(positions.length<=2)continue;
      const endpoint=value=>{const matches=corners.filter(p=>Math.abs(p[axis]-value)<=epsilon);return{[axis]:value,[other]:matches.length?(axis==='x'?Math.max(...matches.map(p=>p[other])):Math.min(...matches.map(p=>p[other]))):axis==='x'?surface.heightCm:0};};
      result[axis]=positions.slice(1).map((value,i)=>({a:endpoint(positions[i]),b:endpoint(value),value:value-positions[i]}));
    }
    return result;
  }
  function formatDimension(value,wall=false){return value.toLocaleString('pl-PL',{minimumFractionDigits:1,maximumFractionDigits:1})+(wall?' cm':'');}
  function setDistance(surface,data,dimension,value){
    if(!Number.isFinite(value)||value<0)return null;const before=measurement(surface,data,dimension);if(!before)return null;
    if(dimension.resize){
      const next=structuredClone(data),item=next.items.find(item=>item.id===dimension.b.id);if(item?.kind!=='placeholder'||!['widthCm','heightCm'].includes(dimension.resize)||value<=0)return null;
      item[dimension.resize]=value;return fits(surface,item)?next:null;
    }
    const next=structuredClone(data),axis=dimension.axis,sign=Math.sign(before.b[axis]-before.a[axis])||dimension.sign||1,movable=ref=>ref.kind==='item'||ref.kind==='line',ref=movable(dimension.b)?dimension.b:movable(dimension.a)?dimension.a:null;if(!ref)return null;
    const delta=(value-before.value)*sign*(ref===dimension.b?1:-1);
    if(ref.kind==='item'){const item=next.items.find(item=>item.id===ref.id);item[axis]+=delta;if(!fits(surface,item))return null;}
    else{
      const line=[...next.lines||[],...next.guides||[]].find(line=>line.id===ref.id);if(!line)return null;
      if(axis==='x'&&!ref.translate)line[ref.edge==='b'?'b':'a'].x+=delta;else{line.a[axis]+=delta;line.b[axis]+=delta;}
      if(Math.abs(line.b.x-line.a.x)<1e-6||![line.a,line.b].every(p=>contains(surface,p)))return null;
    }
    const actual=measurement(surface,next,dimension);return actual&&Math.abs(actual.value-value)<1e-5?next:null;
  }
  function ray(matrix,x,y,width,height){
    const rows=Array.from({length:4},(_,i)=>[...Array.from({length:4},(_,j)=>matrix[j*4+i]),...Array.from({length:4},(_,j)=>Number(i===j))]);
    for(let i=0;i<4;i++){let pivot=i;for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;if(Math.abs(rows[pivot][i])<1e-12)return null;[rows[i],rows[pivot]]=[rows[pivot],rows[i]];const d=rows[i][i];rows[i]=rows[i].map(v=>v/d);for(let j=0;j<4;j++)if(j!==i){const factor=rows[j][i];rows[j]=rows[j].map((v,k)=>v-factor*rows[i][k]);}}
    const unproject=z=>{const v=[2*x/width-1,1-2*y/height,z,1],p=rows.map(row=>v.reduce((sum,n,i)=>sum+row[i+4]*n,0));return p.slice(0,3).map(n=>n/p[3]);},origin=unproject(-1),far=unproject(1);return{origin,direction:far.map((v,i)=>v-origin[i])};
  }
  function dimensionRowSplit(items){
    if(items.length<2)return-Infinity;
    const centers=items.map(item=>item.y+item.heightCm/2),low=Math.min(...centers),high=Math.max(...centers);
    return high-low>Math.min(...items.map(item=>item.heightCm))/2?(low+high)/2:-Infinity;
  }
  function dimensionOffset(surface,dimension,scale,base,saved,items=[]){
    if(Number.isFinite(saved)){if(dimension.axis==='x'&&saved>=0&&saved<=surface.heightCm)return saved>=surface.heightCm/2?surface.heightCm+20/scale:-20/scale;return saved;}
    const offset=saved??dimension.offset??base;
    if(dimension.axis!=='x')return offset;
    const split=dimensionRowSplit(items);
    if([dimension.a,dimension.b].some(ref=>ref?.kind==='item'&&items.some(item=>item.id===ref.id&&item.y+item.heightCm/2<split)))return Math.min(offset,-20/scale);
    return Math.max(offset,surface.heightCm+20/scale);
  }
  const dimensionKey=dimension=>JSON.stringify([dimension.axis,[dimension.a,dimension.b].map(ref=>[ref.kind,ref.id,ref.edge,ref.kind==='point'?ref.x:undefined,ref.kind==='point'?ref.y:undefined]).sort()]);
  function orthogonalEndpoint(start,point){return Math.abs(point.x-start.x)>=Math.abs(point.y-start.y)?{x:point.x,y:start.y}:{x:start.x,y:point.y};}
  function artworkGapOffset(items,dimension,saved){
    if(dimension.axis!=='y'||dimension.a.kind!=='item'||dimension.b.kind!=='item'||dimension.a.id===dimension.b.id)return null;
    const a=items.find(item=>item.id===dimension.a.id),b=items.find(item=>item.id===dimension.b.id);if(!a||!b)return null;
    const left=Math.max(a.x,b.x),right=Math.min(a.x+a.widthCm,b.x+b.widthCm);if(right-left<=1e-6)return null;
    return Number.isFinite(saved)&&saved>=left&&saved<=right?saved:(left+right)/2;
  }
  function dimensionSegment(p,q,scale,confined=false){
    const length=Math.hypot(q.x-p.x,q.y-p.y),ux=(q.x-p.x)/(length||1),uy=(q.y-p.y)/(length||1),pad=confined?0:7/scale,tick=4/scale;
    const line={x1:p.x-ux*pad,y1:p.y-uy*pad,x2:q.x+ux*pad,y2:q.y+uy*pad};
    const ticks=[p,q].map(end=>({x1:end.x-tick,y1:end.y+tick,x2:end.x+tick,y2:end.y-tick}));
    if(confined){const axis=Math.abs(q.x-p.x)>=Math.abs(q.y-p.y)?'x':'y',other=axis==='x'?'y':'x',min=Math.min(p[axis],q[axis]),max=Math.max(p[axis],q[axis]);for(const tick of ticks){const slope=(tick[other+'2']-tick[other+'1'])/(tick[axis+'2']-tick[axis+'1']);for(const end of [1,2]){const value=tick[axis+end],clipped=Math.max(min,Math.min(max,value));tick[axis+end]=clipped;tick[other+end]+=(clipped-value)*slope;}}}
    return{line,ticks};
  }
  return{surfaces,world,local,combine,designated,walls,contains,fits,snap,step,ray,reference,measurement,setDistance,attached,placed,formatDimension,wallDimensionChains,dimensionOffset,orthogonalEndpoint,dimensionKey,dimensionSegment,artworkGapOffset,dimensionRowSplit};
})();

function createArchitecturalPlan(persistPlan,prepareImage,saveView,getLibrary=()=>[]) {
  const restoredExtrusions=new WeakSet();
  let geometryMigrated=false,modelRevision=0,sceneRevision=0;
  const undoStates=[],redoStates=[];let savedState=null,historyReady=false,renderedPlanId=null;
  function updateHistory(){for(const id of ['plan-undo','exhibition-undo'])document.getElementById(id).disabled=!undoStates.length;for(const id of ['plan-redo','exhibition-redo'])document.getElementById(id).disabled=!redoStates.length;}
  function save(data,geometryChanged=true,recordHistory=true){
    for(const plan of data.plans)if(plan.outline)PlanTopology.normalize(plan.outline);
    for(const plan of data.plans)if(plan.outline?.extrusions?.length&&(geometryChanged||plan.outline.extrusions.some(group=>!group.regions)))PlanExtrusions.reconcile(plan.outline,savedState?.plans.find(previous=>previous.id===plan.id)?.outline);
    const changed=!savedState||JSON.stringify(data)!==JSON.stringify(savedState);if(changed){sceneRevision++;if(geometryChanged)modelRevision++;}
    if(recordHistory&&historyReady&&savedState&&changed){undoStates.push(savedState);if(undoStates.length>50)undoStates.shift();redoStates.length=0;}
    savedState=structuredClone(data);updateHistory();persistPlan(data);
  }
  function travelHistory(redo=false){
    const source=redo?redoStates:undoStates,target=redo?undoStates:redoStates;if(!source.length)return;
    if(exhibitionSurface)resetExhibitionDrafts();
    if(pendingWallParts.size)clearWallSelection();
    extrusion=null;extrudeDrag=null;escapeToSelection();target.push(structuredClone(savedState));const state=source.pop();plans=structuredClone(state.plans);active=state.active;savedState=structuredClone(state);render();updateHistory();persistPlan(snapshot());notify(redo?'Ponowiono zmianę.':'Cofnięto zmianę.');
  }
  document.getElementById('plan-undo').addEventListener('click',()=>travelHistory());document.getElementById('plan-redo').addEventListener('click',()=>travelHistory(true));
  document.addEventListener('keydown',event=>{if(document.getElementById('plan-view').hidden||event.target.matches('input,textarea,select,[contenteditable="true"]'))return;if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();travelHistory(event.key.toLowerCase()==='y'||event.shiftKey);}},true);
  function notify(text){
    const container=document.getElementById('notifications'),notice=document.createElement('div');
    if([...container.children].some(item=>item.textContent===text))return;
    notice.className='notification';notice.textContent=text;
    while(container.children.length>=3)container.firstElementChild.remove();
    container.append(notice);setTimeout(()=>notice.remove(),4000);
  }
  const files=document.getElementById('plan-files'),importButton=document.getElementById('plan-import');
  const emptyButton=document.getElementById('plan-empty'),list=document.getElementById('plan-list');
  const image=document.getElementById('plan-image'),placeholder=document.getElementById('plan-placeholder');
  const status=document.getElementById('plan-import-status');
  const board=document.getElementById('plan-board'),surface=document.getElementById('plan-surface'),canvas=document.getElementById('plan-lines'),lineButton=document.getElementById('plan-line');
  const orbitCanvas=document.getElementById('plan-orbit'),orbitButton=document.getElementById('plan-orbit-toggle');
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','auxclick','contextmenu']){
    board.addEventListener(type,event=>{
      if(event.button!==2&&type!=='contextmenu')return;
      event.preventDefault();
      if(type!=='contextmenu')event.stopPropagation();
    },{capture:true});
  }
  const orbitGizmo=document.getElementById('orbit-gizmo');
  const initialOrbit=PlanOrbit.plane('default');
  let orbitView={scale:null,zoom:1,panX:0,panY:0,center:null},orbitFrame=null;
  let orbitMode=false,orbitDrag=null,orbitSpaceDown=false,orbitYaw=initialOrbit.yaw,orbitPitch=initialOrbit.pitch,orbitRoll=0;
  const facesButton=document.getElementById('plan-faces'),extrudeButton=document.getElementById('plan-extrude'),extrudeControls=document.getElementById('extrude-controls'),extrudeHeight=document.getElementById('extrude-height'),extrudeHandle=document.getElementById('extrude-handle');
  let surfaceMode=false,selectedFaces=new Set(),faceCacheGeometry=null,faceCacheRevision=-1,faceCache=[],extrusion=null,extrudeDrag=null,orbitPicks=[],normalScreen={x:0,y:-1};
  let exhibitionPicking=false,exhibitionSurface=null,pendingSurface=null,exhibitionSelected=null,exhibitionTool='select',exhibitionImage=null,exhibitionDrag=null,guideStart=null,exhibitionMarks=[],exhibitionHover=null,measurementStart=null,editingExhibitionDimension=null,catalogDrag=null;
  const exhibitionEditor=document.getElementById('exhibition-editor'),wallSvg=document.getElementById('exhibition-wall'),exhibitionConfirm=document.getElementById('exhibition-confirm'),exhibitionProperties=document.getElementById('exhibition-properties'),exhibitionPhotos=new Map();
  const svgElement=(name,attributes={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
  let pendingWallParts=new Set(), rememberedWall=null, editingWall=null, wallPartAction=null, hoveredWallPart=null;
  const wallHoverName=document.getElementById('wall-hover-name');
  function hideWallHoverName(){wallHoverName.hidden=true;}
  function showWallHoverName(id,event){
    const walls=exhibitionSurfaces(),index=walls.findIndex(wall=>wall.sourceIds.includes(id));
    if(index<0){hideWallHoverName();return;}
    wallHoverName.textContent=currentPlan().exhibition?.surfaces[walls[index].id]?.name||`Ściana ${index+1}`;
    wallHoverName.hidden=false;
    const box=wallHoverName.getBoundingClientRect();
    wallHoverName.style.left=`${Math.max(8,Math.min(event.clientX+14,innerWidth-box.width-8))}px`;
    wallHoverName.style.top=`${Math.max(8,Math.min(event.clientY+18,innerHeight-box.height-8))}px`;
  }
  function syncWorkspace(stage){
    hideWallHoverName();
    const view=document.getElementById('plan-view');view.dataset.workspace=stage;
    syncWallTabsVisibility();
    for(const [id,name] of [['view-mode-2d','sketch'],['plan-orbit-toggle','model'],['view-mode-walls','walls'],['view-mode-layout','layout']])document.getElementById(id).setAttribute('aria-pressed',String(stage===name));
  }
  function showWalls(){if(!currentPlan())return;if(exhibitionSurface)closeExhibition();setOrbitMode(true);endExtrusion();escapeToSelection();surfaceMode=false;selectedFaces.clear();exhibitionPicking=true;syncWorkspace('walls');renderOrbit();}
  document.getElementById('view-mode-walls').addEventListener('click',showWalls);
  document.getElementById('view-mode-layout').addEventListener('click',()=>{if(!currentPlan())return;const walls=exhibitionSurfaces(),wall=walls.find(w=>w.id===rememberedWall)||walls[0];if(wall)openExhibition(wall);else{showWalls();notify('Najpierw utwórz ścianę ekspozycji.');}});

  let wallGeometry=null,wallGeometryKey='',wallCandidates=[],resolvedWallCandidates=null,resolvedWallKey='',resolvedWalls=[];
  function exhibitionCandidates(){const geometry=outline(),key=`${modelRevision}:${JSON.stringify(geometry.extrusions||[])}`;if(geometry!==wallGeometry||key!==wallGeometryKey){wallGeometry=geometry;wallGeometryKey=key;wallCandidates=PlanExhibition.surfaces(geometry,displayFaces());}return wallCandidates;}
  function exhibitionSurfaces(){
    const candidates=exhibitionCandidates(),exhibition=currentPlan().exhibition,key=JSON.stringify(Object.entries(exhibition?.surfaces||{}).filter(([,data])=>PlanExhibition.designated(data)).map(([id,data])=>[id,data.sourceIds]));
    if(candidates!==resolvedWallCandidates||key!==resolvedWallKey){resolvedWallCandidates=candidates;resolvedWallKey=key;resolvedWalls=PlanExhibition.walls(candidates,exhibition);}return resolvedWalls;
  }
  function clearWallSelection(){hideWallHoverName();pendingWallParts.clear();pendingSurface=null;editingWall=null;wallPartAction=null;hoveredWallPart=null;for(const action of ['add','remove'])document.getElementById(`wall-part-${action}`).setAttribute('aria-pressed','false');document.getElementById('wall-part-tools').hidden=true;exhibitionConfirm.hidden=true;renderOrbit();}
  for(const action of ['add','remove'])document.getElementById(`wall-part-${action}`).addEventListener('click',()=>{wallPartAction=action;for(const value of ['add','remove'])document.getElementById(`wall-part-${value}`).setAttribute('aria-pressed',String(value===action));orbitCanvas.focus();});
  function wallPartAt(point){const hit=pickSurface(point,true);return hit&&exhibitionCandidates().find(part=>{const p=PlanExhibition.local(part,hit.point);return Math.abs(p.distance)<.01&&PlanExhibition.contains(part,p);});}

  const distanceEditor=document.getElementById('exhibition-dimension-editor'),distanceInput=document.getElementById('exhibition-distance');
  let wallChoicesKey='',placeholderStart=null,placeholderHover=null,wallDimensionDrag=null,selectedWallDimensionKey=null;
  const wallTabs=document.getElementById('wall-tabs'),wallTabsBar=document.getElementById('wall-tabs-bar'),wallPrevious=document.getElementById('wall-previous'),wallNext=document.getElementById('wall-next'),wallPicker=document.getElementById('wall-picker'),wallPickerToggle=document.getElementById('wall-picker-toggle');
  let wallTabRename=null;
  function renameWallTab(tab){
    if(wallTabRename)wallTabRename.finish(true);
    const id=tab.dataset.wallId,layout=currentPlan()?.exhibition?.surfaces[id];if(!layout)return;
    const original=tab.textContent,input=document.createElement('input');input.type='text';input.id='wall-tab-name';input.className='wall-tab-name';input.maxLength=80;input.value=original;input.setAttribute('aria-label','Nazwa układu');input.dataset.wallId=id;input.setAttribute('aria-selected',tab.getAttribute('aria-selected'));input.style.width=`${Math.max(110,tab.getBoundingClientRect().width)}px`;
    let finished=false;
    const finish=(commit,focus=false)=>{
      if(finished)return;finished=true;wallTabRename=null;if(!input.isConnected)return;
      const name=commit?input.value.trim():original;input.replaceWith(tab);
      if(commit&&name&&name!==original){layout.name=name;tab.textContent=name;tab.title=name;for(const choice of wallPicker.children)if(choice.dataset.wallId===id)choice.textContent=name;save(snapshot(),false);}
      if(focus)tab.focus();
    };
    wallTabRename={finish};input.addEventListener('blur',()=>finish(true));input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();finish(event.key==='Enter',true);}});tab.replaceWith(input);input.focus();input.select();
  }
  function syncWallTabsVisibility(){
    const stage=document.getElementById('plan-view').dataset.workspace;wallTabsBar.hidden=!wallTabs.children.length||!['walls','layout'].includes(stage);
    if(wallTabsBar.hidden&&wallPicker.matches(':popover-open'))wallPicker.hidePopover();
  }
  function syncWallLists(force=false){
    if(!currentPlan()){wallTabsBar.hidden=true;return;}const key=`${active}:${modelRevision}:${sceneRevision}`;
    if((force||key!==wallChoicesKey)&&!wallTabRename){
      wallChoicesKey=key;const choices=exhibitionSurfaces(),saved=currentPlan().exhibition?.surfaces||{};wallTabs.replaceChildren();wallPicker.replaceChildren();
      for(const [index,wall]of choices.entries()){const name=saved[wall.id]?.name||`Ściana ${index+1}`,tab=document.createElement('button');tab.type='button';tab.id=`wall-tab-${encodeURIComponent(wall.id)}`;tab.dataset.wallId=wall.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','exhibition-editor');tab.textContent=name;tab.title=name;tab.addEventListener('click',()=>{const current=exhibitionSurfaces().find(candidate=>candidate.id===wall.id);if(current&&exhibitionSurface?.id!==current.id)openExhibition(current);tab.scrollIntoView({block:'nearest',inline:'nearest'});});tab.addEventListener('dblclick',()=>renameWallTab(tab));tab.addEventListener('keydown',event=>{if(event.key==='F2'){event.preventDefault();renameWallTab(tab);}});wallTabs.append(tab);const choice=document.createElement('button');choice.type='button';choice.dataset.wallId=wall.id;choice.setAttribute('role','menuitemradio');choice.textContent=name;choice.addEventListener('click',()=>{wallPicker.hidePopover();tab.click();tab.focus();});wallPicker.append(choice);}
    }
    const tabs=[...wallTabs.children],remembered=exhibitionSurface?.id||rememberedWall,selected=tabs.some(tab=>tab.dataset.wallId===remembered)?remembered:tabs[0]?.dataset.wallId;syncWallTabsVisibility();
    for(const tab of tabs){const current=tab.dataset.wallId===selected;tab.setAttribute('aria-selected',String(current));tab.tabIndex=current?0:-1;if(current)exhibitionEditor.setAttribute('aria-labelledby',tab.id);}
    const index=tabs.findIndex(tab=>tab.dataset.wallId===selected);wallPrevious.disabled=index<=0;wallNext.disabled=index<0||index>=tabs.length-1;
    for(const choice of wallPicker.children)choice.setAttribute('aria-checked',String(choice.dataset.wallId===selected));
  }
  for(const [button,step]of [[wallPrevious,-1],[wallNext,1]])button.addEventListener('click',()=>{const tabs=[...wallTabs.children],index=tabs.findIndex(tab=>tab.getAttribute('aria-selected')==='true');tabs[index+step]?.click();});
  wallPicker.addEventListener('toggle',()=>{const open=wallPicker.matches(':popover-open');wallPickerToggle.setAttribute('aria-expanded',String(open));if(open)(wallPicker.querySelector('[aria-checked="true"]')||wallPicker.firstElementChild)?.focus();});
  wallPicker.addEventListener('keydown',event=>{const choices=[...wallPicker.children],index=choices.indexOf(event.target);if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus();});
  wallTabs.addEventListener('keydown',event=>{if(event.target.tagName==='INPUT')return;const tabs=[...wallTabs.children],index=tabs.indexOf(event.target);if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});
  function exhibitionData(){const data=currentPlan().exhibition??={surfaces:{}};const layout=data.surfaces[exhibitionSurface.id]??={items:[],guides:[]};layout.lines??=[];layout.dimensions??=[];if(layout.dimensions.some(d=>!PlanExhibition.attached(d)))layout.dimensions=layout.dimensions.filter(PlanExhibition.attached);return layout;}
  function exhibitionLines(){const data=exhibitionData();return[...data.lines,...data.guides].map(line=>({...line,construction:true}));}
  function resetExhibitionDrafts(){if(wallDimensionDrag)restoreWallDimensionDrag();wallDimensionDrag=null;wallSvg.style.cursor='';selectedWallDimensionKey=null;exhibitionDrag=null;guideStart=null;exhibitionHover=null;measurementStart=null;placeholderStart=null;placeholderHover=null;editingExhibitionDimension=null;distanceEditor.hidden=true;catalogDrag=null;document.getElementById('exhibition-drag-preview')?.remove();}
  function exhibitionMessage(text){document.getElementById('exhibition-status').textContent=text;}
  function closeExhibition(){
    rememberedWall=exhibitionSurface?.id||rememberedWall;syncWorkspace('walls');exhibitionPicking=true;resetExhibitionDrafts();exhibitionSurface=null;exhibitionSelected=null;exhibitionEditor.hidden=true;document.getElementById('plan-view').classList.remove('exhibition-mode');
    if(viewports[active]){delete viewports[active].exhibitionSurface;saveView(structuredClone(viewports));}layout();renderOrbit();
  }
  function openExhibition(surface){
    syncWorkspace('layout');rememberedWall=surface.id;endExtrusion();exhibitionSurface=surface;clearWallSelection();exhibitionPicking=false;surfaceMode=false;selectedFaces.clear();
    const layout=currentPlan().exhibition?.surfaces[surface.id];if(layout&&!layout.designated){layout.designated=true;save(snapshot(),false);}
    resetExhibitionDrafts();exhibitionSelected=null;exhibitionImage=null;exhibitionTool='select';exhibitionEditor.hidden=false;document.getElementById('plan-view').classList.add('exhibition-mode');
    viewports[active]={...viewports[active],exhibitionSurface:surface.id};saveView(structuredClone(viewports));renderExhibition();wallSvg.focus();
  }
  function requestExhibition(point,event){
    const hit=pickSurface(point,true);if(!hit){clearWallSelection();return;}
    if(extrusion)endExtrusion();
    const candidates=exhibitionCandidates(),surface=candidates.find(surface=>{const p=PlanExhibition.local(surface,hit.point);return Math.abs(p.distance)<.01&&PlanExhibition.contains(surface,p);});
    if(!surface){notify('Wybierz płaską ścianę.');return;}
    const existing=exhibitionSurfaces().find(wall=>wall.sourceIds?.includes(surface.id));
    const firstExisting=existing&&!editingWall&&!pendingWallParts.size;
    if(firstExisting){editingWall=existing.id;rememberedWall=existing.id;}
    const ids=firstExisting?existing.sourceIds:existing&&existing.id!==editingWall?existing.sourceIds:[surface.id],next=new Set(pendingWallParts);
    const remove=wallPartAction==='remove'||wallPartAction!=='add'&&!firstExisting&&ids.every(id=>next.has(id));
    for(const id of ids)if(remove)next.delete(id);else next.add(id);
    const parts=[...next].map(id=>candidates.find(part=>part.id===id)).filter(Boolean);
    if(parts.length>1&&parts.some(part=>Math.abs(PlanExhibition.local(parts[0],part.origin).distance)>.01||parts[0].normal.x*part.normal.x+parts[0].normal.y*part.normal.y+(parts[0].normal.height||0)*(part.normal.height||0)<1-1e-7)){notify('Fragmenty muszą leżeć w jednej płaszczyźnie.');return;}
    pendingWallParts=new Set(parts.map(part=>part.id));pendingSurface=PlanExhibition.combine(parts,editingWall||undefined);exhibitionConfirm.hidden=!parts.length&&!editingWall;document.getElementById('wall-part-tools').hidden=!editingWall;
    const enter=document.getElementById('exhibition-enter');enter.textContent=parts.length>1?`Utwórz ścianę (${parts.length})`:'Zatwierdź ścianę';if(editingWall)enter.textContent=parts.length?'Zapisz ścianę':'Usuń ścianę';enter.dataset.action=editingWall&&!parts.length?'delete':'save';enter.disabled=!pendingSurface&&!(editingWall&&!parts.length);enter.title=pendingSurface?'':'Fragmenty muszą stykać się krawędziami';renderOrbit();
    exhibitionConfirm.style.left=`${Math.max(8,Math.min(point.x,board.clientWidth-exhibitionConfirm.offsetWidth-8))}px`;exhibitionConfirm.style.top=`${Math.max(160,Math.min(point.y,board.clientHeight-exhibitionConfirm.offsetHeight-8))}px`;document.getElementById('exhibition-enter').focus();
  }
  document.getElementById('exhibition-enter').addEventListener('click',()=>{
    if(!pendingSurface&&editingWall&&!pendingWallParts.size){const data=currentPlan().exhibition.surfaces[editingWall];if(['items','lines','guides','dimensions'].some(key=>data[key]?.length)){notify('Najpierw przenieś obrazy i elementy z usuwanej ściany.');return;}delete currentPlan().exhibition.surfaces[editingWall];rememberedWall=null;save(snapshot(),false);clearWallSelection();syncWallLists(true);return;}
    if(!pendingSurface)return;const wall=pendingSurface,exhibition=currentPlan().exhibition??={surfaces:{}},previous=exhibitionSurfaces(),included=new Set(wall.sourceIds),existing=previous.find(part=>part.sourceIds.length===included.size&&part.sourceIds.every(id=>included.has(id)));
    if(existing){rememberedWall=existing.id;clearWallSelection();return;}
    const layout={designated:true,sourceIds:wall.sourceIds,items:[],guides:[],lines:[],dimensions:[],dimensionOffsets:{}};
    const replaced=previous.filter(old=>old.id===editingWall||old.sourceIds.every(id=>included.has(id)));
    for(const old of replaced){
      const data=exhibition.surfaces[old.id],map=p=>PlanExhibition.local(wall,PlanExhibition.world(old,p.x,p.y));
      if(!layout.name&&data.name)layout.name=data.name;
      for(const item of data.items||[]){const p=map(item);layout.items.push({...structuredClone(item),x:p.x,y:p.y});}
      for(const key of ['lines','guides'])for(const line of data[key]||[])layout[key].push({...structuredClone(line),a:map(line.a),b:map(line.b)});
      const moveOffset=(value,axis)=>axis==='x'?map({x:0,y:value}).y:map({x:value,y:0}).x;
      for(const dimension of data.dimensions||[]){const copy=structuredClone(dimension);if(Number.isFinite(copy.offset))copy.offset=moveOffset(copy.offset,copy.axis);for(const ref of [copy.a,copy.b])if(Number.isFinite(ref.at))ref.at=moveOffset(ref.at,copy.axis);layout.dimensions.push(copy);}
      for(const [key,value]of Object.entries(data.dimensionOffsets||{}))if(!key.startsWith('wall:')){const axis=(data.dimensions||[]).find(d=>d.id===key)?.axis||(/:(left|right|placeholder-width|artwork-width|line-length)$/.test(key)?'x':'y');layout.dimensionOffsets[key]=moveOffset(value,axis);}
    }
    if(layout.items.some(item=>!PlanExhibition.fits(wall,item))||[...layout.lines,...layout.guides].some(line=>![line.a,line.b].every(point=>PlanExhibition.contains(wall,point)))||layout.dimensions.some(dimension=>{const measured=PlanExhibition.measurement(wall,layout,dimension);return !measured||![measured.a,measured.b].every(point=>PlanExhibition.contains(wall,point));})){notify('Ten fragment zawiera obrazy lub elementy układu. Przenieś je przed odjęciem fragmentu.');return;}
    for(const old of replaced)delete exhibition.surfaces[old.id];
    exhibition.surfaces[wall.id]=layout;rememberedWall=wall.id;save(snapshot(),false);clearWallSelection();syncWallLists(true);
  });
  document.getElementById('exhibition-undo').addEventListener('click',()=>travelHistory());document.getElementById('exhibition-redo').addEventListener('click',()=>travelHistory(true));
  function wallPointer(event){const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(wallSvg.getScreenCTM().inverse());return{x:point.x,y:exhibitionSurface.heightCm-point.y};}
  let exhibitionFrameScale=null,exhibitionDimensionTarget=null;
  function wallScale(){return exhibitionFrameScale??Math.abs(wallSvg.getScreenCTM()?.a||1);}
  function selectedExhibitionItem(){return exhibitionSurface&&exhibitionData().items.find(item=>item.id===exhibitionSelected);}
  function selectedExhibitionLine(){if(!exhibitionSurface)return null;const data=exhibitionData();return[...data.lines,...data.guides].find(line=>line.id===exhibitionSelected);}
  function drawExhibitionWallDimensions(w,h){
    const chains=PlanExhibition.wallDimensionChains(exhibitionSurface),scale=wallScale();
    const data=exhibitionData();let horizontalInner=h+20/scale;
    const include=(dimension,key)=>{if(dimension.axis==='x')horizontalInner=Math.max(horizontalInner,PlanExhibition.dimensionOffset(exhibitionSurface,dimension,scale,0,data.dimensionOffsets?.[key],data.items));};
    for(const dimension of data.dimensions)include(dimension,dimension.id);
    for(const item of data.items)for(const dimension of automaticExhibitionDimensions(item))include(dimension,`${item.id}:${dimension.side}`);
    for(const line of exhibitionLines())include({axis:'x',offset:line.a.y+22/scale},`${line.id}:line-length`);
    for(const axis of ['x','y']){
      const segments=chains[axis],horizontal=axis==='x',offset=horizontal?horizontalInner+36/scale:-22/scale;
      for(const [index,segment]of segments.entries())drawExhibitionDimension({axis,a:{kind:'point',...segment.a},b:{kind:'point',...segment.b},offset},{'data-wall-dimension':`${horizontal?'width':'height'}-part-${index}`,'data-wall-chain':axis},true);
      const a=horizontal?{x:0,y:h}:{x:0,y:0},b=horizontal?{x:w,y:h}:{x:0,y:h};
      drawExhibitionDimension({axis,a:{kind:'point',...a},b:{kind:'point',...b},offset:offset+(segments.length?(horizontal?36:-36)/scale:0)},{'data-wall-dimension':horizontal?'width':'height'},true);
    }
  }
  function drawExhibitionDimension(dimension,attributes={},readonly=false){
    const measured=PlanExhibition.measurement(exhibitionSurface,exhibitionData(),dimension);if(!measured)return;
    const owner=attributes['data-dimension-item']||attributes['data-dimension-line'],key=dimension.id||`${attributes['data-wall-dimension']?'wall':owner||exhibitionSelected}:${attributes['data-wall-dimension']||attributes['data-auto-dimension']}`;
    const {a,b,value}=measured,h=exhibitionSurface.heightCm,scale=wallScale(),axis=dimension.axis,other=axis==='x'?'y':'x',base=(a[other]+b[other])/2,saved=exhibitionData().dimensionOffsets?.[key],gapOffset=PlanExhibition.artworkGapOffset(exhibitionData().items,dimension,saved),offset=Number.isFinite(saved)?(wallDimensionDrag?.key===key?saved:PlanExhibition.dimensionOffset(exhibitionSurface,dimension,scale,base,saved,exhibitionData().items)):gapOffset??Math.max(PlanExhibition.dimensionOffset(exhibitionSurface,dimension,scale,base,saved,exhibitionData().items),attributes['data-wall-dimension']&&axis==='x'?dimension.offset:-Infinity),confined=dimension.a.kind==='item'&&dimension.b.kind==='item'&&dimension.a.id!==dimension.b.id,directGap=gapOffset!==null&&(!Number.isFinite(saved)||saved===gapOffset);
    const point=(value,cross)=>axis==='x'?{x:value,y:h-cross}:{x:cross,y:h-value},p=point(a[axis],offset),q=point(b[axis],offset),group=svgElement('g',{...attributes,'data-dimension-confined':confined,'data-dimension-key':PlanExhibition.dimensionKey(dimension),'data-dimension-axis':axis,'data-dimension-value':value,'data-dimension-offset':offset,class:`exhibition-dimension${key===selectedWallDimensionKey?' selected':''}`});
    const extensionOrigin=(ref,position)=>{if(axis==='x'&&ref.kind==='item'){const item=exhibitionData().items.find(item=>item.id===ref.id);if(item)return{x:position.x,y:h-(offset<0?item.y:item.y+item.heightCm)};}if(axis==='x'&&ref.kind==='wall')return{x:position.x,y:offset<0?h:0};return{x:position.x,y:h-position.y};};
    if(!directGap)for(const [from,to]of [[extensionOrigin(dimension.a,a),p],[extensionOrigin(dimension.b,b),q]]){const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<1e-8)continue;const gap=Math.min(7/scale,length),overrun=confined?0:8/scale;group.append(svgElement('line',{x1:from.x+dx/length*gap,y1:from.y+dy/length*gap,x2:to.x+dx/length*overrun,y2:to.y+dy/length*overrun,class:'exhibition-dimension-line exhibition-dimension-extension'}));}
    const geometry=PlanExhibition.dimensionSegment(p,q,scale,confined);group.append(svgElement('line',{...geometry.line,class:'exhibition-dimension-line exhibition-dimension-main'}));
    for(const tick of geometry.ticks)group.append(svgElement('line',{...tick,class:'exhibition-dimension-line exhibition-dimension-tick'}));
    const x=(p.x+q.x)/2+(axis==='y'?-12/scale:0),y=(p.y+q.y)/2-(axis==='x'?12/scale:0),label=svgElement('g',{class:readonly?'exhibition-dimension-static':'exhibition-dimension-value',transform:`translate(${x},${y})${axis==='y'?' rotate(-90)':''}`}),text=PlanExhibition.formatDimension(value,Boolean(attributes['data-wall-dimension'])&&!attributes['data-wall-chain']),labelWidth=(text.length*7.5+14)/scale;
    label.append(svgElement('rect',{x:-labelWidth/2,y:-13/scale,width:labelWidth,height:26/scale,fill:'transparent'}));const node=svgElement('text',{'text-anchor':'middle','dominant-baseline':'central','font-size':14/scale,fill:'#333'});node.textContent=text;label.append(node);group.append(label);
    label.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();wallSvg.focus();distanceEditor.hidden=true;selectedWallDimensionKey=key;if(dimension.id||owner)exhibitionSelected=dimension.id||owner;wallDimensionDrag={key,dimension:structuredClone(dimension),readonly,origin:{x:event.clientX,y:event.clientY},offset,base,scale,beforeOffsets:structuredClone(exhibitionData().dimensionOffsets),point:{x,y},moved:false};renderExhibition();wallSvg.setPointerCapture(event.pointerId);});
    if(!readonly){label.setAttribute('tabindex','0');label.setAttribute('role','button');label.setAttribute('aria-label',`Odległość ${text}`);label.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();selectedWallDimensionKey=key;if(dimension.id||owner)exhibitionSelected=dimension.id||owner;openExhibitionDistance(dimension,{x,y});}});}
    (exhibitionDimensionTarget||wallSvg).append(group);
  }
  function restoreWallDimensionDrag(){if(!wallDimensionDrag||!exhibitionSurface)return;const data=exhibitionData();if(wallDimensionDrag.beforeOffsets===undefined)delete data.dimensionOffsets;else data.dimensionOffsets=structuredClone(wallDimensionDrag.beforeOffsets);}
  function automaticExhibitionDimensions(item){
    const data=exhibitionData(),surface=exhibitionSurface,result=[],rowSplit=PlanExhibition.dimensionRowSplit(data.items),lower=item.y+item.heightCm/2<rowSplit,overlap=(a,b,axis,length)=>Math.min(a[axis]+a[length],b[axis]+b[length])-Math.max(a[axis],b[axis])>1e-6;
    for(const side of ['left','right','bottom','top']){
      const axis=['left','right'].includes(side)?'x':'y',positive=['left','bottom'].includes(side),chainEdge=lower?'right':'left',end=axis==='x'?item.x+(lower?item.widthCm:0):item.y+(positive?0:item.heightCm),edge=axis==='x'?chainEdge:(positive?'top':'bottom');
      let a={kind:'wall',edge:side,at:axis==='x'?item.y+item.heightCm/2:item.x+item.widthCm/2},best=Math.abs(end-(positive?0:axis==='x'?surface.widthCm:surface.heightCm));
      for(const other of data.items){if(other.id===item.id||(axis==='x'?(other.y+other.heightCm/2<rowSplit)!==lower:!overlap(item,other,'x','widthCm')))continue;
        const value=axis==='x'?other.x+(lower?other.widthCm:0):other.y+(positive?other.heightCm:0),gap=positive?end-value:value-end;
        if(gap>=-1e-6&&gap<best){best=gap;a={kind:'item',id:other.id,edge};}
      }
      result.push({axis,a,b:{kind:'item',id:item.id,edge:axis==='x'?chainEdge:side},side,offset:axis==='x'?(lower?-56/wallScale():surface.heightCm+56/wallScale()):item.x+item.widthCm/2,sign:positive?1:-1});
    }
    if(item.kind!=='placeholder')result.push({axis:'x',a:{kind:'item',id:item.id,edge:'left'},b:{kind:'item',id:item.id,edge:'right'},side:'artwork-width',readonly:true,offset:item.y+item.heightCm+18/wallScale()});
    if(item.kind==='placeholder'){
      result.push({axis:'x',a:{kind:'item',id:item.id,edge:'left'},b:{kind:'item',id:item.id,edge:'right'},side:'placeholder-width',resize:'widthCm',offset:item.y+item.heightCm+18/wallScale()});
      result.push({axis:'y',a:{kind:'item',id:item.id,edge:'bottom'},b:{kind:'item',id:item.id,edge:'top'},side:'placeholder-height',resize:'heightCm',offset:item.x+item.widthCm+18/wallScale()});
    }return result;
  }
  function openExhibitionDistance(dimension,point){
    const measured=PlanExhibition.measurement(exhibitionSurface,exhibitionData(),dimension);if(!measured)return;
    editingExhibitionDimension=structuredClone(dimension);distanceInput.value=Number(measured.value.toFixed(3));distanceEditor.hidden=false;
    const client=new DOMPoint(point.x,point.y).matrixTransform(wallSvg.getScreenCTM()),stage=wallSvg.parentElement.getBoundingClientRect();distanceEditor.style.left=`${Math.max(0,Math.min(stage.width-150,client.x-stage.x-70))}px`;distanceEditor.style.top=`${Math.max(0,client.y-stage.y-15)}px`;distanceInput.focus();distanceInput.select();
  }
  distanceEditor.addEventListener('submit',event=>{
    event.preventDefault();if(!editingExhibitionDimension||!distanceEditor.reportValidity())return;
    const changed=PlanExhibition.setDistance(exhibitionSurface,exhibitionData(),editingExhibitionDimension,Number(distanceInput.value));
    if(!changed){exhibitionMessage('Nie można ustawić tej odległości na ścianie.');return;}
    currentPlan().exhibition.surfaces[exhibitionSurface.id]=changed;editingExhibitionDimension=null;distanceEditor.hidden=true;saveExhibition();wallSvg.focus();
  });
  function exhibitionReferenceAt(point,target,axis){
    const data=exhibitionData(),item=data.items.find(item=>item.id===target.closest('[data-placement-id]')?.dataset.placementId);
    if(item)return{kind:'item',id:item.id,edge:axis==='x'?(point.x<item.x+item.widthCm/2?'left':'right'):(point.y<item.y+item.heightCm/2?'bottom':'top')};
    const lines=exhibitionLines(),near=lines.map(line=>{const dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,t=Math.max(0,Math.min(1,((point.x-line.a.x)*dx+(point.y-line.a.y)*dy)/(dx*dx+dy*dy||1)));return{line,distance:Math.hypot(point.x-line.a.x-t*dx,point.y-line.a.y-t*dy)};}).sort((a,b)=>a.distance-b.distance)[0];
    const line=lines.find(line=>line.id===target.closest('[data-line-id]')?.dataset.lineId)||(near?.distance<=10/wallScale()?near.line:null);
    if(line)return{kind:'line',id:line.id,edge:Math.abs(point.x-line.a.x)<=Math.abs(point.x-line.b.x)?'a':'b',...(axis==='y'?{at:point.x}:{})};
    const max=axis==='x'?exhibitionSurface.widthCm:exhibitionSurface.heightCm,edge=point[axis]<max/2?(axis==='x'?'left':'bottom'):(axis==='x'?'right':'top');
    if(Math.min(Math.abs(point[axis]),Math.abs(point[axis]-max))<12/wallScale())return{kind:'wall',edge,at:point[axis==='x'?'y':'x']};
    return null;
  }
  function drawExhibitionObjectDimensions(data){
    const dimensionKeys=new Set(),drawAutomatic=(dimension,attributes)=>{const key=PlanExhibition.dimensionKey(dimension);if(dimensionKeys.has(key))return;dimensionKeys.add(key);drawExhibitionDimension(dimension,attributes,dimension.readonly===true);};
    for(const dimension of data.dimensions)drawAutomatic(dimension,{'data-dimension-id':dimension.id});
    const dimensionItems=[...data.items].sort((a,b)=>Number(b.id===exhibitionSelected)-Number(a.id===exhibitionSelected));
    for(const item of dimensionItems)for(const dimension of automaticExhibitionDimensions(item))drawAutomatic(dimension,{'data-auto-dimension':dimension.side,'data-dimension-item':item.id});
    for(const selectedLine of exhibitionLines()){
      const left=selectedLine.a.x<=selectedLine.b.x?'a':'b',right=left==='a'?'b':'a';
      drawAutomatic({axis:'x',a:{kind:'line',id:selectedLine.id,edge:left},b:{kind:'line',id:selectedLine.id,edge:right},offset:selectedLine.a.y+22/wallScale()},{'data-auto-dimension':'line-length','data-dimension-line':selectedLine.id});
      drawAutomatic({axis:'y',a:{kind:'wall',edge:'bottom',at:(selectedLine.a.x+selectedLine.b.x)/2},b:{kind:'line',id:selectedLine.id,edge:left},offset:(selectedLine.a.x+selectedLine.b.x)/2},{'data-auto-dimension':'line-height','data-dimension-line':selectedLine.id});
    }
  }
  function renderExhibitionDrag(){
    const drag=exhibitionDrag,item=selectedExhibitionItem()||selectedExhibitionLine();if(drag&&!item)return;
    const data=exhibitionData(),h=exhibitionSurface.heightCm,w=exhibitionSurface.widthCm;
    exhibitionFrameScale=wallDimensionDrag?.scale??wallScale();exhibitionDimensionTarget=document.createDocumentFragment();
    try{
      if(drag){const selector=drag.kind==='item'?'[data-placement-id]':'[data-line-id]',node=[...wallSvg.querySelectorAll(selector)].find(node=>(node.dataset.placementId||node.dataset.lineId)===drag.id);
        const origin=drag.kind==='item'?item:item.a,before=drag.kind==='item'?drag.before:drag.before.a;
        node?.setAttribute('transform',`translate(${origin.x-before.x},${before.y-origin.y})`);}
      // Build annotations off-DOM using one scale read, then replace only those
      // annotations. Keep artwork/image nodes, the sidebar and viewport intact.
      drawExhibitionWallDimensions(w,h);drawExhibitionObjectDimensions(data);
      for(const mark of exhibitionMarks){const attrs=mark.axis==='x'?{x1:mark.value,y1:0,x2:mark.value,y2:h}:{x1:0,y1:h-mark.value,x2:w,y2:h-mark.value};exhibitionDimensionTarget.append(svgElement('line',{...attrs,class:'exhibition-snap-mark',stroke:'#168bd2','stroke-dasharray':'4 3','stroke-width':1,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
      for(const node of wallSvg.querySelectorAll('.exhibition-dimension,.exhibition-snap-mark'))node.remove();
      wallSvg.append(exhibitionDimensionTarget);
      if(drag?.kind==='item')for(const key of ['x','y'])exhibitionProperties.elements[key].value=Number(item[key].toFixed(3));
    }finally{exhibitionFrameScale=null;exhibitionDimensionTarget=null;}
  }
  function renderExhibition(fitBox=null,fitPass=0){
    if(!exhibitionSurface)return;
    if(exhibitionDrag?.moved||wallDimensionDrag){renderExhibitionDrag();return;}
    const current=exhibitionSurfaces().find(surface=>surface.id===exhibitionSurface.id);if(!current){closeExhibition();notify('Ta ściana nie jest już dostępna.');return;}exhibitionSurface=current;
    const data=exhibitionData(),library=getLibrary().filter(image=>image.accepted),h=current.heightCm,w=current.widthCm,chains=PlanExhibition.wallDimensionChains(current),rect=wallSvg.getBoundingClientRect(),margin=Math.min(chains.x.length||chains.y.length?120:84,rect.width*.22,rect.height*.22),fitScale=Math.max(.001,Math.min((rect.width-margin*2)/w,(rect.height-margin*2)/h)),pad=margin/fitScale;
    syncWallLists();
    wallSvg.setAttribute('viewBox',(fitBox||[-pad,-pad,w+pad*2,h+pad*2]).join(' '));wallSvg.dataset.surfaceId=current.id;wallSvg.dataset.widthCm=w;wallSvg.dataset.heightCm=h;wallSvg.replaceChildren();
    const path=current.rings.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${p.x},${h-p.y}`).join(' ')+'Z').join(' ');wallSvg.append(svgElement('path',{d:path,fill:'#fbfaf4','fill-rule':'evenodd',stroke:'#7c8b7e','stroke-width':1,'vector-effect':'non-scaling-stroke'}));
    drawExhibitionWallDimensions(w,h);
    for(const line of exhibitionLines()){
      const group=svgElement('g',{'data-line-id':line.id,class:`exhibition-line${line.construction?' construction':''}${line.id===exhibitionSelected?' selected':''}`}),attrs={x1:line.a.x,y1:h-line.a.y,x2:line.b.x,y2:h-line.b.y};
      group.append(svgElement('line',{...attrs,class:'exhibition-line-hit'}),svgElement('line',{...attrs,class:'exhibition-line-visible'}));wallSvg.append(group);
    }
    for(const item of data.items){
      const image=library.find(image=>image.id===item.imageId),group=svgElement('g',{'data-placement-id':item.id,class:`exhibition-art${item.id===exhibitionSelected?' selected':''}`,tabindex:0,role:'button','aria-label':`${item.kind==='placeholder'?item.title||'Pusty obraz':image?.title||'Obraz'} · ${item.widthCm} × ${item.heightCm} cm`});
      const attrs={x:item.x,y:h-item.y-item.heightCm,width:item.widthCm,height:item.heightCm};group.append(svgElement('rect',{...attrs,fill:'#d7d2c7',stroke:'#888','stroke-width':1,'vector-effect':'non-scaling-stroke'}));
      if(image)group.append(svgElement('image',{...attrs,href:image.url,preserveAspectRatio:'none'}));else{
        if(item.kind==='placeholder')group.append(svgElement('path',{d:`M${attrs.x},${attrs.y}l${attrs.width},${attrs.height}m${-attrs.width},0l${attrs.width},${-attrs.height}`,fill:'none',stroke:'#a4a99d','stroke-width':1,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
        const text=svgElement('text',{x:item.x+item.widthCm/2,y:h-item.y-item.heightCm/2,'text-anchor':'middle','font-size':12/wallScale(),fill:'#555','pointer-events':'none'});text.textContent=item.kind==='placeholder'?item.title||'Pusty obraz':'Obraz usunięty z biblioteki';group.append(text);
      }wallSvg.append(group);
    }
    for(const line of wallSvg.querySelectorAll(':scope > .exhibition-line'))wallSvg.append(line);
    for(const mark of exhibitionMarks){const attrs=mark.axis==='x'?{x1:mark.value,y1:0,x2:mark.value,y2:h}:{x1:0,y1:h-mark.value,x2:w,y2:h-mark.value};wallSvg.append(svgElement('line',{...attrs,class:'exhibition-snap-mark',stroke:'#168bd2','stroke-dasharray':'4 3','stroke-width':1,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
    if(guideStart){if(exhibitionHover){const end=exhibitionLinePoint(exhibitionHover);wallSvg.append(svgElement('line',{x1:guideStart.x,y1:h-guideStart.y,x2:end.x,y2:h-end.y,class:'exhibition-line-preview'}));}wallSvg.append(svgElement('circle',{cx:guideStart.x,cy:h-guideStart.y,r:3/wallScale(),fill:'#a47136'}));}
    if(measurementStart){const p=PlanExhibition.reference(current,data,measurementStart);if(p)wallSvg.append(svgElement('circle',{cx:p.x,cy:h-p.y,r:4/wallScale(),fill:'#168bd2'}));}
    if(placeholderStart&&placeholderHover){const item=placeholderRectangle(placeholderHover);wallSvg.append(svgElement('rect',{x:item.x,y:h-item.y-item.heightCm,width:item.widthCm,height:item.heightCm,fill:'#a9c7d333',stroke:'#168bd2','stroke-width':1,'stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
    drawExhibitionObjectDimensions(data);
    const selected=selectedExhibitionItem();exhibitionProperties.hidden=!selected;
    document.getElementById('exhibition-placeholder-properties').hidden=selected?.kind!=='placeholder';
    if(selected){
      document.getElementById('exhibition-work-title').textContent=selected.kind==='placeholder'?selected.title||'Pusty obraz':library.find(image=>image.id===selected.imageId)?.title||'Obraz';document.getElementById('exhibition-work-size').textContent=`${PlanExhibition.formatDimension(selected.widthCm)} × ${PlanExhibition.formatDimension(selected.heightCm)}`;
      for(const key of ['x','y','depthCm'])exhibitionProperties.elements[key].value=Number(selected[key].toFixed(3));
      exhibitionProperties.elements.placeholderWidthCm.value=selected.widthCm;exhibitionProperties.elements.placeholderHeightCm.value=selected.heightCm;exhibitionProperties.elements.placeholderTitle.value=selected.title||'';
    }
    const list=document.getElementById('exhibition-library'),libraryScroll=list.scrollTop;list.replaceChildren();
    for(const image of library){
      const used=PlanExhibition.placed(plans,image.id),sized=Number(image.widthCm)>0&&Number(image.heightCm)>0,valid=sized&&!used,button=document.createElement('button');button.type='button';button.className='exhibition-library-item';button.dataset.imageId=image.id;button.draggable=false;button.disabled=!valid;button.setAttribute('aria-pressed',String(exhibitionImage===image.id));if(used)button.title='Obraz jest już umieszczony na ścianie';
      const img=document.createElement('img');img.src=image.url;img.alt='';img.draggable=false;const title=document.createElement('span');title.textContent=image.title||'Bez tytułu';const dimensions=document.createElement('span');dimensions.textContent=sized?`${PlanExhibition.formatDimension(Number(image.widthCm))} × ${PlanExhibition.formatDimension(Number(image.heightCm))}`:'Uzupełnij wymiary w bibliotece';button.append(img,title,dimensions);
      button.addEventListener('click',event=>{if(event.detail)return;exhibitionImage=image.id;exhibitionTool='select';renderExhibition();});button.addEventListener('pointerdown',event=>{if(event.button!==0||!valid)return;event.preventDefault();catalogDrag={imageId:image.id,start:{x:event.clientX,y:event.clientY},moved:false,pointerId:event.pointerId};button.setPointerCapture(event.pointerId);});list.append(button);
    }
    if(!library.length){const text=document.createElement('p');text.textContent='Brak zaakceptowanych obrazów. Dodaj je w zakładce Obrazy.';list.append(text);}
    list.scrollTop=libraryScroll;
    for(const tool of ['select','line','placeholder','measure-x','measure-y'])document.getElementById(`exhibition-${tool}`).setAttribute('aria-pressed',String(exhibitionTool===tool));
    // Fit actual annotations as well as the wall, including saved label positions.
    // Repeat after changing scale because labels and offsets use screen pixels.
    const bounds=wallSvg.getBBox(),view=wallSvg.viewBox.baseVal,inset=12/wallScale(),x=Math.min(view.x,bounds.x-inset),y=Math.min(view.y,bounds.y-inset),right=Math.max(view.x+view.width,bounds.x+bounds.width+inset),bottom=Math.max(view.y+view.height,bounds.y+bounds.height+inset);
    if(fitPass<12&&(view.x-x>1/wallScale()||view.y-y>1/wallScale()||right-view.x-view.width>1/wallScale()||bottom-view.y-view.height>1/wallScale()))renderExhibition([x,y,right-x,bottom-y],fitPass+1);
  }
  function saveExhibition(){exhibitionMessage('');save(snapshot(),false);sceneRevision++;renderExhibition();}
  function exhibitionImageAt(id,point){
    if(PlanExhibition.placed(plans,id))return null;
    const image=getLibrary().find(image=>image.id===id&&image.accepted);if(!image||!(image.widthCm>0&&image.heightCm>0))return null;
    let item={imageId:id,widthCm:Number(image.widthCm),heightCm:Number(image.heightCm),depthCm:3,x:point.x-image.widthCm/2,y:point.y-image.heightCm/2};
    if(document.getElementById('exhibition-snap').checked)item=PlanExhibition.snap(exhibitionSurface,item,exhibitionData().items,exhibitionLines(),8/wallScale()).item;
    return item;
  }
  function placeExhibitionImage(id,point){
    const item=exhibitionImageAt(id,point);if(!item)return;
    if(!PlanExhibition.fits(exhibitionSurface,item)){exhibitionMessage('Obraz wykracza poza ścianę.');return;}
    item.id=PlanTopology.uid();exhibitionData().items.push(item);exhibitionSelected=item.id;exhibitionImage=null;exhibitionTool='select';saveExhibition();
  }
  function placeholderRectangle(point){return{kind:'placeholder',title:'Pusty obraz',x:Math.min(point.x,placeholderStart.x),y:Math.min(point.y,placeholderStart.y),widthCm:Math.abs(point.x-placeholderStart.x),heightCm:Math.abs(point.y-placeholderStart.y),depthCm:3};}
  function finishPlaceholder(point){
    const item=placeholderRectangle(point);if(item.widthCm<1/wallScale()||item.heightCm<1/wallScale())return;
    if(!PlanExhibition.fits(exhibitionSurface,item)){exhibitionMessage('Obraz wykracza poza ścianę.');return;}
    item.id=PlanTopology.uid();exhibitionData().items.push(item);placeholderStart=placeholderHover=null;exhibitionSelected=item.id;exhibitionTool='select';saveExhibition();
  }
  document.addEventListener('pointermove',event=>{
    if(!catalogDrag||!exhibitionSurface)return;
    if(Math.hypot(event.clientX-catalogDrag.start.x,event.clientY-catalogDrag.start.y)>3)catalogDrag.moved=true;if(!catalogDrag.moved)return;
    const source=getLibrary().find(image=>image.id===catalogDrag.imageId);if(!source)return;
    let preview=document.getElementById('exhibition-drag-preview');if(!preview){preview=document.createElement('img');preview.id='exhibition-drag-preview';preview.src=source.url;preview.alt='';preview.draggable=false;document.body.append(preview);}
    const scale=wallScale(),rect=wallSvg.getBoundingClientRect(),over=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom,item=exhibitionImageAt(source.id,wallPointer(event));
    let x=event.clientX-source.widthCm*scale/2,y=event.clientY-source.heightCm*scale/2;
    if(over&&item){const point=new DOMPoint(item.x,exhibitionSurface.heightCm-item.y-item.heightCm).matrixTransform(wallSvg.getScreenCTM());x=point.x;y=point.y;}
    preview.style.width=`${source.widthCm*scale}px`;preview.style.height=`${source.heightCm*scale}px`;preview.style.left=`${x}px`;preview.style.top=`${y}px`;preview.classList.toggle('invalid',over&&(!item||!PlanExhibition.fits(exhibitionSurface,item)));
  });
  function finishCatalogDrag(event){
    if(!catalogDrag)return;const drag=catalogDrag;catalogDrag=null;document.getElementById('exhibition-drag-preview')?.remove();if(event.type!=='pointerup'||!exhibitionSurface)return;
    if(!drag.moved){exhibitionImage=drag.imageId;exhibitionTool='select';renderExhibition();return;}
    const rect=wallSvg.getBoundingClientRect();if(event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom)placeExhibitionImage(drag.imageId,wallPointer(event));
  }
  document.addEventListener('pointerup',finishCatalogDrag);document.addEventListener('pointercancel',finishCatalogDrag);document.addEventListener('lostpointercapture',finishCatalogDrag);
  for(const tool of ['select','line','placeholder','measure-x','measure-y'])document.getElementById(`exhibition-${tool}`).addEventListener('click',()=>{resetExhibitionDrafts();exhibitionTool=tool;exhibitionImage=null;renderExhibition();exhibitionMessage('');});
  function exhibitionLinePoint(point){
    const snapped=document.getElementById('exhibition-snap').checked?PlanExhibition.snap(exhibitionSurface,{...point,widthCm:0,heightCm:0},exhibitionData().items,exhibitionLines(),8/wallScale()).item:point;
    return guideStart?PlanExhibition.orthogonalEndpoint(guideStart,snapped):{x:snapped.x,y:snapped.y};
  }
  wallSvg.addEventListener('pointerdown',event=>{
    if(event.button!==0||!exhibitionSurface)return;event.preventDefault();wallSvg.focus();const point=wallPointer(event),data=exhibitionData();
    if(exhibitionTool==='placeholder'){
      if(!PlanExhibition.contains(exhibitionSurface,point))return;
      if(placeholderStart){finishPlaceholder(point);return;}placeholderStart=point;placeholderHover=null;wallSvg.setPointerCapture(event.pointerId);renderExhibition();return;
    }
    if(exhibitionTool.startsWith('measure-')){
      const axis=exhibitionTool==='measure-x'?'x':'y',ref=exhibitionReferenceAt(point,event.target,axis);
      if(!ref)return;
      if(!measurementStart){measurementStart=ref;renderExhibition();return;}
      const dimension={id:PlanTopology.uid(),axis,a:measurementStart,b:ref,offset:point[axis==='x'?'y':'x']+22/wallScale()},measured=PlanExhibition.measurement(exhibitionSurface,data,dimension);if(!measured||measured.value<1e-6)return;
      data.dimensions.push(dimension);measurementStart=null;saveExhibition();return;
    }
    if(exhibitionTool==='line'){
      if(!PlanExhibition.contains(exhibitionSurface,point))return;
      const end=exhibitionLinePoint(point);
      if(!guideStart){guideStart=end;renderExhibition();return;}
      if(Math.hypot(end.x-guideStart.x,end.y-guideStart.y)<1/wallScale()||!PlanExhibition.contains(exhibitionSurface,end))return;data.lines.push({id:PlanTopology.uid(),a:guideStart,b:end,construction:true});guideStart=null;exhibitionHover=null;saveExhibition();return;
    }
    if(exhibitionImage){placeExhibitionImage(exhibitionImage,point);return;}
    distanceEditor.hidden=true;editingExhibitionDimension=null;const art=event.target.closest('[data-placement-id]'),line=event.target.closest('[data-line-id]');exhibitionSelected=art?.dataset.placementId||line?.dataset.lineId||null;
    const selected=selectedExhibitionItem()||selectedExhibitionLine();if(selected)exhibitionDrag={id:selected.id,kind:art?'item':'line',origin:point,before:structuredClone(selected),moved:false};renderExhibition();if(exhibitionDrag)wallSvg.setPointerCapture(event.pointerId);
  });
  wallSvg.addEventListener('pointermove',event=>{
    if(wallDimensionDrag){
      const drag=wallDimensionDrag,dx=event.clientX-drag.origin.x,dy=event.clientY-drag.origin.y;if(Math.hypot(dx,dy)>3)drag.moved=true;
      if(drag.moved){const delta=drag.dimension.axis==='x'?-dy:dx;if(Math.abs(delta)<=3)restoreWallDimensionDrag();else(exhibitionData().dimensionOffsets??={})[drag.key]=drag.offset+delta/drag.scale;wallSvg.style.cursor='grabbing';renderExhibition();}return;
    }
    if(placeholderStart&&exhibitionTool==='placeholder'){placeholderHover=wallPointer(event);renderExhibition();return;}
    if(guideStart&&exhibitionTool==='line'){exhibitionHover=wallPointer(event);renderExhibition();return;}
    if(exhibitionDrag?.kind==='line'){
      const line=selectedExhibitionLine(),drag=exhibitionDrag,point=wallPointer(event);if(!line)return;
      const dx=point.x-drag.origin.x,dy=point.y-drag.origin.y,next={a:{x:drag.before.a.x+dx,y:drag.before.a.y+dy},b:{x:drag.before.b.x+dx,y:drag.before.b.y+dy}};
      if([next.a,next.b].every(p=>PlanExhibition.contains(exhibitionSurface,p))){Object.assign(line,next);drag.moved=true;renderExhibition();}return;
    }
    if(!exhibitionDrag)return;const point=wallPointer(event),drag=exhibitionDrag,item=selectedExhibitionItem();if(!item)return;let next={...drag.before,x:drag.before.x+point.x-drag.origin.x,y:drag.before.y+point.y-drag.origin.y};
    exhibitionMarks=[];if(document.getElementById('exhibition-snap').checked&&!event.altKey){const snapped=PlanExhibition.snap(exhibitionSurface,next,exhibitionData().items,exhibitionLines(),8/wallScale());next=snapped.item;exhibitionMarks=snapped.marks;}
    if(PlanExhibition.fits(exhibitionSurface,next)){Object.assign(item,next);drag.moved=true;renderExhibition();}
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])wallSvg.addEventListener(type,event=>{if(wallDimensionDrag){const drag=wallDimensionDrag;if(type==='pointercancel')restoreWallDimensionDrag();wallDimensionDrag=null;wallSvg.style.cursor='';if(type!=='pointercancel'&&drag.moved)save(snapshot(),false);renderExhibition();if(type==='pointerup'&&!drag.moved&&!drag.readonly)openExhibitionDistance(drag.dimension,drag.point);return;}if(placeholderStart&&exhibitionTool==='placeholder'){if(type==='pointercancel'){placeholderStart=placeholderHover=null;renderExhibition();}else if(type==='pointerup'&&placeholderHover)finishPlaceholder(wallPointer(event));return;}if(!exhibitionDrag)return;const drag=exhibitionDrag;exhibitionDrag=null;exhibitionMarks=[];const item=selectedExhibitionItem()||selectedExhibitionLine();if(type==='pointercancel'&&item)Object.assign(item,drag.before);else if(drag.moved)save(snapshot(),false);sceneRevision++;renderExhibition();});
  exhibitionProperties.addEventListener('submit',event=>{event.preventDefault();const item=selectedExhibitionItem();if(!item||!exhibitionProperties.reportValidity())return;const next={...item};for(const key of ['x','y','depthCm',...(item.kind==='placeholder'?['widthCm','heightCm']:[])])next[key]=Number(exhibitionProperties.elements[key==='widthCm'?'placeholderWidthCm':key==='heightCm'?'placeholderHeightCm':key].value);if(item.kind==='placeholder')next.title=exhibitionProperties.elements.placeholderTitle.value.trim()||'Pusty obraz';if(!PlanExhibition.fits(exhibitionSurface,next)){exhibitionMessage('Obraz wykracza poza ścianę.');return;}Object.assign(item,next);saveExhibition();});
  function deleteExhibitionSelection(){if(!exhibitionSurface)return;const data=exhibitionData(),before=JSON.stringify(data),id=exhibitionSelected;data.items=data.items.filter(item=>item.id!==id);data.guides=data.guides.filter(item=>item.id!==id);data.lines=data.lines.filter(item=>item.id!==id);data.dimensions=data.dimensions.filter(item=>item.id!==id&&item.a.id!==id&&item.b.id!==id);exhibitionSelected=null;editingExhibitionDimension=null;distanceEditor.hidden=true;if(before!==JSON.stringify(data))saveExhibition();}
  document.getElementById('exhibition-delete').addEventListener('click',deleteExhibitionSelection);
  document.addEventListener('keydown',event=>{
    if(document.getElementById('plan-view').hidden)return;
    if(event.key==='Escape'&&wallPicker.matches(':popover-open')){event.preventDefault();event.stopImmediatePropagation();wallPicker.hidePopover();wallPickerToggle.focus();return;}
    if((!exhibitionConfirm.hidden||pendingWallParts.size)&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();clearWallSelection();orbitCanvas.focus();return;}
    if(!exhibitionSurface)return;
    if(event.target.closest('#wall-tabs-bar'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(exhibitionDrag){const item=selectedExhibitionItem()||selectedExhibitionLine();if(item)Object.assign(item,exhibitionDrag.before);}resetExhibitionDrafts();exhibitionImage=null;exhibitionSelected=null;exhibitionMarks=[];exhibitionTool='select';renderExhibition();return;}
    if(event.target.matches('input,select,textarea')||event.target.closest('#wall-tabs-bar'))return;
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();deleteExhibitionSelection();}
    const item=selectedExhibitionItem();if(item&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const next={...item},step=event.shiftKey?10:1;next.x+=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;next.y+=event.key==='ArrowDown'?-step:event.key==='ArrowUp'?step:0;if(PlanExhibition.fits(exhibitionSurface,next)){Object.assign(item,next);saveExhibition();}}
  },true);
  const faceColors=['#eeeeee','#d6d6d6','#e4e4e4','#cccccc','#f5f5f5','#dddddd'];
  function sketchFaces(){
    const g=currentPlan()?.outline;if(!g)return [];
    if(g!==faceCacheGeometry||modelRevision!==faceCacheRevision){faceCacheGeometry=g;faceCacheRevision=modelRevision;faceCache=PlanFaces.detect(g);selectedFaces=new Set([...selectedFaces].filter(id=>faceCache.some(face=>face.id===id)));}
    board.dataset.faceCount=String(faceCache.length);board.dataset.selectedFaceCount=String(selectedFaces.size);
    return faceCache;
  }
  function displayFaces(){return sketchFaces().map(face=>({...face,...PlanFaces.mesh(face,lodTolerance)}));}
  function extrusionGroups(){return extrusion?PlanExtrusions.preview(extrusion.before,selectedFaces,extrusion.height,extrusion.id):outline().extrusions||[];}
  function syncSurfaceTools(){
    syncWallLists();
    facesButton.hidden=extrudeButton.hidden=document.getElementById('orbit-view-tools').hidden=!orbitMode;facesButton.setAttribute('aria-pressed',String(surfaceMode));
    extrudeButton.disabled=!surfaceMode||!selectedFaces.size||Boolean(extrusion);extrudeControls.hidden=!orbitMode||!extrusion;extrudeHandle.hidden=true;
  }
  function chooseSurface(faceId,event){
    if(!faceId&&extrusion){endExtrusion();selectedFaces.clear();renderOrbit();return;}
    if(!event.ctrlKey&&!event.metaKey)selectedFaces.clear();
    if(faceId){if((event.ctrlKey||event.metaKey)&&selectedFaces.has(faceId))selectedFaces.delete(faceId);else selectedFaces.add(faceId);}
    board.dataset.selectedFaceCount=String(selectedFaces.size);if(extrusion){sceneRevision++;commitExtrusion();}renderOrbit();
  }
  function beginExtrusion(){
    if(!selectedFaces.size)return;
    const existing=(outline().extrusions||[]).find(group=>[...selectedFaces].every(id=>group.faceIds.includes(id)));
    extrusion={id:existing?.faceIds.length===selectedFaces.size?existing.id:PlanTopology.uid(),before:structuredClone(outline().extrusions||[]),height:existing?.height||0};
    sceneRevision++;extrudeHeight.value=String(Number((extrusion.height*100).toFixed(4)));renderOrbit();
  }
  function commitExtrusion(){
    if(!extrusion)return;
    outline().extrusions=extrusionGroups();const data=snapshot();
    if(JSON.stringify(data)===JSON.stringify(savedState))return;
    save(data,false,!extrusion.committed);extrusion.committed=true;
  }
  function endExtrusion(){
    if(!extrusion)return;
    if(extrudeDrag)commitExtrusion();extrusion=null;extrudeDrag=null;sceneRevision++;renderOrbit();
  }
  facesButton.addEventListener('click',()=>{
    if(!currentPlan()||!orbitMode)return;endExtrusion();escapeToSelection();exhibitionPicking=false;clearWallSelection();surfaceMode=!surfaceMode;selectedItems.clear();selectedFaces.clear();updateProperties();renderOrbit();
  });
  extrudeButton.addEventListener('click',beginExtrusion);
  extrudeHeight.addEventListener('input',()=>{if(extrusion&&extrudeHeight.value!==''&&extrudeHeight.validity.valid){const height=Number(extrudeHeight.value)/100;if(Number.isFinite(height)){extrusion.height=height;sceneRevision++;commitExtrusion();renderOrbit();}}});
  extrudeHandle.addEventListener('pointerdown',event=>{if(event.button!==0||!extrusion)return;event.preventDefault();event.stopPropagation();extrudeDrag={x:event.clientX,y:event.clientY,height:extrusion.height,normal:{...normalScreen}};extrudeHandle.setPointerCapture(event.pointerId);});
  extrudeHandle.addEventListener('pointermove',event=>{
    if(!extrudeDrag||!extrusion)return;const drag=extrudeDrag,n=drag.normal,length=n.x*n.x+n.y*n.y;
    extrusion.height=drag.height+((event.clientX-drag.x)*n.x+(event.clientY-drag.y)*n.y)/length*outline().metersPerUnit;
    extrudeHeight.value=String(Number((extrusion.height*100).toFixed(2)));sceneRevision++;renderOrbit();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])extrudeHandle.addEventListener(type,()=>{if(extrudeDrag)commitExtrusion();extrudeDrag=null;});
  document.addEventListener('keydown',event=>{
    if(!orbitMode||exhibitionSurface||!exhibitionConfirm.hidden||document.getElementById('plan-view').hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(extrusion)endExtrusion();else{selectedFaces.clear();renderOrbit();}}
    if(event.key==='Enter'&&extrusion&&[extrudeHeight,orbitCanvas].includes(event.target)){event.preventDefault();event.stopImmediatePropagation();endExtrusion();}
  },true);
  let orbitScene=null,orbitPending=null,orbitGpu=null,orbitProject=null,orbitDepth=1,lodTolerance=.5,lodAnchor=1;
  let sceneLevels=new Map(),sceneLevelGeometry=null,sceneLevelRevision=-1,sceneLevelModel=-1;
  let orbitMatrix=null,orbitProjection='axonometric';
  const orbitOverlay=document.getElementById('orbit-overlay'),extrudeAxis=document.getElementById('extrude-axis');
  function getOrbitScene(){
    const g=currentPlan()?.outline;if(!g)return null;
    if(sceneLevelGeometry!==g||sceneLevelRevision!==sceneRevision||sceneLevelModel!==modelRevision){sceneLevels.clear();sceneLevelGeometry=g;sceneLevelRevision=sceneRevision;sceneLevelModel=modelRevision;}
    if(sceneLevels.has(lodTolerance)){orbitScene=sceneLevels.get(lodTolerance);return orbitScene;}
    const faces=displayFaces(),groups=extrusionGroups(),models=[],assigned=new Set();
    const curves=PlanCurves.primitives({...g,lines:g.lines.map(o=>({...o,construction:false})),shapes:g.shapes.map(o=>({...o,construction:false}))}),curveMap=new Map(curves.map(c=>[c.id,c]));
    const paths=[...g.lines.map((value,index)=>({kind:'line',value,index})),...g.shapes.map((value,index)=>({kind:'shape',value,index}))].filter(item=>PlanLayers.visible(g,item.value)).map(item=>{const curve=curveMap.get(item.value.id);return{item,points:curve?PlanCurves.polyline({curve,t0:0,t1:1},lodTolerance):itemPoints(item)};});
    const assets=currentPlan().backgroundVisible!==false?backgrounds():[],points=paths.flatMap(path=>path.points);for(const asset of assets)points.push(...itemPoints({kind:'background',value:asset}));
    const polygon=(rings,height,ids,color,alpha,edges,picks,normal={x:0,y:0,z:1})=>models.push({normal,rings:rings.map(ring=>ring.map(p=>({...p,height}))),ids,color,alpha,edges:edges?.map(e=>[{...e.a,height},{...e.b,height}]),picks});
    for(const group of groups){const members=faces.filter(face=>group.faceIds.includes(face.id));if(!members.length)continue;members.forEach(face=>assigned.add(face.id));const h=group.height/g.metersPerUnit,boundary=PlanExtrusions.displayBoundary(members,lodTolerance),rings=members.flatMap(face=>[face.points,...face.holes]),ids=members.map(face=>face.id);
      polygon(rings,h,ids,'#f5f5f5',1,boundary,members.map(face=>({faceId:face.id,rings:[face.points,...face.holes].map(ring=>ring.map(p=>({...p,height:h})))})),{x:0,y:0,z:Math.sign(h)||1});
      if(Math.abs(h)>1e-9){polygon(rings,0,ids,'#f5f5f5',1,boundary,members.map(face=>({faceId:face.id,rings:[face.points,...face.holes].map(ring=>ring.map(p=>({...p,height:0})))})),{x:0,y:0,z:-Math.sign(h)});
        for(const edge of boundary){const ring=[{...edge.a,height:0},{...edge.b,height:0},{...edge.b,height:h},{...edge.a,height:h}],edges=[[ring[0],ring[1]],[ring[2],ring[3]]];if(edge.start)edges.push([ring[3],ring[0]]);if(edge.end)edges.push([ring[1],ring[2]]);models.push({normal:{x:edge.b.y-edge.a.y,y:edge.a.x-edge.b.x,z:0},rings:[ring],ids,color:'#e0e0e0',alpha:1,edges,picks:[{faceId:edge.faceId,rings:[ring]}],side:true});}
      }
    }
    for(const [index,face]of faces.entries())if(!assigned.has(face.id))polygon([face.points,...face.holes],0,[face.id],faceColors[index%faceColors.length],.35,PlanExtrusions.displayBoundary([face],lodTolerance),[{faceId:face.id,rings:[face.points,...face.holes].map(ring=>ring.map(p=>({...p,height:0})))}]);
    const artworks=[],surfaces=Object.keys(currentPlan().exhibition?.surfaces||{}).length?PlanExhibition.walls(PlanExhibition.surfaces(g,faces),currentPlan().exhibition):[],library=getLibrary();
    for(const [surfaceId,layout]of Object.entries(currentPlan().exhibition?.surfaces||{})){
      const target=surfaces.find(s=>s.id===surfaceId);if(!target)continue;
      for(const item of layout.items){
        if(!PlanExhibition.fits(target,item))continue;const source=library.find(image=>image.id===item.imageId);if(!source&&item.kind!=='placeholder')continue;
        let photo=source&&exhibitionPhotos.get(source.id);if(source&&(!photo||photo.src!==source.url)){photo=new Image();photo.onload=()=>{sceneRevision++;renderOrbit();};photo.src=source.url;exhibitionPhotos.set(source.id,photo);}
        const rectangle=[[item.x,item.y+item.heightCm],[item.x+item.widthCm,item.y+item.heightCm],[item.x+item.widthCm,item.y],[item.x,item.y]],front=rectangle.map(([x,y])=>PlanExhibition.world(target,x,y,item.depthCm+.02)),back=rectangle.map(([x,y])=>PlanExhibition.world(target,x,y,.01));
        const quad=ring=>models.push({rings:[ring],ids:[],color:item.kind==='placeholder'?'#d9d9d9':'#b8b8b8',alpha:1,side:true,pickable:false,edges:ring.map((p,i)=>[p,ring[(i+1)%4]]),picks:[{faceId:null,rings:[ring]}]});
        quad(front);for(let i=0;i<4;i++)quad([back[i],back[(i+1)%4],front[(i+1)%4],front[i]]);
        if(source)artworks.push({id:`artwork:${item.id}`,photo,corners:rectangle.map(([x,y])=>PlanExhibition.world(target,x,y,item.depthCm+.04))});
      }
    }
    orbitScene={geometry:g,revision:sceneRevision,modelRevision,faces,models,paths,assets,points,images:[...assets.map(asset=>({id:asset.id,photo:surface.querySelector(`img[data-background-id="${asset.id}"]`),corners:itemPoints({kind:'background',value:asset})})),...artworks]};orbitScene.mesh=PlanMesh.build({...orbitScene,lighting:true});Plan3DStats.sceneBuilds++;sceneLevels.set(lodTolerance,orbitScene);if(sceneLevels.size>3)sceneLevels.delete(sceneLevels.keys().next().value);return orbitScene;
  }
  function renderSurfaces(project){
    const scene=getOrbitScene();syncSurfaceTools();extrudeAxis.hidden=true;
    let highlight=document.getElementById('exhibition-selected-planes');if(!highlight){highlight=svgElement('g',{id:'exhibition-selected-planes'});orbitOverlay.append(highlight);}highlight.replaceChildren();orbitCanvas.dataset.selectedWallPartCount=pendingWallParts.size;
    orbitOverlay.toggleAttribute('hidden',!orbitMode||(!exhibitionPicking&&!extrusion));
    if(exhibitionPicking){
      const candidates=exhibitionCandidates(),walls=exhibitionSurfaces(),hovered=candidates.find(part=>part.id===hoveredWallPart),hoveredWall=hovered&&walls.find(w=>w.sourceIds.includes(hovered.id));
      for(const part of candidates){
        const existing=walls.some(w=>w.sourceIds.includes(part.id)),selected=pendingWallParts.has(part.id),over=hoveredWall?hoveredWall.sourceIds.includes(part.id):part.id===hoveredWallPart;
        if(!selected&&!over)continue;
        const state=existing?(selected?'existing-selected':'existing-hover'):(selected?'candidate-selected':'candidate-hover'),stroke=existing?(selected?'#168bff':'#68baff'):'#55c879',fill=existing?(selected?'#168bff66':'#68baff38'):(selected?'#55c87955':'#55c87933');
        const d=part.rings.map(ring=>ring.map((p,i)=>{const q=project(PlanExhibition.world(part,p.x,p.y));return`${i?'L':'M'}${q.x},${q.y}`;}).join(' ')+'Z').join(' ');highlight.append(svgElement('path',{d,fill,stroke,'stroke-width':selected?3:2,'fill-rule':'evenodd','data-wall-state':state,'data-wall-part':part.id}));
      }
    }
    if(extrusion&&selectedFaces.size){
      const points=scene.faces.filter(face=>selectedFaces.has(face.id)).flatMap(face=>face.points),center={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length,height:extrusion.height/scene.geometry.metersPerUnit},p=project(center),q=project({...center,height:center.height+1});
      normalScreen={x:q.x-p.x,y:q.y-p.y};if(Math.hypot(normalScreen.x,normalScreen.y)<.01)normalScreen={x:0,y:-1};const length=Math.hypot(normalScreen.x,normalScreen.y),x=p.x+normalScreen.x/length*36,y=p.y+normalScreen.y/length*36;
      extrudeAxis.hidden=false;for(const [key,v]of Object.entries({x1:p.x,y1:p.y,x2:x,y2:y}))extrudeAxis.setAttribute(key,v);
      extrudeHandle.hidden=false;extrudeHandle.style.left=`${x}px`;extrudeHandle.style.top=`${y}px`;extrudeHandle.setAttribute('aria-valuenow',String(Number((extrusion.height*100).toFixed(2))));
    }
  }
  function pickSurface(point,detailed=false){
    if(!orbitMatrix||!orbitScene)return null;const ray=PlanExhibition.ray(orbitMatrix,point.x,point.y,board.clientWidth,board.clientHeight);return ray?PlanMesh.raycast(orbitScene.mesh,ray.origin,ray.direction,surfaceMode||exhibitionPicking,detailed):null;
  }
  function renderOrbitGizmo(){
    orbitGizmo.hidden=!orbitMode||!currentPlan();if(orbitGizmo.hidden)return;
    orbitGizmo.style.top=`${Math.max(document.querySelector('.plan-actions').getBoundingClientRect().bottom,document.querySelector('.plan-tabs-bar').getBoundingClientRect().bottom)-board.getBoundingClientRect().top+10}px`;
    const project=p=>{const q=PlanOrbit.rotate(p,orbitYaw,orbitPitch,orbitRoll);return{x:64+q.x*30,y:76+q.y*30,z:q.z};};
    const planes={xy:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:1,z:0},{x:0,y:1,z:0}],xz:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:0,z:1},{x:0,y:0,z:1}],yz:[{x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:1,z:1},{x:0,y:0,z:1}]};
    const group=document.getElementById('orbit-gizmo-planes');
    for(const track of orbitGizmo.querySelectorAll('[data-orbit-track]'))track.setAttribute('d',PlanOrbit.rotationArc(track.dataset.orbitTrack).map(project).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
    for(const control of orbitGizmo.querySelectorAll('[data-orbit-axis]')){const axis=control.dataset.orbitAxis,direction=Number(control.dataset.orbitDirection),points=PlanOrbit.rotationArrow(axis,direction).map(project),d=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');for(const path of control.querySelectorAll('path')){const end=points.at(-1);path.setAttribute('d',path.classList.contains('orbit-rotation-hit')?`M${end.x-.01},${end.y}L${end.x},${end.y}`:d);}control.querySelector('.orbit-rotation-head').setAttribute('points',PlanOrbit.rotationHead(axis,direction).map(project).map(p=>`${p.x},${p.y}`).join(' '));}
    for(const [name,points]of Object.entries(planes).sort((a,b)=>a[1].reduce((sum,p)=>sum+project(p).z,0)-b[1].reduce((sum,p)=>sum+project(p).z,0))){const polygon=group.querySelector(`[data-orbit-plane="${name}"]`);polygon.setAttribute('points',points.map(project).map(p=>`${p.x},${p.y}`).join(' '));group.append(polygon);}
    const face=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(project),defaultFace=document.getElementById('orbit-gizmo-default');defaultFace.querySelector('polygon').setAttribute('points',face.map(p=>`${p.x},${p.y}`).join(' '));const center={x:face.reduce((sum,p)=>sum+p.x,0)/3,y:face.reduce((sum,p)=>sum+p.y,0)/3};defaultFace.querySelector('path').setAttribute('transform',`translate(${center.x-27},${center.y-106})`);group.append(defaultFace);
    for(const [name,point]of [['x',{x:1.65,y:0,z:0}],['y',{x:0,y:1.65,z:0}],['z',{x:0,y:0,z:1.65}]]){const p=project(point),axis=document.getElementById(`orbit-axis-${name}`),label=document.getElementById(`orbit-axis-label-${name}`);axis.setAttribute('x2',p.x);axis.setAttribute('y2',p.y);label.setAttribute('x',p.x);label.setAttribute('y',p.y-7);}
    for(const control of orbitGizmo.querySelectorAll('[data-orbit-plane]')){const camera=PlanOrbit.plane(control.dataset.orbitPlane),active=Math.abs(Math.sin((orbitYaw-camera.yaw)/2))<1e-6&&Math.abs(Math.sin((orbitPitch-camera.pitch)/2))<1e-6&&Math.abs(Math.sin(orbitRoll/2))<1e-6;control.setAttribute('aria-pressed',String(active));}
  }
  function setOrbitPlane(name){const camera=PlanOrbit.plane(name);if(!camera)return;orbitYaw=camera.yaw;orbitPitch=camera.pitch;orbitRoll=0;renderOrbit();}
  for(const control of orbitGizmo.querySelectorAll('[data-orbit-plane]')){const action=()=>setOrbitPlane(control.dataset.orbitPlane);control.addEventListener('click',action);control.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();action();}});}
  document.getElementById('orbit-gizmo-home').addEventListener('click',()=>setOrbitPlane('default'));
  const defaultPlane=document.getElementById('orbit-gizmo-default');defaultPlane.addEventListener('click',()=>setOrbitPlane('default'));defaultPlane.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setOrbitPlane('default');}});
  let arrowDrag=null,suppressArrowClick=null;
  const applyOrbitCamera=camera=>{orbitYaw=camera.yaw;orbitPitch=camera.pitch;orbitRoll=camera.roll||0;renderOrbit();};
  document.getElementById('orbit-projection').addEventListener('change',event=>{orbitProjection=event.target.value;renderOrbit();});
  document.getElementById('orbit-step-axis').addEventListener('change',()=>renderOrbit());
  for(const [id,direction]of [['orbit-step-back',-1],['orbit-step-next',1]])document.getElementById(id).addEventListener('click',()=>{const axis=document.getElementById('orbit-step-axis').value,camera={yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll};camera[axis]=PlanExhibition.step(camera[axis],direction);applyOrbitCamera(camera);});
  for(const control of orbitGizmo.querySelectorAll('[data-orbit-axis]')){
    const axis=control.dataset.orbitAxis,direction=Number(control.dataset.orbitDirection),step=sign=>applyOrbitCamera(PlanOrbit.turn({yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll},axis,sign*Math.PI/12));
    control.addEventListener('click',()=>{if(suppressArrowClick===control){suppressArrowClick=null;return;}step(direction);});
    control.addEventListener('keydown',event=>{if(['Enter',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();step(['ArrowLeft','ArrowDown'].includes(event.key)?-1:['ArrowRight','ArrowUp'].includes(event.key)?1:direction);}});
    control.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();suppressArrowClick=null;arrowDrag={control,x:event.clientX,y:event.clientY,camera:{yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll},moved:false};control.setPointerCapture(event.pointerId);});
    control.addEventListener('pointermove',event=>{if(!arrowDrag||arrowDrag.control!==control)return;const dx=event.clientX-arrowDrag.x,dy=event.clientY-arrowDrag.y;if(Math.hypot(dx,dy)>3)arrowDrag.moved=true;if(arrowDrag.moved)applyOrbitCamera(PlanOrbit.turn(arrowDrag.camera,axis,direction*(dx-dy)*.012));});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])control.addEventListener(type,()=>{if(!arrowDrag||arrowDrag.control!==control)return;const drag=arrowDrag;arrowDrag=null;suppressArrowClick=drag.moved?control:null;if(type==='pointercancel')applyOrbitCamera(drag.camera);});
  }
  function syncZoomControls(){
    const value=orbitMode?orbitView.zoom:zoom;
    document.getElementById('plan-zoom-label').textContent=Math.round(value*100)+'%';
    document.getElementById('plan-zoom-in').disabled=value>=16;document.getElementById('plan-zoom-out').disabled=value<=(orbitMode ? .1 : .25);
    document.getElementById('plan-zoom-reset').setAttribute('aria-label',orbitMode?'Dopasuj scenę 3D':'Dopasuj rzut 2D');
  }
  function zoomOrbit(value,point){
    if(!currentPlan()||!orbitFrame)return;const next=Math.max(.1,Math.min(16,value)),factor=next/orbitView.zoom;
    const x=(point?.x??orbitFrame.x)-orbitFrame.x,y=(point?.y??orbitFrame.y)-orbitFrame.y;
    orbitView.panX=x+(orbitView.panX-x)*factor;orbitView.panY=y+(orbitView.panY-y)*factor;orbitView.zoom=next;syncZoomControls();renderOrbit();
  }
  function fitOrbit(){orbitView={scale:null,zoom:1,panX:0,panY:0,center:null};syncZoomControls();renderOrbit();}
  function updateOrbitLod(){const scale=(orbitView.scale||1)*orbitView.zoom;if(scale>lodAnchor*1.7||scale<lodAnchor/1.7){lodAnchor=2**Math.round(Math.log2(Math.max(.0001,scale)));lodTolerance=.5/lodAnchor;return true;}return false;}
  function renderOrbit(){updateOrbitLod();if(orbitPending!==null)return;orbitPending=requestAnimationFrame(()=>{orbitPending=null;drawOrbitFrame();rememberOrbitViewport();});}
  function drawOrbitFrame(){
    const frameStart=performance.now();syncSurfaceTools();syncZoomControls();renderOrbitGizmo();orbitOverlay.toggleAttribute('hidden',!orbitMode);
    orbitCanvas.hidden=!orbitMode||!currentPlan();if(orbitCanvas.hidden)return;
    const geometry=outline(),width=board.clientWidth,height=board.clientHeight;if(!width||!height)return;
    const dpr=devicePixelRatio||1,pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);if(orbitCanvas.width!==pixelWidth)orbitCanvas.width=pixelWidth;if(orbitCanvas.height!==pixelHeight)orbitCanvas.height=pixelHeight;if(!orbitGpu){try{orbitGpu=PlanGpu.create(orbitCanvas,()=>renderOrbit(),()=>notify('Utracono kontekst 3D. Projekt jest zachowany; mo?esz wr?ci? do edycji 2D.'));}catch(error){console.error(error);}if(!orbitGpu){notify('Widok 3D wymaga WebGL 2. Projekt i edycja 2D pozostaj? dost?pne.');orbitMode=false;document.getElementById('plan-view').classList.remove('orbit-mode');orbitCanvas.hidden=true;orbitGizmo.hidden=true;orbitOverlay.setAttribute('hidden','');orbitButton.setAttribute('aria-pressed','false');orbitButton.setAttribute('aria-label','Widok 3D');orbitButton.title='Otw?rz widok 3D';syncSurfaceTools();return;}}
    const dark=document.documentElement.dataset.theme==='dark';
    const scene=getOrbitScene(),paths=scene.paths,assets=scene.assets,points=scene.points;
    if(!points.length){orbitGpu.draw(scene.mesh,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),selectedFaces,surfaceMode||exhibitionPicking,dark);return;}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),center={x:(minX+maxX)/2,y:(minY+maxY)/2};
    const top=Math.max(document.querySelector('.plan-actions').getBoundingClientRect().bottom,document.querySelector('.plan-tabs-bar').getBoundingClientRect().bottom)-board.getBoundingClientRect().top+20,available=Math.max(40,height-top-30);
    const fitting=orbitView.scale===null;if(fitting){orbitView.center=center;orbitView.scale=Math.min(width-60,available)/Math.max(1,Math.hypot(maxX-minX,maxY-minY));}
    let scale=orbitView.scale*orbitView.zoom,offsetX=orbitView.panX,offsetY=orbitView.panY;orbitFrame={x:width/2,y:top+available/2};
    const support=currentPlan().planes.find(plane=>plane.id===geometry.planeId);
    const perspective=orbitProjection==='perspective',distance=Math.max(1,Math.hypot(maxX-minX,maxY-minY),Math.abs(scene.mesh.bounds.max[2]-scene.mesh.bounds.min[2]))*6;
    const affine=point=>{const world=PlanSketch.world(support,{x:point.x-orbitView.center.x,y:point.y-orbitView.center.y}),height=point.height||0,n=support.normal||{x:0,y:0,z:1};const rotated=PlanOrbit.rotate({x:world.x+n.x*height,y:world.y+n.y*height,z:world.z+n.z*height},orbitYaw,orbitPitch,orbitRoll);return{x:width/2+rotated.x*scale+offsetX,y:top+available/2+rotated.y*scale+offsetY,z:rotated.z};};
    const project=point=>{const q=affine(point);if(!perspective)return q;const factor=distance/(distance-q.z),cx=width/2+offsetX,cy=top+available/2+offsetY;return{x:cx+(q.x-cx)*factor,y:cy+(q.y-cy)*factor,z:q.z};};
    const elevated=fitting?scene.models.flatMap(model=>model.rings.flat()):[];
    if(fitting&&elevated.length){
      const samples=[...points,...elevated],bounds=()=>{const p=samples.map(project);return{left:Math.min(...p.map(p=>p.x)),right:Math.max(...p.map(p=>p.x)),top:Math.min(...p.map(p=>p.y)),bottom:Math.max(...p.map(p=>p.y))};};let box=bounds();
      scale*=Math.min(1,(width-60)/Math.max(1,box.right-box.left),available/Math.max(1,box.bottom-box.top));box=bounds();
      offsetX=box.left<30?30-box.left:box.right>width-30?width-30-box.right:0;offsetY=box.top<top?top-box.top:box.bottom>height-30?height-30-box.bottom:0;
    }
    if(fitting){orbitView.scale=scale;orbitView.panX=offsetX;orbitView.panY=offsetY;if(updateOrbitLod())renderOrbit();}
    orbitProject=project;const p=affine({x:0,y:0}),basis=[affine({x:1,y:0}),affine({x:0,y:1}),affine({x:0,y:0,height:1})],bounds=scene.mesh.bounds;orbitDepth=1;
    for(let i=0;i<8;i++){const q=project({x:bounds[i&1?'max':'min'][0],y:bounds[i&2?'max':'min'][1],height:bounds[i&4?'max':'min'][2]});orbitDepth=Math.max(orbitDepth,Math.abs(q.z)*1.1);}
    const matrix=new Float32Array(16);basis.forEach((q,i)=>{matrix[i*4]=2*(q.x-p.x)/width;matrix[i*4+1]=-2*(q.y-p.y)/height;matrix[i*4+2]=-(q.z-p.z)/orbitDepth;});matrix[12]=2*p.x/width-1;matrix[13]=1-2*p.y/height;matrix[14]=-p.z/orbitDepth;matrix[15]=1;
    if(perspective){
      const near=Math.max(.001,distance-orbitDepth*1.1),far=distance+orbitDepth*1.1,A=(far+near)/(far-near),B=-2*far*near/(far-near),cx=2*(width/2+offsetX)/width-1,cy=1-2*(top+available/2+offsetY)/height,z=[...basis.map(q=>q.z-p.z),p.z];
      for(let i=0;i<4;i++){matrix[i*4]-=cx*z[i]/distance;matrix[i*4+1]-=cy*z[i]/distance;matrix[i*4+2]=-A*z[i]/distance+(i===3?A+B/distance:0);matrix[i*4+3]=(i===3?1:0)-z[i]/distance;}
    }
    orbitMatrix=matrix;document.getElementById('orbit-step-angle').textContent=Number(({yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll}[document.getElementById('orbit-step-axis').value]*180/Math.PI).toFixed(1))+'\u00b0';
    orbitGpu.draw(scene.mesh,matrix,selectedFaces,surfaceMode||exhibitionPicking,dark,scene.images);renderSurfaces(project);Plan3DStats.frames++;Plan3DStats.cpuSamples.push(performance.now()-frameStart);if(Plan3DStats.cpuSamples.length>600)Plan3DStats.cpuSamples.shift();
  }
  function setOrbitMode(value){if(!currentPlan()||orbitMode===value)return;endExtrusion();escapeToSelection();orbitMode=value;syncSurfaceTools();orbitCanvas.hidden=!orbitMode;orbitGizmo.hidden=!orbitMode;document.getElementById('plan-view').classList.toggle('orbit-mode',orbitMode);orbitButton.setAttribute('aria-pressed',String(orbitMode));orbitButton.setAttribute('aria-label','Widok 3D');orbitButton.title='Widok 3D';syncZoomControls();drawLines();}
  orbitButton.addEventListener('click',()=>{if(exhibitionSurface)closeExhibition();setOrbitMode(true);exhibitionPicking=false;clearWallSelection();syncWorkspace('model');});
  document.getElementById('view-mode-2d').addEventListener('click',()=>{if(exhibitionSurface)closeExhibition();exhibitionPicking=false;clearWallSelection();setOrbitMode(false);syncWorkspace('sketch');});
  orbitCanvas.addEventListener('dblclick',event=>{if(!orbitMode||extrusion||surfaceMode)return;const r=orbitCanvas.getBoundingClientRect(),hit=pickSurface({x:event.clientX-r.left,y:event.clientY-r.top},true);if(!hit)return;const candidate=exhibitionCandidates().find(surface=>{const p=PlanExhibition.local(surface,hit.point);return Math.abs(p.distance)<.01&&PlanExhibition.contains(surface,p);});const wall=candidate&&exhibitionSurfaces().find(w=>w.sourceIds.includes(candidate.id));if(wall){event.preventDefault();openExhibition(wall);}});
  orbitCanvas.addEventListener('pointerdown',event=>{if(![0,1].includes(event.button))return;event.preventDefault();orbitCanvas.focus();orbitDrag={x:event.clientX,y:event.clientY,yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll,moved:false,pan:event.button===1||orbitSpaceDown,panX:orbitView.panX,panY:orbitView.panY};orbitCanvas.setPointerCapture(event.pointerId);orbitCanvas.style.cursor=orbitDrag.pan?'grabbing':'move';});
  orbitCanvas.addEventListener('pointermove',event=>{if(!orbitDrag)return;const dx=event.clientX-orbitDrag.x,dy=event.clientY-orbitDrag.y;if(Math.hypot(dx,dy)>3)orbitDrag.moved=true;if(!orbitDrag.moved)return;if(orbitDrag.pan){orbitView.panX=orbitDrag.panX+dx;orbitView.panY=orbitDrag.panY+dy;}else{const camera=PlanOrbit.drag(orbitDrag,dx,dy);orbitYaw=camera.yaw;orbitPitch=camera.pitch;orbitRoll=camera.roll;}renderOrbit();});
  orbitCanvas.addEventListener('pointermove',event=>{if(!exhibitionPicking||orbitDrag){hideWallHoverName();return;}const r=orbitCanvas.getBoundingClientRect(),id=wallPartAt({x:event.clientX-r.left,y:event.clientY-r.top})?.id||null;if(id!==hoveredWallPart){hoveredWallPart=id;if(orbitProject)renderSurfaces(orbitProject);}showWallHoverName(id,event);orbitCanvas.style.cursor=id?'pointer':'move';});
  for(const type of ['pointerdown','pointerleave','pointercancel','blur','wheel'])orbitCanvas.addEventListener(type,hideWallHoverName);
  orbitCanvas.addEventListener('pointerleave',()=>{if(hoveredWallPart){hoveredWallPart=null;if(orbitProject)renderSurfaces(orbitProject);}});
  orbitCanvas.addEventListener('keydown',event=>{if(event.code==='Space'){event.preventDefault();orbitSpaceDown=true;if(!orbitDrag)orbitCanvas.style.cursor='grab';}});
  orbitCanvas.addEventListener('keyup',event=>{if(event.code==='Space'){orbitSpaceDown=false;if(!orbitDrag)orbitCanvas.style.cursor='move';}});
  orbitCanvas.addEventListener('blur',()=>{orbitSpaceDown=false;orbitDrag=null;orbitCanvas.style.cursor='move';});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])orbitCanvas.addEventListener(type,event=>{
    const drag=orbitDrag;orbitDrag=null;orbitCanvas.style.cursor=orbitSpaceDown?'grab':'move';
    if(type==='pointerup'&&drag&&!drag.pan&&!drag.moved){const r=orbitCanvas.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};if(exhibitionPicking)requestExhibition(point,event);else if(surfaceMode)chooseSurface(pickSurface(point),event);}
  });
  let drawing=false,start=null,hover=null;
  let drawingTool='line',arcVia=null,arcMethod='three',circleMethod='radius',bindingMethod=null,tangentStart=null,circlePicks=[];
  const sketchInput=document.getElementById('sketch-input'),sketchInputValue=document.getElementById('sketch-input-value');
  function sketchParameter(){const value=Number(sketchInputValue.value);return sketchInputValue.value!==''&&Number.isFinite(value)&&value!==0?(arcMethod==='angle'&&drawingTool==='arc'?value*Math.PI/180:value/100/outline().metersPerUnit):null;}
  function roundShape(point){return PlanSketchTools.circle(circleMethod,[start,arcVia||point,arcVia?point:null],['radius','diameter'].includes(circleMethod)?sketchParameter():null);}
  function updateSketchPrompt(){
    status.dataset.sketchPrompt=String(!!currentPlan()&&['arc','circle'].includes(drawingTool)&&!!drawing);
    if(!currentPlan()||!['arc','circle'].includes(drawingTool)||!drawing){sketchInput.hidden=true;return;}
    const arcPrompts={three:['Wskaż początek łuku','Wskaż punkt na łuku','Wskaż koniec łuku'],ends:['Wskaż początek łuku','Wskaż koniec łuku','Wskaż punkt na łuku'],center:['Wskaż środek łuku','Wskaż początek łuku','Wskaż koniec łuku'],startCenter:['Wskaż początek łuku','Wskaż środek łuku','Wskaż koniec łuku'],bezier:['Wskaż początek krzywej','Wskaż koniec krzywej','Wskaż uchwyt krzywej'],tangent:['Wskaż koniec istniejącej linii lub krzywej','Wskaż koniec łuku stycznego'],radius:['Wskaż początek łuku','Wskaż koniec łuku','Podaj promień w cm i zatwierdź'],angle:['Wskaż środek łuku','Wskaż początek łuku','Podaj kąt w stopniach i zatwierdź']};
    const circlePrompts={radius:['Wskaż środek okręgu','Wskaż punkt na obwodzie lub podaj promień'],diameter:['Wskaż środek okręgu','Wskaż długość średnicy lub wpisz wartość'],two:['Wskaż pierwszy koniec średnicy','Wskaż drugi koniec średnicy'],three:['Wskaż pierwszy punkt okręgu','Wskaż drugi punkt okręgu','Wskaż trzeci punkt okręgu'],ttr:['Wskaż pierwszą prostą','Wskaż drugą prostą','Podaj promień w cm i zatwierdź'],tangent3:['Wskaż pierwszą prostą','Wskaż drugą prostą','Wskaż trzecią prostą']};
    const stage=drawingTool==='circle'&&['ttr','tangent3'].includes(circleMethod)?circlePicks.length:!start?0:arcVia?2:1;
    status.textContent=(drawingTool==='arc'?arcPrompts[arcMethod]:circlePrompts[circleMethod])[stage]+' · Esc kończy polecenie';
    const numeric=drawingTool==='circle'?(start&&['radius','diameter'].includes(circleMethod)||circleMethod==='ttr'&&circlePicks.length===2):arcVia&&['radius','angle'].includes(arcMethod);
    sketchInput.hidden=!numeric;document.getElementById('sketch-input-label').textContent=drawingTool==='arc'&&arcMethod==='angle'?'Kąt (°)':drawingTool==='circle'&&circleMethod==='diameter'?'Średnica (cm)':'Promień (cm)';
  }
  function commitSketchShape(shape){
    if(!shape){notify('Nie można utworzyć figury z tych danych. Wskaż inne punkty lub popraw wartość.');return false;}
    const geometry=outline(),layer=geometry.layers.find(layer=>layer.id===geometry.activeLayerId);if(!layer||layer.locked||layer.visible===false){notify('Aktywna warstwa musi być widoczna i odblokowana.');return false;}
    shape.id??=PlanTopology.uid();geometry.shapes??=[];geometry.shapes.push(shape);stampNewGeometry(geometry);
    if(precision().infer){
      if(drawingTool==='arc'&&arcMethod==='tangent'&&tangentStart?.objectId)geometry.relations.push({id:PlanTopology.uid(),type:'tangent',objects:[tangentStart.objectId,shape.id],keyA:tangentStart.key,keyB:'a'});
      if(drawingTool==='circle'&&['ttr','tangent3'].includes(circleMethod))for(const pick of circlePicks)geometry.relations.push({id:PlanTopology.uid(),type:'tangent',objects:[pick.line.id,shape.id]});
    }
    start=arcVia=hover=tangentStart=null;circlePicks=[];sketchInputValue.value='';drawLines();save(snapshot());return true;
  }
  sketchInput.addEventListener('submit',event=>{event.preventDefault();const value=sketchParameter();if(value==null||value<=0&&!(drawingTool==='arc'&&arcMethod==='angle'))return;
    const shape=drawingTool==='circle'?(circleMethod==='ttr'?PlanSketchTools.tangentCircle(circlePicks.map(p=>p.line),circlePicks.map(p=>p.point),value):PlanSketchTools.circle(circleMethod,[start],value)):arcMethod==='radius'?PlanSketchTools.radiusArc(start,arcVia,value):PlanSketchTools.centerArc(start,arcVia,null,value);
    if(commitSketchShape(shape))canvas.focus();
  });
  sketchInputValue.addEventListener('input',()=>drawLines());
  sketchInput.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();escapeToSelection();canvas.focus();}});
  function showToolOptions(id,button){
    const menu=document.getElementById(id),rect=(button.closest('.cad-tool-split')||button).getBoundingClientRect();
    menu.style.maxHeight=`${Math.max(100,Math.min(innerHeight*.65,innerHeight-rect.bottom-13))}px`;menu.style.overflowY='auto';
    menu.showPopover();menu.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-menu.getBoundingClientRect().width-8))}px`;menu.style.top=`${rect.bottom+5}px`;
  }
  function arcFromPoints(first,second,third){
    if(arcMethod==='tangent')return PlanSketchTools.tangentArc(first,third||second,tangentStart);
    if(arcMethod==='startCenter')return PlanSketchTools.centerArc(second,first,third);
    if(arcMethod==='radius')return PlanSketchTools.radiusArc(first,second,sketchParameter());
    if(arcMethod==='angle')return PlanSketchTools.centerArc(first,second,third,sketchParameter());
    if(arcMethod==='bezier')return {type:'bezier',a:first,b:second,via:{...third,nodeId:PlanTopology.uid()}};
    if(arcMethod==='three')return {type:'arc',a:first,via:{...second,nodeId:PlanTopology.uid()},b:third};
    if(arcMethod==='ends')return {type:'arc',a:first,via:{...third,nodeId:PlanTopology.uid()},b:second};
    const radius=Math.hypot(second.x-first.x,second.y-first.y),endRadius=Math.hypot(third.x-first.x,third.y-first.y);
    if(radius<1e-6||endRadius<1e-6)return null;
    const angle=Math.atan2(second.y-first.y,second.x-first.x),end=Math.atan2(third.y-first.y,third.x-first.x),delta=((end-angle+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    const b={x:first.x+radius*Math.cos(end),y:first.y+radius*Math.sin(end)};b.nodeId=Math.hypot(b.x-third.x,b.y-third.y)<1e-6?third.nodeId:PlanTopology.uid();
    return {type:'arc',a:second,via:{x:first.x+radius*Math.cos(angle+delta/2),y:first.y+radius*Math.sin(angle+delta/2)},b};
  }
  let polylineStart=null,polylineId=null;
  let hoveredItem=null,angleFirst=null,relationType=null,relationPicks=[],editMode=null,editFirst=null;
  let dimensionHits=[],dimensionDrag=null,dimensionMode='aligned',dimensionFirst=null;
  let editedDimension=null,selectedMeasurement=null;
  const sameMeasurement=(a,b)=>Boolean(a&&b&&(a.dimensionId||a.annotationId||a.shapeId||a.lineId)===(b.dimensionId||b.annotationId||b.shapeId||b.lineId)&&a.kind===b.kind);
  function removeMeasurement(hit){
    const geometry=outline(),target=dimensionTarget(hit);if(!target)return;
    const ids=target.objects||[hit.lineId||hit.shapeId,hit.referenceId].filter(Boolean);if([...geometry.lines,...geometry.shapes].some(object=>ids.includes(object.id)&&PlanLayers.locked(geometry,object)))return;
    if(hit.dimensionId){geometry.dimensions=geometry.dimensions.filter(item=>item.id!==hit.dimensionId);geometry.relations=geometry.relations.filter(item=>item.dimensionId!==hit.dimensionId);}
    else if(hit.annotationId){geometry.angles=geometry.angles.filter(item=>item.id!==hit.annotationId);const line=geometry.lines.find(item=>item.id===hit.lineId);if(line?.fixedAngle?.referenceId===hit.referenceId)line.fixedAngle=null;}
    else if(hit.shapeId){target.hideDimension=true;delete target.dimensionType;target.fixedRadius=null;}
    else{target.showLength=false;target.fixedLength=null;target.fixedDeltaX=null;target.fixedDeltaY=null;}
    selectedMeasurement=null;selectedDetail=null;updateProperties();drawLines();save(snapshot());
  }
  function dimensionTarget(hit){return hit.dimensionId?outline().dimensions.find(item=>item.id===hit.dimensionId):hit.shapeId?outline().shapes.find(item=>item.id===hit.shapeId):hit.annotationId?(outline().angles||[]).find(item=>item.id===hit.annotationId):outline().lines.find(item=>item.id===hit.lineId);}
  function restoreDimensionDrag(drag){const target=dimensionTarget(drag.hit);if(!target)return;if(drag.before===undefined)delete target[drag.field];else target[drag.field]=structuredClone(drag.before);}
  function editMeasurement(hit){
    const dimension=hit.dimensionId?dimensionTarget(hit):null,id=hit.shapeId||hit.lineId||dimension?.objects[0],item=allItems().find(item=>item.value.id===id);if(!item)return;
    selectedItems=new Set([item.key]);syncSelection();
    const rows=[...document.querySelectorAll('#selection-measurements .measurement-row')],row=rows.find(row=>hit.kind==='angle'?row.textContent.includes('Kąt'):hit.shapeId?row.textContent.includes('Promień'):hit.dimensionId?row.textContent.includes('Odległość'):!row.textContent.includes('Kąt'));
    row?.querySelector('button')?.click();
    selectedMeasurement={...hit};selectedDetail={button:row?.querySelector('button'),release:()=>removeMeasurement(hit)};canvas.focus();drawLines();
  }
  document.getElementById('dimension-properties').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const geometry=outline(),dimension=geometry.dimensions.find(item=>item.id===editedDimension);if(!dimension)return;
    if(dimension.type!=='distance'){form.hidePopover();return;}
    const before=structuredClone(geometry),existing=geometry.relations.find(item=>item.dimensionId===dimension.id);geometry.relations=geometry.relations.filter(item=>item.dimensionId!==dimension.id);
    geometry.relations.push({id:existing?.id||PlanTopology.uid(),type:'parallel',objects:dimension.objects,dimensionId:dimension.id},{id:PlanTopology.uid(),type:'distance',objects:dimension.objects,value:Number(form.elements.distance.value),dimensionId:dimension.id});
    if(!moveNodes([])){currentPlan().outline=before;notify('Odległość koliduje z istniejącymi wiązaniami.');return;}if(!form.elements.fixed.checked)geometry.relations=geometry.relations.filter(item=>item.dimensionId!==dimension.id);save(snapshot());drawLines();form.hidePopover();
  });
  document.getElementById('dimension-delete').addEventListener('click',()=>{const geometry=outline();geometry.dimensions=geometry.dimensions.filter(item=>item.id!==editedDimension);geometry.relations=geometry.relations.filter(item=>item.dimensionId!==editedDimension);document.getElementById('dimension-properties').hidePopover();drawLines();save(snapshot());});
  const measureButtons=[...document.querySelectorAll('[data-plan-measure]')];
  const shapeButtons=[...document.querySelectorAll('[data-plan-shape]')];
  function arcGeometry(a,via,b){
    const ux=via.x-a.x,uy=via.y-a.y,vx=b.x-a.x,vy=b.y-a.y,d=2*(ux*vy-uy*vx);
    if(Math.abs(d)<1e-7*Math.max(1,Math.hypot(ux,uy)*Math.hypot(vx,vy)))return null;
    const u2=ux*ux+uy*uy,v2=vx*vx+vy*vy,cx=a.x+(vy*u2-uy*v2)/d,cy=a.y+(ux*v2-vx*u2)/d;
    const angle=p=>Math.atan2(p.y-cy,p.x-cx),normalize=value=>(value%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    return {cx,cy,radius:Math.hypot(a.x-cx,a.y-cy),startAngle:angle(a),endAngle:angle(b),anticlockwise:normalize(angle(via)-angle(a))>normalize(angle(b)-angle(a))};
  }
  let selectedLine=-1,lineDrag=null,arcDrag=null,propertyEditorOpen=false;
  let selectedItems=new Set(),marquee=null,groupDrag=null,selectedVertex=null,vertexDrag=null;
  let selectedDetail=null;
  function selectDetail(button,release){
    document.querySelectorAll('.plan-inspector .detail-selected').forEach(item=>item.classList.remove('detail-selected'));
    button.classList.add('detail-selected');selectedDetail={button,release};button.focus();
  }
  document.addEventListener('keydown',event=>{
    if(!selectedDetail||!['Delete','Backspace'].includes(event.key)||event.target.matches('input,textarea,select'))return;
    event.preventDefault();event.stopImmediatePropagation();const detail=selectedDetail;selectedDetail=null;detail.release?.();
  },true);
  const selectionActions=document.getElementById('plan-selection-actions');
  function allItems(){
    const geometry=outline();return [...(geometry?.lines||[]).map((value,index)=>({key:`line:${index}`,kind:'line',value,index})),...(geometry?.shapes||[]).map((value,index)=>({key:`shape:${index}`,kind:'shape',value,index})),...(currentPlan()?.backgroundVisible!==false?backgrounds():[]).map((value,index)=>({key:`background:${value.id}`,kind:'background',value,index}))].filter(item=>item.kind==='background'||PlanLayers.visible(geometry,item.value)&&!PlanLayers.locked(geometry,item.value));
  }
  function chosenItems(){return allItems().filter(item=>selectedItems.has(item.key));}
  function syncSelection(rebuild=true){
    selectedVertex=null;
    selectedMeasurement=null;
    selectedDetail=null;
    propertyEditorOpen=false;
    const items=chosenItems();selectedLine=items.length===1&&items[0].kind==='line'?items[0].index:-1;updateProperties(rebuild);drawLines();
  }
  function renderMeasurements(){
    const panel=document.getElementById('plan-measurements'),list=document.getElementById('selection-measurements');
    if(list.querySelector('input'))return;
    list.replaceChildren();
    const geometry=outline();if(!geometry){panel.hidden=true;return;}
    const settings=precision(),factor=settings.dimensionUnit==='m'?1:settings.dimensionUnit==='mm'?1000:100,unit=settings.dimensionUnit;
    const add=(label,value,suffix,commit,disabled=false)=>{
      const row=document.createElement('div');row.className='measurement-row';
      const name=document.createElement('span');name.textContent=label;
      const button=document.createElement('button');button.type='button';button.textContent=`${Number(value.toFixed(suffix==='°'?3:settings.dimensionPrecision)).toLocaleString('pl-PL')} ${suffix}`;
      button.title=commit?'Kliknij dwukrotnie, aby edytować':'Pomiar';button.disabled=disabled;row.append(name,button);list.append(row);
      button.addEventListener('click',()=>selectDetail(button,null));
      if(commit)button.addEventListener('dblclick',()=>{
        const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.value=String(Number(value.toFixed(6))).replace('.',',');input.setAttribute('aria-label',label);button.replaceWith(input);input.focus();input.select();let finished=false;
        const finish=saveValue=>{if(finished)return;finished=true;const text=input.value.trim(),next=Number(text.replace(',','.'));input.replaceWith(button);if(saveValue&&text&&Number.isFinite(next)&&(suffix==='°'||next>0)&&Math.abs(next-value)>1e-6)commit(next);updateProperties();drawLines();};
        input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}});
        input.addEventListener('blur',()=>finish(true));
      });
    };
    for(const item of chosenItems().filter(item=>item.kind!=='background')){
      const value=item.value,prefix=chosenItems().length>1?`${item.kind==='line'?'Linia':'Krzywa'} ${item.index+1} · `:'';
      if(item.kind==='line'){
        const mode=value.dimensionType||'aligned',size=mode==='horizontal'?Math.abs(value.b.x-value.a.x):mode==='vertical'?Math.abs(value.b.y-value.a.y):distance(value.a,value.b);
        const commitLine=(field,next,referenceId)=>{
          selectedItems=new Set([item.key]);selectedLine=item.index;updateProperties(true);
          referenceInput.value=referenceId?String(geometry.lines.findIndex(line=>line.id===referenceId)):'';updateProperties();
          const input=field==='length'?lengthInput:angleInput;input.value=next;lineDirty.add(field);(field==='length'?fixLength:fixAngle).checked=true;if(field==='angle')directionBinding.value='none';properties.requestSubmit();
        };
        if(value.showLength||value.fixedLength||value.fixedDeltaX!=null||value.fixedDeltaY!=null)add(prefix+(mode==='horizontal'?'Poziomo':mode==='vertical'?'Pionowo':'Długość'),size*geometry.metersPerUnit*factor,unit,next=>{if(next>0)commitLine('length',next/factor);},value.locked||value.fixed);
        const binding=value.fixedAngle,ref=binding?.referenceId?geometry.lines.find(line=>line.id===binding.referenceId):null,frame=axes(value,ref);
        let degrees=-(Math.atan2(frame.moving.y-frame.anchor.y,frame.moving.x-frame.anchor.x)-frame.direction)*180/Math.PI;degrees=((degrees+180)%360+360)%360-180;
        if(binding||value.directionBinding)add(prefix+(ref?'Kąt między liniami':'Kąt do poziomu'),degrees,'°',next=>commitLine('angle',next,ref?.id),value.locked||value.fixed);
        for(const annotation of geometry.angles||[])if((annotation.a===value.id||annotation.b===value.id)&&!ref){
          const other=geometry.lines.find(line=>line.id===(annotation.a===value.id?annotation.b:annotation.a));if(!other)continue;const frame=axes(value,other);let angle=-(Math.atan2(frame.moving.y-frame.anchor.y,frame.moving.x-frame.anchor.x)-frame.direction)*180/Math.PI;angle=((angle+180)%360+360)%360-180;
          add(prefix+'Kąt między liniami',angle,'°',next=>commitLine('angle',next,other.id),value.locked||value.fixed);
        }
      }else if(['arc','circle'].includes(value.type)){
        const circle=value.type==='circle'?{cx:value.center.x,cy:value.center.y,radius:value.radius}:arcGeometry(value.a,value.via,value.b);if(!circle)continue;
        if(value.dimensionType||value.fixedRadius)add(prefix+'Promień',circle.radius*geometry.metersPerUnit*factor,unit,next=>{
          if(next<=0)return;const before=structuredClone(geometry),radius=next/(factor*geometry.metersPerUnit),ratio=radius/circle.radius;
          value.fixedRadius=next/factor;const changes=[];
          if(value.type==='circle')value.radius=radius;else for(const key of ['a','via','b'])changes.push({from:{...value[key]},to:{x:circle.cx+(value[key].x-circle.cx)*ratio,y:circle.cy+(value[key].y-circle.cy)*ratio}});
          if(!moveNodes(changes)){currentPlan().outline=before;notify('Promień koliduje z wiązaniami.');}else save(snapshot());
        },value.locked||value.fixed);
        if(value.type==='arc'&&value.dimensionType==='arcLength')add(prefix+'Długość łuku',PlanDimensions.arcLength(value)*geometry.metersPerUnit*factor,unit);
      }
    }
    const selectedIds=new Set(chosenItems().map(item=>item.value.id));
    for(const dimension of geometry.dimensions||[])if(dimension.objects.some(id=>selectedIds.has(id))){
      const measured=PlanDimensions.line(geometry,dimension);if(!measured)continue;
      add('Odległość',distance(measured.a,measured.b)*geometry.metersPerUnit*factor,unit,dimension.type==='distance'?next=>{
        if(next<=0)return;const before=structuredClone(geometry);geometry.relations=geometry.relations.filter(relation=>relation.dimensionId!==dimension.id);geometry.relations.push({id:PlanTopology.uid(),type:'parallel',objects:dimension.objects,dimensionId:dimension.id},{id:PlanTopology.uid(),type:'distance',objects:dimension.objects,value:next/factor,dimensionId:dimension.id});
        if(!moveNodes([])){currentPlan().outline=before;notify('Odległość koliduje z wiązaniami.');}else save(snapshot());
      }:null);
    }
    panel.hidden=!list.childElementCount;
    const top=Math.max(document.querySelector('.plan-actions').getBoundingClientRect().bottom,document.querySelector('.plan-tabs-bar').getBoundingClientRect().bottom)-board.getBoundingClientRect().top+12;
    for(const inspector of document.querySelectorAll('.plan-inspector')){const offset=top+(inspector.id==='plan-constraints-panel'?40:0);inspector.style.top=`${offset}px`;inspector.style.maxHeight=`calc(100% - ${offset+70}px)`;}
  }
  function updateSelectionActions(){
    const items=chosenItems();selectionActions.hidden=!items.length;
    document.getElementById('selection-more').hidden=!items.length;
    document.getElementById('plan-selection-count').textContent=`Zaznaczono: ${items.length}`;
    document.getElementById('selection-lock').disabled=items.every(item=>item.value.locked);
    document.getElementById('selection-unlock').disabled=items.every(item=>!item.value.locked);
    document.getElementById('selection-delete').disabled=items.every(item=>item.value.locked);
    document.getElementById('selection-detach').disabled=!items.some(item=>item.kind!=='background'&&!item.value.locked);
    const line=selection();
    document.querySelectorAll('[data-plane-binding]').forEach(button=>{button.disabled=!line||Boolean(line.locked);button.setAttribute('aria-pressed',String(line?.directionBinding?.mode===button.dataset.planeBinding));});
    const chips=document.getElementById('selection-constraints');chips.replaceChildren();
    const addChip=(text,release)=>{const button=document.createElement('button');button.type='button';button.className='constraint-chip';button.textContent=text;button.title='Kliknij, aby zaznaczyć; Delete usuwa wiązanie';button.addEventListener('click',()=>selectDetail(button,()=>{if(items.some(item=>item.value.locked)){notify('Najpierw odblokuj element.');return;}release();updateProperties();drawLines();save(snapshot());}));chips.append(button);};
    for(const item of items){const value=item.value;if(value.fixedLength)addChip(`Długość ${value.fixedLength*100} cm`,()=>value.fixedLength=null);if(value.fixedAngle)addChip(`Kąt ${value.fixedAngle.degrees}°`,()=>value.fixedAngle=null);if(value.directionBinding)addChip(value.directionBinding.mode==='horizontal'?'Poziome':value.directionBinding.mode==='vertical'?'Pionowe':`Do poziomu ${value.directionBinding.degrees}°`,()=>value.directionBinding=null);if(value.fixedRadius)addChip(`R ${value.fixedRadius*100} cm`,()=>value.fixedRadius=null);}
    for(const item of items){if(item.value.fixedDeltaX!=null)addChip(`ΔX ${Math.abs(item.value.fixedDeltaX)*100} cm`,()=>item.value.fixedDeltaX=null);if(item.value.fixedDeltaY!=null)addChip(`ΔY ${Math.abs(item.value.fixedDeltaY)*100} cm`,()=>item.value.fixedDeltaY=null);}
    for(const item of items)if(item.value.fixed)addChip('Unieruchomienie',()=>item.value.fixed=false);
    const selectedNodes=new Set(items.flatMap(item=>item.kind==='background'?[]:item.kind==='line'?[item.value.a.nodeId,item.value.b.nodeId]:item.value.type==='circle'?[item.value.center.nodeId]:[item.value.a.nodeId,item.value.b.nodeId,item.value.via.nodeId]));
    if(selectedVertex)selectedNodes.add(selectedVertex);
    for(const id of outline()?.fixedNodes||[])if(selectedNodes.has(id))addChip('Unieruchomiony punkt',()=>outline().fixedNodes=outline().fixedNodes.filter(other=>other!==id));
    const selectedIds=new Set(items.map(item=>item.value.id)),names={parallel:'Równoległość',perpendicular:'Prostopadłość',collinear:'Współliniowość',equal:'Równość',coincident:'Połączenie',pointOn:'Punkt na obiekcie',concentric:'Współśrodkowość',tangent:'Styczność',symmetric:'Symetria',smooth:'Gładkość',distance:'Odległość'};
    for(const relation of outline()?.relations||[])if(relation.objects.some(id=>selectedIds.has(id)))addChip(names[relation.type]||relation.type,()=>{
      if(relation.type==='coincident'||relation.type==='smooth'||relation.type==='collinear'&&relation.objects.some(id=>outline().shapes.some(shape=>shape.id===id))){const geometry=outline(),second=[...geometry.lines,...geometry.shapes].find(item=>item.id===relation.objects[1]),point=second?.[relation.keyB||'a'];if(point){const old=point.nodeId,next=PlanTopology.uid();for(const object of [...geometry.lines,...geometry.shapes])if(object===second||second.polylineId&&object.polylineId===second.polylineId)for(const key of object.type==='circle'?['center']:object.type?['a','b','via']:['a','b'])if(object[key]?.nodeId===old)object[key].nodeId=next;}}
      outline().relations=outline().relations.filter(item=>item.id!==relation.id);
    });
    document.getElementById('plan-constraints-panel').hidden=!chips.childElementCount;
    renderMeasurements();
  }
  for(const [id,locked] of [['selection-lock',true],['selection-unlock',false]])document.getElementById(id).addEventListener('click',()=>{chosenItems().forEach(item=>item.value.locked=locked);syncSelection(false);save(snapshot());});
  function deleteSelected(){
    const items=chosenItems(),remove=new Set(items.filter(item=>!item.value.locked).map(item=>item.key));if(!remove.size)return;
    const geometry=outline();geometry.lines=geometry.lines.filter((item,index)=>!remove.has(`line:${index}`));geometry.shapes=(geometry.shapes||[]).filter((item,index)=>!remove.has(`shape:${index}`));
    const remainingIds=new Set(geometry.lines.map(line=>line.id));geometry.angles=(geometry.angles||[]).filter(item=>remainingIds.has(item.a)&&remainingIds.has(item.b));
    for(const line of geometry.lines)if(line.fixedAngle?.referenceId&&!remainingIds.has(line.fixedAngle.referenceId))line.fixedAngle=null;
    currentPlan().backgrounds=backgrounds().filter(item=>!remove.has(`background:${item.id}`));
    PlanTopology.prune(geometry);
    selectedItems.clear();render();save(snapshot());status.textContent='';notify(items.some(item=>item.value.locked)?'Usunięto niezablokowane elementy. Zablokowane pozostają na rzucie.':`Usunięto elementy: ${remove.size}.`);
  }
  document.getElementById('selection-delete').addEventListener('click',deleteSelected);
  document.getElementById('selection-detach').addEventListener('click',()=>{
    const items=chosenItems().filter(item=>!item.value.locked&&item.kind!=='background'),replacements=new Map();
    for(const item of items)for(const key of item.kind==='line'?['a','b']:item.value.type==='circle'?['center']:['a','b']){const point=item.value[key];if(!replacements.has(point.nodeId))replacements.set(point.nodeId,PlanTopology.uid());point.nodeId=replacements.get(point.nodeId);}
    const ids=new Set(items.map(item=>item.value.id));outline().relations=outline().relations.filter(relation=>relation.type!=='coincident'||!relation.objects.some(id=>ids.has(id))||relation.objects.every(id=>ids.has(id)));
    syncSelection();save(snapshot());notify('Rozłączono zaznaczone elementy od pozostałych.');
  });
  const objectForm=document.getElementById('object-properties');let propertyObject=null,calibration=null;
  document.getElementById('selection-properties').addEventListener('click',event=>{
    const items=chosenItems();if(items.length!==1){notify('Wskaż jeden element, aby edytować jego właściwości.');return;}
    const item=items[0];if(item.kind!=='background'){updateProperties();document.querySelector('#selection-measurements button')?.focus();return;}
    if(item.value.locked||item.value.fixed){notify('Najpierw odblokuj lub zwolnij element.');return;}
    propertyObject={id:item.value.id,kind:item.kind};const value=item.value,round=item.kind==='shape'&&['circle','arc'].includes(value.type),scale=outline().metersPerUnit;
    document.getElementById('round-properties').hidden=!round;document.getElementById('background-properties').hidden=item.kind!=='background';
    objectForm.elements.radius.disabled=objectForm.elements.fixRadius.disabled=!round;
    for(const name of['width','height','rotation'])objectForm.elements[name].disabled=item.kind!=='background';
    objectForm.elements.radius.required=round;objectForm.elements.width.required=objectForm.elements.height.required=item.kind==='background';
    if(round){const radius=value.type==='circle'?value.radius:arcGeometry(value.a,value.via,value.b).radius;objectForm.elements.radius.value=Number((radius*scale*100).toFixed(4));objectForm.elements.fixRadius.checked=Boolean(value.fixedRadius);}
    if(item.kind==='background'){objectForm.elements.width.value=value.width*scale*100;objectForm.elements.height.value=value.height*scale*100;objectForm.elements.rotation.value=value.rotation||0;}
    if(!round&&item.kind!=='background'){notify('Kształt krzywej zmienisz uchwytami. Położenie i obrót: „Przekształć / kopiuj”.');return;}
    showToolOptions('object-properties',event.currentTarget);
  });
  objectForm.addEventListener('submit',event=>{
    event.preventDefault();if(!objectForm.reportValidity()||!propertyObject)return;
    const geometry=outline(),scale=geometry.metersPerUnit;
    if(propertyObject.kind==='background'){
      const asset=backgrounds().find(asset=>asset.id===propertyObject.id);if(!asset||asset.locked)return;asset.width=Number(objectForm.elements.width.value)/(scale*100);asset.height=Number(objectForm.elements.height.value)/(scale*100);asset.rotation=Number(objectForm.elements.rotation.value);render();save(snapshot());
    }else{
      const shape=geometry.shapes.find(shape=>shape.id===propertyObject.id);if(!shape||shape.locked)return;const before=captureMovement(),radius=Number(objectForm.elements.radius.value)/(scale*100),old=shape.type==='circle'?{cx:shape.center.x,cy:shape.center.y,radius:shape.radius}:arcGeometry(shape.a,shape.via,shape.b),changes=[];
      shape.fixedRadius=objectForm.elements.fixRadius.checked?radius*scale:null;
      if(shape.type==='circle')shape.radius=radius;
      else for(const key of['a','via','b'])changes.push({from:{...shape[key]},to:{x:old.cx+(shape[key].x-old.cx)*radius/old.radius,y:old.cy+(shape[key].y-old.cy)*radius/old.radius}});
      if(!moveNodes(changes))restoreMovement(before);else save(snapshot());drawLines();
    }
    objectForm.hidePopover();
  });
  document.getElementById('background-calibrate').addEventListener('click',()=>{if(!propertyObject)return;objectForm.hidePopover();calibration={id:propertyObject.id,points:[]};setDrawingTool('calibrate');notify('Wskaż dwa punkty o znanej odległości na podkładzie.');});
  document.getElementById('calibration-menu').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity()||!calibration)return;const asset=backgrounds().find(asset=>asset.id===calibration.id);if(!asset||asset.locked)return;
    const [a,b]=calibration.points,factor=Number(form.elements.distance.value)/(distance(a,b)*outline().metersPerUnit);asset.x=a.x+(asset.x-a.x)*factor;asset.y=a.y+(asset.y-a.y)*factor;asset.width*=factor;asset.height*=factor;calibration=null;form.hidePopover();setDrawingTool('select');render();save(snapshot());notify('Skalibrowano podkład. Geometria rzutu pozostała bez zmian.');
  });
  document.getElementById('selection-transform').addEventListener('click',event=>showToolOptions('transform-menu',event.currentTarget));
  document.getElementById('transform-menu').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
    const originalItems=chosenItems().filter(item=>!item.value.locked);if(!originalItems.length)return;
    const plan=currentPlan(),beforePlan=structuredClone(plan),geometry=outline(),samples=originalItems.flatMap(item=>itemPoints(item));if(!samples.length)return;
    const pivot={x:(Math.min(...samples.map(p=>p.x))+Math.max(...samples.map(p=>p.x)))/2,y:(Math.min(...samples.map(p=>p.y))+Math.max(...samples.map(p=>p.y)))/2},factor=Number(form.elements.factor.value),angle=-Number(form.elements.angle.value)*Math.PI/180,dx=Number(form.elements.dx.value)/geometry.metersPerUnit,dy=-Number(form.elements.dy.value)/geometry.metersPerUnit;
    const transform=point=>({x:pivot.x+(point.x-pivot.x)*factor*Math.cos(angle)-(point.y-pivot.y)*factor*Math.sin(angle)+dx,y:pivot.y+(point.x-pivot.x)*factor*Math.sin(angle)+(point.y-pivot.y)*factor*Math.cos(angle)+dy});
    let items=originalItems;
    if(form.elements.copy.checked){
      const objectIds=new Map(originalItems.map(item=>[item.value.id,PlanTopology.uid()])),nodeIds=new Map(),polylineIds=new Map(),dimensionIds=new Map();
      items=originalItems.map(item=>{
        const value=structuredClone(item.value);value.id=objectIds.get(item.value.id);
        if(value.fixedAngle?.referenceId){if(objectIds.has(value.fixedAngle.referenceId))value.fixedAngle.referenceId=objectIds.get(value.fixedAngle.referenceId);else value.fixedAngle=null;}
        if(value.polylineId){if(!polylineIds.has(value.polylineId))polylineIds.set(value.polylineId,PlanTopology.uid());value.polylineId=polylineIds.get(value.polylineId);}
        for(const key of item.kind==='line'?['a','b']:item.kind==='shape'?value.type==='circle'?['center']:['a','b','via']:[]){const point=value[key];if(!nodeIds.has(point.nodeId))nodeIds.set(point.nodeId,PlanTopology.uid());point.nodeId=nodeIds.get(point.nodeId);}
        if(item.kind==='line')geometry.lines.push(value);else if(item.kind==='shape')geometry.shapes.push(value);else plan.backgrounds.push(value);
        return{...item,value};
      });
      for(const dimension of [...geometry.dimensions])if(dimension.objects.every(id=>objectIds.has(id))){const id=PlanTopology.uid();dimensionIds.set(dimension.id,id);geometry.dimensions.push({...structuredClone(dimension),id,objects:dimension.objects.map(id=>objectIds.get(id)),...dimension.points?{points:dimension.points.map(ref=>({...ref,objectId:objectIds.get(ref.objectId)}))}:{}});}
      for(const relation of [...geometry.relations])if(relation.objects.every(id=>objectIds.has(id)))geometry.relations.push({...structuredClone(relation),id:PlanTopology.uid(),dimensionId:relation.dimensionId?dimensionIds.get(relation.dimensionId):undefined,objects:relation.objects.map(id=>objectIds.get(id))});
      for(const annotation of [...geometry.angles||[]])if(objectIds.has(annotation.a)&&objectIds.has(annotation.b))geometry.angles.push({...structuredClone(annotation),id:PlanTopology.uid(),a:objectIds.get(annotation.a),b:objectIds.get(annotation.b)});
    }
    const changes=[];
    for(const item of items){
      if(item.kind==='background'){const target=transform({x:item.value.x,y:item.value.y});item.value.x=target.x;item.value.y=target.y;item.value.width*=factor;item.value.height*=factor;item.value.rotation=(item.value.rotation||0)+Number(form.elements.angle.value)*-1;}
      else{for(const key of item.kind==='line'?['a','b']:item.value.type==='circle'?['center']:['a','b','via'])changes.push({from:{...item.value[key]},to:transform(item.value[key])});if(item.value.type==='circle')item.value.radius*=factor;}
    }
    if(!moveNodes(changes)){plans[plans.indexOf(plan)]=beforePlan;notify('Przekształcenie koliduje z wiązaniami. Zachowano poprzedni stan.');render();return;}
    form.hidePopover();render();const ids=new Set(items.map(item=>item.value.id));selectedItems=new Set(allItems().filter(item=>ids.has(item.value.id)).map(item=>item.key));syncSelection();save(snapshot());
  });
  const selectButton=document.getElementById('plan-select'),properties=document.getElementById('line-properties'),referenceInput=properties.elements.reference;
  const trimButton=document.getElementById('plan-trim');
  const lengthInput=properties.elements.lineLength,angleInput=properties.elements.lineAngle,collinearButton=document.getElementById('line-collinear');
  const fixLength=properties.elements.fixLength,fixAngle=properties.elements.fixAngle;
  const lineDirty=new Set();lengthInput.addEventListener('input',()=>lineDirty.add('length'));angleInput.addEventListener('input',()=>lineDirty.add('angle'));
  const directionBinding=properties.elements.directionBinding,directionAngle=properties.elements.directionAngle;
  directionBinding.addEventListener('change',()=>{directionAngle.required=directionBinding.value==='angle';});
  directionAngle.addEventListener('input',()=>{directionBinding.value='angle';directionAngle.required=true;});
  for(const input of [lengthInput,angleInput,directionAngle])input.addEventListener('change',()=>{
    if(selection()&&!selection().locked&&properties.checkValidity())properties.requestSubmit();
  });
  for(const input of[fixLength,fixAngle])input.addEventListener('change',()=>{if(selection()&&!selection().locked&&properties.checkValidity())properties.requestSubmit();});
  const lockButton=document.getElementById('line-lock');
  lockButton.addEventListener('click',()=>{
    const line=selection();if(!line)return;line.locked=!line.locked;updateProperties();drawLines();save(snapshot());
  });
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const same=PlanTopology.same;
  function selection(){return outline()?.lines[selectedLine];}
  function reference(){return selectedLine<0||referenceInput.value===''?null:outline()?.lines[Number(referenceInput.value)];}
  function axes(line,ref){
    const sharedB=ref&&(same(line.b,ref.a)||same(line.b,ref.b));
    const anchor=sharedB?line.b:line.a,moving=sharedB?line.a:line.b;
    let direction=0;
    if(ref){const end=same(anchor,ref.b)?ref.a:ref.b;direction=Math.atan2(end.y-(same(anchor,ref.a)||same(anchor,ref.b)?anchor.y:ref.a.y),end.x-(same(anchor,ref.a)||same(anchor,ref.b)?anchor.x:ref.a.x));}
    return {anchor,moving,key:sharedB?'a':'b',direction};
  }
  function updateProperties(rebuild=false){
    updateSelectionActions();
    const line=selection();properties.hidden=true;
    if(!line)return;
    if(rebuild){referenceInput.replaceChildren(new Option('Poziom',''));outline().lines.forEach((other,index)=>{if(index!==selectedLine)referenceInput.add(new Option(`Linia ${index+1}`,String(index)));});}
    if(rebuild&&line.fixedAngle?.referenceId){const index=outline().lines.findIndex(other=>other.id===line.fixedAngle.referenceId);if(index>=0)referenceInput.value=String(index);}
    const ref=reference(),frame=axes(line,ref),scale=outline().metersPerUnit;
    const mode=line.dimensionType||'aligned',measured=mode==='horizontal'?Math.abs(line.b.x-line.a.x):mode==='vertical'?Math.abs(line.b.y-line.a.y):distance(line.a,line.b);
    lengthInput.value=scale?Number((measured*scale).toFixed(6)):'';
    let angle=-(Math.atan2(frame.moving.y-frame.anchor.y,frame.moving.x-frame.anchor.x)-frame.direction)*180/Math.PI;
    angle=((angle+180)%360+360)%360-180;angleInput.value=Number(angle.toFixed(4));collinearButton.disabled=!ref||Boolean(line.locked);
    const locked=Boolean(line.locked);
    directionBinding.value=line.directionBinding?.mode||'none';
    const absolute=-Math.atan2(line.b.y-line.a.y,line.b.x-line.a.x)*180/Math.PI;
    directionAngle.value=line.directionBinding?.degrees??Number((absolute>90?absolute-180:absolute< -90?absolute+180:absolute).toFixed(3));
    directionAngle.required=directionBinding.value==='angle';directionBinding.disabled=directionAngle.disabled=locked;
    fixLength.checked=mode==='horizontal'?line.fixedDeltaX!=null:mode==='vertical'?line.fixedDeltaY!=null:Boolean(line.fixedLength);fixAngle.checked=Boolean(line.fixedAngle);fixLength.disabled=fixAngle.disabled=locked;
    properties.elements.dimensionType.value=line.dimensionType||'aligned';
    lengthInput.disabled=angleInput.disabled=properties.querySelector('[type="submit"]').disabled=locked;
    lockButton.setAttribute('aria-pressed',String(locked));lockButton.title=locked?'Odblokuj linię':'Zablokuj linię';lockButton.setAttribute('aria-label',lockButton.title);
    lockButton.innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="${locked?'M8 10V7a4 4 0 0 1 8 0v3':'M8 10V7a4 4 0 0 1 7.5-2'}M12 14v3"/></svg>`;
    document.getElementById('line-scale-hint').textContent=scale?'Ustalone wymiary są zachowywane. Pozostałe odcinki mogą się rozciągać. Odznacz „Ustal”, aby zwolnić ograniczenie.':'Pierwsza podana długość ustali skalę całego rzutu.';
    if(locked)document.getElementById('line-scale-hint').textContent='Linia jest zablokowana. Kliknij kłódkę, aby ją odblokować.';
    lineDirty.clear();
  }
  function moveNodes(changes,anchors=[],moveConnected=false){
    const geometry=outline(),solution=PlanConstraints.solve(geometry.lines,changes,geometry.metersPerUnit,anchors,{moveConnected,shapes:geometry.shapes,relations:geometry.relations,fixedNodes:geometry.fixedNodes,layers:geometry.layers});
    if(!solution){
      // Passing through the other endpoint is a transient zero-length segment,
      // not a conflict between H/V bindings. Keep the last valid drag position.
      if(changes.some(change=>geometry.lines.some(line=>['a','b'].some(key=>PlanTopology.same(line[key],change.from)&&distance(change.to,line[key==='a'?'b':'a'])<1e-5))))return false;
      const descriptions=geometry.lines.flatMap((line,index)=>{const values=[];if(line.locked||line.fixed)values.push('nieruchoma');if(line.fixedLength)values.push(`długość ${line.fixedLength*100} cm`);if(line.fixedAngle)values.push(`kąt ${line.fixedAngle.degrees.toFixed(2)}°`);if(line.directionBinding)values.push(line.directionBinding.mode==='horizontal'?'pozioma':line.directionBinding.mode==='vertical'?'pionowa':`kierunek ${line.directionBinding.degrees}°`);return values.length?[`linia ${index+1}: ${values.join(', ')}`]:[];});
      notify(`Nie można spełnić tych wiązań. ${descriptions.length?'Sprawdź '+descriptions.slice(0,4).join('; ')+'.':'Sprawdź blokady, promienie i relacje zaznaczonych elementów.'}`);return false;
    }
    geometry.lines=solution;geometry.shapes=solution.shapes;return true;
  }
  const planeMenu=document.getElementById('plane-angle-menu');
  function applyPlaneBinding(mode,degrees){
    const line=selection();if(!line||line.locked)return;
    const before=structuredClone(outline().lines);
    if(!mode){line.directionBinding=null;line.fixedAngle=null;updateProperties();drawLines();save(snapshot());return;}
    line.directionBinding={mode,degrees};
    const current=Math.atan2(line.b.y-line.a.y,line.b.x-line.a.x),desired=-degrees*Math.PI/180,angle=mode==='angle'?desired:desired+Math.round((current-desired)/Math.PI)*Math.PI,size=distance(line.a,line.b);
    if(!moveNodes([{from:{...line.b},to:{x:line.a.x+Math.cos(angle)*size,y:line.a.y+Math.sin(angle)*size}}],[{...line.a}])){outline().lines=before;notify('Nie można ustawić wiązania — koliduje z innymi ograniczeniami.');}
    else save(snapshot());
    updateProperties();drawLines();
  }
  document.querySelectorAll('[data-plane-binding]').forEach(button=>button.addEventListener('click',()=>{
    const line=selection();if(!line||line.locked)return;
    const mode=button.dataset.planeBinding;
    if(mode==='angle'){
      document.getElementById('plane-angle-entry').hidden=false;planeMenu.elements.degrees.required=true;
      planeMenu.elements.degrees.value=line.directionBinding?.degrees??Number((-Math.atan2(line.b.y-line.a.y,line.b.x-line.a.x)*180/Math.PI).toFixed(2));planeMenu.showPopover();planeMenu.elements.degrees.focus();planeMenu.elements.degrees.select();
    }else{applyPlaneBinding(mode,mode==='horizontal'?0:90);planeMenu.hidePopover();}
  }));
  planeMenu.addEventListener('submit',event=>{event.preventDefault();if(!planeMenu.reportValidity())return;applyPlaneBinding('angle',Number(planeMenu.elements.degrees.value));planeMenu.hidePopover();});
  document.getElementById('plane-angle-release').addEventListener('click',()=>{applyPlaneBinding(null);planeMenu.hidePopover();});
  properties.elements.dimensionType.addEventListener('change',event=>{const line=selection();if(!line)return;line.dimensionType=event.target.value;updateProperties();drawLines();save(snapshot());});
  referenceInput.addEventListener('change',()=>{updateProperties();drawLines();});
  properties.addEventListener('submit',event=>{
    event.preventDefault();if(!properties.reportValidity()||!selection()||selection().locked)return;
    const line=selection(),geometry=outline(),mode=line.dimensionType||'aligned',measured=mode==='horizontal'?Math.abs(line.b.x-line.a.x):mode==='vertical'?Math.abs(line.b.y-line.a.y):distance(line.a,line.b),length=lineDirty.has('length')?Number(lengthInput.value):measured*geometry.metersPerUnit,frame=axes(line,reference());
    let angle=lineDirty.has('angle')?frame.direction-Number(angleInput.value)*Math.PI/180:Math.atan2(frame.moving.y-frame.anchor.y,frame.moving.x-frame.anchor.x);
    const direction=directionBinding.value,heading=direction==='horizontal'?0:direction==='vertical'?90:Number(directionAngle.value);
    if(direction!=='none'){const desired=-heading*Math.PI/180,current=Math.atan2(frame.moving.y-frame.anchor.y,frame.moving.x-frame.anchor.x);angle=direction==='angle'?desired+(frame.key==='a'?Math.PI:0):desired+Math.round((current-desired)/Math.PI)*Math.PI;}
    const scale=geometry.metersPerUnit,projection=mode==='horizontal'?Math.abs(Math.cos(angle)):mode==='vertical'?Math.abs(Math.sin(angle)):1;
    const partial=mode!=='aligned'&&lineDirty.has('length')&&!lineDirty.has('angle'),holdProjection=mode!=='aligned'&&fixLength.checked;
    if(!partial&&holdProjection&&projection<1e-8&&length>1e-8){notify('Ten kierunek nie pozwala zachować ustalonego wymiaru w wybranej osi.');return;}
    const size=mode==='aligned'?length/scale:holdProjection&&projection>=1e-8?length/scale/projection:distance(line.a,line.b);
    const target={x:frame.anchor.x+Math.cos(angle)*size,y:frame.anchor.y+Math.sin(angle)*size};
    if(partial){if(mode==='horizontal'){target.x=frame.anchor.x+(Math.sign(frame.moving.x-frame.anchor.x)||1)*length/scale;target.y=frame.moving.y;}else{target.y=frame.anchor.y+(Math.sign(frame.moving.y-frame.anchor.y)||1)*length/scale;target.x=frame.moving.x;}}
    const before=structuredClone(geometry.lines),oldScale=geometry.metersPerUnit,ref=reference();
    if(mode==='horizontal')line.fixedDeltaX=fixLength.checked?(Math.sign(line.b.x-line.a.x)||1)*length:null;
    else if(mode==='vertical')line.fixedDeltaY=fixLength.checked?(Math.sign(line.b.y-line.a.y)||1)*length:null;
    else line.fixedLength=fixLength.checked?length:null;
    line.directionBinding=direction==='none'?null:{mode:direction,degrees:heading};
    line.fixedAngle=fixAngle.checked?(line.fixedAngle&&!lineDirty.has('angle')&&line.fixedAngle.referenceId===(ref?.id||null)?line.fixedAngle:{degrees:(frame.direction-angle)*180/Math.PI,referenceId:ref?.id||null,anchorKey:frame.key==='a'?'b':'a',referenceAnchorKey:ref&&same(frame.anchor,ref.b)?'b':'a'}):null;
    line.showLength=Boolean(line.fixedLength)||line.showLength;geometry.metersPerUnit=scale;
    const anchors=[{...frame.anchor},...(ref?[{...ref.a},{...ref.b}]:[])];
    if(!moveNodes([{from:{...frame.moving},to:target,axes:partial?[mode==='horizontal'?'x':'y']:undefined}],anchors)){geometry.lines=before;geometry.metersPerUnit=oldScale;drawLines();return;}
    if(ref&&fixAngle.checked){geometry.angles??=[];if(!geometry.angles.some(item=>item.a===line.id&&item.b===ref.id||item.b===line.id&&item.a===ref.id))geometry.angles.push({a:ref.id,b:line.id});}
    status.textContent='Wymiary zastosowane. Połączone linie zostały dopasowane.';updateProperties();drawLines();save(snapshot());
  });
  collinearButton.addEventListener('click',()=>{
    const line=selection(),ref=reference();if(!line||!ref||line.locked)return;
    const geometry=outline(),before=captureMovement(),relation={id:PlanTopology.uid(),type:'collinear',objects:[ref.id,line.id]};geometry.relations.push(relation);
    if(!moveNodes([],[ref.a,ref.b])){geometry.relations.pop();restoreMovement(before);}else save(snapshot());updateProperties();drawLines();
  });
  let zoom=1,panX=0,panY=0,baseWidth=1,baseHeight=1,fit=null,panDrag=null,spaceDown=false,lastPointer=null,snapped=false,snapKind='';
  const precisionMenu=document.getElementById('precision-menu');
  function precision(){return {infer:true,grid:true,gridSnap:false,step:.1,snap:'all',move:'stretch',dimensionUnit:'cm',dimensionPrecision:1,...currentPlan()?.precision};}
  const layersMenu=document.getElementById('layers-menu');
  const layerDeleteDialog=document.getElementById('layer-delete-dialog');let pendingLayerDelete=null;
  function assignSelectedLayer(layer){
    const geometry=outline(),items=chosenItems().filter(item=>item.kind!=='background'&&!item.value.locked);if(!items.length)return;
    if(layer.locked||layer.visible===false){notify('Docelowa warstwa musi być widoczna i odblokowana.');return;}
    for(const item of items)item.value.layerId=layer.id;syncSelection();renderLayers();save(snapshot());
  }
  function requestLayerDelete(layer){
    if(layer.id==='default')return;pendingLayerDelete=layer.id;
    const geometry=outline(),count=[...geometry.lines,...geometry.shapes,...geometry.surfaces||[]].filter(object=>object.layerId===layer.id).length;
    document.getElementById('layer-delete-summary').textContent=`Warstwa „${layer.name}” zawiera ${count} elementów. Usunąć je razem z warstwą czy zachować na default?`;
    layersMenu.hidePopover();layerDeleteDialog.showModal();
  }
  for(const [id,mode]of [['layer-delete-move','move'],['layer-delete-content','delete']])document.getElementById(id).addEventListener('click',()=>{
    if(!pendingLayerDelete)return;PlanLayers.remove(outline(),pendingLayerDelete,mode);layerDeleteDialog.close();selectedItems.clear();syncSelection();renderLayers();save(snapshot());
  });
  document.getElementById('layer-delete-cancel').addEventListener('click',()=>layerDeleteDialog.close());
  layerDeleteDialog.addEventListener('close',()=>pendingLayerDelete=null);
  function renderLayers(){
    const geometry=outline(),list=document.getElementById('layer-list');list.replaceChildren();if(!geometry)return;
    for(const layer of geometry.layers){
      const row=document.createElement('div');row.className='layer-row';row.dataset.layerId=layer.id;
      const name=document.createElement('button');name.type='button';name.textContent=layer.name;name.title='Przenieś zaznaczone elementy na tę warstwę';name.addEventListener('click',()=>assignSelectedLayer(layer));row.append(name);
      for(const [field,label,checked] of [['visible','Widoczna',layer.visible!==false],['locked','Zablokowana',Boolean(layer.locked)]]){const control=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',label);control.append(input,document.createTextNode(label));row.append(control);input.addEventListener('change',()=>{layer[field]=input.checked;selectedItems.clear();syncSelection();save(snapshot());});}
      if(layer.id!=='default'){const remove=document.createElement('button');remove.type='button';remove.dataset.layerDelete='';remove.textContent='×';remove.title=`Usuń warstwę ${layer.name}`;remove.setAttribute('aria-label',remove.title);remove.addEventListener('click',()=>requestLayerDelete(layer));row.append(remove);}
      list.append(row);
    }
    document.getElementById('selection-construction').disabled=!chosenItems().some(item=>item.kind!=='background'&&!item.value.locked);
  }
  layersMenu.addEventListener('beforetoggle',event=>{if(event.newState==='open')renderLayers();});
  document.getElementById('layer-add').addEventListener('click',()=>{const geometry=outline();if(!geometry)return;const input=document.getElementById('layer-name'),name=input.value.trim()||`Warstwa ${geometry.layers.length+1}`,layer={id:PlanTopology.uid(),name,visible:true,locked:false};geometry.layers.push(layer);input.value='';renderLayers();save(snapshot());});
  document.getElementById('selection-construction').addEventListener('click',()=>{const items=chosenItems().filter(item=>item.kind!=='background'&&!item.value.locked),construction=!items.every(item=>item.value.construction);for(const item of items)item.value.construction=construction;drawLines();save(snapshot());});
  function stampNewGeometry(geometry){for(const object of [...geometry.lines,...geometry.shapes])if(!object.layerId){object.layerId='default';object.construction=document.getElementById('plan-construction').checked;}}
  function fillPrecisionControls(){const settings=precision();for(const [key,value]of Object.entries(settings)){const field=precisionMenu.elements[key];if(field.type==='checkbox')field.checked=value;else field.value=value;}}
  document.getElementById('plan-precision').addEventListener('click',event=>{fillPrecisionControls();showToolOptions('precision-menu',event.currentTarget);});
  for(const id of ['view-visibility','plan-settings']){
    const menu=document.getElementById(id);
    menu.addEventListener('beforetoggle',event=>{if(event.newState==='open')fillPrecisionControls();});
    menu.addEventListener('change',()=>precisionMenu.dispatchEvent(new Event('change')));
  }
  precisionMenu.addEventListener('submit',event=>event.preventDefault());
  precisionMenu.addEventListener('change',()=>{if(!currentPlan()||!precisionMenu.reportValidity())return;currentPlan().precision={infer:precisionMenu.elements.infer.checked,grid:precisionMenu.elements.grid.checked,gridSnap:precisionMenu.elements.gridSnap.checked,step:Number(precisionMenu.elements.step.value),snap:precisionMenu.elements.snap.value,move:precisionMenu.elements.move.value,dimensionUnit:precisionMenu.elements.dimensionUnit.value,dimensionPrecision:Number(precisionMenu.elements.dimensionPrecision.value)};drawLines();save(snapshot());});
  const zoomControls=board.querySelector('.plan-zoom-controls');
  const backgroundControl=document.getElementById('plan-background-control'),backgroundVisible=document.getElementById('plan-background-visible');
  let plans=[],active=null,previewUrls=[];
  let importQueue=Promise.resolve();
  let viewports={},restoreViewport=true;
  function rememberViewport(){
    if(!currentPlan()||!fit)return;
    const geometry=outline();viewports[active]={...viewports[active],zoom,centerX:geometry.width/2-panX/fit.scale,centerY:geometry.height/2-panY/fit.scale};
    saveView(structuredClone(viewports));
  }
  function rememberOrbitViewport(){
    if(!currentPlan())return;
    const orbit={mode:orbitMode,yaw:orbitYaw,pitch:orbitPitch,roll:orbitRoll,projection:orbitProjection,view:structuredClone(orbitView)};
    if(JSON.stringify(viewports[active]?.orbit)===JSON.stringify(orbit))return;
    viewports[active]={...viewports[active],orbit};saveView(structuredClone(viewports));
  }
  orbitButton.addEventListener('click',rememberOrbitViewport);
  image.draggable=false;
  function snapshot(){return {version:2,plans,active};}
  function currentPlan(){return plans.find(plan=>plan.id===active);}
  function outline(plan=currentPlan()){
    if(!plan)return null;
    if(!plan.outline){
      const height=1000/(plan.blob?(plan.aspect||1):10/7);
      plan.outline={width:1000,height,lines:(plan.lines||[]).map(line=>({a:{x:line.a.x*1000,y:line.a.y*height},b:{x:line.b.x*1000,y:line.b.y*height}}))};
      delete plan.lines;
    }
    PlanSketch.normalize(plan);
    PlanTopology.normalize(plan.outline);
    if(PlanFaces.migrate(plan.outline))geometryMigrated=true;
    if(!restoredExtrusions.has(plan.outline)){restoredExtrusions.add(plan.outline);if(PlanExtrusions.reconcile(plan.outline))geometryMigrated=true;}
    plan.outline.metersPerUnit??=.01;
    return plan.outline;
  }
  function backgrounds(plan=currentPlan()){
    if(!plan)return [];
    const geometry=outline(plan);
    if(!Array.isArray(plan.backgrounds)){
      plan.backgrounds=plan.blob?[{id:crypto.randomUUID(),name:plan.name,blob:plan.blob,x:0,y:0,width:geometry.width,height:geometry.height}]:[];
      delete plan.blob;delete plan.aspect;
    }
    return plan.backgrounds;
  }
  function updateBackgroundVisibility(){
    const plan=currentPlan(),visible=Boolean(plan)&&plan.backgroundVisible!==false;
    surface.querySelectorAll('img').forEach(photo=>{photo.hidden=!visible||!photo.hasAttribute('src');});
  }
  function fitBackgrounds(){
    const assets=backgrounds();if(!assets.length||!fit)return;
    const minX=Math.min(...assets.map(asset=>asset.x)),minY=Math.min(...assets.map(asset=>asset.y));
    const maxX=Math.max(...assets.map(asset=>asset.x+asset.width)),maxY=Math.max(...assets.map(asset=>asset.y+asset.height));
    const scale=Math.min((board.clientWidth-64)/(maxX-minX),(board.clientHeight-64)/(maxY-minY));
    const geometry=outline();zoom=Math.max(.25,Math.min(16,scale/(baseWidth/geometry.width)));
    panX=(geometry.width/2-(minX+maxX)/2)*baseWidth*zoom/geometry.width;panY=(geometry.height/2-(minY+maxY)/2)*baseWidth*zoom/geometry.width;
    restoreViewport=false;layout();rememberViewport();
  }
  backgroundVisible.addEventListener('change',()=>{
    const plan=currentPlan();if(!plan)return;plan.backgroundVisible=backgroundVisible.checked;updateBackgroundVisibility();drawLines();save(snapshot());
  });
  function drawLines(){
    updateSketchPrompt();
    if(orbitMode)renderOrbit();
    dimensionHits=[];
    const width=board.clientWidth-24,height=board.clientHeight-24;if(width<=0||height<=0||!currentPlan())return;
    fit={x:(width-baseWidth*zoom)/2+panX,y:(height-baseHeight*zoom)/2+panY,width:baseWidth*zoom,height:baseHeight*zoom};
    fit.scale=baseWidth*zoom/outline().width;
    document.getElementById('plan-dimensions-label').textContent=`Wymiary (${precision().dimensionUnit})`;
    const meterSpacing=fit.scale/outline().metersPerUnit;
    board.classList.toggle('metered-grid',precision().grid&&Number.isFinite(meterSpacing)&&meterSpacing>=6);
    if(Number.isFinite(meterSpacing)&&meterSpacing>=6){
      board.style.backgroundSize=`${meterSpacing}px ${meterSpacing}px`;
      board.style.backgroundPosition=`${fit.x+11}px ${fit.y+11}px`;
    }
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineWidth=2;ctx.strokeStyle='#315d36';
    const dark=document.documentElement.dataset.theme==='dark'&&(!backgrounds().length||currentPlan().backgroundVisible===false);
    const lineColor=dark?'#a9d49f':'#315d36',pointFill=dark?'#202722':'#fffefa';
    const position=p=>({x:fit.x+p.x*fit.scale,y:fit.y+p.y*fit.scale});
    function segment(a,b){const p=position(a),q=position(b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    function shape(item){
      ctx.beginPath();
      if(item.type==='circle'){const p=position(item.center);ctx.arc(p.x,p.y,item.radius*fit.scale,0,Math.PI*2);}
      else if(item.type==='bezier'){const a=position(item.a),b=position(item.b),control=position(item.via);ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(control.x,control.y,b.x,b.y);}
      else if(item.type==='arc'){const arc=arcGeometry(item.a,item.via,item.b);if(!arc)return;const p=position({x:arc.cx,y:arc.cy});ctx.arc(p.x,p.y,arc.radius*fit.scale,arc.startAngle,arc.endAngle,arc.anticlockwise);}
      else if(item.type==='rectangle'){const p=position(item.a),q=position(item.b);ctx.rect(p.x,p.y,q.x-p.x,q.y-p.y);}
      ctx.stroke();
    }
    function label(text,x,y,editing){ctx.save();ctx.font='14px Manrope, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const width=ctx.measureText(text).width;ctx.fillStyle=document.documentElement.dataset.theme==='dark'?'#242424':'#fafafa';ctx.fillRect(x-width/2-5,y-11,width+10,22);ctx.fillStyle=document.documentElement.dataset.theme==='dark'?'#ededed':'#333';ctx.fillText(text,x,y);if(editing)dimensionHits.push({left:x-width/2-7,right:x+width/2+7,top:y-13,bottom:y+13,...editing});ctx.restore();}
    function lengthDimension(line){
      const a=position(line.a),originalB=position(line.b),mode=line.dimensionType||'aligned',b=mode==='horizontal'?{x:originalB.x,y:a.y}:mode==='vertical'?{x:a.x,y:originalB.y}:originalB,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1||!outline().metersPerUnit)return;
      let ux=dx/len,uy=dy/len;if(ux<0||Math.abs(ux)<1e-8&&uy<0){ux=-ux;uy=-uy;}
      const nx=uy,ny=-ux,offset=Number.isFinite(line.dimensionOffset)?line.dimensionOffset*fit.scale:line.dimensionRecord?64:36,side=offset<0?-1:1;
      ctx.save();ctx.strokeStyle=dark?'#b9b9b9':'#666';ctx.lineWidth=1;ctx.beginPath();
      for(const [p,origin]of[[a,line.originA?position(line.originA):a],[b,line.originB?position(line.originB):originalB]]){const end={x:p.x+nx*(offset+8*side),y:p.y+ny*(offset+8*side)},length=Math.hypot(end.x-origin.x,end.y-origin.y),gap=Math.min(7,length);ctx.moveTo(origin.x+(end.x-origin.x)*gap/(length||1),origin.y+(end.y-origin.y)*gap/(length||1));ctx.lineTo(end.x,end.y);}
      ctx.moveTo(a.x+nx*offset-ux*7,a.y+ny*offset-uy*7);ctx.lineTo(b.x+nx*offset+ux*7,b.y+ny*offset+uy*7);ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();
      for(const p of[a,b]){const x=p.x+nx*offset,y=p.y+ny*offset;ctx.moveTo(x-(ux+nx)*4,y-(uy+ny)*4);ctx.lineTo(x+(ux+nx)*4,y+(uy+ny)*4);}ctx.stroke();
      const settings=precision(),unit=settings.dimensionUnit,multiplier=unit==='m'?1:unit==='mm'?1000:100,measure=mode==='horizontal'?Math.abs(line.b.x-line.a.x):mode==='vertical'?Math.abs(line.b.y-line.a.y):distance(line.a,line.b),fixed=mode==='horizontal'?line.fixedDeltaX!=null:mode==='vertical'?line.fixedDeltaY!=null:Boolean(line.fixedLength);
      const text=`${(measure*outline().metersPerUnit*multiplier).toLocaleString('pl-PL',{maximumFractionDigits:settings.dimensionPrecision})}${fixed?' •':''}`;
      const x=(a.x+b.x)/2+nx*(offset+12*side),y=(a.y+b.y)/2+ny*(offset+12*side),angle=Math.atan2(uy,ux);
      ctx.translate(x,y);ctx.rotate(angle);ctx.font='14px Manrope, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const active=sameMeasurement(selectedMeasurement,{...(line.dimensionRecord?{dimensionId:line.dimensionRecord.id}:{lineId:line.id}),kind:'length'});ctx.fillStyle=active?(dark?'#ffb36d':'#bc672d'):dark?'#ededed':'#333';ctx.fillText(text,0,0);
      if(active){ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();ctx.moveTo(-ctx.measureText(text).width/2,10);ctx.lineTo(ctx.measureText(text).width/2,10);ctx.stroke();}
      const textWidth=ctx.measureText(text).width/2+7,h=13,halfWidth=Math.abs(ux)*textWidth+Math.abs(uy)*h,halfHeight=Math.abs(uy)*textWidth+Math.abs(ux)*h;
      dimensionHits.push({left:x-halfWidth,right:x+halfWidth,top:y-halfHeight,bottom:y+halfHeight,...line.dimensionRecord?{dimensionId:line.dimensionRecord.id}:{lineId:line.id},a:{...line.a},b:mode==='horizontal'?{x:line.b.x,y:line.a.y}:mode==='vertical'?{x:line.a.x,y:line.b.y}:{...line.b},kind:'length'});ctx.restore();
    }
    function angleDimension(annotation){
      annotation.id??=PlanTopology.uid();
      const lines=outline().lines,a=lines.find(line=>line.id===annotation.a),b=lines.find(line=>line.id===annotation.b);if(!a||!b)return;
      if(!PlanLayers.visible(outline(),a)||!PlanLayers.visible(outline(),b))return;
      const shared=[a.a,a.b].find(p=>same(p,b.a)||same(p,b.b));
      let vertex=shared,va,vb;
      if(shared){va=same(shared,a.a)?a.b:a.a;vb=same(shared,b.a)?b.b:b.a;}
      else{const ax=a.b.x-a.a.x,ay=a.b.y-a.a.y,bx=b.b.x-b.a.x,by=b.b.y-b.a.y,cross=ax*by-ay*bx;
        if(Math.abs(cross)<1e-7){const p=position(a.a);label('0°',p.x+25,p.y-25,{lineId:b.id,referenceId:a.id,kind:'angle'});return;}
        const t=((b.a.x-a.a.x)*by-(b.a.y-a.a.y)*bx)/cross;vertex={x:a.a.x+t*ax,y:a.a.y+t*ay};va={x:vertex.x+ax,y:vertex.y+ay};vb={x:vertex.x+bx,y:vertex.y+by};
      }
      let first=Math.atan2(va.y-vertex.y,va.x-vertex.x),second=Math.atan2(vb.y-vertex.y,vb.x-vertex.x),delta=((second-first+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      const p=position(vertex),radius=Math.max(12,Number.isFinite(annotation.dimensionRadius)?annotation.dimensionRadius*fit.scale:36);
      ctx.save();ctx.strokeStyle=dark?'#e2c376':'#946b20';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,radius,first,first+delta,delta<0);ctx.stroke();
      label(`${(Math.abs(delta)*180/Math.PI).toLocaleString('pl-PL',{maximumFractionDigits:1})}°`,p.x+Math.cos(first+delta/2)*(radius+17),p.y+Math.sin(first+delta/2)*(radius+17),{lineId:b.id,referenceId:a.id,annotationId:annotation.id,normal:{x:Math.cos(first+delta/2),y:Math.sin(first+delta/2)},kind:'angle'});ctx.restore();
    }
    for(const item of chosenItems().filter(item=>item.kind==='background')){const points=itemPoints(item);ctx.strokeStyle='#e5a26b';ctx.lineWidth=2;ctx.setLineDash([6,3]);for(let i=1;i<points.length;i++)segment(points[i-1],points[i]);ctx.setLineDash([]);}
    for(const [index,item] of (outline().shapes||[]).entries()){if(!PlanLayers.visible(outline(),item))continue;ctx.setLineDash(item.construction?[7,5]:[]);const key=`shape:${index}`;ctx.strokeStyle=hoveredItem===key?'#79baff':selectedItems.has(key)?(dark?'#ffb36d':'#bc672d'):lineColor;ctx.lineWidth=selectedItems.has(key)||hoveredItem===key?3:2;shape(item);ctx.setLineDash([]);
      if(item.type==='bezier'&&selectedItems.has(key)){ctx.save();ctx.lineWidth=1;ctx.setLineDash([6,5]);segment(item.a,item.via);segment(item.via,item.b);ctx.restore();}
      if(['arc','bezier'].includes(item.type)&&selectedItems.has(key))for(const endpoint of[item.a,item.via,item.b]){const p=position(endpoint);ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=pointFill;ctx.fill();ctx.stroke();}
      if(item.type==='circle'&&selectedItems.has(key))for(const endpoint of[item.center,{x:item.center.x+item.radius,y:item.center.y}]){const p=position(endpoint);ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=pointFill;ctx.fill();ctx.stroke();}
    }
    const drawnHandles=[];
    for(const [index,line] of outline().lines.entries()){
      if(!PlanLayers.visible(outline(),line))continue;
      const chosen=!selectedMeasurement&&(selectedItems.has(`line:${index}`)||index===selectedLine);
      ctx.strokeStyle=hoveredItem===`line:${index}`?'#79baff':line.id===angleFirst?'#e2c376':chosen?(dark?'#ffb36d':'#bc672d'):line===reference()?(dark?'#8db8e5':'#477da4'):lineColor;ctx.lineWidth=chosen||hoveredItem===`line:${index}`?3:2;ctx.setLineDash(line.construction?[7,5]:[]);segment(line.a,line.b);ctx.setLineDash([]);
      if(chosen){for(const point of[line.a,line.b]){if(drawnHandles.some(other=>same(other,point)))continue;drawnHandles.push(point);const p=position(point);ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=pointFill;ctx.fill();ctx.stroke();}}
      if(line.locked){const a=position(line.a),b=position(line.b),x=(a.x+b.x)/2,y=(a.y+b.y)/2-18;ctx.save();ctx.lineWidth=1.5;ctx.fillStyle=pointFill;ctx.fillRect(x-8,y-7,16,18);ctx.strokeRect(x-5,y,10,8);ctx.beginPath();ctx.arc(x,y,3.5,Math.PI,0);ctx.stroke();ctx.restore();}
      if(line.directionBinding){const a=position(line.a),b=position(line.b),binding=line.directionBinding,text=binding.mode==='horizontal'?'H':binding.mode==='vertical'?'V':`${binding.degrees.toLocaleString('pl-PL')}°`;label(text,(a.x+b.x)/2,(a.y+b.y)/2-(line.locked?37:18));}
    }
    if(currentPlan().showDimensions!==false)for(const line of outline().lines)if(PlanLayers.visible(outline(),line)&&(line.showLength||line.fixedLength||line.fixedDeltaX!=null||line.fixedDeltaY!=null))lengthDimension(line);
    if(currentPlan().showDimensions!==false)for(const dimension of outline().dimensions){
      if(dimension.objects.some(id=>[...outline().lines,...outline().shapes].some(object=>object.id===id&&!PlanLayers.visible(outline(),object))))continue;
      if(dimension.type==='partialArcLength'){
        const item=outline().shapes.find(s=>s.id===dimension.objects[0]);if(!item)continue;
        const arc=arcGeometry(item.a,item.via,item.b);if(!arc)continue;
        const [first,last]=dimension.points.map(ref=>PlanDimensions.point(outline(),ref));if(!first||!last)continue;
        const sign=arc.anticlockwise?-1:1,parameter=p=>((sign*(Math.atan2(p.y-arc.cy,p.x-arc.cx)-arc.startAngle))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
        let a=parameter(first),b=parameter(last);if(a>b)[a,b]=[b,a];
        const center=position({x:arc.cx,y:arc.cy}),offset=Number.isFinite(dimension.dimensionOffset)?dimension.dimensionOffset*fit.scale:36,radius=Math.max(12,arc.radius*fit.scale+offset),startAngle=arc.startAngle+sign*a,endAngle=arc.startAngle+sign*b,mid=(startAngle+endAngle)/2;
        ctx.save();ctx.strokeStyle=dark?'#b9b9b9':'#666';ctx.lineWidth=1;ctx.beginPath();ctx.arc(center.x,center.y,radius,startAngle,endAngle,arc.anticlockwise);ctx.stroke();
        for(const angle of[startAngle,endAngle]){const x=Math.cos(angle),y=Math.sin(angle);ctx.beginPath();ctx.moveTo(center.x+x*arc.radius*fit.scale,center.y+y*arc.radius*fit.scale);ctx.lineTo(center.x+x*(radius+8),center.y+y*(radius+8));ctx.moveTo(center.x+x*radius-y*5,center.y+y*radius+x*5);ctx.lineTo(center.x+x*radius+y*5,center.y+y*radius-x*5);ctx.stroke();}
        const settings=precision(),multiplier=settings.dimensionUnit==='m'?1:settings.dimensionUnit==='mm'?1000:100,value=PlanDimensions.arcLength(item,dimension.points[0].key,dimension.points[1].key)*outline().metersPerUnit*multiplier;
        label(`⌒ ${value.toLocaleString('pl-PL',{maximumFractionDigits:settings.dimensionPrecision})}`,center.x+Math.cos(mid)*(radius+16),center.y+Math.sin(mid)*(radius+16),{dimensionId:dimension.id,kind:'partialArcDimension',normal:{x:Math.cos(mid),y:Math.sin(mid)}});ctx.restore();continue;
      }
      const virtual=PlanDimensions.line(outline(),dimension);if(virtual){virtual.fixedLength=outline().relations.find(item=>item.dimensionId===dimension.id&&item.type==='distance')?.value;lengthDimension(virtual);}else{const object=outline().lines.find(item=>item.id===dimension.objects[0]);if(object){const p=position(object.a);label('Wymiar: brak równoległości',p.x+90,p.y-45,{dimensionId:dimension.id,kind:'invalidDimension'});}}}
    if(currentPlan().showDimensions!==false)for(const item of outline().shapes||[])if(['circle','arc'].includes(item.type)){
      const data=item.type==='circle'?{cx:item.center.x,cy:item.center.y,radius:item.radius}:arcGeometry(item.a,item.via,item.b);if(!data)continue;
      if(!PlanLayers.visible(outline(),item)||item.hideDimension||!item.dimensionType&&!item.fixedRadius)continue;
      const center=position({x:data.cx,y:data.cy}),end=position(item.type==='circle'?{x:data.cx+data.radius*.7071,y:data.cy-data.radius*.7071}:item.via),settings=precision(),multiplier=settings.dimensionUnit==='m'?1:settings.dimensionUnit==='mm'?1000:100,mode=item.dimensionType||'radius',value=mode==='arcLength'&&item.type==='arc'?PlanDimensions.arcLength(item):data.radius*(mode==='diameter'?2:1),prefix=mode==='diameter'?'Ø':mode==='arcLength'?'⌒':'R',offset=item.dimensionTextOffset||{x:0,y:0};
      const textX=(center.x+end.x)/2+offset.x*fit.scale,textY=(center.y+end.y)/2+offset.y*fit.scale;
      ctx.save();ctx.strokeStyle=dark?'#b9b9b9':'#666';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.lineTo(end.x,end.y);if(offset.x||offset.y){ctx.moveTo(end.x,end.y);ctx.lineTo(textX,textY);}ctx.stroke();label(`${prefix} ${(value*outline().metersPerUnit*multiplier).toLocaleString('pl-PL',{maximumFractionDigits:settings.dimensionPrecision})}${item.fixedRadius?' •':''}`,textX,textY,{shapeId:item.id,kind:'shapeDimension'});ctx.restore();
    }
    for(const annotation of outline().angles||[])angleDimension(annotation);
    ctx.strokeStyle=lineColor;ctx.lineWidth=2;
    if(drawingTool==='circle'&&circleMethod==='ttr'&&circlePicks.length===2&&sketchParameter()>0){const preview=PlanSketchTools.tangentCircle(circlePicks.map(p=>p.line),circlePicks.map(p=>p.point),sketchParameter());if(preview){ctx.save();ctx.setLineDash([6,4]);shape(preview);ctx.restore();}}
    if(start){if(hover||drawingTool==='arc'&&arcVia&&['radius','angle'].includes(arcMethod)&&sketchParameter()!=null||drawingTool==='circle'&&['radius','diameter'].includes(circleMethod)&&sketchParameter()>0){ctx.setLineDash([6,4]);
      if(drawingTool==='circle'){const preview=roundShape(hover);if(preview)shape(preview);}
      else if(drawingTool==='arc'&&arcMethod==='tangent'){const preview=PlanSketchTools.tangentArc(start,hover,tangentStart);if(preview)shape(preview);}
      else if(drawingTool==='rectangle')shape({type:'rectangle',a:start,b:hover});
      else if(drawingTool==='arc'&&arcVia){const preview=arcFromPoints(start,arcVia,hover);if(preview){shape(preview);if(preview.type==='bezier'){segment(preview.a,preview.via);segment(preview.via,preview.b);}}}
      else segment(start,hover);ctx.setLineDash([]);
    }for(const point of[start,arcVia].filter(Boolean)){const p=position(point);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle=pointFill;ctx.fill();ctx.stroke();}}
    if(hover&&snapped){const p=position(hover);ctx.strokeStyle='#b6672d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();ctx.fillStyle=dark?'#ffc98f':'#7c4219';ctx.font='12px Manrope, sans-serif';ctx.fillText(snapKind,p.x+12,p.y-12);}
    if(polylineStart){const p=position(polylineStart);ctx.strokeStyle=lineColor;ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.stroke();}
    if(drawingTool==='length'&&['pointDistance','pointHorizontal','pointVertical','partialArcLength'].includes(dimensionMode))for(const ref of PlanDimensions.references(outline())){const object=outline().shapes.find(s=>s.id===ref.objectId);if(dimensionMode==='partialArcLength'&&object?.type!=='arc')continue;const p=position(PlanDimensions.point(outline(),ref));ctx.beginPath();ctx.arc(p.x,p.y,dimensionFirst?.objectId===ref.objectId&&dimensionFirst?.key===ref.key?5:3,0,Math.PI*2);ctx.fillStyle=dimensionFirst?.objectId===ref.objectId&&dimensionFirst?.key===ref.key?'#ffb36d':'#79baff';ctx.fill();}
    if(selectedVertex){const point=PlanTopology.points(outline()).find(point=>point.nodeId===selectedVertex);if(point){const p=position(point);ctx.save();ctx.setLineDash([]);ctx.strokeStyle=dark?'#ffb36d':'#bc672d';ctx.fillStyle=pointFill;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,6,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.restore();}}
    if(marquee){const a=position(marquee.origin),b=position(marquee.current);ctx.fillStyle='#6fafe428';ctx.strokeStyle='#8db8e5';ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
  }
  function layout(){
    const plan=currentPlan();if(!plan)return;
    if(board.clientWidth<=24||board.clientHeight<=24)return;
    const geometry=outline(plan),ratio=geometry.width/geometry.height;
    const availableWidth=Math.max(1,board.clientWidth-24),availableHeight=Math.max(1,board.clientHeight-24);
    // Keep the drawing scale when selection panels change the viewport size.
    // A new plan establishes its fit once; only explicit zoom changes it later.
    if(!baseWidth){baseWidth=Math.min(availableWidth,availableHeight*ratio);baseHeight=baseWidth/ratio;}
    if(restoreViewport){const saved=viewports[active];if(saved&&[saved.zoom,saved.centerX,saved.centerY].every(Number.isFinite)){zoom=Math.max(.25,Math.min(16,saved.zoom));const scale=baseWidth*zoom/geometry.width;panX=(geometry.width/2-saved.centerX)*scale;panY=(geometry.height/2-saved.centerY)*scale;}restoreViewport=false;}
    surface.style.width=baseWidth+'px';surface.style.height=baseHeight+'px';surface.style.transform=`translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`;
    syncZoomControls();drawLines();
  }
  function setZoom(value,point){
    if(!currentPlan()||!fit)return;const next=Math.max(.25,Math.min(16,value)),factor=next/zoom;
    const x=point?.x??(board.clientWidth-24)/2,y=point?.y??(board.clientHeight-24)/2;
    panX=(x-(board.clientWidth-24)/2)*(1-factor)+panX*factor;panY=(y-(board.clientHeight-24)/2)*(1-factor)+panY*factor;zoom=next;layout();rememberViewport();
  }
  document.getElementById('plan-zoom-in').addEventListener('click',()=>orbitMode?zoomOrbit(orbitView.zoom*1.4):setZoom(zoom*1.4));
  document.getElementById('plan-zoom-out').addEventListener('click',()=>orbitMode?zoomOrbit(orbitView.zoom/1.4):setZoom(zoom/1.4));
  document.getElementById('plan-zoom-reset').addEventListener('click',()=>{if(orbitMode){fitOrbit();return;}zoom=1;panX=panY=0;layout();rememberViewport();});
  board.addEventListener('wheel',event=>{if(!currentPlan())return;event.preventDefault();if(orbitMode){const r=orbitCanvas.getBoundingClientRect();zoomOrbit(orbitView.zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.003),{x:event.clientX-r.left,y:event.clientY-r.top});return;}const r=canvas.getBoundingClientRect();setZoom(zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.003),{x:event.clientX-r.left,y:event.clientY-r.top});},{passive:false});
  image.addEventListener('load',()=>{restoreViewport=true;layout();});new ResizeObserver(()=>{restoreViewport=true;layout();}).observe(board);
  document.addEventListener('themechange',drawLines);
  function setDrawingTool(tool){
    tangentStart=null;circlePicks=[];sketchInputValue.value='';sketchInput.hidden=true;
    dimensionFirst=null;
    if(planeMenu.matches(':popover-open'))planeMenu.hidePopover();
    document.getElementById('plan-bindings').setAttribute('aria-pressed',String(['bindings','angle','relation'].includes(tool)));
    drawing=tool!=='select';drawingTool=tool;start=null;hover=null;arcVia=null;lineButton.setAttribute('aria-pressed',String(drawing&&['line','polyline'].includes(tool)));surface.classList.toggle('drawing-lines',drawing);
    selectedItems.clear();canvas.style.cursor=drawing?'crosshair':'default';
    hoveredItem=null;angleFirst=null;measureButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.planMeasure===tool)));
    polylineStart=null;polylineId=null;
    shapeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.planShape===tool)));
    trimButton.setAttribute('aria-pressed',String(tool==='trim'));
    selectButton.setAttribute('aria-pressed',String(!drawing));selectedLine=-1;updateProperties();
    if(['bindings','relation','calibrate','polyedit'].includes(tool)){status.textContent='';drawLines();return;}
    status.textContent={line:'Kliknij początek i koniec. Shift: kąty co 45°.',polyline:'Klikaj kolejne punkty. Enter kończy polilinię, kliknięcie początku zamyka obrys. Shift: kąty co 45°.',arc:'Kliknij początek, punkt pośredni i koniec łuku.',rectangle:'Kliknij dwa przeciwległe narożniki. Shift: kwadrat.',circle:'Kliknij środek i punkt na obwodzie koła.',trim:'Kliknij fragment do usunięcia pomiędzy najbliższymi przecięciami.',length:'Kliknij linię i ustaw jej długość w panelu edycji.',angle:'Kliknij linię odniesienia, następnie drugą linię i ustaw kąt w panelu edycji.',select:'Kliknij element lub przeciągnij po pustym obszarze, aby zaznaczyć grupę. Shift dodaje do zaznaczenia.'}[tool]+' Escape przerywa rysowanie. Spacja + przeciągnięcie przesuwa widok.';drawLines();
  }
  lineButton.addEventListener('click',()=>showToolOptions('line-method-menu',lineButton));
  document.querySelector('[data-line-method="line"]').addEventListener('click',()=>{document.getElementById('line-method-menu').hidePopover();setDrawingTool('line');});
  document.querySelectorAll('[data-line-edit]').forEach(button=>button.addEventListener('click',()=>{editMode=button.dataset.lineEdit;editFirst=null;document.getElementById('modify-method-menu').hidePopover();setDrawingTool('polyedit');notify(['join','extend'].includes(editMode)?'Wskaż pierwszy element, następnie drugi. Przy wydłużaniu kliknij blisko końca, który chcesz wydłużyć.':'Kliknij segment lub wierzchołek, który chcesz edytować.');}));
  shapeButtons.forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.planShape==='arc'){
      showToolOptions('arc-method-menu',button);
    }else{if(document.getElementById('line-method-menu').matches(':popover-open'))document.getElementById('line-method-menu').hidePopover();setDrawingTool(button.dataset.planShape);}
  }));
  document.querySelectorAll('[data-arc-method]').forEach(button=>button.addEventListener('click',()=>{
    arcMethod=button.dataset.arcMethod;document.getElementById('arc-method-menu').hidePopover();setDrawingTool('arc');
    document.querySelectorAll('[data-arc-method]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));
    drawLines();
  }));
  document.querySelectorAll('[data-circle-method]').forEach(button=>button.addEventListener('click',()=>{circleMethod=button.dataset.circleMethod;document.getElementById('circle-method-menu').hidePopover();setDrawingTool('circle');drawLines();}));
  selectButton.addEventListener('click',()=>setDrawingTool('select'));
  trimButton.addEventListener('click',()=>setDrawingTool('trim'));
  let dimensionMenuWasOpen=false;
  document.querySelector('[data-plan-measure=length]').addEventListener('pointerdown',()=>{dimensionMenuWasOpen=document.getElementById('dimension-method-menu').matches(':popover-open');});
  measureButtons.forEach(button=>button.addEventListener('click',()=>{if(button.dataset.planMeasure==='length'){const menu=document.getElementById('dimension-method-menu');if(dimensionMenuWasOpen||menu.matches(':popover-open'))menu.hidePopover();else showToolOptions('dimension-method-menu',button);dimensionMenuWasOpen=false;return;}document.getElementById('binding-method-menu').hidePopover();setDrawingTool(button.dataset.planMeasure);}));
  document.querySelectorAll('[data-dimension-method]').forEach(button=>button.addEventListener('click',()=>{dimensionMode=button.dataset.dimensionMethod;dimensionFirst=null;document.getElementById('dimension-method-menu').hidePopover();setDrawingTool('length');document.querySelectorAll('[data-dimension-method]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));const main=document.querySelector('[data-plan-measure=length]');main.querySelector('svg').replaceWith(button.querySelector('svg').cloneNode(true));main.title=button.textContent.trim();status.textContent=['pointDistance','pointHorizontal','pointVertical','partialArcLength'].includes(dimensionMode)?'Wskaż dwa punkty obiektów. Escape kończy pomiar.':status.textContent;}));
  document.getElementById('plan-bindings').addEventListener('click',event=>showToolOptions('binding-method-menu',event.currentTarget));
  document.querySelectorAll('[data-binding-method]').forEach(button=>button.addEventListener('click',()=>{bindingMethod=button.dataset.bindingMethod;document.getElementById('binding-method-menu').hidePopover();setDrawingTool('bindings');}));
  document.querySelectorAll('[data-relation-type]').forEach(button=>button.addEventListener('click',()=>{relationType=button.dataset.relationType;relationPicks=[];document.getElementById('binding-method-menu').hidePopover();setDrawingTool('relation');notify(relationType==='symmetric'?'Wskaż dwa elementy, a następnie linię osi symetrii.':'Wskaż pierwszy, a następnie drugi element. Dla połączeń kliknij blisko właściwego końca.');}));
  // Main button repeats the last action; the separate arrow only opens its variants.
  for(const [group,main,initial]of[
    ['line-method-menu',lineButton,'[data-line-method="line"]'],
    ['arc-method-menu',document.querySelector('[data-plan-shape="arc"]'),'[data-arc-method="three"]'],
    ['circle-method-menu',document.querySelector('[data-plan-shape="circle"]'),'[data-circle-method="radius"]'],
    ['modify-method-menu',document.getElementById('plan-edit'),'[data-line-edit="add"]'],
    ['dimension-method-menu',document.querySelector('[data-plan-measure="length"]'),'[data-dimension-method="aligned"]'],
    ['binding-method-menu',document.getElementById('plan-bindings'),'[data-binding-method="horizontal"]']
  ]){
    const menu=document.getElementById(group),key=`exhibition-tool-${group}`;
    let selected=initial;
    try{const saved=localStorage.getItem(key);if(saved&&menu.querySelector(saved)?.matches('button'))selected=saved;}catch(error){}
    const wrapper=document.createElement('div');wrapper.className='cad-tool-split';main.before(wrapper);wrapper.append(main);main.removeAttribute('aria-haspopup');
    const arrow=document.createElement('button');arrow.type='button';arrow.className='cad-tool-variants';arrow.dataset.toolMenu=group;arrow.setAttribute('aria-label',`Warianty: ${main.textContent.trim()}`);arrow.setAttribute('aria-haspopup','menu');arrow.setAttribute('aria-controls',group);arrow.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';wrapper.append(arrow);
    const sync=()=>{const option=menu.querySelector(selected);if(!option)return;main.querySelector('svg').replaceWith(option.querySelector('svg').cloneNode(true));main.title=option.textContent.trim();main.setAttribute('aria-label',main.title);menu.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button===option)));};
    const attributes=['data-line-method','data-line-edit','data-plan-shape','data-arc-method','data-circle-method','data-dimension-method','data-plan-measure','data-binding-method','data-relation-type'];
    menu.addEventListener('click',event=>{const option=event.target.closest('button');if(!option||!menu.contains(option)||option.disabled)return;const attribute=attributes.find(name=>option.hasAttribute(name));if(!attribute)return;selected=`[${attribute}="${option.getAttribute(attribute)}"]`;try{localStorage.setItem(key,selected);}catch(error){}sync();main.setAttribute('aria-pressed','true');});
    main.addEventListener('click',event=>{event.stopImmediatePropagation();menu.hidePopover();menu.querySelector(selected)?.click();},true);
    main.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();showToolOptions(group,main);menu.querySelector(selected)?.focus();}});
    arrow.addEventListener('click',()=>{if(menu.matches(':popover-open'))menu.hidePopover();else showToolOptions(group,main);});
    const updateDisabled=()=>{arrow.disabled=main.disabled;};new MutationObserver(updateDisabled).observe(main,{attributes:true,attributeFilter:['disabled']});updateDisabled();sync();
  }
  const rawPointer=event=>{const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left-fit.x)/fit.scale,y:(event.clientY-r.top-fit.y)/fit.scale};};
  function snapDraggedPoint(target,source,event,drag){
    drag.snap=null;const settings=precision();if(event.altKey)return target;
    if(settings.gridSnap){const step=settings.step/outline().metersPerUnit;target={x:Math.round(target.x/step)*step,y:Math.round(target.y/step)*step};}
    if(settings.snap==='none')return target;
    const ignored=new Set([...outline().lines,...outline().shapes].filter(object=>(object.type==='circle'?[object.center]:object.type?[object.a,object.b,object.via]:[object.a,object.b]).some(point=>point.nodeId===source.nodeId)).map(object=>object.id));
    let best=null,score=Infinity;
    for(const candidate of PlanSnap.candidates(outline(),target,source,12/fit.scale)){
      if(candidate.point.nodeId===source.nodeId||settings.snap==='end'&&candidate.kind!=='Koniec'||candidate.kind!=='Koniec'&&ignored.has(candidate.objectId))continue;
      if(candidate.kind==='Przecięcie'&&candidate.objectIds?.every(id=>ignored.has(id)))continue;
      const d=distance(candidate.point,target)*fit.scale,penalty=['Na linii','Na krzywej'].includes(candidate.kind)?8:0;if(d<12&&d+penalty<score){score=d+penalty;best=candidate;}
    }
    if(!best)return target;
    if(settings.infer&&best.kind==='Koniec')drag.snap=best.point.nodeId;
    return{x:best.point.x,y:best.point.y};
  }
  function commitConnection(drag,source){
    if(!drag.snap||!source?.nodeId)return;const points=PlanTopology.points(outline()),target=points.find(point=>point.nodeId===drag.snap),current=points.find(point=>point.nodeId===source.nodeId);if(target&&current&&distance(target,current)<1e-5)PlanTopology.connect(outline(),current,target);
  }
  function hitLine(point){
    let hit=-1,nearest=10/fit.scale;
    outline().lines.forEach((line,index)=>{if(!PlanLayers.visible(outline(),line)||PlanLayers.locked(outline(),line))return;const dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,t=Math.max(0,Math.min(1,((point.x-line.a.x)*dx+(point.y-line.a.y)*dy)/(dx*dx+dy*dy)));const dist=distance(point,{x:line.a.x+dx*t,y:line.a.y+dy*t});if(dist<=nearest){nearest=dist;hit=index;}});return hit;
  }
  function itemPoints(item){
    const value=item.value;
    if(value.type==='bezier')return Array.from({length:97},(_,i)=>{const t=i/96,u=1-t;return{x:u*u*value.a.x+2*u*t*value.via.x+t*t*value.b.x,y:u*u*value.a.y+2*u*t*value.via.y+t*t*value.b.y};});
    if(item.kind==='line')return [value.a,value.b];
    if(item.kind==='background'){const angle=(value.rotation||0)*Math.PI/180;return [[0,0],[value.width,0],[value.width,value.height],[0,value.height],[0,0]].map(([x,y])=>({x:value.x+x*Math.cos(angle)-y*Math.sin(angle),y:value.y+x*Math.sin(angle)+y*Math.cos(angle)}));}
    const arc=value.type==='circle'?{cx:value.center.x,cy:value.center.y,radius:value.radius,startAngle:0,endAngle:0,anticlockwise:false}:arcGeometry(value.a,value.via,value.b);
    if(!arc)return [];
    const direction=arc.anticlockwise?-1:1,sweep=value.type==='circle'?Math.PI*2:((direction*(arc.endAngle-arc.startAngle))%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    return Array.from({length:97},(_,i)=>({x:arc.cx+Math.cos(arc.startAngle+direction*sweep*i/96)*arc.radius,y:arc.cy+Math.sin(arc.startAngle+direction*sweep*i/96)*arc.radius}));
  }
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return distance(p,{x:a.x+dx*t,y:a.y+dy*t});}
  function hitItem(point){
    const items=allItems();let nearest=10/fit.scale,result=null;
    for(const item of items.filter(item=>item.kind!=='background')){const points=itemPoints(item);for(let i=1;i<points.length;i++){const dist=segmentDistance(point,points[i-1],points[i]);if(dist<=nearest){result=item;nearest=dist;}}}
    return result||items.filter(item=>item.kind==='background').reverse().find(item=>{const angle=-(item.value.rotation||0)*Math.PI/180,dx=point.x-item.value.x,dy=point.y-item.value.y,x=dx*Math.cos(angle)-dy*Math.sin(angle),y=dx*Math.sin(angle)+dy*Math.cos(angle);return x>=0&&x<=item.value.width&&y>=0&&y<=item.value.height;});
  }
  function keysForItem(item){return item.kind!=='background'&&item.value.polylineId?allItems().filter(other=>other.kind!=='background'&&other.value.polylineId===item.value.polylineId).map(other=>other.key):[item.key];}
  function captureMovement(){return {lines:structuredClone(outline().lines),shapes:structuredClone(outline().shapes||[]),assets:backgrounds().map(asset=>({id:asset.id,x:asset.x,y:asset.y}))};}
  function restoreMovement(before){outline().lines=structuredClone(before.lines);outline().shapes=structuredClone(before.shapes);for(const asset of backgrounds()){const old=before.assets.find(item=>item.id===asset.id);if(old){asset.x=old.x;asset.y=old.y;}}}
  function positionBackgrounds(){const geometry=outline();surface.querySelectorAll('img[data-background-id]').forEach(photo=>{const asset=backgrounds().find(item=>item.id===photo.dataset.backgroundId);if(asset){photo.style.left=`${asset.x/geometry.width*100}%`;photo.style.top=`${asset.y/geometry.height*100}%`;photo.style.transformOrigin='0 0';photo.style.transform=`rotate(${asset.rotation||0}deg)`;}});}
  function moveGroup(delta,before){
    const previous=captureMovement();restoreMovement(before);const items=chosenItems().filter(item=>!item.value.locked),changes=[];
    for(const item of items.filter(item=>item.kind!=='background'))for(const key of item.kind==='line'?['a','b']:item.value.type==='circle'?['center']:['a','via','b'])changes.push({from:{...item.value[key]},to:{x:item.value[key].x+delta.x,y:item.value[key].y+delta.y}});
    if(changes.length&&!moveNodes(changes,[],currentPlan().precision?.move==='connected')){restoreMovement(previous);return;}
    for(const item of items.filter(item=>item.kind==='background')){item.value.x+=delta.x;item.value.y+=delta.y;}
  }
  function intersectsBox(item,box){
    const points=itemPoints(item),inside=p=>p.x>=box.left&&p.x<=box.right&&p.y>=box.top&&p.y<=box.bottom;
    if(points.some(inside))return true;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];let low=0,high=1;
      for(const [p,q] of [[a.x-b.x,a.x-box.left],[b.x-a.x,box.right-a.x],[a.y-b.y,a.y-box.top],[b.y-a.y,box.bottom-a.y]]){
        if(!p){if(q<0){low=1;high=0;break;}}else{const ratio=q/p;if(p<0)low=Math.max(low,ratio);else high=Math.min(high,ratio);}
      }
      if(low<=high)return true;
    }
    return item.kind==='background'&&inside({x:box.left,y:box.top})&&box.left>=item.value.x&&box.left<=item.value.x+item.value.width&&box.top>=item.value.y&&box.top<=item.value.y+item.value.height;
  }
  const pointer=event=>{
    const r=canvas.getBoundingClientRect();let point={x:(event.clientX-r.left-fit.x)/fit.scale,y:(event.clientY-r.top-fit.y)/fit.scale,nodeId:PlanTopology.uid()};
    const settings=precision();
    if(settings.gridSnap&&!event.altKey){const step=settings.step/outline().metersPerUnit;if(step>0){point.x=Math.round(point.x/step)*step;point.y=Math.round(point.y/step)*step;}}
    if(start&&event.shiftKey&&['line','polyline'].includes(drawingTool)){
      const dx=point.x-start.x,dy=point.y-start.y,angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);
      point={x:start.x+Math.cos(angle)*length,y:start.y+Math.sin(angle)*length,nodeId:point.nodeId};
    }
    if(start&&event.shiftKey&&drawingTool==='rectangle'){const size=Math.max(Math.abs(point.x-start.x),Math.abs(point.y-start.y));point={x:start.x+(point.x>=start.x?1:-1)*size,y:start.y+(point.y>=start.y?1:-1)*size,nodeId:point.nodeId};}
    snapped=false;snapKind='';
    if(settings.snap!=='none'&&!event.altKey){
      const candidates=PlanSnap.candidates(outline(),point,start,12/fit.scale).filter(candidate=>settings.snap!=='end'||candidate.kind==='Koniec');
      let best=null,bestScore=Infinity;
      for(const candidate of candidates){const endpoint=candidate.point,dist=distance(point,endpoint)*fit.scale;
        if(dist>=12||start&&distance(endpoint,start)*fit.scale<1)continue;
        if(start&&event.shiftKey&&['line','polyline','rectangle'].includes(drawingTool)){const dx=(point.x-start.x)*fit.scale,dy=(point.y-start.y)*fit.scale,ex=(endpoint.x-start.x)*fit.scale,ey=(endpoint.y-start.y)*fit.scale,len=Math.hypot(dx,dy);if(!len||Math.abs(dx*ey-dy*ex)/len>.5||dx*ex+dy*ey<0)continue;}
        const score=dist+(['Na linii','Na krzywej'].includes(candidate.kind)?8:0);if(score<bestScore){bestScore=score;best=candidate;}
      }
      if(best){point={...best.point};if(!settings.infer||best.kind!=='Koniec')point.nodeId=PlanTopology.uid();snapped=true;snapKind=best.kind;}
    }
    point.nodeId??=PlanTopology.uid();
    return point;
  };
  function editDimension(lineId,referenceId){
    const index=outline().lines.findIndex(line=>line.id===lineId);if(index<0)return;
    selectedItems=new Set([`line:${index}`]);syncSelection();propertyEditorOpen=true;updateProperties();
    if(referenceId){const refIndex=outline().lines.findIndex(line=>line.id===referenceId);if(refIndex>=0){referenceInput.value=String(refIndex);updateProperties();}}
    status.textContent='Dwuklik wartości po lewej pozwala edytować wymiar lub kąt.';drawLines();
  }
  canvas.addEventListener('dblclick',event=>{
    if(drawing)return;const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,hit=dimensionHits.find(hit=>x>=hit.left&&x<=hit.right&&y>=hit.top&&y<=hit.bottom);
    if(hit){event.preventDefault();editMeasurement(hit);selectedDetail?.button?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return;}
    if(drawingTool!=='select')return;
    const point=pointer(event),item=hitItem(rawPointer(event));if(item?.kind!=='line')return;event.preventDefault();
    const geometry=outline(),before=structuredClone(geometry);
    try{
      const pieces=PlanEditing.split(geometry,item.value,point);PlanTopology.normalize(geometry);PlanTopology.prune(geometry);
      selectedItems=new Set(pieces.map(line=>`line:${geometry.lines.indexOf(line)}`));syncSelection();drawLines();save(snapshot());notify('Dodano punkt i podzielono linię na dwa połączone odcinki.');
    }catch(error){currentPlan().outline=before;notify(error.message);drawLines();}
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!currentPlan()||!fit)return;
    if(event.button===1||event.button===0&&spaceDown){event.preventDefault();canvas.focus();panDrag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);return;}
    if(drawingTool==='polyedit'&&event.button===0){
      event.preventDefault();const point=rawPointer(event),hit=hitItem(point);if(!hit||hit.kind==='background')return;const geometry=outline(),before=structuredClone(geometry);
      try{
        if(['join','extend'].includes(editMode)){
          if(!editFirst){editFirst={id:hit.value.id,key:hit.value.a&&distance(point,hit.value.a)<distance(point,hit.value.b)?'a':'b'};selectedItems=new Set([hit.key]);syncSelection();return;}
          const first=[...geometry.lines,...geometry.shapes].find(object=>object.id===editFirst.id);if(!first||first===hit.value)return;
          if(editMode==='join')PlanEditing.join(geometry,first,hit.value,12/fit.scale);else{const change=PlanEditing.extend(geometry,first,hit.value,editFirst.key);if(!moveNodes([change]))throw Error('Wydłużenie koliduje z wiązaniami.');}editFirst=null;
        }else if(editMode==='remove')PlanEditing.removeVertex(geometry,hit.value,distance(point,hit.value.a)<distance(point,hit.value.b)?'a':'b');
        else PlanEditing.split(geometry,hit.value,point,editMode==='break');
        PlanTopology.normalize(geometry);PlanTopology.prune(geometry);selectedItems.clear();syncSelection();drawLines();save(snapshot());
      }catch(error){currentPlan().outline=before;editFirst=null;notify(error.message);drawLines();}return;
    }
    if(drawingTool==='calibrate'&&event.button===0){
      if(!calibration)return;event.preventDefault();const point=rawPointer(event);calibration.points.push(point);if(calibration.points.length===2){if(distance(...calibration.points)*fit.scale<3){calibration.points.pop();return;}const menu=document.getElementById('calibration-menu');menu.style.left=`${Math.max(8,Math.min(event.clientX,innerWidth-330))}px`;menu.style.top=`${Math.max(8,Math.min(event.clientY,innerHeight-150))}px`;canvas.addEventListener('click',()=>{menu.showPopover();menu.elements.distance.focus();},{once:true});}drawLines();return;
    }
    if(drawingTool==='relation'&&event.button===0){
      event.preventDefault();canvas.focus();const point=rawPointer(event),hit=hitItem(point);if(!hit||hit.kind==='background')return;
      if(relationPicks.some(pick=>pick.id===hit.value.id))return;
      const key=hit.value.type==='circle'?'center':distance(point,hit.value.a)<=distance(point,hit.value.b)?'a':'b';
      relationPicks.push({id:hit.value.id,key,kind:hit.kind==='line'?'line':hit.value.type});selectedItems.add(hit.key);syncSelection();
      if(relationPicks.length<(relationType==='symmetric'?3:2))return;
      const [a,b,axis]=relationPicks,linePair=a.kind==='line'&&b.kind==='line',round=kind=>['arc','circle'].includes(kind);
      const supported={parallel:linePair,perpendicular:linePair,collinear:[a.kind,b.kind].every(kind=>['line','arc','bezier'].includes(kind)),distance:linePair,equal:linePair||round(a.kind)&&round(b.kind),concentric:round(a.kind)&&round(b.kind),symmetric:linePair&&axis?.kind==='line',pointOn:['line','arc','circle','bezier'].includes(b.kind),smooth:[a.kind,b.kind].includes('bezier')&&a.kind!=='circle'&&b.kind!=='circle',tangent:!linePair,coincident:true},allowed=Boolean(supported[relationType]);
      if(!allowed){notify('Ta zależność nie obsługuje wskazanej pary obiektów.');relationPicks=[];return;}
      const geometry=outline(),before=captureMovement(),relation={id:PlanTopology.uid(),type:relationType,objects:relationPicks.map(pick=>pick.id),keyA:a.key,keyB:b.key};
      const symmetricTypes=['parallel','perpendicular',...(linePair?['collinear']:[]),'equal','concentric'];
      if(geometry.relations.some(existing=>existing.type===relation.type&&(symmetricTypes.includes(relation.type)?[...existing.objects].sort().join('|')===[...relation.objects].sort().join('|'):existing.objects.join('|')===relation.objects.join('|')&&existing.keyA===relation.keyA&&existing.keyB===relation.keyB))){notify('To wiązanie już istnieje.');relationPicks=[];return;}
      geometry.relations.push(relation);
      if(!moveNodes([])){geometry.relations.pop();restoreMovement(before);notify('Nie można dodać wiązania: koliduje z istniejącymi ograniczeniami.');}
      else{if(relationType==='coincident'||relationType==='collinear'&&!linePair){const objects=[...geometry.lines,...geometry.shapes],first=objects.find(object=>object.id===a.id),second=objects.find(object=>object.id===b.id);PlanTopology.connect(geometry,second[b.key],first[a.key]);}save(snapshot());notify('Dodano wiązanie.');}
      relationPicks=[];updateProperties();drawLines();return;
    }
    if(drawingTool==='bindings'&&event.button===0){
      if(bindingMethod==='fixPoint'){
        const point=rawPointer(event),candidates=allItems().filter(item=>item.kind!=='background').flatMap(item=>(item.kind==='line'?[item.value.a,item.value.b]:item.value.type==='circle'?[item.value.center]:[item.value.a,item.value.b,item.value.via]).map(p=>({point:p,item}))).filter(candidate=>distance(candidate.point,point)*fit.scale<12).sort((a,b)=>distance(a.point,point)-distance(b.point,point));
        if(!candidates.length)return;const chosen=candidates[0];if(chosen.item.value.locked){notify('Najpierw odblokuj element.');return;}const fixed=outline().fixedNodes,id=chosen.point.nodeId,index=fixed.indexOf(id);if(index<0)fixed.push(id);else fixed.splice(index,1);selectedItems=new Set([chosen.item.key]);syncSelection();save(snapshot());return;
      }
      if(bindingMethod==='fix'){
        const hit=hitItem(rawPointer(event));if(!hit||hit.kind==='background')return;selectedItems=new Set([hit.key]);syncSelection();if(!hit.value.locked){hit.value.fixed=!hit.value.fixed;updateProperties();save(snapshot());drawLines();}return;
      }
      event.preventDefault();const index=hitLine(rawPointer(event));if(index<0)return;
      selectedItems=new Set([`line:${index}`]);syncSelection();
      const line=selection();if(line.locked){notify('Odblokuj linię, aby zmienić wiązanie.');return;}
      if(bindingMethod==='horizontal'||bindingMethod==='vertical'||bindingMethod==='none'){applyPlaneBinding(bindingMethod==='none'?null:bindingMethod,bindingMethod==='vertical'?90:0);return;}
      document.getElementById('plane-angle-entry').hidden=true;planeMenu.elements.degrees.required=false;
      if(bindingMethod==='angle'){document.getElementById('plane-angle-entry').hidden=false;planeMenu.elements.degrees.required=true;planeMenu.elements.degrees.value=line.directionBinding?.degrees??Number((-Math.atan2(line.b.y-line.a.y,line.b.x-line.a.x)*180/Math.PI).toFixed(2));}
      document.getElementById('plane-angle-release').disabled=!line.directionBinding&&!line.fixedAngle;
      planeMenu.style.left=`${Math.max(8,Math.min(event.clientX+10,innerWidth-240))}px`;planeMenu.style.top=`${Math.max(8,Math.min(event.clientY+10,innerHeight-260))}px`;
      canvas.addEventListener('click',()=>{if(drawingTool==='bindings')planeMenu.showPopover();},{once:true});return;
    }
    const nearHandle=!drawing&&chosenItems().some(item=>item.kind==='line'?[item.value.a,item.value.b].some(point=>distance(rawPointer(event),point)*fit.scale<10):item.kind==='shape'?(item.value.type==='circle'?[item.value.center,{x:item.value.center.x+item.value.radius,y:item.value.center.y}]:[item.value.a,item.value.b,item.value.via]).some(point=>distance(rawPointer(event),point)*fit.scale<10):false);
    if(!nearHandle&&event.button===0&&!drawing){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,hit=dimensionHits.find(hit=>x>=hit.left&&x<=hit.right&&y>=hit.top&&y<=hit.bottom);if(hit){
      event.preventDefault();canvas.focus();
      if(['length','shapeDimension','partialArcDimension'].includes(hit.kind)||hit.annotationId){
        const target=dimensionTarget(hit);if(!target)return;if([...outline().lines,...outline().shapes].some(object=>(target.objects||[hit.lineId||hit.shapeId,hit.referenceId]).includes(object.id)&&PlanLayers.locked(outline(),object)))return;
        let nx=0,ny=0,field='dimensionOffset',offset=0;
        if(hit.kind==='length'){const dx=hit.b.x-hit.a.x,dy=hit.b.y-hit.a.y,len=Math.hypot(dx,dy),sign=dx<0||Math.abs(dx)<1e-8&&dy<0?-1:1;nx=sign*dy/len;ny=-sign*dx/len;offset=Number.isFinite(target.dimensionOffset)?target.dimensionOffset*fit.scale:hit.dimensionId?64:36;}
        else if(hit.kind==='partialArcDimension'){nx=hit.normal.x;ny=hit.normal.y;offset=Number.isFinite(target.dimensionOffset)?target.dimensionOffset*fit.scale:36;}
        else if(hit.shapeId)field='dimensionTextOffset';
        else{field='dimensionRadius';nx=hit.normal.x;ny=hit.normal.y;offset=Number.isFinite(target.dimensionRadius)?target.dimensionRadius*fit.scale:36;}
        selectedMeasurement={...hit};selectedDetail={release:()=>removeMeasurement(hit)};drawLines();dimensionDrag={hit,field,origin:{x:event.clientX,y:event.clientY},nx,ny,before:structuredClone(target[field]),offset,moved:false};canvas.setPointerCapture(event.pointerId);
      }else canvas.addEventListener('click',()=>editMeasurement(hit),{once:true});return;
    }}
    if(['length','angle'].includes(drawingTool)&&event.button===0){
      if(drawingTool==='length'&&['pointDistance','pointHorizontal','pointVertical','partialArcLength'].includes(dimensionMode)){
        event.preventDefault();canvas.focus();const geometry=outline(),p=rawPointer(event),partial=dimensionMode==='partialArcLength';
        const refs=PlanDimensions.references(geometry).filter(ref=>!partial||geometry.shapes.some(s=>s.id===ref.objectId&&s.type==='arc'&&(!dimensionFirst||ref.objectId===dimensionFirst.objectId)));
        const candidates=refs.map(ref=>({ref,p:PlanDimensions.point(geometry,ref)})).filter(c=>distance(c.p,p)*fit.scale<12).sort((a,b)=>distance(a.p,p)-distance(b.p,p));
        if(!candidates.length){notify(partial?'Wskaż punkt na tym samym łuku.':'Kliknij oznaczony punkt obiektu.');return;}
        const ref=candidates[0].ref;if(!dimensionFirst){dimensionFirst=ref;drawLines();return;}
        if(ref.objectId===dimensionFirst.objectId&&ref.key===dimensionFirst.key)return;
        geometry.dimensions.push({id:PlanTopology.uid(),type:dimensionMode,objects:[...new Set([dimensionFirst.objectId,ref.objectId])],points:[{...dimensionFirst},{...ref}]});dimensionFirst=null;drawLines();save(snapshot());return;
      }
      if(drawingTool==='length'&&['radius','diameter','arcLength'].includes(dimensionMode)){
        event.preventDefault();const hit=hitItem(rawPointer(event));if(hit?.kind!=='shape'||!['arc','circle'].includes(hit.value.type)||dimensionMode==='arcLength'&&hit.value.type!=='arc'){notify('Wskaż okrąg lub łuk odpowiedni do tego pomiaru.');return;}hit.value.dimensionType=dimensionMode;hit.value.hideDimension=false;selectedItems=new Set([hit.key]);syncSelection();drawLines();save(snapshot());return;
      }
      event.preventDefault();canvas.focus();const index=hitLine(rawPointer(event)),geometry=outline(),line=geometry.lines[index];if(!line)return;
      if(drawingTool==='length'){
        if(!geometry.metersPerUnit){notify('Najpierw zaznacz linię i podaj jej znaną długość, aby ustalić skalę rzutu.');return;}
        if(dimensionMode==='distance'){
          if(!dimensionFirst){dimensionFirst=line.id;selectedItems=new Set([`line:${index}`]);syncSelection();return;}if(dimensionFirst===line.id)return;
          const first=geometry.lines.find(item=>item.id===dimensionFirst),u={x:first.b.x-first.a.x,y:first.b.y-first.a.y},v={x:line.b.x-line.a.x,y:line.b.y-line.a.y};if(Math.abs(u.x*v.y-u.y*v.x)>1e-5*Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)){notify('Pomiar odstępu wymaga linii równoległych.');dimensionFirst=null;return;}
          geometry.dimensions??=[];geometry.dimensions.push({id:PlanTopology.uid(),type:'distance',objects:[first.id,line.id]});dimensionFirst=null;drawLines();save(snapshot());return;
        }
        if(['totalHorizontal','totalVertical'].includes(dimensionMode)){
          const objects=geometry.lines.filter(other=>other===line||line.polylineId&&other.polylineId===line.polylineId).map(other=>other.id);geometry.dimensions??=[];geometry.dimensions.push({id:PlanTopology.uid(),type:dimensionMode,objects});drawLines();save(snapshot());return;
        }
        const members=dimensionMode==='chain'&&line.polylineId?geometry.lines.filter(other=>other.polylineId===line.polylineId):[line];for(const member of members){member.showLength=true;member.dimensionType=dimensionMode==='chain'?'aligned':dimensionMode;}editDimension(line.id);
      }else{
        if(!angleFirst){angleFirst=line.id;drawLines();return;}
        if(angleFirst===line.id)return;
        geometry.angles??=[];const found=geometry.angles.findIndex(item=>item.a===angleFirst&&item.b===line.id||item.b===angleFirst&&item.a===line.id);
        if(found<0)geometry.angles.push({a:angleFirst,b:line.id});editDimension(line.id,angleFirst);angleFirst=null;
      }
      drawLines();save(snapshot());return;
    }
    if(drawingTool==='trim'&&event.button===0){
      event.preventDefault();canvas.focus();const result=PlanTrimming.trim(outline(),rawPointer(event),10/fit.scale);
      if(!result.changed)notify(result.message);selectedLine=-1;selectedItems.clear();updateProperties();drawLines();if(result.changed)save(snapshot());return;
    }
    if(!drawing&&event.button===0){
      event.preventDefault();canvas.focus();const point=rawPointer(event);
      const vertex=PlanTopology.vertices(outline()).filter(vertex=>vertex.references.some(ref=>!ref.object.locked&&!PlanLayers.locked(outline(),ref.object))).map(vertex=>({vertex,distance:distance(point,vertex.point)*fit.scale})).filter(hit=>hit.distance<10).sort((a,b)=>a.distance-b.distance)[0]?.vertex;
      if(vertex){selectedItems.clear();syncSelection();selectedVertex=vertex.nodeId;updateProperties();vertexDrag={origin:point,point:{...vertex.point},before:captureMovement()};canvas.setPointerCapture(event.pointerId);drawLines();return;}
      const arcs=outline().shapes||[];
      for(let index=0;index<arcs.length;index++){
        if(!PlanLayers.visible(outline(),arcs[index])||PlanLayers.locked(outline(),arcs[index]))continue;
        if(arcs[index].type==='circle'&&selectedItems.has(`shape:${index}`)){
          const circle=arcs[index],radial={x:circle.center.x+circle.radius,y:circle.center.y,nodeId:`${circle.id}:radius`},key=distance(point,circle.center)*fit.scale<10?'center':distance(point,radial)*fit.scale<10?'radial':null;
          if(key){if(!circle.locked)arcDrag={index,key,origin:point,point:{...(key==='center'?circle.center:radial)},before:captureMovement()};canvas.setPointerCapture(event.pointerId);return;}
        }
        const arc=arcs[index];if(!['arc','bezier'].includes(arc.type))continue;
        const key=['a','via','b'].find(key=>distance(point,arc[key])*fit.scale<10);if(!key)continue;
        selectedItems=new Set([`shape:${index}`]);syncSelection();
        if(!arc.locked)arcDrag={index,key,origin:point,point:{...arc[key]},before:captureMovement()};
        canvas.setPointerCapture(event.pointerId);return;
      }
      const handle=chosenItems().filter(item=>item.kind==='line').flatMap(item=>['a','b'].map(key=>({line:item.value,key}))).find(item=>distance(point,item.line[item.key])*fit.scale<10);
      if(handle){if(!handle.line.locked)lineDrag={origin:point,line:structuredClone(handle.line),key:handle.key,before:captureMovement()};canvas.setPointerCapture(event.pointerId);return;}
      const hit=hitItem(point);
      if(hit){
        const keys=event.ctrlKey||event.metaKey?[hit.key]:keysForItem(hit);
        if(event.shiftKey){const remove=keys.every(key=>selectedItems.has(key));keys.forEach(key=>remove?selectedItems.delete(key):selectedItems.add(key));syncSelection();return;}
        if(!selectedItems.has(hit.key))selectedItems=new Set(keys);
        syncSelection();if(chosenItems().some(item=>!item.value.locked))groupDrag={origin:point,before:captureMovement()};
      }else{marquee={origin:point,current:point,initial:new Set(event.shiftKey?selectedItems:[])};selectedItems=new Set(marquee.initial);syncSelection();}
      canvas.setPointerCapture(event.pointerId);return;
    }
    if(!drawing||event.button!==0)return;
    event.preventDefault();canvas.focus();const point=pointer(event);
    if(drawingTool==='circle'&&['ttr','tangent3'].includes(circleMethod)){
      const hit=hitItem(rawPointer(event));if(hit?.kind!=='line'){notify('Wskaż prosty odcinek w pobliżu punktu styczności.');return;}if(circlePicks.some(p=>p.line.id===hit.value.id))return;
      if(circleMethod==='ttr'&&circlePicks.length===2)return;circlePicks.push({line:hit.value,point:rawPointer(event)});
      if(circleMethod==='tangent3'&&circlePicks.length===3){if(!commitSketchShape(PlanSketchTools.tangentCircle(circlePicks.map(p=>p.line),circlePicks.map(p=>p.point))))circlePicks.pop();}
      drawLines();return;
    }
    if(drawingTool==='arc'&&arcMethod==='tangent'&&!start){
      const candidates=allItems().filter(item=>item.kind!=='background'&&item.value.type!=='circle'&&PlanLayers.visible(outline(),item.value)).flatMap(item=>['a','b'].map(key=>({item,key,point:item.value[key]}))).filter(c=>c.point&&distance(c.point,point)*fit.scale<12).sort((a,b)=>distance(a.point,point)-distance(b.point,point));
      const chosen=candidates[0];if(!chosen){notify('Wskaż koniec istniejącej linii lub krzywej.');return;}
      const object=chosen.item.value,path=PlanTrimming.path(object,chosen.item.kind,chosen.item.index);if(!path)return;
      const endpoint=chosen.point,inside=path.at(chosen.key==='a'?.0001:.9999);tangentStart={x:endpoint.x-inside.x,y:endpoint.y-inside.y,objectId:object.id,key:chosen.key};start={...endpoint};hover=start;drawLines();return;
    }
    if(!start){start=point;hover=point;if(drawingTool==='polyline'){polylineStart={...point};polylineId=crypto.randomUUID();}drawLines();return;}
    if(Math.hypot(point.x-start.x,point.y-start.y)*fit.scale<3)return;
    const geometry=outline();
    const activeLayer=geometry.layers.find(layer=>layer.id===geometry.activeLayerId);if(!activeLayer||activeLayer.locked||activeLayer.visible===false){notify('Aktywna warstwa musi być widoczna i odblokowana.');return;}
    if(drawingTool==='polyline'){
      const closed=distance(point,polylineStart)<1e-6;
      if(closed&&geometry.lines.filter(line=>line.polylineId===polylineId).length<2){notify('Aby zamknąć obrys, wskaż co najmniej trzy różne punkty.');return;}
      geometry.lines.push({a:{...start},b:{...point},polylineId});
      start=closed?null:{...point};hover=null;
      if(closed){polylineStart=null;polylineId=null;}
      stampNewGeometry(geometry);drawLines();save(snapshot());return;
    }
    if(drawingTool==='arc'&&arcMethod==='tangent'){commitSketchShape(PlanSketchTools.tangentArc(start,point,tangentStart));return;}
    if(drawingTool==='circle'){if(circleMethod==='three'&&!arcVia){arcVia=point;hover=null;drawLines();return;}commitSketchShape(roundShape(point));return;}
    if(drawingTool==='arc'&&!arcVia){arcVia=point;hover=null;drawLines();return;}
    if(drawingTool==='arc'){
      const arc=arcFromPoints(start,arcVia,point);
      if(!arc||arc.type!=='bezier'&&!arcGeometry(arc.a,arc.via,arc.b)){notify('Nie można utworzyć łuku z tych punktów. Wskaż inny punkt.');return;}
      geometry.shapes??=[];geometry.shapes.push(arc);
    }else if(drawingTool==='circle'){
      geometry.shapes??=[];geometry.shapes.push({type:'circle',center:start,radius:distance(start,point)});
    }else if(drawingTool==='rectangle'){
      if(Math.min(Math.abs(point.x-start.x),Math.abs(point.y-start.y))*fit.scale<3)return;
      const corners=[start,{x:point.x,y:start.y,nodeId:PlanTopology.uid()},point,{x:start.x,y:point.y,nodeId:PlanTopology.uid()}],polylineId=PlanTopology.uid();
      const sides=[];for(let i=0;i<4;i++){const line={id:PlanTopology.uid(),a:{...corners[i]},b:{...corners[(i+1)%4]},polylineId};geometry.lines.push(line);sides.push(line);}
      if(precision().infer){for(const [type,a,b]of[['parallel',0,2],['parallel',1,3],['perpendicular',0,1],...(event.shiftKey?[['equal',0,1]]:[])])geometry.relations.push({id:PlanTopology.uid(),type,objects:[sides[a].id,sides[b].id]});}
    }else geometry.lines.push({a:start,b:point});
    stampNewGeometry(geometry);start=null;hover=null;arcVia=null;drawLines();save(snapshot());
  });
  canvas.addEventListener('pointermove',event=>{
    lastPointer=event;
    if(vertexDrag){const drag=vertexDrag,point=rawPointer(event),target=snapDraggedPoint({x:drag.point.x+point.x-drag.origin.x,y:drag.point.y+point.y-drag.origin.y},drag.point,event,drag),previous=captureMovement();restoreMovement(drag.before);if(!moveNodes([{from:drag.point,to:target}]))restoreMovement(previous);canvas.style.cursor='grabbing';drawLines();return;}
    if(arcDrag){
      const drag=arcDrag,point=rawPointer(event);let target={x:drag.point.x+point.x-drag.origin.x,y:drag.point.y+point.y-drag.origin.y};target=snapDraggedPoint(target,drag.point,event,drag);const previous=captureMovement();
      restoreMovement(drag.before);
      if(drag.key==='radial'){
        const shape=outline().shapes[drag.index];if(shape.fixedRadius){restoreMovement(previous);return;}
        shape.radius=distance(shape.center,target);if(shape.radius*fit.scale<3||!moveNodes([]))restoreMovement(previous);drawLines();return;
      }
      if(!moveNodes([{from:drag.point,to:target}]))restoreMovement(previous);
      canvas.style.cursor='grabbing';drawLines();return;
    }
    if(dimensionDrag){
      const drag=dimensionDrag,dx=event.clientX-drag.origin.x,dy=event.clientY-drag.origin.y,target=dimensionTarget(drag.hit);
      if(Math.hypot(dx,dy)>3)drag.moved=true;
      if(drag.moved&&target){
        if(drag.field==='dimensionTextOffset')target[drag.field]={x:(drag.before?.x||0)+dx/fit.scale,y:(drag.before?.y||0)+dy/fit.scale};
        else {const offset=drag.offset+dx*drag.nx+dy*drag.ny;target[drag.field]=(drag.field==='dimensionOffset'&&target.type!=='distance'?PlanDimensions.snapOffset(offset):offset)/fit.scale;}
        canvas.style.cursor='grabbing';drawLines();
      }return;
    }
    if(fit&&!panDrag&&!lineDrag&&!groupDrag&&!marquee){hoveredItem=hitItem(rawPointer(event))?.key||null;if(!drawing)canvas.style.cursor=hoveredItem?'pointer':'default';}
    if(!drawing&&!panDrag&&!lineDrag&&!groupDrag&&!marquee){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(dimensionHits.some(hit=>hit.kind==='length'&&x>=hit.left&&x<=hit.right&&y>=hit.top&&y<=hit.bottom))canvas.style.cursor='grab';}
    if(panDrag){panX+=event.clientX-panDrag.x;panY+=event.clientY-panDrag.y;panDrag={x:event.clientX,y:event.clientY};layout();return;}
    if(marquee){marquee.current=rawPointer(event);const crossing=marquee.current.x<marquee.origin.x,box={left:Math.min(marquee.origin.x,marquee.current.x),right:Math.max(marquee.origin.x,marquee.current.x),top:Math.min(marquee.origin.y,marquee.current.y),bottom:Math.max(marquee.origin.y,marquee.current.y)};selectedItems=new Set([...marquee.initial,...allItems().filter(item=>crossing?intersectsBox(item,box):itemPoints(item).every(point=>point.x>=box.left&&point.x<=box.right&&point.y>=box.top&&point.y<=box.bottom)).flatMap(keysForItem)]);syncSelection();return;}
    if(groupDrag){const point=rawPointer(event);moveGroup({x:point.x-groupDrag.origin.x,y:point.y-groupDrag.origin.y},groupDrag.before);positionBackgrounds();updateProperties();drawLines();return;}
    if(lineDrag){
      const point=rawPointer(event),delta={x:point.x-lineDrag.origin.x,y:point.y-lineDrag.origin.y},previous=captureMovement();restoreMovement(lineDrag.before);
      const keys=lineDrag.key?[lineDrag.key]:['a','b'];
      if(!moveNodes(keys.map(key=>({from:lineDrag.line[key],to:snapDraggedPoint({x:lineDrag.line[key].x+delta.x,y:lineDrag.line[key].y+delta.y},lineDrag.line[key],event,lineDrag)}))))restoreMovement(previous);
      updateProperties();drawLines();return;
    }
    if(drawing&&fit)hover=pointer(event);drawLines();
  });
  for(const type of['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{
    if(vertexDrag){const drag=vertexDrag;vertexDrag=null;if(type==='pointercancel')restoreMovement(drag.before);else{commitConnection(drag,drag.point);if(JSON.stringify(drag.before)!==JSON.stringify(captureMovement()))save(snapshot());}canvas.style.cursor='default';drawLines();}
    if(arcDrag){const drag=arcDrag;arcDrag=null;if(type==='pointercancel')restoreMovement(drag.before);else{if(['a','b','center'].includes(drag.key))commitConnection(drag,drag.point);if(JSON.stringify(drag.before)!==JSON.stringify(captureMovement()))save(snapshot());}canvas.style.cursor='default';drawLines();}
    if(dimensionDrag){const drag=dimensionDrag;dimensionDrag=null;if(type==='pointercancel')restoreDimensionDrag(drag);else if(drag.moved)save(snapshot());else if(type==='pointerup')canvas.addEventListener('click',()=>editMeasurement(drag.hit),{once:true});canvas.style.cursor='default';drawLines();}
    if(marquee){if(type==='pointercancel')selectedItems=marquee.initial;marquee=null;syncSelection();}
    if(groupDrag){const before=groupDrag.before;groupDrag=null;if(type==='pointercancel')restoreMovement(before);else if(JSON.stringify(before)!==JSON.stringify(captureMovement()))save(snapshot());positionBackgrounds();updateProperties();drawLines();}
    if(panDrag)rememberViewport();panDrag=null;if(lineDrag){const drag=lineDrag;lineDrag=null;if(type==='pointercancel')restoreMovement(drag.before);else{commitConnection(drag,drag.line[drag.key]);if(JSON.stringify(drag.before)!==JSON.stringify(captureMovement()))save(snapshot());}updateProperties();drawLines();}
  });
  canvas.addEventListener('pointerleave',()=>{hover=null;hoveredItem=null;drawLines();});
  canvas.addEventListener('keydown',event=>{
    if(['Delete','Backspace'].includes(event.key)&&!drawing){event.preventDefault();if(orbitMode&&surfaceMode){selectedFaces.clear();renderOrbit();return;}deleteSelected();return;}
    if(event.code==='Space'){event.preventDefault();spaceDown=true;canvas.classList.add('panning');}
    if(event.key==='Shift'&&lastPointer&&start){hover=pointer({clientX:lastPointer.clientX,clientY:lastPointer.clientY,shiftKey:true});drawLines();}
    if(event.key==='Enter'&&drawingTool==='polyline'){event.preventDefault();start=null;hover=null;polylineStart=null;polylineId=null;drawLines();}
    if(event.key==='Escape'){event.preventDefault();escapeToSelection();}
  });
  function escapeToSelection(){
    if(layersMenu.matches(':popover-open'))layersMenu.hidePopover();
    if(vertexDrag){restoreMovement(vertexDrag.before);vertexDrag=null;}selectedVertex=null;
    editFirst=null;
    calibration=null;
    relationPicks=[];
    if(arcDrag){restoreMovement(arcDrag.before);arcDrag=null;}
    if(dimensionDrag){restoreDimensionDrag(dimensionDrag);dimensionDrag=null;}
    if(lineDrag){restoreMovement(lineDrag.before);lineDrag=null;}
    if(groupDrag){restoreMovement(groupDrag.before);groupDrag=null;positionBackgrounds();}
    marquee=null;panDrag=null;setDrawingTool('select');
  }
  document.addEventListener('keydown',event=>{
    if(document.getElementById('plan-view').hidden||document.querySelector('dialog[open]')||event.target===canvas||event.target.matches('input,textarea,select'))return;
    if(event.key==='Escape'){event.preventDefault();escapeToSelection();}
    if(['Delete','Backspace'].includes(event.key)&&!drawing){event.preventDefault();if(orbitMode&&surfaceMode){selectedFaces.clear();renderOrbit();return;}deleteSelected();}
  });
  canvas.addEventListener('keyup',event=>{if(event.code==='Space'){spaceDown=false;canvas.classList.remove('panning');}if(event.key==='Shift'&&lastPointer&&start){hover=pointer({clientX:lastPointer.clientX,clientY:lastPointer.clientY,shiftKey:false});drawLines();}});
  canvas.addEventListener('blur',()=>{spaceDown=false;panDrag=null;canvas.classList.remove('panning');});
  function render(){
    const keepView=renderedPlanId===active&&fit?{zoom,panX,panY,baseWidth,baseHeight}:null;
    if(renderedPlanId!==active){
      clearWallSelection();
      if(exhibitionSurface){exhibitionSurface=null;exhibitionEditor.hidden=true;document.getElementById('plan-view').classList.remove('exhibition-mode');}
      const saved=viewports[active]?.orbit;
      orbitMode=saved?.mode===true;orbitProjection=saved?.projection==='perspective'?'perspective':'axonometric';document.getElementById('orbit-projection').value=orbitProjection;orbitYaw=initialOrbit.yaw;orbitPitch=initialOrbit.pitch;orbitRoll=0;
      orbitView={scale:null,zoom:1,panX:0,panY:0,center:null};
      if(saved&&[saved.yaw,saved.pitch,saved.roll].every(Number.isFinite)){
        orbitYaw=saved.yaw;orbitPitch=saved.pitch;orbitRoll=saved.roll;
        const view=saved.view;if(view&&[view.scale,view.zoom,view.panX,view.panY,view.center?.x,view.center?.y].every(Number.isFinite)&&view.scale>0&&view.zoom>=.1&&view.zoom<=16)orbitView=structuredClone(view);
      }
      document.getElementById('plan-view').classList.toggle('orbit-mode',orbitMode);orbitButton.setAttribute('aria-pressed',String(orbitMode));orbitButton.setAttribute('aria-label','Widok 3D');orbitButton.title='Widok 3D';exhibitionPicking=false;syncWorkspace(orbitMode?'model':'sketch');
    }
    renderedPlanId=active;
    dimensionDrag=null;arcDrag=null;vertexDrag=null;selectedVertex=null;propertyEditorOpen=false;
    selectedItems.clear();marquee=null;groupDrag=null;
    hoveredItem=null;angleFirst=null;
    start=null;hover=null;arcVia=null;zoom=1;panX=panY=0;snapped=false;panDrag=null;lineDrag=null;selectedLine=-1;updateProperties();
    polylineStart=null;polylineId=null;
    restoreViewport=true;baseWidth=0;
    previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];
    surface.querySelectorAll('img:not(#plan-image)').forEach(photo=>photo.remove());
    list.replaceChildren();
    for(const plan of plans){
      const button=document.createElement('button');button.type='button';button.textContent=plan.name;
      button.setAttribute('aria-pressed',String(plan.id===active));
      button.addEventListener('click',()=>{active=plan.id;render();save(snapshot());});list.append(button);
    }
    document.getElementById('plan-delete').disabled=!plans.length;
    document.getElementById('plan-more').hidden=!plans.length;
    document.getElementById('plan-dimensions-visible').checked=currentPlan()?.showDimensions!==false;
    document.getElementById('plan-dimensions-visible').disabled=!plans.length;
    const current=plans.find(plan=>plan.id===active);
    facesButton.disabled=!current;document.getElementById('plan-edit').disabled=!current;selectedFaces.clear();extrusion=null;extrudeDrag=null;syncSurfaceTools();
    orbitButton.disabled=!current;orbitCanvas.hidden=!orbitMode||!current;
    if(!current)board.classList.remove('metered-grid');
    if(current)outline(current);
    surface.hidden=!current;lineButton.disabled=selectButton.disabled=!current;
    trimButton.disabled=!current;
    document.getElementById('plan-bindings').disabled=!current;
    shapeButtons.forEach(button=>button.disabled=!current);
    measureButtons.forEach(button=>button.disabled=!current);
    canvas.hidden=!current;zoomControls.hidden=!current;
    const assets=backgrounds(current);
    backgroundControl.hidden=!assets.length;backgroundVisible.checked=current?.backgroundVisible!==false;
    placeholder.hidden=Boolean(current);image.hidden=!assets.length||!backgroundVisible.checked;
    image.removeAttribute('src');image.alt=current?.name||'';
    assets.forEach((asset,index)=>{
      const photo=index===0?image:document.createElement('img'),geometry=outline(current);
      const url=URL.createObjectURL(asset.blob);previewUrls.push(url);photo.src=url;photo.alt=asset.name;photo.draggable=false;
      photo.dataset.backgroundId=asset.id;
      photo.style.left=`${asset.x/geometry.width*100}%`;photo.style.top=`${asset.y/geometry.height*100}%`;photo.style.transformOrigin='0 0';photo.style.transform=`rotate(${asset.rotation||0}deg)`;photo.style.width=`${asset.width/geometry.width*100}%`;photo.style.height=`${asset.height/geometry.height*100}%`;
      if(index>0)surface.append(photo);
    });
    updateBackgroundVisibility();
    document.getElementById('plan-board').setAttribute('aria-label',current?.name||'Pole rzutu');
    if(keepView){({zoom,panX,panY,baseWidth,baseHeight}=keepView);restoreViewport=false;}
    layout();
    if(exhibitionSurface)renderExhibition();
  }
  importButton.addEventListener('click',()=>files.click());
  document.getElementById('plan-dimensions-visible').addEventListener('change',event=>{
    const plan=currentPlan();if(!plan)return;plan.showDimensions=event.target.checked;drawLines();save(snapshot());
  });
  document.getElementById('plan-more').addEventListener('click',event=>{
    const menu=document.getElementById('plan-menu'),rect=event.currentTarget.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-170))}px`;menu.style.top=`${rect.bottom+5}px`;menu.showPopover();
  });
  document.addEventListener('keydown',event=>{
    const menu=document.querySelector('#plan-menu:popover-open, #plane-angle-menu:popover-open, #arc-method-menu:popover-open, #line-method-menu:popover-open, #binding-method-menu:popover-open, #precision-menu:popover-open, #object-properties:popover-open, #calibration-menu:popover-open, #transform-menu:popover-open, #dimension-method-menu:popover-open, #dimension-properties:popover-open');
    if(event.key==='Escape'&&menu){event.preventDefault();event.stopImmediatePropagation();menu.hidePopover();}
  },true);
  document.getElementById('plan-delete').addEventListener('click',()=>{
    document.getElementById('plan-menu').hidePopover();
    const plan=currentPlan();if(!plan)return;
    const index=plans.indexOf(plan);plans.splice(index,1);delete viewports[plan.id];
    active=plans[Math.min(index,plans.length-1)]?.id||null;
    render();save(snapshot());saveView(structuredClone(viewports));status.textContent='';notify(`Usunięto rzut: ${plan.name}.`);
  });
  function newPlan(){
    const plan={id:crypto.randomUUID(),name:`Rzut ${plans.length+1}`,backgrounds:[]};
    outline(plan).metersPerUnit=.01;plans.push(plan);active=plan.id;return plan;
  }
  emptyButton.addEventListener('click',()=>{
    newPlan();render();save(snapshot());
  });
  async function importFiles(selected){
    if(!selected.length)return;
    importButton.disabled=emptyButton.disabled=true;
    const errors=[];let added=0;
    let target=currentPlan();
    try{
      for(const file of selected){
        status.textContent=`Wczytuję: ${file.name}`;
        try{
          const prepared=await prepareImage(file);
          URL.revokeObjectURL(prepared.url);
          if(!target)target=newPlan();
          const assets=backgrounds(target),geometry=outline(target),aspect=prepared.pixelWidth/prepared.pixelHeight;
          const width=Math.min(geometry.width,geometry.height*aspect),height=width/aspect;
          const x=assets.length?Math.max(...assets.map(asset=>asset.x+asset.width))+40:0;
          assets.push({id:crypto.randomUUID(),name:file.name,blob:prepared.blob,x,y:0,width,height});added++;
        }catch(error){errors.push(`${file.name}: ${error.message}`);}
      }
      if(added){active=target.id;render();fitBackgrounds();save(snapshot());}
      if(errors.length)notify(errors.join(' '));
    }finally{importButton.disabled=emptyButton.disabled=false;}
  }
  function enqueueFiles(selected){
    importQueue=importQueue.then(()=>importFiles(selected)).catch(()=>{notify('Nie udało się wczytać rzutu. Spróbuj ponownie.');});
    return importQueue;
  }
  files.addEventListener('change',()=>{const selected=Array.from(files.files);files.value='';void enqueueFiles(selected);});
  return {entries:()=>plans.map(plan=>({id:plan.id,name:plan.name})),activate(id){if(!plans.some(plan=>plan.id===id))return;active=id;render();save(snapshot());},snapshot:()=>structuredClone(snapshot()),getViewports:()=>structuredClone(viewports),importFiles:enqueueFiles,load(data,savedViewports={}){
    viewports=savedViewports||{};
    plans=data?.version===2&&Array.isArray(data.plans)?data.plans:[];
    for(const plan of plans)outline(plan);
    active=plans.some(plan=>plan.id===data?.active)?data.active:plans[0]?.id||null;render();savedState=structuredClone(snapshot());historyReady=true;undoStates.length=redoStates.length=0;updateHistory();if(geometryMigrated){persistPlan(snapshot());geometryMigrated=false;}
  },show(){sceneRevision++;restoreViewport=true;layout();const id=viewports[active]?.exhibitionSurface;if(id&&!exhibitionSurface){const surface=exhibitionSurfaces().find(s=>s.id===id);if(surface)openExhibition(surface);}if(exhibitionSurface)renderExhibition();}};
}


const ProjectTreeSize={
  bounds(viewport){const max=Math.max(80,Math.min(600,viewport<=700?viewport-32:viewport-360));return {min:Math.min(200,max),max};},
  clamp(value,viewport){const {min,max}=this.bounds(viewport);return Math.round(Math.max(min,Math.min(max,Number.isFinite(value)?value:232)));}
};
const ImageIcons=(()=>{
  const cache=new WeakMap();
  let queue=Promise.resolve();
  function centerCrop(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Nieprawidłowy rozmiar grafiki.');
    const side=Math.min(width,height);return {x:(width-side)/2,y:(height-side)/2,width:side,height:side};
  }
  function create(blob,size=48){
    if(!(blob instanceof Blob)||!Number.isInteger(size)||size<1||size>256)return Promise.reject(Error('Nieprawidłowe parametry ikony.'));
    let sizes=cache.get(blob);if(!sizes){sizes=new Map();cache.set(blob,sizes);}if(sizes.has(size))return sizes.get(size);
    const promise=queue.then(async()=>{
      const url=URL.createObjectURL(blob),photo=new Image();let canvas;
      try{
        photo.src=url;await photo.decode();const crop=centerCrop(photo.naturalWidth,photo.naturalHeight);
        canvas=document.createElement('canvas');canvas.id='artwork-icon';canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');
        if(!ctx)throw Error('Nie można przygotować ikony.');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(photo,crop.x,crop.y,crop.width,crop.height,0,0,size,size);return canvas.toDataURL('image/png');
      }finally{photo.src='';URL.revokeObjectURL(url);if(canvas)canvas.width=canvas.height=1;}
    });queue=promise.catch(()=>{});sizes.set(size,promise);return promise;
  }
  return {centerCrop,create};
})();
const ImageCollections={
  matches(image,id){return id==='all'||(image.collectionId||'unfiled')===id;},
  name(value,collections,except=null){const name=value.trim();if(!name||name.length>100)throw Error('Wpisz nazwę kolekcji (do 100 znaków).');if(collections.some(folder=>folder.id!==except&&folder.name.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl')))throw Error('Kolekcja o tej nazwie już istnieje.');return name;},
  uniqueName(value,collections){let name=value,index=2;while(collections.some(folder=>folder.name.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl')))name=`${value.slice(0,90)} (${index++})`;return name;},
  subset(collections,records,whole=false){const ids=new Set(records.map(record=>record.image.collectionId));return collections.filter(folder=>whole||ids.has(folder.id));}
};
const ProjectTransfer={
  previewGeometry(plan){
    const geometry=plan.outline||{},paths=PlanCurves.primitives(geometry).map(curve=>PlanCurves.polyline({curve,t0:0,t1:1},Math.max(geometry.width||1000,geometry.height||700)/1200));
    const assets=plan.backgroundVisible===false?[]:(plan.backgrounds||[]).filter(asset=>PlanLayers.visible(geometry,asset));
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const include=p=>{minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);};
    for(const points of paths)for(const p of points)include(p);
    for(const asset of assets){const angle=(asset.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);for(const [x,y]of [[0,0],[asset.width,0],[asset.width,asset.height],[0,asset.height]]){const dx=x-asset.width/2,dy=y-asset.height/2;include({x:asset.x+asset.width/2+c*dx-s*dy,y:asset.y+asset.height/2+s*dx+c*dy});}}
    if(!Number.isFinite(minX)){minX=minY=0;maxX=geometry.width||1000;maxY=geometry.height||700;}
    return {paths,assets,bounds:{minX,minY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)}};
  },
  async thumbnail(plan){
    const {paths,assets,bounds}=this.previewGeometry(plan),canvas=document.createElement('canvas');canvas.id='transfer-raster-'+plan.id;canvas.width=canvas.height=640;
    const ctx=canvas.getContext('2d'),scale=Math.min(592/bounds.width,592/bounds.height);
    ctx.fillStyle='#f7f7f2';ctx.fillRect(0,0,640,640);ctx.translate((640-bounds.width*scale)/2,(640-bounds.height*scale)/2);ctx.scale(scale,scale);ctx.translate(-bounds.minX,-bounds.minY);
    for(const asset of assets){const url=URL.createObjectURL(asset.blob);try{const photo=new Image();photo.src=url;await photo.decode();ctx.save();ctx.translate(asset.x+asset.width/2,asset.y+asset.height/2);ctx.rotate((asset.rotation||0)*Math.PI/180);ctx.drawImage(photo,-asset.width/2,-asset.height/2,asset.width,asset.height);ctx.restore();}finally{URL.revokeObjectURL(url);}}
    ctx.strokeStyle='#263d33';ctx.lineWidth=1.8/scale;ctx.lineJoin='round';ctx.lineCap='round';
    for(const points of paths){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.stroke();}
    if(!paths.length&&!assets.length){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#70776f';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillText('Pusty rzut',320,325);}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));canvas.width=canvas.height=1;if(!blob)throw Error('Nie udało się przygotować podglądu.');return blob;
  },
  async encode(value){
    if(value instanceof Blob)return {$blob:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(value);})};
    if(Array.isArray(value))return Promise.all(value.map(item=>this.encode(item)));
    if(value&&typeof value==='object'){const result={};for(const [key,item]of Object.entries(value))result[key]=await this.encode(item);return result;}
    return value;
  },
  async decode(value){
    if(value&&typeof value==='object'&&Object.hasOwn(value,'$blob')){
      if(typeof value.$blob!=='string'||!/^data:image\/[a-z0-9.+-]+;base64,/i.test(value.$blob))throw Error('Nieprawidłowe zdj?cie w pliku.');
      const [header,body]=value.$blob.split(','),bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));return new Blob([bytes],{type:header.slice(5,header.indexOf(';'))});
    }
    if(Array.isArray(value))return Promise.all(value.map(item=>this.decode(item)));
    if(value&&typeof value==='object'){const result={};for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Nieprawidłowe pole.');result[key]=await this.decode(item);}return result;}
    return value;
  },
  validate(data,kind){
    if(data?.format!=='exhibition-planner'||data.version!==1||!['plans','images','project'].includes(data.kind))throw Error('To nie jest obsługiwany plik aplikacji Wystawa.');
    if(data.kind!==kind)throw Error('Wybierz właściwy typ danych przed importem.');
    if(data.plan?.version!==2||!Array.isArray(data.plan.plans)||!Array.isArray(data.records)||!Array.isArray(data.authors)||!data.viewports||typeof data.viewports!=='object')throw Error('Niepełne dane projektu.');
    for(const plan of data.plan.plans)if(!plan||typeof plan.id!=='string'||!plan.outline||!Array.isArray(plan.outline.lines)||!Array.isArray(plan.outline.shapes))throw Error('Nieprawidłowy rzut.');
    for(const record of data.records)if(!record?.image||typeof record.image.id!=='string'||!(record.image.blob instanceof Blob)||!record.image.blob.type.startsWith('image/'))throw Error('Nieprawidłowy obraz.');
    if(new Set(data.plan.plans.map(plan=>plan.id)).size!==data.plan.plans.length||new Set(data.records.map(record=>record.image.id)).size!==data.records.length)throw Error('Powtórzone identyfikatory w pliku.');
    for(const plan of data.plan.plans){
      if(typeof plan.name!=='string'||!Number.isFinite(plan.outline.width)||!Number.isFinite(plan.outline.height))throw Error('Nieprawidłowe wymiary rzutu.');
      for(const line of plan.outline.lines)if(!line||![line.a?.x,line.a?.y,line.b?.x,line.b?.y].every(Number.isFinite))throw Error('Nieprawidłowa linia rzutu.');
      if(plan.backgrounds!==undefined&&(!Array.isArray(plan.backgrounds)||plan.backgrounds.some(asset=>!asset||!(asset.blob instanceof Blob))))throw Error('Nieprawidłowy podkład.');
    }
    for(const record of data.records)if(record.editor&&(!record.editor.data||!record.editor.fields||!Array.isArray(record.editor.bindings)||!Array.isArray(record.editor.suppressed)))throw Error('Nieprawidłowy opis obrazu.');
    if(data.kind==='images'&&data.plan.plans.length)throw Error('Plik kolekcji zawiera rzuty.');
    if(data.collections!==undefined){
      if(!Array.isArray(data.collections)||data.collections.some(folder=>!folder||typeof folder.id!=='string'||['all','unfiled'].includes(folder.id)||typeof folder.name!=='string'||!folder.name.trim()||folder.name.length>100)||new Set(data.collections.map(folder=>folder.id)).size!==data.collections.length)throw Error('Nieprawidłowe kolekcje.');
      const ids=new Set(data.collections.map(folder=>folder.id));if(data.records.some(record=>record.image.collectionId&&!ids.has(record.image.collectionId)))throw Error('Nieznana kolekcja obrazu.');
    }
  },
  remap(data){
    const ids=new Map();
    // Geometry identifiers belong to their plan. Keep face signatures and node
    // bindings intact; only the globally shared plan and library IDs need new IDs.
    for(const plan of data.plan?.plans||[])ids.set(plan.id,crypto.randomUUID());
    for(const record of data.records||[])ids.set(record.image.id,crypto.randomUUID());
    for(const folder of data.collections||[])ids.set(folder.id,crypto.randomUUID());
    function copy(value){if(typeof value==='string')return ids.get(value)||value;if(!value||typeof value!=='object'||value instanceof Blob)return value;if(Array.isArray(value))return value.map(copy);return Object.fromEntries(Object.entries(value).map(([key,item])=>[ids.get(key)||key,copy(item)]));}
    return copy(data);
  }
};

(() => {
  const themeToggle=document.getElementById('theme-toggle');
  function updateThemeButton(){
    const dark=document.documentElement.dataset.theme==='dark';
    themeToggle.title=dark?'Przełącz na jasny motyw':'Przełącz na ciemny motyw';themeToggle.setAttribute('aria-label',themeToggle.title);
    themeToggle.innerHTML=dark?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg>';
  }
  updateThemeButton();
  themeToggle.addEventListener('click',()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('exhibition-theme',theme);}catch(error){}
    updateThemeButton();document.dispatchEvent(new Event('themechange'));
  });
  const addButton = document.getElementById("add-images");
  const fileInput = document.getElementById("image-files");
  const gallery = document.getElementById("images");
  const emptyMessage = document.getElementById("empty-message");
  const status = document.getElementById("import-status");
  const workspace = document.getElementById("workspace");
  let planEditor=null,planReady=false,planSaveRevision=0;
  let uiState={view:'library',scroll:{}},uiReady=false,activeView='library',restoringScroll=false,scrollTimer,leavingPage=false;
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  function rememberUi(captureScroll=true){
    if(!uiReady||!localDatabase)return;
    uiState.view=activeView;uiState.imageTab=activeImageTab;uiState.collection=activeCollection;
    if(captureScroll&&!restoringScroll)uiState.scroll[activeView]=window.scrollY;
    try{const transaction=localDatabase.transaction('library','readwrite');transaction.objectStore('library').put(uiState,'uiState');}catch(error){/* Bieżący widok nadal działa bez zapisu ustawień. */}
  }
  window.addEventListener('scroll',()=>{if(restoringScroll||!uiReady||leavingPage)return;uiState.scroll[activeView]=window.scrollY;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>rememberUi(false),150);},{passive:true});
  window.addEventListener('beforeunload',()=>{leavingPage=true;clearTimeout(scrollTimer);rememberUi(false);});
  window.addEventListener('pageshow',()=>{leavingPage=false;});
  window.addEventListener('pagehide',()=>{clearTimeout(scrollTimer);rememberUi(false);});
  const planViewButton=document.getElementById('plan-view-button'),libraryViewButton=document.getElementById('library-view-button');
  function selectView(view,restoring=false){
    if(view==='plan'&&planViewButton.disabled)return;
    if(!restoring)uiState.scroll[activeView]=window.scrollY;
    activeView=view;restoringScroll=true;
    setProjectTree(view==='library'?libraryTreeOpen:false);
    openDateMenu?.close();openFilenameMenu?.close();
    document.getElementById('library-view').hidden=view!=='library';document.getElementById('plan-view').hidden=view!=='plan';
    for(const [button,name] of [[planViewButton,'plan'],[libraryViewButton,'library']]){if(view===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    if(view==='plan')planEditor?.show();
    rememberUi();
    requestAnimationFrame(()=>{window.scrollTo(0,Number(uiState.scroll[view])||0);requestAnimationFrame(()=>{restoringScroll=false;rememberUi();});});
  }
  planViewButton.addEventListener('click',()=>selectView('plan'));libraryViewButton.addEventListener('click',()=>selectView('library'));
  const images = [];
  const compactProjectTree=matchMedia('(max-width: 700px)');
  let collections=[],activeCollection='all',libraryTreeOpen=!compactProjectTree.matches,editingCollection=null;
  const tree=document.getElementById('project-tree'),collectionStatus=document.getElementById('collection-status'),expandedCollections=new Set();
  const artworkIcons=new WeakMap();
  function prepareArtworkIcon(image){
    if(artworkIcons.get(image)?.blob===image.blob)return;
    const state={blob:image.blob,src:null,error:false};artworkIcons.set(image,state);
    ImageIcons.create(image.blob).then(src=>{
      if(artworkIcons.get(image)!==state)return;state.src=src;
      for(const icon of tree.querySelectorAll('img[data-artwork-id]'))if(icon.dataset.artworkId===image.id){icon.src=src;icon.style.visibility='visible';}
    }).catch(()=>{
      if(artworkIcons.get(image)!==state)return;state.error=true;
      for(const icon of tree.querySelectorAll('img[data-artwork-id]'))if(icon.dataset.artworkId===image.id)icon.replaceWith(projectTreeIcon('document'));
    });
  }
  function artworkIcon(image){
    const state=artworkIcons.get(image);if(state?.error)return projectTreeIcon('document');
    const icon=document.createElement('img');icon.alt='';icon.width=icon.height=48;icon.dataset.treeIcon='artwork';icon.dataset.artworkId=image.id;icon.draggable=false;
    if(state?.src)icon.src=state.src;else icon.style.visibility='hidden';return icon;
  }
  function projectTreeIcon(type){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');icon.dataset.treeIcon=type;
    icon.innerHTML=type==='folder'?'<path fill="#d4a847" d="M3 3h7l2 3h9v15H3z"/><path fill="#f7d66e" d="M4 5h6l2 3h8v12H4z"/><path fill="#efc455" d="m4 6 4 2v14l-4-2z"/><path fill="#ffe89b" d="M8 8h12v2H8z"/>':'<path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 15h8M8 18h6"/>';
    return icon;
  }
  for(const summary of tree.querySelectorAll(':scope > details > summary')){const title=document.createElement('span');title.textContent=summary.textContent;summary.replaceChildren(projectTreeIcon('folder'),title);}
  function setProjectTree(open){tree.hidden=!open;document.getElementById('project-tree-toggle').setAttribute('aria-expanded',String(open));document.body.classList.toggle('project-tree-open',open);}
  setProjectTree(libraryTreeOpen);
  const treeResize=document.getElementById('project-tree-resize');
  let preferredTreeWidth=232,treeResizeDrag=null;
  try{const stored=Number(localStorage.getItem('exhibition-project-tree-width'));if(stored>0)preferredTreeWidth=stored;}catch{}
  function applyTreeWidth(value){
    const width=ProjectTreeSize.clamp(value,innerWidth),bounds=ProjectTreeSize.bounds(innerWidth);
    document.documentElement.style.setProperty('--project-tree-width',`${width}px`);
    treeResize.setAttribute('aria-valuemin',String(bounds.min));treeResize.setAttribute('aria-valuemax',String(bounds.max));treeResize.setAttribute('aria-valuenow',String(width));return width;
  }
  function rememberTreeWidth(){try{localStorage.setItem('exhibition-project-tree-width',String(preferredTreeWidth));}catch{}}
  function finishTreeResize(cancel=false){
    if(!treeResizeDrag)return;const drag=treeResizeDrag;treeResizeDrag=null;
    if(cancel){preferredTreeWidth=drag.before;applyTreeWidth(preferredTreeWidth);}else rememberTreeWidth();
    document.body.classList.remove('project-tree-resizing');if(treeResize.hasPointerCapture(drag.pointerId))treeResize.releasePointerCapture(drag.pointerId);
  }
  applyTreeWidth(preferredTreeWidth);
  window.addEventListener('resize',()=>applyTreeWidth(preferredTreeWidth));
  window.addEventListener('blur',()=>finishTreeResize(true));
  treeResize.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();treeResize.focus();treeResizeDrag={pointerId:event.pointerId,x:event.clientX,width:tree.getBoundingClientRect().width,before:preferredTreeWidth};treeResize.setPointerCapture(event.pointerId);document.body.classList.add('project-tree-resizing');
  });
  treeResize.addEventListener('pointermove',event=>{if(!treeResizeDrag||event.pointerId!==treeResizeDrag.pointerId)return;preferredTreeWidth=applyTreeWidth(treeResizeDrag.width+event.clientX-treeResizeDrag.x);});
  treeResize.addEventListener('pointerup',()=>finishTreeResize());
  for(const name of ['pointercancel','lostpointercapture'])treeResize.addEventListener(name,()=>finishTreeResize(true));
  treeResize.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&treeResizeDrag){event.preventDefault();event.stopPropagation();finishTreeResize(true);return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const bounds=ProjectTreeSize.bounds(innerWidth),width=tree.getBoundingClientRect().width,step=event.shiftKey?50:10;
    preferredTreeWidth=applyTreeWidth(event.key==='Home'?bounds.min:event.key==='End'?bounds.max:width+(event.key==='ArrowRight'?step:-step));rememberTreeWidth();
  });
  compactProjectTree.addEventListener('change',event=>{if(event.matches){libraryTreeOpen=false;setProjectTree(false);}});
  document.getElementById('project-tree-toggle').addEventListener('click',()=>{const open=tree.hidden;if(activeView==='library')libraryTreeOpen=open;renderProjectTree();setProjectTree(open);});
  document.getElementById('project-tree-close').addEventListener('click',()=>{if(activeView==='library')libraryTreeOpen=false;setProjectTree(false);document.getElementById('project-tree-toggle').focus();});
  tree.addEventListener('keydown',event=>{if(event.key==='Escape'){setProjectTree(false);document.getElementById('project-tree-toggle').focus();}event.stopPropagation();});
  function selectCollection(id){
    activeCollection=id;const scoped=images.filter(image=>ImageCollections.matches(image,id));
    if(scoped.length&&!scoped.some(image=>(image.accepted?'accepted':'pending')===activeImageTab))activeImageTab=scoped[0].accepted?'accepted':'pending';
    selectView('library');refreshImageTabs();rememberUi();
    if(matchMedia('(max-width: 700px)').matches)setProjectTree(false);
  }
  function moveToCollection(image,id){
    if(id&& !collections.some(folder=>folder.id===id))return;
    const before=image.collectionId||null;if(before===id)return;
    image.collectionId=id;rememberChange(()=>{image.collectionId=before;},()=>{image.collectionId=id;},image);
    collectionStatus.textContent=id?`Przeniesiono obraz do: ${collections.find(folder=>folder.id===id).name}.`:'Przeniesiono obraz do „Bez folderu”.';
  }
  function bindImageDrag(element,image){
    element.draggable=true;element.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-exhibition-image',image.id);event.dataTransfer.effectAllowed='move';});
  }
  function collectionRow(id,name,group){
    const button=document.createElement('button');button.type='button';button.className='collection-row';button.dataset.collectionId=id;button.setAttribute('aria-pressed',String(activeCollection===id));
    const title=document.createElement('span'),count=document.createElement('span');title.textContent=name;title.className='project-tree-name';count.textContent=group.length;count.className='collection-count';count.setAttribute('aria-hidden','true');button.append(projectTreeIcon('folder'),title,count);
    button.addEventListener('click',()=>selectCollection(id));
    if(id!=='all'){
      button.addEventListener('dragover',event=>{if(![...event.dataTransfer.types].includes('application/x-exhibition-image'))return;event.preventDefault();event.dataTransfer.dropEffect='move';button.classList.add('collection-drop');});
      button.addEventListener('dragleave',()=>button.classList.remove('collection-drop'));
      button.addEventListener('drop',event=>{button.classList.remove('collection-drop');const image=images.find(image=>image.id===event.dataTransfer.getData('application/x-exhibition-image'));if(!image)return;event.preventDefault();event.stopPropagation();moveToCollection(image,id==='unfiled'?null:id);});
    }
    return button;
  }
  function renderProjectTree(){
    const list=document.getElementById('project-collection-list');list.replaceChildren();list.append(collectionRow('all','Wszystkie',images));
    for(const folder of [{id:'unfiled',name:'Bez folderu'},...collections]){
      const group=images.filter(image=>ImageCollections.matches(image,folder.id)),details=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');details.className='collection-branch';details.open=expandedCollections.has(folder.id);summary.append(collectionRow(folder.id,folder.name,group));details.append(summary,children);
      details.addEventListener('toggle',()=>{if(details.open)expandedCollections.add(folder.id);else expandedCollections.delete(folder.id);});
      for(const image of group){const entry=document.createElement('button'),title=document.createElement('span');entry.type='button';entry.className='collection-artwork';title.className='project-tree-name';title.textContent=image.title||image.name;entry.append(artworkIcon(image),title);bindImageDrag(entry,image);entry.addEventListener('click',()=>{activeCollection=folder.id;activeImageTab=image.accepted?'accepted':'pending';selectView('library');refreshImageTabs();rememberUi();imageCards.get(image)?.scrollIntoView({block:'center'});});children.append(entry);}
      list.append(details);
    }
    document.getElementById('collection-actions').hidden=!collections.some(folder=>folder.id===activeCollection);
    const planList=document.getElementById('project-tree-plans');planList.replaceChildren();
    for(const plan of planEditor?.entries()||[]){const button=document.createElement('button'),title=document.createElement('span');button.type='button';title.className='project-tree-name';title.textContent=plan.name;button.append(projectTreeIcon('document'),title);button.addEventListener('click',()=>{planEditor.activate(plan.id);selectView('plan');});planList.append(button);}
    for(const image of images){const select=imageCards.get(image)?.querySelector('.collection-picker select');if(!select)continue;select.replaceChildren();for(const folder of [{id:'',name:'Bez folderu'},...collections]){const option=document.createElement('option');option.value=folder.id;option.textContent=folder.name;select.append(option);}select.value=image.collectionId||'';}
  }
  function editCollection(id=null){editingCollection=id;document.getElementById('collection-form').hidden=false;document.getElementById('collection-error').textContent='';const input=document.getElementById('collection-name');input.value=collections.find(folder=>folder.id===id)?.name||'';input.focus();input.select();}
  document.getElementById('collection-add').addEventListener('click',()=>editCollection());
  document.getElementById('collection-rename').addEventListener('click',()=>editCollection(activeCollection));
  document.getElementById('collection-cancel').addEventListener('click',()=>{document.getElementById('collection-form').hidden=true;});
  document.getElementById('collection-form').addEventListener('submit',event=>{
    event.preventDefault();try{
      const name=ImageCollections.name(document.getElementById('collection-name').value,collections,editingCollection),folder=collections.find(folder=>folder.id===editingCollection);
      if(folder){const before=folder.name;folder.name=name;rememberChange(()=>{folder.name=before;},()=>{folder.name=name;});}
      else{const folder={id:crypto.randomUUID(),name};let members=[];collections.push(folder);rememberChange(()=>{members=images.filter(image=>image.collectionId===folder.id);for(const image of members)image.collectionId=null;collections=collections.filter(item=>item!==folder);if(activeCollection===folder.id)activeCollection='all';},()=>{collections.push(folder);for(const image of members)if(images.includes(image))image.collectionId=folder.id;});}
      document.getElementById('collection-form').hidden=true;document.getElementById('collection-add').focus();
    }catch(error){document.getElementById('collection-error').textContent=error.message;}
  });
  document.getElementById('collection-delete').addEventListener('click',()=>{
    const index=collections.findIndex(folder=>folder.id===activeCollection);if(index<0)return;
    const folder=collections[index],members=images.filter(image=>image.collectionId===folder.id);
    const remove=()=>{collections=collections.filter(item=>item.id!==folder.id);for(const image of members)image.collectionId=null;activeCollection='unfiled';};remove();
    rememberChange(()=>{collections.splice(index,0,folder);for(const image of members)image.collectionId=folder.id;activeCollection=folder.id;},remove);
    collectionStatus.textContent='Usunięto folder. Obrazy pozostają w „Bez folderu”.';
  });
  let importQueue = Promise.resolve();
  let dragDepth = 0;
  let openDateMenu = null;
  let openFilenameMenu = null;
  const undoButton = document.getElementById("undo");
  const redoButton = document.getElementById("redo");
  const past = [];
  const future = [];
  const storageStatus=document.getElementById('storage-status');
  for(const element of [status,storageStatus]){
    let hideTimer;
    new MutationObserver(()=>{
      clearTimeout(hideTimer);
      const text=element.textContent;
      element.hidden=!text;
      const success=/^(Dodano:|Odrzucono obraz|Przywrócono obraz|Zapisano w tej przeglądarce\.|Zapis lokalny jest włączony\.)/.test(text);
      if(success&&!/Pominięte pliki:/.test(text))hideTimer=setTimeout(()=>{element.hidden=true;},2500);
    }).observe(element,{childList:true,characterData:true,subtree:true});
  }
  const editorSnapshots=new WeakMap();
  const imageCards=new WeakMap();
  const pendingTab=document.getElementById('pending-tab'),acceptedTab=document.getElementById('accepted-tab');
  let activeImageTab='pending';
  const thumbnailSize=document.getElementById('thumbnail-size');
  function updateThumbnailSize(){
    gallery.style.setProperty('--thumbnail-size',`${thumbnailSize.value}px`);
    document.getElementById('thumbnail-size-value').value=`${thumbnailSize.value} px`;
  }
  thumbnailSize.addEventListener('input',updateThumbnailSize);
  thumbnailSize.addEventListener('change',()=>{
    if(!localDatabase)return;
    try{const transaction=localDatabase.transaction('library','readwrite');transaction.objectStore('library').put(Number(thumbnailSize.value),'thumbnailSize');}catch(error){/* Rozmiar pozostaje ustawiony w bieżącej sesji. */}
  });
  updateThumbnailSize();
  function refreshImageTabs(){
    document.getElementById('thumbnail-controls').hidden=activeImageTab!=='accepted';
    if(activeCollection!=='all'&&activeCollection!=='unfiled'&&!collections.some(folder=>folder.id===activeCollection))activeCollection='all';
    const scoped=images.filter(image=>ImageCollections.matches(image,activeCollection)),pending=scoped.filter(image=>!image.accepted).length;
    pendingTab.textContent=`Do akceptacji (${pending})`;
    acceptedTab.textContent=`Zaakceptowane (${scoped.length-pending})`;
    for(const [tab,value] of [[pendingTab,'pending'],[acceptedTab,'accepted']]){
      tab.setAttribute('aria-selected',String(activeImageTab===value));tab.tabIndex=activeImageTab===value?0:-1;
    }
    gallery.setAttribute('aria-labelledby',activeImageTab==='pending'?'pending-tab':'accepted-tab');
    for(const image of images){const card=imageCards.get(image);if(card)card.hidden=!ImageCollections.matches(image,activeCollection)||(image.accepted?'accepted':'pending')!==activeImageTab;}
    const visible=activeImageTab==='pending'?pending:scoped.length-pending;
    emptyMessage.hidden=visible>0;
    emptyMessage.textContent=activeImageTab==='accepted'?'Nie ma jeszcze zaakceptowanych obrazów.':images.length?'Wszystkie obrazy zostały zaakceptowane. Dodaj kolejne albo przejdź do zaakceptowanych.':'Przeciągnij obrazy, wklej ze schowka (Ctrl+V) albo użyj przycisku „Dodaj obrazy”.';
    if(activeCollection!=='all'&&!visible)emptyMessage.textContent='Brak obrazów w tej części kolekcji. Przeciągnij tu obrazy z „Wszystkie” albo dodaj nowe.';
    document.getElementById('acceptance-status').textContent='';
    workspace.dataset.imagesReady=String(!images.some(image=>!image.accepted));
    planViewButton.disabled=!planReady;
    planViewButton.title='Rzuty, widok 3D i ściany wystawy';
    renderProjectTree();
  }
  function selectImageTab(value){activeImageTab=value;openDateMenu?.close();openFilenameMenu?.close();refreshImageTabs();rememberUi();}
  pendingTab.addEventListener('click',()=>selectImageTab('pending'));
  acceptedTab.addEventListener('click',()=>selectImageTab('accepted'));
  for(const tab of [pendingTab,acceptedTab])tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?pendingTab:event.key==='End'?acceptedTab:tab===pendingTab?acceptedTab:pendingTab;
    next.click();next.focus();
  });
  let localDatabase=null;
  let storageRevision=0;
  let recentAuthors=[];
  function rememberAuthor(value){
    const author=value.trim();if(!author)return;
    recentAuthors=[author,...recentAuthors.filter(item=>item.toLocaleLowerCase('pl')!==author.toLocaleLowerCase('pl'))].slice(0,500);
    void persistImages();
  }
  function persistImages(){
    rememberUi();
    if(!localDatabase){storageStatus.textContent='Zapis lokalny jest niedostępny. Zmiany pozostają tylko w tej sesji.';return Promise.resolve(false);}
    const revision=++storageRevision;
    storageStatus.textContent='Zapisuję w przeglądarce…';
    return new Promise(resolve=>{
      let transaction;
      try{
        const records=images.map(image=>{
          const {url,...data}=image;
          return {image:data,editor:editorSnapshots.get(image)?.()};
        });
        transaction=localDatabase.transaction('library','readwrite');
        transaction.objectStore('library').put(records,'images');
        transaction.objectStore('library').put(collections,'collections');
        transaction.objectStore('library').put(recentAuthors,'authors');
        transaction.oncomplete=()=>{if(revision===storageRevision)storageStatus.textContent='Zapisano w tej przeglądarce.';resolve(true);};
        transaction.onabort=()=>{storageStatus.textContent='Nie udało się zapisać danych w przeglądarce. Zmiany pozostają tylko w tej sesji.';resolve(false);};
      }catch(error){try{transaction?.abort();}catch{}storageStatus.textContent='Zapis lokalny jest niedostępny. Zmiany pozostają tylko w tej sesji.';resolve(false);}
    });
  }
  async function restoreLibrary(){
    addButton.disabled=true;
    storageStatus.textContent='Wczytuję obrazy z przeglądarki…';
    try{
      localDatabase=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('exhibition-planner-v2',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('library');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>{storageStatus.textContent='Zamknij inne karty aplikacji, żeby uruchomić zapis lokalny.';};
      });
      localDatabase.onversionchange=()=>{localDatabase.close();localDatabase=null;storageStatus.textContent='Otwórz ponownie stronę, aby wznowić zapis lokalny.';};
      const records=await new Promise((resolve,reject)=>{
        const transaction=localDatabase.transaction('library','readonly');
        const request=transaction.objectStore('library').get('images');
        const sizeRequest=transaction.objectStore('library').get('thumbnailSize');
        const authorsRequest=transaction.objectStore('library').get('authors');
        const collectionsRequest=transaction.objectStore('library').get('collections');
        const planRequest=transaction.objectStore('library').get('plan');
        const viewportRequest=transaction.objectStore('library').get('planViewports');
        const uiRequest=transaction.objectStore('library').get('uiState');
        transaction.oncomplete=()=>{if(uiRequest.result){uiState=uiRequest.result;uiState.scroll??={};}collections=Array.isArray(collectionsRequest.result)?collectionsRequest.result:[];activeCollection=uiState.collection||'all';planEditor.load(planRequest.result,viewportRequest.result);recentAuthors=Array.isArray(authorsRequest.result)?authorsRequest.result:[];if(Number.isFinite(sizeRequest.result)){thumbnailSize.value=Math.max(120,Math.min(320,sizeRequest.result));updateThumbnailSize();}resolve(request.result||[]);};
        transaction.onabort=()=>reject(transaction.error);
      });
      const missingImageIds=records.some(record=>!record.image.id);
      for(const record of records){
        const image=record.image;image.id??=crypto.randomUUID();image.url=URL.createObjectURL(image.blob);
        images.push(image);showImage(image,record.editor);
      }
      if(missingImageIds)void persistImages();
      activeImageTab=['pending','accepted'].includes(uiState.imageTab)?uiState.imageTab:images.length&&!images.some(image=>!image.accepted)?'accepted':'pending';refreshImageTabs();
      storageStatus.textContent=images.length?`Przywrócono obrazy: ${images.length}. Zapis lokalny jest włączony.`:'Zapis lokalny jest włączony.';
    }catch(error){localDatabase?.close();localDatabase=null;storageStatus.textContent='Zapis lokalny jest niedostępny. Obrazy pozostaną tylko w tej sesji.';}
    finally{addButton.disabled=false;planReady=true;refreshImageTabs();uiReady=true;selectView(uiState.view==='plan'&&!planViewButton.disabled?'plan':'library',true);}
  }

  function updateHistoryButtons() {
    undoButton.disabled = past.length === 0;
    redoButton.disabled = future.length === 0;
  }
  function rememberChange(undo, redo, image=null) {
    past.push({ undo, redo, image });
    if (past.length > 100) past.shift();
    future.length = 0;
    updateHistoryButtons();
    refreshImageTabs();
    void persistImages();
  }
  function travelHistory(redo = false) {
    const action = (redo ? future : past).pop();
    if (!action) return;
    openDateMenu?.close();
    openFilenameMenu?.close();
    if (redo) action.redo(); else action.undo();
    (redo ? past : future).push(action);
    updateHistoryButtons();
    refreshImageTabs();
    void persistImages();
  }
  undoButton.addEventListener("click", () => travelHistory());
  redoButton.addEventListener("click", () => travelHistory(true));
  document.addEventListener("keydown", event => {
    if(!document.getElementById('plan-view').hidden)return;
    if (document.querySelector('.photo-editor[open], .image-viewer[open], .description-modal[open]')) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" || key === "y") {
      event.preventDefault();
      travelHistory(key === "y" || event.shiftKey);
    }
  });

  document.addEventListener("pointerdown", event => {
    if (openDateMenu && !openDateMenu.element.contains(event.target)) openDateMenu.close();
    if (openFilenameMenu && !openFilenameMenu.element.contains(event.target)) openFilenameMenu.close();
  });

  const dateTemplates = [
    { id: "year", label: "2020", hint: "np. 2020" },
    { id: "month", label: "05.2020", hint: "np. 05.2020" },
    { id: "day", label: "15.05.2020", hint: "np. 15.05.2020" },
    { id: "years", label: "2018–2021", hint: "np. 2018–2021" },
    { id: "months", label: "05.2020–08.2021", hint: "np. 05.2020–08.2021" },
    { id: "days", label: "01.05.2020–30.06.2020", hint: "np. 01.05.2020–30.06.2020" },
    { id: "before", label: "przed 05.2020", hint: "np. przed 05.2020" },
    { id: "after", label: "po 05.2020", hint: "np. po 05.2020" },
  ];

  // Osobno zachowujemy tekst użytkownika i zakres dat do przyszłego sortowania.
  function parseArtworkDate(text) {
    return ArtworkMetadata.parseDate(text);
  }

  function isFutureArtworkDate(details) {
    if (!details) return false;
    const now = new Date();
    const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    if (details.precision === 'after') return details.start >= today;
    if (details.precision === 'before') return details.end > today;
    return (details.endStart ?? details.start) > today;
  }

  function detectDescriptionDimensions(text, aspect) {
    return ArtworkMetadata.dimensions(text, aspect);
  }

  function detectDescriptionDate(text) {
    return ArtworkMetadata.date(text);
  }
  function detectExecutionDetails(text) {
    const normalized = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").replace(/_/g, " ");
    const techniques = [
      ["akryl", "akryl(?:owe|owa|owy|em)?"], ["olej", "olej(?:na|ne|ny|em)?"],
      ["akwarela", "akwarel(?:a|e|ami|owa|owe)?"], ["gwasz", "gwasz(?:em)?"],
      ["tempera", "temper(?:a|ami|owa)?"], ["pastel", "pastel(?:e|ami|owy|owa)?"],
      ["tusz", "tusz(?:em)?"], ["ołówek", "olow(?:ek|kiem|kowy)"],
      ["węgiel", "w(?:egiel|eglem)"], ["kolaż", "kolaz(?:em)?"],
      ["linoryt", "linoryt"], ["drzeworyt", "drzeworyt"], ["fotografia", "fotografi(?:a|czna)"],
      ["mieszana", "(?:technika\\s+)?mieszana|mixed\\s+media"], ["własna", "(?:technika\\s+)?wlasna"],
    ];
    const foundTechniques = techniques.filter(([, pattern]) =>
      new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "u").test(normalized)).map(([name]) => name);
    const supports = [
      ["płótno", "plotn(?:ie|o)"], ["papier", "papier(?:ze)?"],
      ["drewno", "drewn(?:ie|o)|des(?:ce|ka)"], ["karton", "karton(?:ie)?"],
      ["tektura", "tektur(?:ze|a)"], ["sklejka", "sklej(?:ce|ka)"],
      ["płyta MDF", "ply(?:cie|ta)\\s+mdf"], ["płyta pilśniowa", "ply(?:cie\\s+pilsniowej|ta\\s+pilsniowa)"],
      ["metal", "metal(?:u)?|blasze"], ["szkło", "szkl(?:e|o)"], ["tkanina", "tkanin(?:ie|a)"],
    ];
    const foundSupports = supports.filter(([, pattern]) =>
      new RegExp(`(?:\\bna\\s+|podloze\\s*:\\s*)(?:${pattern})(?![\\p{L}\\p{N}])`, "u").test(normalized)).map(([name]) => name);
    return {
      technique: foundTechniques.includes("mieszana") ? "mieszana" : foundTechniques.includes("własna") ? "własna" : foundTechniques.length ? foundTechniques.join(" + ") : undefined,
      support: foundSupports.length === 1 ? foundSupports[0] : foundSupports.length > 1 ? null : undefined,
    };
  }

  addButton.addEventListener("click", () => fileInput.click());

  let clipboardImageCount = 0;
  document.addEventListener("paste", event => {
    if (document.querySelector('.photo-editor[open]')) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    let files = Array.from(clipboard.items || [])
      .filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (!files.length) files = Array.from(clipboard.files || []).filter(file => file.type.startsWith("image/"));
    // Zwykły tekst pozostaje obsługiwany przez edytowane pole.
    if (!files.length) return;
    event.preventDefault();
    const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp" };
    enqueueFiles(files.map(file => {
      if (file.name && !/^(image\.png|blob)$/i.test(file.name)) return file;
      clipboardImageCount++;
      return new File([file], `Wklejony obraz ${clipboardImageCount}.${extensions[file.type] || "obraz"}`, { type: file.type });
    }));
  });

  function hasFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function clearDropHighlight() {
    dragDepth = 0;
    workspace.classList.remove("drag-over");
  }

  // Blokujemy otwieranie upuszczonych plików przez przeglądarkę.
  window.addEventListener("dragover", event => {
    if (hasFiles(event)) event.preventDefault();
  });
  window.addEventListener("drop", event => {
    if (hasFiles(event)) event.preventDefault();
    clearDropHighlight();
  });
  window.addEventListener("dragend", clearDropHighlight);

  workspace.addEventListener("dragenter", event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    workspace.classList.add("drag-over");
  });
  workspace.addEventListener("dragover", event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  workspace.addEventListener("dragleave", event => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) clearDropHighlight();
  });
  workspace.addEventListener("drop", event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    clearDropHighlight();
    const files=Array.from(event.dataTransfer.files);
    if(!document.getElementById('plan-view').hidden){void planEditor.importFiles(files);return;}
    enqueueFiles(files);
  });

  // Każdy plik przetwarzamy osobno, a w pamięci zachowujemy lżejszą kopię.
  function openPhotoEditor(image, onApply) {
    if (document.querySelector('.photo-editor[open]')) return;
    openDateMenu?.close();openFilenameMenu?.close();
    const dialog=document.createElement('dialog');
    dialog.className='photo-editor';
    dialog.setAttribute('aria-label','Edytuj zdjęcie obrazu');
    dialog.innerHTML=`
      <header class="photo-header"><h2>Edytuj zdjęcie</h2><button type="button" data-action="cancel" class="photo-close" aria-label="Zamknij edytor">×</button></header>
      <div class="photo-toolbar">
        <button type="button" data-action="left">↶ Obróć 90°</button>
        <button type="button" data-action="right">↷ Obróć 90°</button>
        <label class="photo-angle">Wyprostuj <input type="range" data-angle="range" aria-label="Wyprostowanie zdjęcia" min="-45" max="45" step="0.1" value="0"><input type="number" data-angle="number" aria-label="Kąt wyprostowania" min="-45" max="45" step="0.1" value="0"><span>°</span></label>
        <button type="button" data-action="undo" class="icon-button" aria-label="Cofnij korektę" title="Cofnij korektę (Ctrl+Z)" disabled><span aria-hidden="true">↶</span></button>
        <button type="button" data-action="redo" class="icon-button" aria-label="Ponów korektę" title="Ponów korektę (Ctrl+Y)" disabled><span aria-hidden="true">↷</span></button>
        <button type="button" data-action="reset">Resetuj ustawienia</button>
      </div>
      <div class="photo-body">
        <section class="photo-input"><p>Przeciągnij cztery punkty na narożniki obrazu.</p><div class="photo-stage"><canvas aria-label="Zdjęcie z narożnikami do korekty"></canvas></div></section>
        <div class="photo-direction" role="img" aria-label="Od zdjęcia wejściowego do obrazu po korekcie"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18M14 5l7 7-7 7"/></svg></div>
        <section class="photo-output"><div class="photo-output-heading"><h3>Podgląd po korekcie</h3><select aria-label="Proporcje po korekcie"><option value="auto">Proporcje z narożników</option></select></div><div class="photo-result"><canvas aria-label="Podgląd po korekcie"></canvas></div></section>
      </div>
      <footer class="photo-footer"><span role="status" aria-live="polite">Wczytuję zdjęcie…</span><button type="button" data-action="cancel">Anuluj</button><button type="button" data-action="apply" class="photo-apply" disabled>Zastosuj</button></footer>`;
    document.body.append(dialog);
    const stage=dialog.querySelector('.photo-stage'),stageCanvas=stage.querySelector('canvas');
    const resultCanvas=dialog.querySelector('.photo-result canvas'),message=dialog.querySelector('[role="status"]');
    const apply=dialog.querySelector('[data-action="apply"]'),ratioSelect=dialog.querySelector('select');
    const fineRange=dialog.querySelector('[data-angle="range"]'),fineNumber=dialog.querySelector('[data-angle="number"]');
    const localPast=[],localFuture=[];
    let settings={rotation:0,fine:0,points:ArtworkImageTools.fullCorners(),ratio:'auto'};
    let committed=structuredClone(settings),base=null,rotated=null,closed=false,timer=null,dragIndex=null,fit=null;
    let zoom=1,panX=0,panY=0,panDrag=null;
    const zoomControls=document.createElement('div');zoomControls.className='photo-zoom';
    zoomControls.innerHTML='<button type="button" data-zoom="out" aria-label="Oddal zdjęcie" title="Oddal">−</button><button type="button" data-zoom="reset" aria-label="Dopasuj zdjęcie" title="Dopasuj całe zdjęcie">100%</button><button type="button" data-zoom="in" aria-label="Przybliż zdjęcie" title="Przybliż"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg></button>';
    stage.append(zoomControls);
    function setZoom(value,x=stage.clientWidth/2,y=stage.clientHeight/2){
      if(!fit||!rotated)return;
      const next=Math.max(1,Math.min(16,value)),factor=next/zoom;
      panX=(x-stage.clientWidth/2)*(1-factor)+panX*factor;
      panY=(y-stage.clientHeight/2)*(1-factor)+panY*factor;
      zoom=next;if(zoom===1){panX=0;panY=0;}draw();
    }
    zoomControls.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;setZoom(button.dataset.zoom==='reset'?1:zoom*(button.dataset.zoom==='in'?1.4:1/1.4));});
    stage.addEventListener('wheel',event=>{if(!rotated)return;event.preventDefault();if(dragIndex!==null)return;const rect=stage.getBoundingClientRect();setZoom(zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.003),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
    stage.addEventListener('pointerdown',event=>{if(event.button!==0||zoom===1||event.target.closest('button'))return;event.preventDefault();panDrag={x:event.clientX,y:event.clientY};stage.setPointerCapture(event.pointerId);stage.classList.add('panning');});
    if(image.widthCm>0&&image.heightCm>0){const option=document.createElement('option');option.value='work';option.textContent=`Wymiary pracy (${image.widthCm} × ${image.heightCm} cm)`;ratioSelect.append(option);}
    function selectedAspect(){return settings.ratio==='work'?image.widthCm/image.heightCm:null;}
    function record(){if(JSON.stringify(settings)===JSON.stringify(committed))return;localPast.push(committed);if(localPast.length>50)localPast.shift();localFuture.length=0;committed=structuredClone(settings);updateButtons();}
    function updateButtons(){dialog.querySelector('[data-action="undo"]').disabled=!localPast.length;dialog.querySelector('[data-action="redo"]').disabled=!localFuture.length;}
    function sync(){fineRange.value=settings.fine;fineNumber.value=settings.fine;ratioSelect.value=settings.ratio;}
    function refreshRotated(){if(!base)return;zoom=1;panX=0;panY=0;if(rotated){rotated.width=1;rotated.height=1;}rotated=ArtworkImageTools.rotate(base,settings.rotation+settings.fine);}
    function history(redo=false){const state=(redo?localFuture:localPast).pop();if(!state)return;(redo?localPast:localFuture).push(structuredClone(settings));settings=structuredClone(state);committed=structuredClone(settings);sync();refreshRotated();draw();schedulePreview();updateButtons();}
    function draw(){
      if(!rotated||closed)return;
      const width=stage.clientWidth,height=stage.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
      if(!width||!height)return;
      stageCanvas.width=Math.round(width*dpr);stageCanvas.height=Math.round(height*dpr);
      const ctx=stageCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle=document.documentElement.dataset.theme==='dark'?'#29322b':'#e9ece5';ctx.fillRect(0,0,width,height);
      const scale=Math.min((width-80)/rotated.width,(height-80)/rotated.height)*zoom;
      panX=Math.max(-rotated.width*scale/2,Math.min(rotated.width*scale/2,panX));panY=Math.max(-rotated.height*scale/2,Math.min(rotated.height*scale/2,panY));
      fit={x:(width-rotated.width*scale)/2+panX,y:(height-rotated.height*scale)/2+panY,width:rotated.width*scale,height:rotated.height*scale};
      zoomControls.querySelector('[data-zoom="reset"]').textContent=Math.round(zoom*100)+'%';
      zoomControls.querySelector('[data-zoom="out"]').disabled=zoom<=1;zoomControls.querySelector('[data-zoom="in"]').disabled=zoom>=16;
      stage.classList.toggle('zoomed',zoom>1);
      ctx.drawImage(rotated,fit.x,fit.y,fit.width,fit.height);
      const points=settings.points.map(p=>({x:fit.x+p.x*fit.width,y:fit.y+p.y*fit.height}));
      ctx.beginPath();ctx.rect(0,0,width,height);ctx.moveTo(points[0].x,points[0].y);for(let i=3;i>=0;i--)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();ctx.fillStyle='#263b3155';ctx.fill('evenodd');
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.lineWidth=2;ctx.strokeStyle=ArtworkImageTools.validQuad(settings.points)?'#3c8058':'#b44739';ctx.stroke();
      points.forEach((point,i)=>{corners[i].style.left=point.x+'px';corners[i].style.top=point.y+'px';});
    }
    function previewResult(){
      if(!rotated||closed)return;
      try{const canvas=ArtworkImageTools.rectify(rotated,settings.points,selectedAspect(),600);resultCanvas.width=canvas.width;resultCanvas.height=canvas.height;resultCanvas.getContext('2d').drawImage(canvas,0,0);canvas.width=1;canvas.height=1;message.textContent='';apply.disabled=false;}
      catch(error){message.textContent=error.message;apply.disabled=true;resultCanvas.getContext('2d').clearRect(0,0,resultCanvas.width,resultCanvas.height);}
    }
    function schedulePreview(){clearTimeout(timer);apply.disabled=true;timer=setTimeout(previewResult,60);}
    const corners=settings.points.map((_,i)=>{
      const button=document.createElement('button');button.type='button';button.className='photo-corner';button.dataset.corner=i;
      const number=document.createElement('span');number.className='photo-corner-number';number.textContent=String(i+1);number.setAttribute('aria-hidden','true');button.append(number);
      button.setAttribute('aria-label',`Narożnik ${i+1}`);button.title='Przeciągnij narożnik lub użyj strzałek (Shift: większy krok)';
      button.addEventListener('pointerdown',event=>{if(event.button!==0||!rotated)return;event.preventDefault();button.focus();dragIndex=i;button.setPointerCapture(event.pointerId);});
      button.addEventListener('keydown',event=>{
        if(!rotated||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();const step=event.shiftKey?10:1,p=settings.points[i];
        if(event.key==='ArrowLeft')p.x=Math.max(0,p.x-step/rotated.width);if(event.key==='ArrowRight')p.x=Math.min(1,p.x+step/rotated.width);
        if(event.key==='ArrowUp')p.y=Math.max(0,p.y-step/rotated.height);if(event.key==='ArrowDown')p.y=Math.min(1,p.y+step/rotated.height);
        record();draw();schedulePreview();
      });
      stage.append(button);return button;
    });
    stage.addEventListener('pointermove',event=>{if(panDrag){panX+=event.clientX-panDrag.x;panY+=event.clientY-panDrag.y;panDrag={x:event.clientX,y:event.clientY};draw();return;}if(dragIndex===null||!fit)return;const rect=stage.getBoundingClientRect();settings.points[dragIndex]={x:Math.max(0,Math.min(1,(event.clientX-rect.left-fit.x)/fit.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top-fit.y)/fit.height))};draw();schedulePreview();});
    function finishDrag(){panDrag=null;stage.classList.remove('panning');if(dragIndex===null)return;dragIndex=null;record();}
    stage.addEventListener('pointerup',finishDrag);stage.addEventListener('pointercancel',finishDrag);
    for(const input of[fineRange,fineNumber]){
      input.addEventListener('input',()=>{const value=Number(input.value);if(!Number.isFinite(value)||input.value===''||value<-45||value>45)return;settings.fine=value;settings.points=ArtworkImageTools.fullCorners();sync();refreshRotated();draw();schedulePreview();});
      input.addEventListener('change',()=>{sync();record();});
    }
    ratioSelect.addEventListener('change',()=>{settings.ratio=ratioSelect.value;record();schedulePreview();});
    dialog.querySelector('[data-action="left"]').addEventListener('click',()=>{settings.rotation=(settings.rotation+270)%360;settings.points=ArtworkImageTools.fullCorners();refreshRotated();draw();schedulePreview();record();});
    dialog.querySelector('[data-action="right"]').addEventListener('click',()=>{settings.rotation=(settings.rotation+90)%360;settings.points=ArtworkImageTools.fullCorners();refreshRotated();draw();schedulePreview();record();});
    dialog.querySelector('[data-action="reset"]').addEventListener('click',()=>{settings={rotation:0,fine:0,points:ArtworkImageTools.fullCorners(),ratio:'auto'};sync();refreshRotated();draw();schedulePreview();record();});
    dialog.querySelector('[data-action="undo"]').addEventListener('click',()=>history());dialog.querySelector('[data-action="redo"]').addEventListener('click',()=>history(true));
    dialog.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();history(event.key.toLowerCase()==='y'||event.shiftKey);}});
    dialog.querySelectorAll('[data-action="cancel"]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    apply.addEventListener('click',async()=>{
      apply.disabled=true;apply.textContent='Zapisuję…';message.textContent='Przygotowuję zdjęcie po korekcie…';
      try{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(closed)return;
        const canvas=ArtworkImageTools.rectify(rotated,settings.points,selectedAspect(),1600);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
        if(!blob)throw Error('Nie udało się zapisać zdjęcia.');
        if(closed)return;
        await onApply({blob,width:canvas.width,height:canvas.height});canvas.width=1;canvas.height=1;dialog.close();
      }catch(error){if(!closed){message.textContent=error.message;apply.disabled=false;apply.textContent='Zastosuj';}}
    });
    const observer=new ResizeObserver(draw);observer.observe(stage);
    dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);observer.disconnect();if(base){base.width=1;base.height=1;}if(rotated){rotated.width=1;rotated.height=1;}dialog.remove();},{once:true});
    dialog.showModal();
    const sourceImage=new Image();sourceImage.src=image.url;
    sourceImage.decode().then(()=>{if(closed)return;base=document.createElement('canvas');base.width=sourceImage.naturalWidth;base.height=sourceImage.naturalHeight;const ctx=base.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,base.width,base.height);ctx.drawImage(sourceImage,0,0);sourceImage.src='';refreshRotated();draw();previewResult();}).catch(()=>{if(!closed)message.textContent='Nie udało się otworzyć zdjęcia.';});
  }

  async function prepareImage(file) {
    if (!file.type.startsWith("image/") &&
        !/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(file.name)) {
      throw new Error("To nie jest plik obrazu.");
    }
    if (file.size > 250 * 1024 * 1024) {
      throw new Error("Plik przekracza 250 MB. Zmniejsz go przed dodaniem.");
    }

    const sourceUrl = URL.createObjectURL(file);
    const source = new Image();
    try {
      source.src = sourceUrl;
      await source.decode();
      const width = source.naturalWidth;
      const height = source.naturalHeight;
      if (!width || !height) throw new Error("Nie można odczytać rozmiaru obrazu.");

      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Przeglądarka nie może przygotować podglądu.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.86));
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) throw new Error("Nie można przygotować podglądu obrazu.");
      return {
        id: crypto.randomUUID(),
        name: file.name,
        pixelWidth: width,
        pixelHeight: height,
        title: "",
        widthCm: null,
        heightCm: null,
        description: "",
        technique: "",
        support: "",
        date: "",
        dateFormat: "",
        dateDetails: null,
        blob,
        url: URL.createObjectURL(blob),
      };
    } finally {
      source.src = "";
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function showImage(image, savedEditor=null) {
    prepareArtworkIcon(image);
    const filenameDescription = image.name.replace(/\.[^.]+$/, "");
    const item = document.createElement("li");
    item.className = "image-card";
    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = "Obraz bez tytułu";
    preview.loading = "lazy";
    bindImageDrag(preview,image);preview.title='Przeciągnij do kolekcji w drzewku projektu';
    function openImagePreview(){
      if(!image.accepted)return;
      const modal=document.createElement('dialog');modal.className='image-viewer';modal.setAttribute('aria-label','Powiększony podgląd obrazu');
      const heading=document.createElement('h2');heading.textContent=image.title||'Podgląd obrazu';
      const close=document.createElement('button');close.type='button';close.className='image-viewer-close';close.textContent='×';close.title='Zamknij';close.setAttribute('aria-label','Zamknij podgląd');close.addEventListener('click',()=>modal.close());
      const header=document.createElement('div');header.className='image-viewer-header';header.append(heading,close);
      const photo=document.createElement('img');photo.src=image.url;photo.alt=image.title||'Obraz';
      modal.append(header,photo);document.body.append(modal);
      modal.addEventListener('close',()=>modal.remove(),{once:true});
      modal.addEventListener('click',event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
      modal.showModal();
    }
    preview.addEventListener('click',openImagePreview);
    preview.addEventListener('keydown',event=>{if(image.accepted&&['Enter',' '].includes(event.key)){event.preventDefault();openImagePreview();}});
    const form = document.createElement("form");
    form.className = "image-details";
    form.addEventListener("submit", event => event.preventDefault());
    let dateManuallyEdited = false;
    let settingAutomaticDate = false;
    let automaticDateSource = "description";
    const dimensionsManuallyEdited = { widthCm: false, heightCm: false };
    let settingAutomaticDimensions = false;
    const executionManuallyEdited = { technique: false, support: false };
    let settingAutomaticExecution = false;
    let refreshSourceHighlights = () => {};
    const fieldRefreshers = new Map();
    let editDepth = 0;
    let lastState = null;

    function field(labelText, key, options = {}) {
      const label = document.createElement("label");
      label.className = "field-with-status";
      label.dataset.field = options.dimension ? "dimensions" : key;
      const input = document.createElement(options.multiline ? "textarea" : "input");
      const indicator = document.createElement("span");
      indicator.className = "field-status";
      indicator.setAttribute("aria-hidden", "true");
      let dimensionValue;
      if (options.dimension) {
        const unit = document.createElement('span');
        unit.className = 'dimension-unit';
        unit.setAttribute('aria-hidden', 'true');
        dimensionValue = document.createElement('span');
        dimensionValue.className = 'dimension-unit-value';
        const suffix = document.createElement('span');
        suffix.textContent = 'cm';
        unit.append(dimensionValue, suffix);
        label.append(unit);
      }
      if (!options.multiline) input.type = "text";
      else input.rows = 3;
      input.name = key;
      input.value = image[key] ?? "";
      input.required = Boolean(options.required);
      input.placeholder = options.placeholder || labelText;
      input.setAttribute("aria-label", labelText);
      input.title = labelText;
      if (options.dimension) input.inputMode = "decimal";
      input.addEventListener("input", () => {
        editDepth++;
        try {
        input.setCustomValidity("");
        if (options.dimension) {
          if (!settingAutomaticDimensions) dimensionsManuallyEdited[key] = true;
          const text = input.value.trim();
          const value = Number(text.replace(",", "."));
          const valid = /^\d+(?:[.,]\d+)?$/.test(text) && Number.isFinite(value) && value > 0;
          image[key] = valid ? value : null;
          if (text && !valid) input.setCustomValidity("Wpisz wymiar większy od zera, np. 80 lub 80,5.");
        } else if (key === "date") {
          if (!settingAutomaticDate) dateManuallyEdited = true;
          image.dateSource = settingAutomaticDate ? automaticDateSource : "manual";
          image.date = input.value;
          image.dateDetails = parseArtworkDate(input.value);
          if (isFutureArtworkDate(image.dateDetails)) {
            image.dateDetails = null;
            input.setCustomValidity("Data nie może być w przyszłości. Wpisz datę nie późniejszą niż dzisiaj.");
          } else if (input.value.trim() && !image.dateDetails) {
            input.setCustomValidity("Wpisz np. 2020, 05.2020, 15.05.2020, 05.2020–08.2021, przed 2020 lub po 2020. Sprawdź poprawność i kolejność dat.");
          }
        } else {
          image[key] = key==='title'&&image.untitled?'':input.value;
          if ((key === "technique" || key === "support") && !settingAutomaticExecution) executionManuallyEdited[key] = true;
          if (options.required && input.value && !input.value.trim() && !(key==='title'&&image.untitled)) {
            input.setCustomValidity("Wpisz tytuł obrazu.");
          }
        }
        updateFieldState();
        preview.alt = image.title.trim() || "Obraz bez tytułu";
        if (key === "description") {
          fillDateFromDescription();
          fillDimensionsFromDescription();
          fillExecutionFromDescription();
        }
        refreshSourceHighlights();
        } finally {
          editDepth--;
          if (editDepth === 0) commitEdit();
        }
      });

      function updateFieldState() {
        const filled = input.value.trim().length > 0;
        const valid = input.validity.valid;
        if (dimensionValue) {
          dimensionValue.textContent = input.value;
          dimensionValue.parentElement.hidden = !filled || !valid;
        }
        // Puste pola opcjonalne nie są błędem.
        indicator.hidden = key==='title'&&image.untitled || !options.required && !filled;
        indicator.classList.toggle("valid", valid && filled);
        indicator.textContent = valid && filled ? "✓" : "";
        input.setAttribute("aria-invalid", String(!valid));
        input.title = `${labelText} — ${!options.required && !filled ? "opcjonalne" : valid && filled ? "wypełnione poprawnie" : "wymaga uzupełnienia lub poprawy"}`;
        if (!valid && key === "date") input.title = input.validationMessage;
      }

      updateFieldState();
      fieldRefreshers.set(key, updateFieldState);
      label.append(input, indicator);
      return label;
    }

    const title = field("Tytuł", "title", { required: true, placeholder: "Tytuł obrazu" });
    const titleGroup=document.createElement('div');titleGroup.className='title-group';
    const untitledLabel=document.createElement('label');untitledLabel.className='untitled-option';
    const untitledCheckbox=document.createElement('input');untitledCheckbox.type='checkbox';untitledCheckbox.setAttribute('aria-label','Bez tytułu');
    untitledLabel.append(untitledCheckbox,document.createTextNode('Bez tytułu'));titleGroup.append(title,untitledLabel);
    function syncUntitled(){
      const input=title.querySelector('input');untitledCheckbox.checked=Boolean(image.untitled);
      untitledCheckbox.disabled=item.classList.contains('image-locked');
      input.required=!image.untitled;input.disabled=Boolean(image.untitled);
      if(image.untitled)input.setCustomValidity('');
      fieldRefreshers.get('title')();
    }
    untitledCheckbox.addEventListener('change',()=>{
      image.untitled=untitledCheckbox.checked;syncUntitled();title.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
    });
    const author=field('Autor (opcjonalnie)','author',{placeholder:'Autor'});
    author.classList.add('author-field');
    const authorInput=author.querySelector('input');authorInput.autocomplete='off';
    const authorSuggestions=document.createElement('div');authorSuggestions.className='author-suggestions';authorSuggestions.hidden=true;authorSuggestions.setAttribute('role','listbox');
    authorSuggestions.id=`author-options-${Math.random().toString(36).slice(2)}`;
    authorInput.setAttribute('role','combobox');authorInput.setAttribute('aria-autocomplete','list');authorInput.setAttribute('aria-controls',authorSuggestions.id);authorInput.setAttribute('aria-expanded','false');
    let selectedAuthor=-1;
    const normalizeAuthor=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').toLocaleLowerCase('pl');
    function closeAuthors(){authorSuggestions.hidden=true;authorInput.setAttribute('aria-expanded','false');authorInput.removeAttribute('aria-activedescendant');selectedAuthor=-1;}
    function chooseAuthor(value){authorInput.value=value;authorInput.dispatchEvent(new Event('input',{bubbles:true}));rememberAuthor(value);closeAuthors();}
    function suggestAuthors(){
      if(authorInput.readOnly){closeAuthors();return;}
      const query=normalizeAuthor(authorInput.value.trim());
      const matches=query?recentAuthors.filter(value=>normalizeAuthor(value).includes(query)).sort((a,b)=>Number(!normalizeAuthor(a).startsWith(query))-Number(!normalizeAuthor(b).startsWith(query))).slice(0,6):recentAuthors.slice(0,1);
      authorSuggestions.replaceChildren();selectedAuthor=-1;
      authorInput.removeAttribute('aria-activedescendant');
      matches.forEach((value,index)=>{
        const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.textContent=value;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.id=`${authorSuggestions.id}-${index}`;
        option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>chooseAuthor(value));authorSuggestions.append(option);
      });
      authorSuggestions.hidden=!matches.length;authorInput.setAttribute('aria-expanded',String(matches.length>0));
    }
    authorInput.addEventListener('focus',suggestAuthors);authorInput.addEventListener('input',suggestAuthors);
    authorInput.addEventListener('change',()=>rememberAuthor(authorInput.value));
    authorInput.addEventListener('blur',closeAuthors);
    authorInput.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeAuthors();return;}
      if(event.key==='Enter'&&selectedAuthor>=0&&!authorSuggestions.hidden){event.preventDefault();chooseAuthor(authorSuggestions.children[selectedAuthor].textContent);return;}
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault();if(authorSuggestions.hidden)suggestAuthors();
      const options=[...authorSuggestions.children];if(!options.length)return;
      selectedAuthor=(selectedAuthor+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===selectedAuthor)));
      authorInput.setAttribute('aria-activedescendant',options[selectedAuthor].id);
    });
    author.append(authorSuggestions);
    const dimensions = document.createElement("fieldset");
    dimensions.className = "image-dimensions";
    dimensions.setAttribute("aria-label", "Format w centymetrach");
    dimensions.append(
      field("Szerokość", "widthCm", { required: true, dimension: true, placeholder: "Szerokość (cm)" }),
      field("Wysokość", "heightCm", { required: true, dimension: true, placeholder: "Wysokość (cm)" }),
    );
    for (const [index, name] of ['Szerokość', 'Wysokość'].entries()) {
      const icon = document.createElement('span');
      icon.className = 'dimension-icon';
      icon.title = `${name} (cm)`;
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><g${index ? ' transform="rotate(90 12 12)"' : ''}><path d="M4 7v10M20 7v10M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></g></svg>`;
      dimensions.children[index].append(icon);
    }
    const swapDimensions = document.createElement('button');
    swapDimensions.type = 'button';
    swapDimensions.className = 'swap-dimensions icon-button';
    swapDimensions.title = 'Zamień szerokość i wysokość';
    swapDimensions.setAttribute('aria-label', 'Zamień szerokość i wysokość');
    swapDimensions.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/></svg>';
    swapDimensions.addEventListener('click', () => {
      const width = dimensions.querySelector('[name="widthCm"]');
      const height = dimensions.querySelector('[name="heightCm"]');
      [width.value, height.value] = [height.value, width.value];
      editDepth++;
      try {
        width.dispatchEvent(new Event('input', { bubbles: true }));
        height.dispatchEvent(new Event('input', { bubbles: true }));
      } finally {
        editDepth--;
        commitEdit();
      }
    });
    dimensions.insertBefore(swapDimensions, dimensions.children[1]);
    const date = document.createElement("div");
    date.className = "date-field";
    const dateLabel = field("Data (opcjonalnie)", "date", { placeholder: "Data (opcjonalnie)" });
    const dateInput = dateLabel.querySelector("input");
    const dateButton = document.createElement("button");
    dateButton.type = "button";
    dateButton.className = "date-template-button";
    dateButton.setAttribute("aria-label", "Format daty");
    dateButton.setAttribute("aria-haspopup", "listbox");
    dateButton.setAttribute("aria-expanded", "false");
    dateButton.title = "Wybierz sugerowany format daty";
    const menu = document.createElement("div");
    menu.className = "date-template-menu";
    menu.id = `date-formats-${images.length}`;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Sugerowane formaty daty");
    menu.hidden = true;
    dateButton.setAttribute("aria-controls", menu.id);

    function closeMenu() {
      menu.hidden = true;
      dateButton.setAttribute("aria-expanded", "false");
      if (openDateMenu?.element === date) openDateMenu = null;
    }

    const options = [];
    for (const template of dateTemplates) {
      const option = document.createElement("button");
      option.type = "button";
      option.tabIndex = -1;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(image.dateFormat === template.id));
      option.textContent = template.label;
      option.addEventListener("click", () => {
        image.dateFormat = template.id;
        dateInput.placeholder = template.hint;
        dateButton.title = template.label;
        options.forEach(button => button.setAttribute("aria-selected", String(button === option)));
        closeMenu();
        dateInput.focus();
        commitEdit();
      });
      options.push(option);
      menu.append(option);
    }

    function showMenu(last = false) {
      openFilenameMenu?.close();
      openDateMenu?.close();
      menu.hidden = false;
      dateButton.setAttribute("aria-expanded", "true");
      openDateMenu = { element: date, close: closeMenu };
      (last ? options[options.length - 1] : options.find(option => option.getAttribute("aria-selected") === "true") || options[0]).focus();
    }
    dateButton.addEventListener("click", () => menu.hidden ? showMenu() : closeMenu());
    dateButton.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        showMenu(event.key === "ArrowUp");
      }
    });
    menu.addEventListener("keydown", event => {
      const index = options.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next].focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        dateButton.focus();
      } else if (event.key === "Tab") {
        dateButton.focus();
        closeMenu();
      }
    });
    date.append(dateLabel, dateButton, menu);
    const description = field("Opis (opcjonalnie)", "description", { multiline: true });
    const execution = document.createElement("div");
    execution.className = "execution-fields";
    execution.append(
      field("Technika (opcjonalnie)", "technique", { placeholder: "Technika, np. akryl" }),
      field("Podłoże (opcjonalnie)", "support", { placeholder: "Podłoże, np. płótno" }),
    );

    function fillDateFromDescription() {
      if (dateManuallyEdited) return;
      const fromDescription = detectDescriptionDate(image.description);
      automaticDateSource = fromDescription === undefined ? "filename" : "description";
      const detected = (fromDescription === undefined ? detectDescriptionDate(filenameDescription) : fromDescription) || "";
      if (dateInput.value === detected) return;
      settingAutomaticDate = true;
      try {
        dateInput.value = detected;
        dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      } finally {
        settingAutomaticDate = false;
      }
    }

    function fillDimensionsFromDescription() {
      const aspect = image.pixelWidth / image.pixelHeight;
      const fromDescription = detectDescriptionDimensions(image.description, aspect);
      const detected = fromDescription === undefined
        ? detectDescriptionDimensions(filenameDescription, aspect)
        : fromDescription;
      image.dimensionCandidates = ArtworkMetadata.extractDimensions(fromDescription === undefined ? filenameDescription : image.description, aspect);
      settingAutomaticDimensions = true;
      try {
        for (const key of ["widthCm", "heightCm"]) {
          if (dimensionsManuallyEdited[key]) continue;
          const input = dimensions.querySelector(`[name="${key}"]`);
          const value = detected ? String(detected[key]) : "";
          if (input.value === value) continue;
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } finally {
        settingAutomaticDimensions = false;
      }
    }

    function fillExecutionFromDescription() {
      const fromDescription = detectExecutionDetails(image.description);
      const fromFilename = detectExecutionDetails(filenameDescription);
      settingAutomaticExecution = true;
      try {
        for (const key of ["technique", "support"]) {
          if (executionManuallyEdited[key]) continue;
          const value = (fromDescription[key] === undefined ? fromFilename[key] : fromDescription[key]) || "";
          const input = execution.querySelector(`[name="${key}"]`);
          if (input.value === value) continue;
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } finally {
        settingAutomaticExecution = false;
      }
    }

    form.append(titleGroup, author, dimensions, execution, date, description);
    fillDateFromDescription();
    fillDimensionsFromDescription();
    fillExecutionFromDescription();
    const source = document.createElement("div");
    source.className = "image-source";
    const filenameArea = document.createElement("div");
    filenameArea.className = "filename-area";
    const sourceLegend = document.createElement("div");
    sourceLegend.className = "source-legend";
    sourceLegend.setAttribute("aria-label", "Przypisane fragmenty tekstu");
    const sourceEditor = document.createElement("div");
    sourceEditor.className = "source-editor";
    const highlights = document.createElement("div");
    highlights.className = "source-highlights";
    highlights.setAttribute("aria-hidden", "true");
    const filename = document.createElement("textarea");
    filename.className = "source-filename";
    filename.spellcheck = false;
    filename.rows = 12;
    filename.value = image.sourceText ?? image.name;
    filename.placeholder = "Wklej nazwę pliku lub pełny opis. Zaznacz fragment, aby przypisać go do pola.";
    filename.setAttribute("aria-label", "Nazwa pliku lub opis");
    filename.title = "Zaznacz fragment tekstu, aby przypisać go do pola. Enter przechodzi do wyboru pola.";
    const mapping = document.createElement("div");
    mapping.className = "filename-mapping";
    mapping.setAttribute("role", "group");
    mapping.setAttribute("aria-label", "Przypisz zaznaczony tekst");
    mapping.hidden = true;
    const mappingCaption = document.createElement("span");
    mappingCaption.textContent = "Przypisz do:";
    mappingCaption.className = "mapping-caption";
    mapping.append(mappingCaption);
    let selectedText = "";
    let selectedDimensions = null;
    let selectedDate = null;
    let selectedExecution = {};
    let selectedStart = 0;
    let selectedEnd = 0;
    let bindings = [];
    const suppressedLinks = new Set();

    const fieldLabels = { title: "Tytuł", dimensions: "Rozmiar", date: "Data", technique: "Technika", support: "Podłoże", description: "Opis" };
    function fieldValue(key) {
      return key === "dimensions" ? `${image.widthCm}:${image.heightCm}` : image[key];
    }
    const overlaps = (a, b) => a.start < b.end && b.start < a.end;

    function captureState() {
      const keys = ["title", "untitled", "author", "widthCm", "heightCm", "description", "technique", "support", "date", "dateFormat", "dateDetails", "dateSource", "sourceText", "dimensionCandidates", "pixelWidth", "pixelHeight"];
      return structuredClone({
        data: Object.fromEntries(keys.map(key => [key, image[key]])),
        fields: Object.fromEntries([...form.elements].filter(input => input.name).map(input => [input.name, { value: input.value, error: input.validity.customError ? input.validationMessage : "" }])),
        source: filename.value,
        bindings,
        suppressed: [...suppressedLinks],
        dateManuallyEdited,
        dimensionsManuallyEdited,
        executionManuallyEdited,
        dateHint: dateInput.placeholder,
        dateHintTitle: dateButton.title,
      });
    }

    function restoreState(snapshot) {
      const state = structuredClone(snapshot);
      Object.assign(image, state.data);
      dateManuallyEdited = state.dateManuallyEdited;
      Object.assign(dimensionsManuallyEdited, state.dimensionsManuallyEdited);
      Object.assign(executionManuallyEdited, state.executionManuallyEdited);
      bindings = state.bindings;
      suppressedLinks.clear();
      state.suppressed.forEach(key => suppressedLinks.add(key));
      for (const [key, field] of Object.entries(state.fields)) {
        const input = form.querySelector(`[name="${key}"]`);
        input.value = field.value;
        input.setCustomValidity(field.error);
        fieldRefreshers.get(key)();
      }
      filename.value = state.source;
      dateInput.placeholder = state.dateHint;
      dateButton.title = state.dateHintTitle;
      options.forEach((option, index) => option.setAttribute("aria-selected", String(dateTemplates[index].id === image.dateFormat)));
      preview.alt = image.title.trim() || "Obraz bez tytułu";
      closeMapping();
      syncUntitled();
      refreshSourceHighlights();
      lastState = captureState();
      refreshAcceptedSummary();
    }

    function commitEdit() {
      if (editDepth || !lastState) return;
      const next = captureState();
      if (JSON.stringify(next) === JSON.stringify(lastState)) return;
      const before = lastState;
      lastState = next;
      rememberChange(() => restoreState(before), () => restoreState(next), image);
    }

    refreshSourceHighlights = () => {
      const text = filename.value;
      const ranges = [];
      for (const binding of bindings) {
        if (!suppressedLinks.has(binding.key) && text.slice(binding.start, binding.end) === binding.text && fieldValue(binding.key) === binding.value) ranges.push(binding);
      }
      function add(key, start, end) {
        if (suppressedLinks.has(key) || start < 0 || end <= start || ranges.some(range => overlaps(range, { start, end }) || range.key === key)) return;
        ranges.push({ key, start, end });
      }
      for (const key of ["title", "description"]) {
        const value = image[key]?.trim();
        if (value) { const index = text.toLowerCase().indexOf(value.toLowerCase()); add(key, index, index + value.length); }
      }
      for (const match of ArtworkMetadata.extractDimensions(text, image.pixelWidth / image.pixelHeight)) {
        if (match.kind === 'physical' && !match.isFrame && match.widthCm === image.widthCm && match.heightCm === image.heightCm) add('dimensions', match.start, match.end);
      }
      const actualDate = image.dateDetails && JSON.stringify(image.dateDetails);
      for (const match of ArtworkMetadata.extractDates(text)) {
        if (actualDate && match.details && JSON.stringify(match.details) === actualDate) add('date', match.start, match.end);
      }      const words = [...text.matchAll(/[\p{L}]+/gu)];
      for (const key of ["technique", "support"]) {
        if (!image[key]) continue;
        const candidates = [];
        for (let i = 0; i < words.length; i++) {
          if (key === "support" && /^(na|podłoże)$/iu.test(words[i][0])) continue;
          for (let length = 1; length <= 4 && i + length <= words.length; length++) {
            const start = words[i].index, end = words[i + length - 1].index + words[i + length - 1][0].length;
            const fragment = text.slice(start, end);
            const parsed = detectExecutionDetails(key === "support" ? `na ${fragment}` : fragment);
            if (parsed[key] === image[key]) candidates.push({ start, end });
          }
        }
        candidates.sort((a, b) => (a.end - a.start) - (b.end - b.start) || a.start - b.start);
        for (const candidate of candidates) add(key, candidate.start, candidate.end);
      }
      ranges.sort((a, b) => a.start - b.start);
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const range of ranges) {
        fragment.append(document.createTextNode(text.slice(offset, range.start)));
        const mark = document.createElement("mark");
        mark.className = "source-mark";
        mark.dataset.field = range.key;
        mark.textContent = text.slice(range.start, range.end);
        fragment.append(mark);
        offset = range.end;
      }
      fragment.append(document.createTextNode(text.slice(offset) + "\u200b"));
      highlights.replaceChildren(fragment);
      const linked = new Set(ranges.map(range => range.key));
      const legend = document.createDocumentFragment();
      for (const [key, label] of Object.entries(fieldLabels)) {
        for (const field of form.querySelectorAll(`[data-field="${key}"]`)) field.classList.toggle("has-source-link", linked.has(key));
        if (!linked.has(key)) continue;
        const chip = document.createElement("span");
        chip.className = "source-chip";
        chip.dataset.field = key;
        const focus = document.createElement("button");
        focus.type = "button";
        focus.className = "source-chip-label";
        focus.textContent = label;
        focus.title = `${label}: ${key === "dimensions" ? `${image.widthCm} × ${image.heightCm} cm` : image[key]}`;
        focus.addEventListener("click", () => form.querySelector(`[name="${key === "dimensions" ? "widthCm" : key}"]`).focus());
        const unlink = document.createElement("button");
        unlink.type = "button";
        unlink.className = "source-chip-unlink";
        unlink.setAttribute("aria-label", `Usuń powiązanie: ${label}`);
        unlink.title = "Usuń powiązanie (zachowaj wartość pola i tekst)";
        unlink.addEventListener("click", () => {
          suppressedLinks.add(key);
          bindings = bindings.filter(binding => binding.key !== key);
          if (key === "date") dateManuallyEdited = true;
          if (key === "dimensions") { dimensionsManuallyEdited.widthCm = true; dimensionsManuallyEdited.heightCm = true; }
          if (key === "technique" || key === "support") executionManuallyEdited[key] = true;
          refreshSourceHighlights();
          commitEdit();
          form.querySelector(`[name="${key === "dimensions" ? "widthCm" : key}"]`).focus();
        });
        chip.append(focus, unlink);
        legend.append(chip);
      }
      sourceLegend.replaceChildren(legend);
      sourceLegend.hidden = linked.size === 0;
      highlights.scrollTop = filename.scrollTop;
      highlights.scrollLeft = filename.scrollLeft;
    };

    function closeMapping() {
      mapping.hidden = true;
      if (openFilenameMenu?.element === filenameArea) openFilenameMenu = null;
    }

    function writeField(key, value) {
      const input = form.querySelector(`[name="${key}"]`);
      if(key==='title'&&image.untitled){image.untitled=false;syncUntitled();}
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return input;
    }

    const mappingButtons = new Map();
    for (const [key, label] of [
      ["title", "Tytuł"], ["dimensions", "Rozmiar"], ["date", "Data"],
      ["technique", "Technika"], ["support", "Podłoże"], ["description", "Opis"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        if (!selectedText) return;
        editDepth++;
        try {
        let destination;
        if (key === "dimensions") {
          if (!selectedDimensions) return;
          destination = writeField("widthCm", String(selectedDimensions.widthCm));
          writeField("heightCm", String(selectedDimensions.heightCm));
        } else if (key === "date") {
          if (!selectedDate) return;
          destination = writeField("date", selectedDate);
        } else {
          const value = key === "technique" ? selectedExecution.technique || selectedText
            : key === "support" ? selectedExecution.support || selectedText : selectedText;
          destination = writeField(key, value);
        }
        bindings = bindings.filter(binding => binding.key !== key && !overlaps(binding, { start: selectedStart, end: selectedEnd }));
        bindings.push({ key, start: selectedStart, end: selectedEnd, text: selectedText, value: fieldValue(key) });
        suppressedLinks.delete(key);
        refreshSourceHighlights();
        selectedText = "";
        closeMapping();
        destination.focus();
        } finally {
          editDepth--;
          commitEdit();
        }
      });
      mappingButtons.set(key, button);
      mapping.append(button);
    }

    function updateSelection() {
      if (document.activeElement !== filename) return;
      selectedText = filename.value.slice(filename.selectionStart, filename.selectionEnd).trim();
      if (!selectedText) { closeMapping(); return; }
      const rawSelection = filename.value.slice(filename.selectionStart, filename.selectionEnd);
      selectedStart = filename.selectionStart + rawSelection.length - rawSelection.trimStart().length;
      selectedEnd = selectedStart + selectedText.length;
      selectedDimensions = detectDescriptionDimensions(selectedText, image.pixelWidth / image.pixelHeight);
      selectedDate = detectDescriptionDate(selectedText);
      selectedExecution = detectExecutionDetails(selectedText);
      // Sam zaznaczony materiał może nie zawierać przyimka „na”.
      selectedExecution.support ||= detectExecutionDetails(`na ${selectedText}`).support;
      const suggestions = new Set();
      if (selectedDimensions) suggestions.add("dimensions");
      if (selectedDate) suggestions.add("date");
      if (selectedExecution.technique) suggestions.add("technique");
      if (selectedExecution.support) suggestions.add("support");
      if (!suggestions.size) suggestions.add("title");
      for (const [key, button] of mappingButtons) {
        button.classList.toggle("suggested", suggestions.has(key));
        button.disabled = key === "dimensions" ? !selectedDimensions : key === "date" ? !selectedDate : false;
      }
      if (openFilenameMenu?.element !== filenameArea) openFilenameMenu?.close();
      openDateMenu?.close();
      mapping.hidden = false;
      openFilenameMenu = { element: filenameArea, close: closeMapping };
    }

    filename.addEventListener("select", updateSelection);
    filename.addEventListener("input", () => {
      const oldText = image.sourceText ?? image.name;
      const newText = filename.value;
      let prefix = 0, suffix = 0;
      while (prefix < Math.min(oldText.length, newText.length) && oldText[prefix] === newText[prefix]) prefix++;
      while (suffix < Math.min(oldText.length, newText.length) - prefix && oldText[oldText.length - suffix - 1] === newText[newText.length - suffix - 1]) suffix++;
      const oldEnd = oldText.length - suffix, delta = newText.length - oldText.length;
      bindings = bindings.flatMap(binding => binding.end <= prefix ? [binding] : binding.start >= oldEnd ? [{ ...binding, start: binding.start + delta, end: binding.end + delta }] : []);
      image.sourceText = filename.value;
      selectedText = "";
      closeMapping();
      refreshSourceHighlights();
      commitEdit();
    });
    filename.addEventListener("scroll", () => {
      highlights.scrollTop = filename.scrollTop;
      highlights.scrollLeft = filename.scrollLeft;
    });
    filename.addEventListener("pointerup", updateSelection);
    filename.addEventListener("keyup", event => {
      if (event.key !== "Escape" && event.key !== "Enter") updateSelection();
    });
    filename.addEventListener("keydown", event => {
      if (event.key === "Enter" && !mapping.hidden) {
        event.preventDefault();
        (mapping.querySelector("button.suggested:not(:disabled)") || mapping.querySelector("button:not(:disabled)")).focus();
      } else if (event.key === "Escape") {
        closeMapping();
        filename.setSelectionRange(filename.selectionEnd, filename.selectionEnd);
      }
    });
    mapping.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMapping();
        filename.focus();
        filename.setSelectionRange(filename.selectionEnd, filename.selectionEnd);
      }
    });
    filenameArea.addEventListener("focusout", event => {
      if (event.relatedTarget && !filenameArea.contains(event.relatedTarget)) closeMapping();
    });
    sourceEditor.append(highlights, filename);
    filenameArea.append(sourceLegend, sourceEditor, mapping);
    const previewContainer=document.createElement('div');
    previewContainer.className='preview-container';
    const editPhoto=document.createElement('button');editPhoto.type='button';editPhoto.className='edit-photo icon-button';editPhoto.title='Edytuj zdjęcie';editPhoto.setAttribute('aria-label','Edytuj zdjęcie');
    editPhoto.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5-9 9-6 1 1-6zM14 5l5 5"/></svg>';
    function setPhoto(blob){const oldUrl=image.url;image.blob=blob;image.url=URL.createObjectURL(blob);preview.src=image.url;prepareArtworkIcon(image);URL.revokeObjectURL(oldUrl);}
    function applyPhoto(result, detectDimensions=true){
      const before=captureState(),oldBlob=image.blob;
      editDepth++;
      try{setPhoto(result.blob);image.pixelWidth=result.width;image.pixelHeight=result.height;if(detectDimensions)fillDimensionsFromDescription();refreshSourceHighlights();}
      finally{editDepth--;}
      const after=captureState();lastState=after;
      rememberChange(()=>{setPhoto(oldBlob);restoreState(before);},()=>{setPhoto(result.blob);restoreState(after);},image);
    }
    editPhoto.addEventListener('click',()=>openPhotoEditor(image,applyPhoto));
    const rotatePhoto=document.createElement('button');rotatePhoto.type='button';rotatePhoto.className='rotate-photo icon-button';rotatePhoto.title='Obróć zdjęcie o 90°';rotatePhoto.setAttribute('aria-label','Obróć zdjęcie o 90°');
    rotatePhoto.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7"/></svg>';
    rotatePhoto.addEventListener('click',async()=>{
      editPhoto.disabled=rotatePhoto.disabled=cancelDetails.disabled=true;
      const sourceImage=new Image();sourceImage.src=image.url;
      let canvas;
      try{
        await sourceImage.decode();
        canvas=ArtworkImageTools.rotate(sourceImage,90);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
        if(!blob)throw Error('Nie udało się obrócić zdjęcia.');
        applyPhoto({blob,width:canvas.width,height:canvas.height});
      }catch(error){status.textContent=error.message;}
      finally{sourceImage.src='';if(canvas){canvas.width=1;canvas.height=1;}editPhoto.disabled=rotatePhoto.disabled=cancelDetails.disabled=false;}
    });
    const photoActions=document.createElement('div');photoActions.className='photo-actions';photoActions.append(editPhoto,rotatePhoto);
    previewContainer.append(preview,photoActions);
    const saveRow=document.createElement('div');saveRow.className='save-image-row';
    const saveImage=document.createElement('button');saveImage.type='button';saveImage.className='save-image';saveImage.textContent=image.accepted?'Zapisz zmiany':'Zaakceptuj obraz';saveImage.title='Zachowaj tylko lekką kopię: 4 piksele na 1 cm (1 piksel na 0,25 cm)';
    const saveInfo=document.createElement('span');saveInfo.className='save-image-info';saveInfo.setAttribute('role','status');
    const rejectImage=document.createElement('button');rejectImage.type='button';rejectImage.className='reject-image';rejectImage.textContent='Odrzuć';rejectImage.title='Usuń obraz z sesji (możesz cofnąć)';
    const editDetails=document.createElement('button');editDetails.type='button';editDetails.className='edit-details';editDetails.textContent='Edytuj';editDetails.setAttribute('aria-label','Edytuj dane obrazu');
    const cancelDetails=document.createElement('button');cancelDetails.type='button';cancelDetails.className='cancel-details';cancelDetails.textContent='Anuluj';
    let editStart=null;
    const acceptedSummary=document.createElement('div');acceptedSummary.className='accepted-summary';
    const summaryTitle=document.createElement('h3'),summaryDimensions=document.createElement('p'),summaryMetadata=document.createElement('p');
    summaryDimensions.className='accepted-dimensions';
    const showDescription=document.createElement('button');showDescription.type='button';showDescription.className='show-description';showDescription.textContent='Opis ↗';
    acceptedSummary.append(summaryTitle,summaryDimensions,summaryMetadata,showDescription);form.prepend(acceptedSummary);
    function refreshAcceptedSummary(){
      summaryTitle.textContent=image.untitled?'Bez tytułu':image.title||'Obraz bez tytułu';
      summaryTitle.title=summaryTitle.textContent;
      const dimensionsText=image.widthCm&&image.heightCm?`${image.widthCm} × ${image.heightCm} cm`:'';
      const executionText=[image.technique,image.support?`na ${image.support}`:''].filter(Boolean).join(' ');
      summaryDimensions.textContent=dimensionsText;
      summaryDimensions.hidden=!dimensionsText;
      summaryMetadata.textContent=[image.author,executionText,image.date].filter(Boolean).join(' · ');
      summaryMetadata.hidden=!summaryMetadata.textContent;
      showDescription.hidden=!image.description?.trim();
    }
    showDescription.addEventListener('click',()=>{
      const modal=document.createElement('dialog');modal.className='description-modal';modal.setAttribute('aria-label','Opis obrazu');
      const heading=document.createElement('h2');heading.textContent=image.title||'Opis obrazu';
      const text=document.createElement('p');text.textContent=image.description;
      const close=document.createElement('button');close.type='button';close.textContent='Zamknij';close.addEventListener('click',()=>modal.close());
      modal.append(heading,text,close);document.body.append(modal);
      modal.addEventListener('close',()=>modal.remove(),{once:true});
      modal.addEventListener('click',event=>{if(event.target!==modal)return;const rect=modal.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();});
      modal.showModal();
    });
    function setAcceptedMode(editing=false){
      const accepted=Boolean(image.accepted),locked=accepted&&!editing;
      preview.tabIndex=accepted?0:-1;
      if(accepted){preview.setAttribute('role','button');preview.setAttribute('aria-label',`Powiększ: ${image.title||'obraz'}`);preview.title='Kliknij, aby powiększyć';}
      item.classList.toggle('accepted-image',accepted);
      item.classList.toggle('image-locked',locked);
      for(const input of form.querySelectorAll('input,textarea'))input.readOnly=locked;
      syncUntitled();
      for(const button of form.querySelectorAll('button'))if(!saveRow.contains(button))button.disabled=locked;
      showDescription.disabled=false;
      refreshAcceptedSummary();
      photoActions.hidden=locked;
      editDetails.hidden=!locked;
      saveImage.hidden=locked;
      cancelDetails.hidden=!accepted||locked;
      rejectImage.textContent=accepted?'Usuń':'Odrzuć';
    }
    editDetails.addEventListener('click',()=>{editStart={state:captureState(),blob:image.blob,info:saveInfo.textContent};setAcceptedMode(true);(image.untitled?untitledCheckbox:form.querySelector('[name="title"]')).focus();});
    cancelDetails.addEventListener('click',()=>{
      if(!editStart)return;
      setPhoto(editStart.blob);restoreState(editStart.state);saveInfo.textContent=editStart.info;editStart=null;
      for(const stack of [past,future])for(let i=stack.length-1;i>=0;i--)if(stack[i].image===image)stack.splice(i,1);
      updateHistoryButtons();setAcceptedMode();void persistImages();editDetails.focus();
    });
    rejectImage.addEventListener('click',()=>{
      const index=images.indexOf(image);
      if(index<0)return;
      openDateMenu?.close();openFilenameMenu?.close();
      function remove(){
        const current=images.indexOf(image);if(current>=0)images.splice(current,1);
        item.remove();URL.revokeObjectURL(image.url);
        emptyMessage.hidden=images.length>0;
        status.textContent=`Odrzucono obraz. Obrazy w tej sesji: ${images.length}.`;
      }
      function restore(){
        images.splice(index,0,image);image.url=URL.createObjectURL(image.blob);preview.src=image.url;
        gallery.insertBefore(item,gallery.children[index]||null);emptyMessage.hidden=true;
        status.textContent=`Przywrócono obraz. Obrazy w tej sesji: ${images.length}.`;
      }
      remove();rememberChange(restore,remove,image);
    });
    saveRow.append(editDetails,saveImage,cancelDetails,rejectImage,saveInfo);form.append(saveRow);
    saveImage.addEventListener('click',async()=>{
      if(!form.reportValidity())return;
      const width=Math.max(1,Math.round(image.widthCm*4)),height=Math.max(1,Math.round(image.heightCm*4));
      if(width>16000||height>16000||width*height>32000000){saveInfo.textContent='Podane wymiary są zbyt duże. Sprawdź wartości w cm.';return;}
      saveImage.disabled=cancelDetails.disabled=rejectImage.disabled=editPhoto.disabled=rotatePhoto.disabled=true;
      saveInfo.textContent='Przygotowuję…';
      const sourceImage=new Image();sourceImage.src=image.url;
      const canvas=document.createElement('canvas');
      try{
        await sourceImage.decode();canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(sourceImage,0,0,width,height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
        if(!blob)throw Error('Nie udało się zapisać obrazu.');
        // Akceptacja jest granicą: historia nie może przechowywać starszych zdjęć.
        setPhoto(blob);image.pixelWidth=width;image.pixelHeight=height;image.accepted=true;
        editStart=null;
        for(const stack of [past,future])for(let i=stack.length-1;i>=0;i--)if(stack[i].image===image)stack.splice(i,1);
        lastState=captureState();updateHistoryButtons();
        saveImage.textContent='Zapisz zmiany';rejectImage.textContent='Usuń';
        sourceImage.src='';
        if(!images.some(entry=>!entry.accepted))activeImageTab='accepted';
        refreshImageTabs();
        const stored=await persistImages();
        saveInfo.textContent=`${stored?'Zapisano w przeglądarce':'Zapisano tylko w sesji'} · ${width} × ${height} px · ${(blob.size/1024).toLocaleString('pl-PL',{maximumFractionDigits:1})} KB`;
      }catch(error){saveInfo.textContent=error.message;}
      finally{sourceImage.src='';canvas.width=1;canvas.height=1;saveImage.disabled=cancelDetails.disabled=rejectImage.disabled=editPhoto.disabled=rotatePhoto.disabled=false;if(image.accepted&&!editStart)setAcceptedMode();}
    });
    source.append(previewContainer, form);
    item.append(source, filenameArea);
    const picker=document.createElement('label'),folderSelect=document.createElement('select');picker.className='collection-picker';picker.append(document.createTextNode('Kolekcja '),folderSelect);folderSelect.setAttribute('aria-label','Kolekcja obrazu');folderSelect.addEventListener('change',()=>moveToCollection(image,folderSelect.value||null));item.append(picker);
    gallery.append(item);
    refreshSourceHighlights();
    lastState = captureState();
    if(savedEditor)restoreState(savedEditor);
    editorSnapshots.set(image,captureState);
    imageCards.set(image,item);
    if(image.accepted)rejectImage.textContent='Usuń';
    setAcceptedMode();
  }

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files);
    fileInput.value = "";
    enqueueFiles(files);
  });

  function enqueueFiles(files) {
    if (!files.length) return;
    // Kolejne upuszczenie podczas importu dopisuje paczkę do kolejki.
    importQueue = importQueue.then(() => importImages(files)).catch(() => {
      status.textContent = "Nie udało się dodać obrazów. Spróbuj ponownie.";
    });
  }

  async function importImages(files) {
    selectView('library');
    addButton.disabled = true;
    gallery.setAttribute("aria-busy", "true");
    const errors = [];
    let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        status.textContent = `Dodawanie ${index + 1} z ${files.length}: ${file.name}`;
        try {
          const image = await prepareImage(file);
          image.collectionId=collections.some(folder=>folder.id===activeCollection)?activeCollection:null;
          images.push(image);
          showImage(image);
          activeImageTab='pending';refreshImageTabs();
          await persistImages();
          added += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Nie można odczytać pliku.";
          errors.push(`${file.name}: ${reason}`);
        }
      }
      status.textContent = `Dodano: ${added}. Obrazy w tej sesji: ${images.length}.`;
      if (errors.length) status.textContent += ` Pominięte pliki: ${errors.join("; ")}`;
    } finally {
      addButton.disabled = false;
      gallery.setAttribute("aria-busy", "false");
    }
  }
  planEditor=createArchitecturalPlan(data=>{
    renderProjectTree();
    const message=document.getElementById('plan-save-status'),revision=++planSaveRevision;
    if(!localDatabase){message.textContent='Rzut pozostaje tylko w tej sesji — zapis lokalny jest niedostępny.';return;}
    message.textContent='';
    try{
      const transaction=localDatabase.transaction('library','readwrite');transaction.objectStore('library').put(data,'plan');
      transaction.oncomplete=()=>{if(revision===planSaveRevision)message.textContent='';};
      transaction.onabort=()=>{message.textContent='Nie udało się zapisać rzutu. Zmiany pozostają w tej sesji.';};
    }catch(error){message.textContent='Nie udało się zapisać rzutu. Zmiany pozostają w tej sesji.';}
  },prepareImage,viewports=>{
    if(!localDatabase)return;
    try{const transaction=localDatabase.transaction('library','readwrite');transaction.objectStore('library').put(viewports,'planViewports');}catch(error){/* Podgląd pozostaje dostępny w bieżącej sesji. */}
  },()=>images);
  importQueue=restoreLibrary();
  importQueue.finally(()=>{document.getElementById("transfer-open").disabled=false;});
  const transfer=document.getElementById('transfer-dialog'),kind={value:'plans'},transferStatus=document.getElementById('transfer-status'),whole=document.getElementById('transfer-whole');
  transfer.addEventListener('keydown',event=>event.stopPropagation());
  let pendingTransfer=null,transferBusy=false,previewGeneration=0;
  const previewUrls=new Set();
  const transferHelp={plans:'Import doda nowe rzuty. Obecne rzuty pozostaną bez zmian. Plik zawiera też obrazy użyte na tych rzutach.',images:'Import doda obrazy do biblioteki wraz z ich opisami i zdjęciami. Obecne obrazy pozostaną bez zmian.',project:'Pełna kopia rzutów i biblioteki obrazów. Import zastąpi cały bieżący projekt po potwierdzeniu.'};
  function transferReset(){pendingTransfer=null;document.getElementById('transfer-preview').hidden=true;}
  function transferScope(){return whole.checked?'project':kind.value;}
  function updateTransferSelection(){
    const count=document.querySelectorAll(`#transfer-${kind.value==='plans'?'plan':'image'}-list input:checked`).length;
    document.getElementById('transfer-selection').textContent=whole.checked?'Wszystkie rzuty i obrazy':`Zaznaczono: ${count}`;
    document.getElementById('transfer-export').textContent=whole.checked?'Eksportuj cały projekt':`Eksportuj zaznaczone (${count})`;
    document.getElementById('transfer-help').textContent=whole.checked?transferHelp.project:kind.value==='plans'?'Zaznacz rzuty, które chcesz wyeksportować. Import doda nowe rzuty bez nadpisywania obecnych.':'Zaznacz obrazy do eksportu. Import doda je do biblioteki bez nadpisywania obecnych.';
    for(const input of document.querySelectorAll('.transfer-grid input'))input.disabled=whole.checked;
  }
  function selectTransferTab(value){
    kind.value=value;whole.checked=false;transferReset();transferStatus.textContent='';
    for(const tab of ['plans','images']){const selected=tab===value,button=document.getElementById('transfer-tab-'+tab);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;document.getElementById('transfer-'+tab).hidden=!selected;}
    document.getElementById('transfer-scroll').scrollTop=0;updateTransferSelection();
  }
  function clearTransferPreviews(){previewGeneration++;for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls.clear();}
  function transferTile(list,id,title){
    const label=document.createElement('label'),input=document.createElement('input'),photo=document.createElement('img'),caption=document.createElement('span');
    label.className='transfer-tile';input.type='checkbox';input.value=id;photo.alt='';photo.width=640;photo.height=640;photo.decoding='async';caption.textContent=title;label.append(photo,input,caption);list.append(label);input.addEventListener('change',updateTransferSelection);return photo;
  }
  function transferOptions(){
    clearTransferPreviews();transferReset();transferStatus.textContent='';const generation=previewGeneration;
    const list=document.getElementById('transfer-plan-list'),imageList=document.getElementById('transfer-image-list');list.replaceChildren();imageList.replaceChildren();
    let queue=Promise.resolve();
    for(const plan of planEditor.snapshot().plans){
      const photo=transferTile(list,plan.id,plan.name||'Rzut');
      queue=queue.then(async()=>{if(generation!==previewGeneration)return;try{const blob=await ProjectTransfer.thumbnail(plan);if(generation!==previewGeneration)return;const url=URL.createObjectURL(blob);previewUrls.add(url);photo.src=url;}catch(error){photo.replaceWith(document.createTextNode('Podgląd niedostępny'));}await new Promise(resolve=>setTimeout(resolve,0));});
    }
    for(const image of images){const photo=transferTile(imageList,image.id,image.title||image.name||'Obraz'),url=URL.createObjectURL(image.blob);previewUrls.add(url);photo.src=url;}
    if(!list.children.length)list.textContent='Nie ma jeszcze rzutów.';
    if(!imageList.children.length)imageList.textContent='Nie ma jeszcze obrazów.';
    updateTransferSelection();
  }
  transfer.addEventListener('close',clearTransferPreviews);
  document.getElementById('transfer-open').addEventListener('click',()=>{whole.checked=false;selectTransferTab('plans');transferOptions();transfer.showModal();});
  for(const value of ['plans','images']){const tab=document.getElementById('transfer-tab-'+value);tab.addEventListener('click',()=>selectTransferTab(value));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'plans':event.key==='End'?'images':value==='plans'?'images':'plans';selectTransferTab(next);document.getElementById('transfer-tab-'+next).focus();});}
  whole.addEventListener('change',()=>{transferReset();updateTransferSelection();});
  document.getElementById('transfer-cancel').addEventListener('click',transferReset);
  document.getElementById('transfer-import').addEventListener('click',()=>{transferReset();document.getElementById('transfer-file').click();});
  document.getElementById('transfer-export').addEventListener('click',async()=>{
    if(transferBusy)return;transferBusy=true;transferStatus.textContent='Przygotowuję plik…';
    try{
      await importQueue;
      const scope=transferScope(),plan=planEditor.snapshot();
      if(scope==='plans'){const ids=new Set([...document.querySelectorAll('#transfer-plan-list input:checked')].map(input=>input.value));plan.plans=plan.plans.filter(p=>ids.has(p.id));if(!plan.plans.length)throw Error('Wybierz co najmniej jeden rzut.');plan.active=plan.plans[0].id;}
      const selectedImages=new Set([...document.querySelectorAll('#transfer-image-list input:checked')].map(input=>input.value));
      if(scope==='images'){if(!selectedImages.size)throw Error('Wybierz co najmniej jeden obraz.');plan.plans=[];plan.active=null;}
      const references=new Set();
      function collect(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='imageId')references.add(item);else collect(item);}}
      collect(plan);
      const records=images.filter(image=>scope==='project'||scope==='plans'&&references.has(image.id)||scope==='images'&&selectedImages.has(image.id)).map(image=>{const {url,...data}=image;return {image:data,editor:editorSnapshots.get(image)?.()};});
      const viewports=Object.fromEntries(Object.entries(planEditor.getViewports()).filter(([id])=>plan.plans.some(plan=>plan.id===id)));
      const folders=ImageCollections.subset(collections,records,scope==='project');
      const content=await ProjectTransfer.encode({format:'exhibition-planner',version:1,kind:scope,plan,viewports,records,collections:folders,authors:recentAuthors});
      const url=URL.createObjectURL(new Blob([JSON.stringify(content)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`wystawa-${scope}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);transferStatus.textContent='Wyeksportowano plik.';
    }catch(error){transferStatus.textContent=error.message;}finally{transferBusy=false;}
  });
  document.getElementById('transfer-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    transferReset();transferStatus.textContent='Sprawdzam plik…';
    try{
      const data=await ProjectTransfer.decode(JSON.parse(await file.text()));ProjectTransfer.validate(data,transferScope());pendingTransfer=data;
      document.getElementById('transfer-summary').textContent=`Rzuty: ${data.plan.plans.length}. Obrazy: ${data.records.length}.`;
      document.getElementById('transfer-warning').textContent=data.kind==='project'?'Uwaga: wszystkie bieżące rzuty i obrazy zostaną utracone i zastąpione zawartością pliku. Aby je zachować, anuluj i najpierw wyeksportuj cały projekt.':'Dane zostaną dodane. Obecne rzuty i obrazy pozostaną bez zmian.';
      document.getElementById('transfer-apply').textContent=data.kind==='project'?'Zastąp projekt':'Dodaj do projektu';document.getElementById('transfer-preview').hidden=false;transferStatus.textContent='';
    }catch(error){transferStatus.textContent='Nie można zaimportować pliku. '+error.message;}
  });
  document.getElementById('transfer-apply').addEventListener('click',async()=>{
    if(!pendingTransfer||transferBusy)return;transferBusy=true;
    const button=document.getElementById('transfer-apply');button.disabled=true;
    try{
      await importQueue;
      const data=ProjectTransfer.remap(pendingTransfer),replace=data.kind==='project';
      const nextPlan=replace?data.plan:planEditor.snapshot();
      if(!replace&&data.kind==='plans'){nextPlan.plans.push(...data.plan.plans);nextPlan.active=data.plan.active;}
      if(replace){for(const image of images)URL.revokeObjectURL(image.url);images.length=0;gallery.replaceChildren();past.length=future.length=0;recentAuthors=[];collections=[];}
      for(const folder of data.collections||[]){folder.name=ImageCollections.uniqueName(folder.name,collections);collections.push(folder);}
      for(const record of data.records)if(!collections.some(folder=>folder.id===record.image.collectionId))record.image.collectionId=null;
      activeCollection='all';
      for(const record of data.records){record.image.url=URL.createObjectURL(record.image.blob);images.push(record.image);showImage(record.image,record.editor);}
      recentAuthors=[...new Set([...recentAuthors,...data.authors])];
      if(replace||data.kind==='plans')planEditor.load(nextPlan,replace?data.viewports:{...planEditor.getViewports(),...data.viewports});
      updateHistoryButtons();refreshImageTabs();
      // Save both halves in one transaction so a failed save cannot persist half a project.
      let stored=false;
      if(localDatabase)stored=await new Promise(resolve=>{let tx;try{tx=localDatabase.transaction('library','readwrite');const store=tx.objectStore('library');store.put(images.map(image=>{const {url,...value}=image;return {image:value,editor:editorSnapshots.get(image)?.()};}),'images');store.put(collections,'collections');store.put(nextPlan,'plan');store.put(planEditor.getViewports(),'planViewports');store.put(recentAuthors,'authors');tx.oncomplete=()=>resolve(true);tx.onabort=()=>resolve(false);}catch(error){try{tx?.abort();}catch{}resolve(false);}});
      transferOptions();transferStatus.textContent=stored?'Import zakończony. Zapisano w tej przeglądarce.':'Import zakończony tylko w tej sesji. Nie udało się zapisać w przeglądarce — wyeksportuj kopię przed zamknięciem.';
    }catch(error){transferStatus.textContent='Nie udało się zaimportować danych. '+error.message;}finally{transferBusy=false;button.disabled=false;}
  });

})();

// Workspace chrome has no access to model/history: layout changes cannot edit geometry.
(() => {
  const header=document.querySelector('.header'),tabs=document.querySelector('.plan-tabs-bar');
  header.insertBefore(tabs,document.getElementById('workspace-focus'));
  const byId=id=>document.getElementById(id),dock=byId('viewport-controls');
  const paths={
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    layers:'<path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    image:'<rect x="3" y="5" width="18" height="16" rx="1"/><circle cx="8" cy="10" r="1.5"/><path d="m3 18 6-5 4 4 4-4 4 5M18 1v6m-3-3h6"/>',
    check:'<path d="m5 12 5 5L20 6"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    wall:'<path d="M4 3h16v18H4Z"/><rect x="8" y="7" width="8" height="8"/><path d="m8 15 3-4 5 4"/>',
    cursor:'<path d="m5 3 14 10-7 1-3 7Z"/>',
    line:'<path d="m4 20 16-16"/><rect x="2" y="18" width="4" height="4"/><rect x="18" y="2" width="4" height="4"/>',
    frame:'<rect x="3" y="5" width="18" height="15"/><path d="M12 8v9m-4-4h8"/>',
    measureX:'<path d="M3 5v14M21 5v14M3 12h18m-14-4-4 4 4 4m10-8 4 4-4 4"/>',
    measureY:'<path d="M5 3h14M5 21h14M12 3v18m-4-14 4-4 4 4m-8 10 4 4 4-4"/>',
    magnet:'<path d="M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4ZM5 8h5m4 0h5"/>',
    dashed:'<path d="M3 12h4m3 0h4m3 0h4"/>',
    panel:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16m3-12v8"/>',
    left:'<path d="M5 10a8 8 0 1 1 1 9M5 4v6h6"/>',
    right:'<path d="M19 10a8 8 0 1 0-1 9m1-15v6h-6"/>',
  };
  function icon(node,name,label){
    node.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
    node.setAttribute('aria-label',label);node.title=label;node.classList.add('workspace-icon');
  }
  function button(id,name,label,parent,target){
    const node=document.createElement('button');node.id=id;node.type='button';icon(node,name,label);
    if(target)node.setAttribute('popovertarget',target);parent.append(node);return node;
  }
  const viewRow=document.createElement('div');viewRow.className='viewport-row';dock.append(viewRow);
  byId('view-mode-switch').append(byId('plan-orbit-toggle'));
  const viewModeLabel=document.createElement('span');viewModeLabel.textContent='3D';byId('plan-orbit-toggle').append(viewModeLabel);
  function syncViewMode(){byId('view-mode-2d').setAttribute('aria-pressed',String(!['walls','layout'].includes(byId('plan-view').dataset.workspace)&&byId('plan-orbit-toggle').getAttribute('aria-pressed')!=='true'));byId('view-mode-2d').disabled=byId('plan-orbit-toggle').disabled;}
  new MutationObserver(syncViewMode).observe(byId('plan-orbit-toggle'),{attributes:true,attributeFilter:['aria-pressed','disabled']});syncViewMode();
  button('view-visibility-toggle','eye','Widoczność',viewRow,'view-visibility');
  dock.append(byId('orbit-gizmo'),byId('orbit-view-tools'),document.querySelector('.plan-zoom-controls'));
  icon(byId('camera-settings-toggle'),'settings','Ustawienia widoku');
  for(const id of ['plan-background-control','plan-dimensions-visible']){
    const node=byId(id);byId('view-visibility').append(id==='plan-dimensions-visible'?node.closest('label'):node);
  }
  for(const [name,target] of [['grid','view-visibility'],['dimensionUnit','plan-settings'],['dimensionPrecision','plan-settings']]){
    const field=byId('precision-menu').elements[name];field.setAttribute('form','precision-menu');byId(target).append(field.closest('label'));
  }
  tabs.append(byId('plan-empty'),byId('plan-import'));
  button('plan-settings-toggle','settings','Ustawienia rzutu',tabs,'plan-settings');
  byId('plan-import').setAttribute('aria-label','Dodaj podkład');byId('plan-import').title='Dodaj podkład';
  for(const node of document.querySelectorAll('.cad-tool')){
    const label=node.getAttribute('aria-label')||node.querySelector('span')?.textContent.trim()||node.title;
    if(label){node.setAttribute('aria-label',label);if(!node.title)node.title=label;}
  }
  for(const [id,name,label]of [
    ['plan-layers','layers','Warstwy'],
    ['exhibition-select','cursor','Zaznacz'],['exhibition-line','dashed','Linia pomocnicza'],
    ['exhibition-placeholder','frame','Pusty obraz'],['exhibition-measure-x','measureX','Pomiar poziomy'],
    ['exhibition-measure-y','measureY','Pomiar pionowy'],['exhibition-panel-toggle','panel','Ukryj obrazy'],
    ['add-images','image','Dodaj obrazy'],['exhibition-delete','trash','Usuń ze ściany']
  ])icon(byId(id),name,label);
  icon(byId('exhibition-properties').querySelector('button[type="submit"]'),'check','Ustaw pozycję');
  const layerPanelButton=byId('plan-layers');layerPanelButton.classList.add('object-panel-toggle');byId('plan-board').append(layerPanelButton);
  const sidebar=byId('exhibition-sidebar');sidebar.before(byId('exhibition-panel-toggle'));
  for(const [id,name,label]of [['plan-construction','dashed','Linie pomocnicze'],['exhibition-snap','magnet','Przyciąganie']]){
    const input=byId(id),labelNode=input.closest('label');
    for(const child of [...labelNode.childNodes])if(child!==input)child.remove();
    labelNode.insertAdjacentHTML('beforeend',`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`);
    input.setAttribute('aria-label',label);labelNode.title=label;labelNode.classList.add('icon-toggle');
  }
  icon(byId('plan-precision'),'magnet','Przyciąganie i rysowanie');
  const focus=document.getElementById('workspace-focus');
  const contextMenus=[['camera-settings','camera-settings-toggle'],['view-visibility','view-visibility-toggle'],['plan-settings','plan-settings-toggle']];
  // Capture before native light-dismiss so the same click cannot reopen a menu.
  const menuStateAtPointerDown=new WeakMap();
  function menuTrigger(target){
    const node=target.closest?.('button');if(!node)return null;
    const id=node.getAttribute('popovertarget')||node.dataset.toolMenu||({'plan-more':'plan-menu','plan-precision':'precision-menu','selection-more':'plan-selection-actions'})[node.id];
    return id?{node,menu:byId(id)}:null;
  }
  window.addEventListener('pointerdown',event=>{const item=menuTrigger(event.target);if(item?.menu)menuStateAtPointerDown.set(item.node,item.menu.matches(':popover-open'));},true);
  window.addEventListener('click',event=>{
    const item=menuTrigger(event.target);if(!item?.menu)return;
    const wasOpen=event.detail===0?item.menu.matches(':popover-open'):menuStateAtPointerDown.get(item.node);
    menuStateAtPointerDown.delete(item.node);
    if(!wasOpen)return;
    if(item.menu.matches(':popover-open'))item.menu.hidePopover();
    event.preventDefault();event.stopImmediatePropagation();item.node.focus();
  },true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const open=contextMenus.find(([id])=>document.getElementById(id).matches(':popover-open'));
    if(!open)return;
    event.preventDefault();event.stopImmediatePropagation();
    document.getElementById(open[0]).hidePopover();document.getElementById(open[1]).focus();
  },true);
  function setFocus(value){
    document.body.classList.toggle('workspace-focused',value);
    focus.setAttribute('aria-pressed',String(value));
    focus.title=value?'Pokaż narzędzia':'Ukryj narzędzia';
    window.dispatchEvent(new Event('resize'));
  }
  focus.addEventListener('click',()=>setFocus(focus.getAttribute('aria-pressed')!=='true'));
  document.getElementById('library-view-button').addEventListener('click',()=>setFocus(false));
  const panelToggle=document.getElementById('exhibition-panel-toggle');
  function setPanel(collapsed){
    document.body.classList.toggle('exhibition-panel-collapsed',collapsed);
    panelToggle.setAttribute('aria-expanded',String(!collapsed));
    panelToggle.setAttribute('aria-label',collapsed?'Pokaż obrazy':'Ukryj obrazy');panelToggle.title=collapsed?'Pokaż obrazy':'Ukryj obrazy';
    try{localStorage.setItem('exhibition-panel-collapsed',String(collapsed));}catch(_){}
    window.dispatchEvent(new Event('resize'));
  }
  panelToggle.addEventListener('click',()=>setPanel(panelToggle.getAttribute('aria-expanded')==='true'));
  try{setPanel(localStorage.getItem('exhibition-panel-collapsed')==='true');}catch(_){}
  // A task ribbon: keep related operations together, with names always visible.
  const actions=byId('plan-view').querySelector('.plan-actions'),panels=document.createElement('div');panels.className='ribbon-panels';
  const heading=document.createElement('div');heading.className='ribbon-heading';heading.append(byId('view-mode-switch'));actions.prepend(heading);byId('view-mode-switch').append(byId('view-mode-walls'),byId('view-mode-layout'));
  byId('view-mode-2d').textContent='Szkic 2D';byId('plan-orbit-toggle').querySelector('span').textContent='Model 3D';
  const history=document.createElement('div');history.className='ribbon-history';history.append(byId('plan-undo'),byId('plan-redo'));heading.append(history);actions.prepend(heading);actions.append(panels);
  const sketchTools=actions.querySelector('.cad-tools');panels.append(sketchTools);
  function ribbonPanel(label,nodes,parent=sketchTools){
    const panel=document.createElement('section');panel.className='ribbon-panel';panel.setAttribute('role','group');panel.setAttribute('aria-label',label);
    const body=document.createElement('div');body.className='ribbon-panel-body';
    for(const node of nodes){if(!node)continue;body.append(node.closest('.cad-tool-split')||node);}
    const title=document.createElement('div');title.className='ribbon-panel-title';title.textContent=label;panel.append(body,title);parent.append(panel);return panel;
  }
  ribbonPanel('Rysuj',[byId('plan-select'),byId('plan-line'),document.querySelector('[data-plan-shape="circle"]'),document.querySelector('[data-plan-shape="arc"]'),document.querySelector('[data-plan-shape="rectangle"]')]);
  ribbonPanel('Modyfikuj',[byId('plan-trim'),byId('plan-edit')]);
  ribbonPanel('Wymiary',[document.querySelector('[data-plan-measure="length"]')]);
  ribbonPanel('Wiązania',[byId('plan-bindings')]);
  byId('plan-bindings').querySelector('span').textContent='Wiązania';document.querySelector('[data-plan-shape="circle"] > span').textContent='Okrąg';
  ribbonPanel('Precyzja',[byId('plan-precision'),byId('plan-layers'),byId('plan-construction').closest('label')]);
  const modelPanel=ribbonPanel('Modelowanie',[byId('plan-faces'),byId('plan-extrude'),byId('extrude-controls')],panels);modelPanel.classList.add('ribbon-model-panel');
  for(const [id,label]of [['plan-precision','Przyciąg.'],['plan-layers','Warstwy']]){const node=byId(id);node.classList.add('cad-tool');const text=document.createElement('span');text.textContent=label;node.append(text);}
  const constructionLabel=document.createElement('span');constructionLabel.textContent='Pomocnicze';byId('plan-construction').closest('label').append(constructionLabel);
  byId('plan-board').append(byId('plan-import-status'));
  const tooltip=document.createElement('div');tooltip.id='workspace-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
  let tooltipOwner=null;
  function hideTooltip(){if(tooltipOwner)tooltipOwner.removeAttribute('aria-describedby');tooltipOwner=null;tooltip.hidden=true;}
  document.addEventListener('focusin',event=>{
    hideTooltip();const node=event.target;
    if(!node.matches('.workspace-icon,.cad-tool,.cad-tool-variants,.icon-toggle input,.plan-zoom-controls button')||!node.matches(':focus-visible'))return;
    const label=node.getAttribute('aria-label')||node.title;if(!label)return;
    tooltip.textContent=label;tooltip.hidden=false;tooltipOwner=node;node.setAttribute('aria-describedby',tooltip.id);
    const box=node.getBoundingClientRect(),tip=tooltip.getBoundingClientRect();
    tooltip.style.left=`${Math.max(6,Math.min(innerWidth-tip.width-6,box.x+box.width/2-tip.width/2))}px`;
    tooltip.style.top=`${box.y>tip.height+8?box.y-tip.height-6:box.bottom+6}px`;
  });
  document.addEventListener('focusout',hideTooltip);window.addEventListener('resize',hideTooltip);window.addEventListener('pointerdown',hideTooltip,true);
})();
