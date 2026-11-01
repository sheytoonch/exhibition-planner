const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
const scope = {};
vm.runInNewContext(source.slice(0, source.indexOf('\n(() => {')) + '\nthis.parser = ArtworkMetadata;', scope);
const parser = scope.parser;
let failures = 0;
for(const [text,expected] of [['Lato 2026','06.2026–08.2026'],['Wiosna 2026','03.2026–05.2026'],['Jesień 2025','09.2025–11.2025'],['Zima 2025','12.2025–02.2026'],['Dłoń - Akryl na płótnie 40x50cm - Lato 2026 - Plener w Domu Pracy Twórczej krakowskiej ASP na Harendzie w Zakopanem.jpg','06.2026–08.2026']]){
 assert.equal(parser.date(text),expected,text);
 assert.equal(JSON.stringify(parser.extractDates(text)[0].details),JSON.stringify(parser.parseDate(expected)));
}
function check(label, fn) { try { fn(); console.log('OK:', label); } catch (error) { failures++; console.error('BŁĄD:', label, error.message); } }
for (const [text, width, height, aspect = .8] of [
  ['120 x 80 cm',80,120], ['120cm×80cm',80,120], ['150,5 x 100 mm',10,15.05],
  ['wys. 120 cm, szer. 80 cm',80,120], ['h: 120 cm, w: 80 cm',80,120],
  ['H120 x W90 cm',90,120,1.5], ['W80 x H120 cm',80,120,1.5],
  ['120 * 80 cm',80,120], ['120 x 80 x 5 cm',80,120],
  ['120 x 80 (rama: 135 x 95 x 8 cm)',80,120],
  ['24 x 36 in',60.96,91.44], ['24" x 36"',60.96,91.44],
  ['12 1/2 x 8 3/4 in',22.225,31.75], ['A0',84.1,118.9],
]) check(text, () => { const d=parser.dimensions(text,aspect); assert.equal(d?.widthCm,width);assert.equal(d?.heightCm,height); });
for(const text of ['1920x1080px','1920x1080','1920_1080','16x9','4x3','1x1','0x100cm','40x50cm albo 80x100cm'])check('Bez fałszywych cm: '+text,()=>assert.equal(parser.dimensions(text,.8),null));
check('Głębokość',()=>assert.equal(parser.dimensions('120x80x5cm',.8).depthCm,5));
check('Rama osobno',()=>assert.equal(parser.dimensions('120x80 (rama: 135x95x8cm)',.8).frame.depthCm,8));
check('Piksele są cyfrowe',()=>assert.equal(parser.extractDimensions('1920x1080px')[0].kind,'digital'));
check('Pojedynczy rozmiar w px',()=>assert.equal(parser.extractDimensions('800px')[0].kind,'digital'));
check('Proporcje są proporcjami',()=>assert.equal(parser.extractDimensions('16_9')[0].kind,'ratio'));
check('DPI nie jest datą ani cm',()=>assert.equal(parser.extractDimensions('300_dpi')[0].kind,'resolution'));
check('Zachowanie niepewności',()=>assert.equal(parser.parseDate('ok. 1920').approximate,true));
check('Rok z pytajnikiem',()=>assert.equal(parser.parseDate('1920?').uncertain,true));
check('Nieznany wiek nie jest dopisywany',()=>assert.equal(parser.date('lata 70.'),undefined));
check('Wiele dat nie uzupełnia pola',()=>assert.equal(parser.date('2018 i 2020'),null));
for (const [text, expected] of [
  ['1923','1923'], ['1923 r.','1923'], ['12.05.1923','12.05.1923'], ['1923-05-12','12.05.1923'],
  ['May 12, 1923','12.05.1923'], ['15 październik 2026','15.10.2026'], ['paź. 2026','10.2026'],
  ['1920-1925','1920–1925'], ['1920/25','1920–1925'], ['1920/1925','1920–1925'],
  ['ca. 1920','ok. 1920'], ['ok1920r','ok. 1920'], ['1920(?)','1920?'], ['[1920]','1920?'],
  ['20240329','29.03.2024'], ['2024_03_29','29.03.2024'], ['IMG_20240329_143022','29.03.2024'],
  ['2024-03-29_14-30-22','29.03.2024'], ['29.03.2024','29.03.2024'], ['03-29-2024','29.03.2024'],
  ['przed 1920','przed 1920'], ['po 05.2020','po 05.2020'], ['maj 2025 – paź 2026','05.2025–10.2026'],
  ['300 BCE','300 p.n.e.'], ['300 p.n.e.','300 p.n.e.'],
  ['Jan Matejko - Bitwa pod Grunwaldem, 1878 r., olej na płótnie, 426 x 987 cm','1878'],
  ['obraz_1920x1080_ok1920r.jpg','ok. 1920'],
  ['Portrait_18th_century_H120xW90cm_300dpi.png','18th century'],
  ['Untitled (ca. 1945-1950), 24" x 36", mixed media','ok. 1945–1950'],
  ['IMG_20230512_120000_150x100mm.jpg','12.05.2023'],
  ['Obiekt_Muzealny_2 poł. XIX w._wym_120.5x80cm.tiff','2 poł. XIX w.'],
])check(text,()=>assert.equal(parser.date(text),expected));
for(const [text,start,end] of [
  ['I poł. XX w.',19010101,19501231], ['2 poł. XIX w.',18510101,19001231],
  ['lata 20. XX w.',19200101,19291231], ['1920s',19200101,19291231], ["1920's",19200101,19291231],
  ['lata 1970-te',19700101,19791231], ['early 20th century',19010101,19331231],
  ['mid-19th c.',18340101,18661231], ['late 18th century',17670101,18001231],
])check(text,()=>{const d=parser.parseDate(text);assert.equal(d?.start,start);assert.equal(d?.end,end);assert.ok(parser.date(text));});
for(const text of ['31.04.2020','29.02.2021','03-04-2024','1920x1080','300dpi'])check('Nie zgaduj: '+text,()=>assert.ok(!parser.date(text)));
check('Wiele różnych dat',()=>assert.equal(parser.date('Namalowany 2018, wystawiony 2021'),null));
if(failures)process.exitCode=1;
