import {test,expect} from '@playwright/test';
test('PDF jako podkład, kalibracja, rysowanie ściany i pomiar',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=await context.newPage();await fixture.setContent('<html><body style="margin:50px"><h1>Rzut sali</h1><div style="width:400px;height:300px;border:8px solid black">900 x 650 cm</div><div style="break-before:page">Druga strona</div></body></html>');const pdf=await fixture.pdf({format:'A4'});await fixture.close();
 await page.goto('/');await page.getByTitle('Nowy projekt').click();
 const chooser=page.waitForEvent('filechooser');await page.getByTitle('Wczytaj podkład PDF lub obraz').click();await (await chooser).setFiles({name:'rzut.pdf',mimeType:'application/pdf',buffer:pdf});
 await expect(page.getByRole('heading',{name:'Wybierz strony'})).toBeVisible();await page.getByRole('button',{name:'Wczytaj wybrane strony'}).click();await expect(page.locator('.plan-view image')).toHaveCount(1,{timeout:20000});
 const box=await page.locator('.plan-view > svg').boundingBox();if(!box)throw Error('Brak rzutu');
 await page.mouse.click(box.x+box.width*.35,box.y+box.height*.4);page.once('dialog',dialog=>dialog.accept('500'));await page.mouse.click(box.x+box.width*.65,box.y+box.height*.4);await expect(page.getByRole('status')).toContainText('Skala podkładu');
 await page.getByLabel('Rysuj ściany (W)').click();await page.mouse.click(box.x+box.width*.35,box.y+box.height*.4);await page.mouse.click(box.x+box.width*.65,box.y+box.height*.4);await page.keyboard.press('Escape');await expect(page.locator('.wall-line')).toHaveCount(1);
 await page.getByLabel('Miarka (M)').click();await page.mouse.click(box.x+box.width*.35,box.y+box.height*.4);await page.mouse.click(box.x+box.width*.65,box.y+box.height*.4);await expect(page.locator('.dimension')).toHaveCount(2);expect(errors).toEqual([]);
});
