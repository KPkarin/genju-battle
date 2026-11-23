from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8768/');parser.add_argument('--output',default='/tmp/battle-ui-review');args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url,wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#roster canvas')?.width===128");page.locator('#btnModalClose').click();page.locator('#btnStart').click();page.wait_for_timeout(600)
 print('startup',errors,flush=True)
 seed=page.evaluate('_seed');turn=page.evaluate('B.turn')
 page.locator('#btnFieldEffects').click();assert page.locator('#modalTitle').inner_text()=='場の効果';page.locator('#btnModalClose').click()
 page.locator('.move-inspect').first.click();assert page.locator('#modalTitle').inner_text()=='技の詳細';assert '命中' in page.locator('#modalBody').inner_text();page.locator('#btnModalClose').click()
 assert page.evaluate('_seed')==seed and page.evaluate('B.turn')==turn
 page.evaluate("MY().en=0;renderCmd()");page.locator('.move-command').first.click(force=True);assert page.locator('#modalTitle').inner_text()=='技の詳細';assert '気力が足りません' in page.locator('#modalBody').inner_text();page.locator('#btnModalClose').click()
 page.evaluate("B.busy=true;MY().restTurns=1;renderCmd()");page.locator('#btnBattleMonsters').click();assert page.locator('#modalTitle').inner_text()=='幻獣';page.locator('#btnModalClose').click();page.locator('.move-inspect').first.click();assert '反動' in page.locator('#modalBody').inner_text();assert page.locator('#modalBody > button.primary').is_disabled();page.locator('#btnModalClose').click();assert page.evaluate('_seed')==seed and page.evaluate('B.turn')==turn
 page.evaluate("MY().restTurns=0;MY().en=100;B.busy=false;B.weather={kind:'snow',turns:3};MY().bleedLevel=2;OP().tauntTurns=2;paint();renderCmd()");page.locator('#btnFieldEffects').click();assert '残り3ターン' in page.locator('#modalBody').inner_text();assert '流血' in page.locator('#modalBody').inner_text();page.screenshot(path=str(out/'effects.png'));page.locator('#btnModalClose').click()
 for name,w,h in [('portrait',390,844),('small',360,640),('landscape',844,390),('desktop',1600,1000)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(300);page.screenshot(path=str(out/(name+'.png')));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
  if name=='landscape':
   r=page.locator('#stage').bounding_box();assert r['width']>=w-2 and r['height']>=h-2;page.locator('#btnToggleCommands').click();assert page.locator('#btnToggleCommands').get_attribute('aria-expanded')=='false';page.screenshot(path=str(out/'landscape-folded.png'));page.locator('#btnToggleCommands').click()
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
 button=page.locator('.move-command').first;pos=button.bounding_box();before=page.evaluate('B.turn');page.mouse.move(pos['x']+20,pos['y']+20);page.mouse.down();page.wait_for_timeout(550);page.mouse.up();assert page.locator('#modalTitle').inner_text()=='技の詳細';assert page.evaluate('B.turn')==before
 assert not errors,errors
 print('PASS field/move details, read-only locked moves, rest inspection, all four layouts',flush=True)
 b.close()
