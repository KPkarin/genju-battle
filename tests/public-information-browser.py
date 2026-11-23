from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8771/');parser.add_argument('--output',default='/tmp/public-information-review');args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url,wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#roster canvas')?.width===128");page.locator('#btnModalClose').click()
 for side in ['you','foe']:
  page.evaluate('''side=>{const a=['homura','shiogame','fuen'].map(id=>({id,moves:['tackle','guard','focus','swap'],equip:'fang',ability:'quick'})),d=['tsurarauchi','kamegane','hazumimi'].map(id=>({id,moves:['tackle','guard','focus','swap'],equip:'charm',ability:'fluid'}));beginBattle(side==='you'?a:d,side==='you'?d:a,123,side);B.busy=true;renderCmd();}''',side)
  enemy='foe' if side=='you' else 'you'
  page.locator('#btnBattleMonsters').click()
  body=page.locator('#modalBody');text=body.inner_text()
  assert body.locator('[data-battle-unit]').count()==4
  assert body.locator('.is-unknown').count()==2
  for word in ['カメガネ','ハズミミ']:assert word not in text
  page.locator('[data-unit-detail="'+enemy+':0"]').click()
  text=body.inner_text();assert '特性：不明' in text and '持ち物：不明' in text and 'まだ確認していません' in text
  assert '流麗' not in text and '護りの札' not in text and '気力' not in text
  assert 'HP 100%' in text
  page.screenshot(path=str(out/('unknown-'+side+'.png')))
  page.locator('#btnModalClose').click()
  page.evaluate("OP().ability='pressure';onEnter(OP());hurt(OP(),9999);tryCharm(OP());paint()")
  page.wait_for_timeout(2400)
  page.evaluate("async()=>{OP().en=100;await doMove(OP(),MY(),'guard');}")
  page.locator('#btnBattleMonsters').click();page.locator('[data-unit-detail="'+enemy+':0"]').click();text=body.inner_text()
  assert '威圧' in text and '護りの札' in text and '守る' in text
  assert '体当たり' not in text and '気力' not in text
  page.screenshot(path=str(out/('revealed-'+side+'.png')))
  page.locator('#btnModalClose').click()
  page.evaluate("()=>{window.oldFoe=OP();leaveField(oldFoe);if(ME==='you')B.fi=1;else B.yi=1;onEnter(OP());paint();oldFoe.hp=oldFoe.maxhp;oldFoe.status='麻痺';}")
  page.locator('#btnBattleMonsters').click();assert body.locator('.is-unknown').count()==1
  page.locator('[data-unit-detail="'+enemy+':0"]').click();text=body.inner_text()
  assert '最後に確認した状態' in text and 'HP 1%' in text and '麻痺' not in text
  page.locator('#btnModalClose').click()
 assert not errors,errors
 print('PASS both perspectives: hidden roster/traits/items/moves, actual trigger discoveries, percentage HP, stale bench snapshots; no browser errors')
 b.close()
