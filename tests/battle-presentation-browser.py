from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8769/');parser.add_argument('--output',default='/tmp/battle-presentation-review');args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url,wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#roster canvas')?.width===128");page.locator('#btnModalClose').click()
 page.evaluate('''()=>{const team=(id,ability)=>[{id,moves:['tackle','guard','focus','sub'],ability,equip:'none'},...['homura','shiogame'].map(id=>randomBuildForSpecies(spec(id)))];beginBattle(team('tsurarauchi','snowWarning'),team('ungei','rainBeast'),1234,'you');}''')
 assert page.evaluate("BattlePresentation.visualWeather(B.weather.kind)===null")
 assert '雨獣' in page.locator('#abilityBanner').inner_text()
 page.wait_for_timeout(600);assert page.evaluate("BattlePresentation.visualWeather(B.weather.kind)==='rain'")
 page.wait_for_timeout(1200);assert page.evaluate("BattlePresentation.visualWeather(B.weather.kind)==='snow'")
 page.screenshot(path=str(out/'weather-banner.png'));page.wait_for_timeout(700)
 page.evaluate("MY().hp=14;paint()")
 page.wait_for_timeout(300)
 r=page.evaluate('''()=>({text:document.querySelector('#youHpV').textContent,hp:BattlePresentation.hpSnapshot().find(s=>s.side===ME).hp,bar:parseFloat(document.querySelector('#youHp').style.width),max:MY().maxhp})''');assert 14<r['hp']<145;assert abs(r['bar']/100-r['hp']/r['max'])<.015
 page.wait_for_timeout(600);assert page.locator('#youHpV').inner_text().startswith('HP 14/')
 page.evaluate("()=>{B.busy=true;MY().hp=0;window.knockout=markFaints();}")
 page.wait_for_timeout(200);assert not page.locator('#spYou').evaluate("e=>e.classList.contains('faint')")
 page.wait_for_timeout(700);assert page.locator('#youHpV').inner_text().startswith('HP 0/');assert page.locator('#spYou').evaluate("e=>e.classList.contains('faint')")
 page.wait_for_timeout(750)
 page.evaluate("beginBattle(randBuild(),randBuild(),123,'you');BattlePresentation.reset();MY().equip='charm';MY().hp=MY().maxhp;hurt(MY(),999);tryCharm(MY());paint()")
 assert page.locator('#abilityBanner').get_attribute('data-kind')=='item';assert '護りの札' in page.locator('#abilityBanner').inner_text();assert page.evaluate('MY().hp')==1
 page.screenshot(path=str(out/'charm.png'));page.wait_for_timeout(1200)
 page.evaluate("BattlePresentation.reset();MY().ability='spite';MY().equip='none';lowerRank(MY(),'def',1,OP());paint()")
 assert '反骨' in page.locator('#abilityBanner').inner_text()
 page.evaluate("()=>{window.fxDraws=[];const old=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='statusCanvas'&&a[0].src?.includes('status-'))fxDraws.push({src:a[0].src,h:this.canvas.height,w:this.canvas.width,args:a.slice(1)});return old.apply(this,a)};}")
 for label,w,h in [('portrait',390,844),('landscape',844,390),('desktop',1600,1000),('short',999,320)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(150);page.evaluate("MY().status='やけど';MY().bleedLevel=1;OP().status='麻痺';B.busy=true;paint();StatusEffects.sync();fxDraws=[];StatusEffects.render(performance.now(),true)");page.wait_for_timeout(250)
  result=page.evaluate('''()=>{const draw=fxDraws[0];if(!draw)return null;const a=draw.args,c=document.querySelector('#statusCanvas').getBoundingClientRect(),p=document.querySelector('#spYou').getBoundingClientRect();return {dx:Math.abs(c.left+(a[4]+a[6]*16/160)/draw.w*c.width-p.left),dy:Math.abs(c.top+(a[5]+a[7]*24/160)/draw.h*c.height-p.top)}}''')
  assert result and result['dx']<5 and result['dy']<5,(label,result)
  other=page.evaluate("""()=>{const draw=fxDraws.find(d=>d.src.includes('status-paralysis'));if(!draw)return null;const a=draw.args,c=document.querySelector('#statusCanvas').getBoundingClientRect(),p=document.querySelector('#spFoe').getBoundingClientRect();return {dx:Math.abs(c.left+(a[4]+a[6]*16/160)/draw.w*c.width-p.left),dy:Math.abs(c.top+(a[5]+a[7]*24/160)/draw.h*c.height-p.top)}}""")
  assert other and other['dx']<5 and other['dy']<5,(label,other)
  page.screenshot(path=str(out/(label+'.png')))
 assert not errors,errors;print('PASS weather cue order, synchronized HP numbers/bar, zero-before-faint, charm item/spite banners, overlay alignment in four layouts; no browser errors')
 b.close()
