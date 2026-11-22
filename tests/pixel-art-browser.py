# Optional browser integration check: pip install playwright; Chromium required.
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,argparse
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8765/');parser.add_argument('--output',default='/tmp/genju-pixel-browser');args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errors=[];bad=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:bad.append([r.status,r.url]) if r.status>=400 and '127.0.0.1' in r.url else None)
 page.goto(args.url);page.wait_for_function("document.querySelector('#roster canvas')?.width===128")
 page.locator('#btnModalClose').click();page.locator('#btnStart').click();page.wait_for_timeout(500)
 page.evaluate('''() => {
   const team=ids=>ids.map(id=>({id,moves:learnable(spec(id)).slice(0,4),equip:'none',ability:ABIL_OF[id][0]}));
   beginBattle(team(['homura','kokejyu','raitachi']),team(['shiogame','arakuma','yoigumo']),20261122,'you');
 }''')
 page.wait_for_timeout(800)
 assert page.locator('#spYou').evaluate('(c)=>c.width')==128
 page.screenshot(path=str(out/'mobile-clear.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('MY().hp=MY().maxhp=1000;OP().hp=OP().maxhp=1000;paint()')
 page.locator('#cmd button').first.click()
 page.wait_for_function('B.turn>1 && !B.busy',timeout=30000)
 page.locator('#btnBattleMonsters').click();assert page.locator('#uiModal').is_visible();page.locator('#btnModalClose').click()
 for kind in ['rain','shower','sandstorm','snow']:
  page.evaluate('(kind)=>{B.weather={kind,turns:5};paint()}',kind);page.wait_for_timeout(350)
  assert page.locator('#pixelWeatherCanvas').is_visible()
  assert page.locator('#weatherOverlay').is_hidden()
  page.screenshot(path=str(out/f'mobile-{kind}.png'))
 for key in ['paralysis','burn','freeze','sleep','confusion','drowsy','bleed1','bleed2','bleed3','bleed4','bleed5']:
  page.evaluate('''key=>{B.weather=null;const u=MY();u.status=({paralysis:'麻痺',burn:'やけど',freeze:'凍結',sleep:'眠り'})[key]||null;u.confusionTurns=key==='confusion'?2:0;u.drowsy=key==='drowsy'?{turn:1}:null;u.bleedLevel=key.startsWith('bleed')?Number(key.slice(-1)):0;paint()}''',key)
  page.wait_for_timeout(200)
  assert page.evaluate("Array.from(document.querySelector('#statusCanvas').getContext('2d').getImageData(0,0,384,216).data).some(x=>x>0)")
 page.evaluate("MY().status='やけど';MY().bleedLevel=5;B.weather={kind:'rain',turns:5};paint()")
 page.wait_for_timeout(300);page.screenshot(path=str(out/'mobile-burn-bleed-rain.png'))
 page.evaluate('MY().sub=30;paint()');page.wait_for_timeout(250)
 assert page.locator('#spYou').evaluate('(c)=>getComputedStyle(c).visibility')=='hidden'
 assert page.locator('#decoyYou').is_visible()
 page.screenshot(path=str(out/'mobile-substitute.png'))
 page.evaluate('MY().sub=0;MY().status=null;MY().bleedLevel=0;B.weather=null;paint()')
 assert page.locator('#pixelWeatherCanvas').is_hidden()
 # All atlas rows and both views draw successfully, not just the two active species.
 assert page.evaluate('''()=>{const c=document.createElement('canvas');return SPECIES.every(s=>['front','back'].every(v=>PixelArt.creature(c,s.id,v,7)&&c.width===128&&c.getContext('2d').getImageData(0,0,128,128).data.some(x=>x>0)))}''')
 # Visual redraw and animation do not affect the deterministic battle seed.
 assert page.evaluate('''()=>{const seed=_seed;for(let i=0;i<30;i++){StatusEffects.render(i*150,true);PixelArt.weather('snow',i*80,true);drawSprite(document.createElement('canvas'),'homura','back',i%8);}return _seed===seed}''')
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(150)
 assert page.evaluate('IdleAnimation.running===false')
 page.set_viewport_size({'width':1360,'height':900});page.evaluate('B.weather={kind:"snow",turns:5};MY().status="麻痺";paint()');page.wait_for_timeout(250);page.screenshot(path=str(out/'desktop-snow.png'))
 assert page.locator('#spFoe').evaluate('(c)=>c.width')==128
 assert not errors,errors
 # A missing favicon is irrelevant; every versioned art file must load.
 assert not [x for x in bad if '/assets/pixel-v1/' in x[1]],bad
 print(json.dumps({'browser_errors':errors,'bad_local_responses':bad,'species_views_rendered':50,'weathers':4,'status_variants':11,'substitute_hides_original':True,'cosmetic_rng_unchanged':True,'reduced_motion_stops_animation':True,'mobile_horizontal_overflow':False},ensure_ascii=False))
 saved=page.evaluate('localStorage.getItem(DRAFT_KEY)');page.reload();page.wait_for_timeout(300)
 assert page.evaluate('localStorage.getItem(DRAFT_KEY)')==saved
 assert page.locator('#uiModal').is_hidden(),'latest news should not show twice'
 assert not errors
 print('PASS real UI turn, monster window, draft preservation, latest news shown once')
 b.close()
