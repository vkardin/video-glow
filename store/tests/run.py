import asyncio, json, http.server, threading, functools, sys
from playwright.async_api import async_playwright
EXT=__import__('os').path.abspath('extension')
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory='.')
class Q(H.func):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(Q,directory='.'))
threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[]
def ok(name,cond,extra=''):
    res.append(cond); print(('PASS' if cond else 'FAIL'),name,extra)
async def main():
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context('/tmp/vgprof',headless=False,args=['--headless=new','--no-sandbox',f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required'],viewport={'width':1280,'height':800})
        sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        extid=sw.url.split('/')[2]; print('ext',extid)
        async def setst(d): await sw.evaluate("d=>chrome.storage.local.set(d)",d); await asyncio.sleep(0.4)
        async def clear(): await sw.evaluate("()=>chrome.storage.local.clear()"); await asyncio.sleep(0.3)
        errs=[]
        await asyncio.sleep(1)
        for old in list(ctx.pages): await old.close()
        page=await ctx.new_page(); page.on('pageerror',lambda e:errs.append(str(e))); await page.bring_to_front()
        await page.goto('http://localhost:8765/page.html'); await asyncio.sleep(2.5)
        q=lambda s:page.evaluate(s)
        ok('glow root exists', await q("!!document.querySelector('video-glow-root')"))
        f=await q("document.querySelector('video-glow-root canvas')?.style.filter"); print(' filter',f)
        ok('default blur 36', 'blur(36px)' in (f or ''))
        # pause fade
        await q("document.getElementById('v').pause()"); await asyncio.sleep(2)
        ok('pause fade -> removed', not await q("!!document.querySelector('video-glow-root')"))
        await q("document.getElementById('v').play()"); await asyncio.sleep(1.5)
        # hold
        await setst({'pauseMode':'hold'}); await q("document.getElementById('v').pause()"); await asyncio.sleep(2)
        ok('pause hold -> stays', await q("!!document.querySelector('video-glow-root')"))
        # delay
        await setst({'pauseMode':'delay','pauseDelay':1}); await q("document.getElementById('v').play()"); await asyncio.sleep(1)
        await q("document.getElementById('v').pause()"); await asyncio.sleep(0.5)
        ok('delay: still on at 0.5s', await q("!!document.querySelector('video-glow-root')"))
        await asyncio.sleep(2.5)
        ok('delay: gone after 3s', not await q("!!document.querySelector('video-glow-root')"))
        await setst({'pauseMode':'fade'}); await q("document.getElementById('v').play()"); await asyncio.sleep(1.5)
        # dim
        await setst({'dim':True,'dimLevel':70}); await asyncio.sleep(1)
        d=await q("(()=>{const e=document.querySelector('video-glow-dimlayer');return e?{o:e.style.opacity,cp:e.style.clipPath}:null})()")
        print(' dim',d); ok('dim present & visible', bool(d) and float(d['o'])>0.5 and 'evenodd' in d['cp'])
        await setst({'dim':False}); await asyncio.sleep(0.5)
        ok('dim removed', not await q("!!document.querySelector('video-glow-dimlayer')"))
        # hover button
        await page.mouse.move(400,300); await asyncio.sleep(0.2); await page.mouse.move(420,310); await asyncio.sleep(0.6)
        b=await q("(()=>{const e=document.querySelector('video-glow-btn');return e?{o:e.style.opacity,pe:e.style.pointerEvents}:null})()")
        print(' btn',b); ok('button shown on hover', bool(b) and b['o']=='1')
        box=await page.evaluate("(()=>{const r=document.querySelector('video-glow-btn').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
        await page.mouse.move(*box); await page.mouse.down(); await page.mouse.up(); await asyncio.sleep(1.5)
        o=await q("document.querySelector('video-glow-root canvas')?.style.opacity")
        ok('click turns glow off', o is not None and float(o)<0.05, str(o))
        ok('video still playing (click not leaked)', not await q("document.getElementById('v').paused"))
        await page.mouse.move(*box); await page.mouse.down(); await page.mouse.up(); await asyncio.sleep(1.5)
        o=await q("document.querySelector('video-glow-root canvas')?.style.opacity")
        ok('click again turns glow on', o is not None and float(o)>0.9, str(o))
        # site profile
        await setst({'siteProfiles':{'localhost':{'blur':99}}}); await asyncio.sleep(0.6)
        f=await q("document.querySelector('video-glow-root canvas')?.style.filter")
        ok('site profile blur 99', 'blur(99px)' in (f or ''), f)
        await setst({'siteProfiles':{'other.com':{'blur':5}}}); await asyncio.sleep(0.6)
        f=await q("document.querySelector('video-glow-root canvas')?.style.filter")
        ok('other site profile ignored', 'blur(36px)' in (f or ''), f)
        await setst({'siteProfiles':{}})
        # fullscreen with own settings
        await setst({'fsSame':False,'fsBlur':77,'fsOpacity':50}); await asyncio.sleep(0.5)
        await page.click('#v'); 
        try:
            await page.evaluate("document.getElementById('wrap').requestFullscreen()"); await asyncio.sleep(2)
        except Exception as e: print(' fs err',e)
        isfs=await q("!!document.fullscreenElement")
        print(' fullscreen',isfs)
        if isfs:
            f=await q("document.querySelector('video-glow-root canvas')?.style.filter")
            ok('fullscreen uses fsBlur 77', 'blur(77px)' in (f or ''), f)
            await q("document.exitFullscreen()"); await asyncio.sleep(1.5)
            f=await q("document.querySelector('video-glow-root canvas')?.style.filter")
            ok('back to page blur 36', 'blur(36px)' in (f or ''), f)
        await clear()
        ok('no page errors', not errs, str(errs))
        # popup
        pp=await ctx.new_page(); perr=[]; pp.on('pageerror',lambda e:perr.append(str(e))); pp.on('console',lambda m: perr.append(m.text) if m.type=='error' else None)
        await pp.add_init_script("chrome.tabs.query=(q,cb)=>cb([{id:1,url:'http://example.com/x'}]);")
        await pp.goto(f'chrome-extension://{extid}/popup.html'); await asyncio.sleep(1)
        txt=await pp.inner_text('body'); ok('popup renders text', 'Video Glow' in txt and 'Own settings' in txt, txt[:80].replace('\n',' '))
        await pp.click('#siteMode'); await asyncio.sleep(0.6)
        ok('site mode badge', await pp.is_visible('#scopeBadge'))
        await pp.click('.chip[data-preset=neon]'); await asyncio.sleep(0.6)
        st=await sw.evaluate("()=>chrome.storage.local.get(['siteProfiles','blur'])")
        print(' storage',st); ok('preset went to site profile, not global', st.get('blur') is None and any(v.get('blur')==24 for v in st['siteProfiles'].values()))
        await pp.click('#fsSame'); await asyncio.sleep(0.4)
        ok('fs own settings visible', await pp.is_visible('#fsOwn'))
        await pp.select_option('select[data-key=pauseMode]','delay'); await asyncio.sleep(0.4)
        ok('delay slider visible', await pp.is_visible('#pauseSliders .ctl'))
        await pp.click('#siteMode'); await asyncio.sleep(0.5)
        st=await sw.evaluate("()=>chrome.storage.local.get('siteProfiles')"); ok('site mode off removes profile', not st.get('siteProfiles'))
        for l in ('ru','uk'): pass
        ok('popup no errors', not perr, str(perr))
        po=await ctx.new_page(); oerr=[]; po.on('pageerror',lambda e:oerr.append(str(e)))
        await po.goto(f'chrome-extension://{extid}/options.html'); await asyncio.sleep(0.8)
        ok('options renders', 'Sites with their own settings' in await po.inner_text('body'))
        ok('options no errors', not oerr, str(oerr))
        await ctx.close()
    print('ALL' if all(res) else 'SOME FAILED', sum(res),'/',len(res))
asyncio.run(main())
