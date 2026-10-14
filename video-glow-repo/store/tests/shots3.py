import asyncio, http.server, threading, functools
from playwright.async_api import async_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8770),functools.partial(Q,directory='.'))
threading.Thread(target=srv.serve_forever,daemon=True).start()
EXT='/home/claude/video-ambilight'
async def main():
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context('/tmp/vgprof6',headless=False,args=['--headless=new','--no-sandbox','--autoplay-policy=no-user-gesture-required',f'--disable-extensions-except={EXT}',f'--load-extension={EXT}'],viewport={'width':1280,'height':800})
        sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        await asyncio.sleep(1)
        for o in list(ctx.pages): await o.close()
        pg=await ctx.new_page(); await pg.bring_to_front()
        async def st(d): await sw.evaluate("()=>chrome.storage.local.clear()"); await sw.evaluate("d=>chrome.storage.local.set(d)",d); await asyncio.sleep(0.6)
        await st({'spread':22,'blur':44})
        await pg.goto('http://localhost:8770/page3.html'); await asyncio.sleep(3)
        await pg.mouse.move(5,780); await asyncio.sleep(.5)
        await pg.screenshot(path='s1_glow.png')
        await st({'spread':22,'blur':44,'dim':True,'dimLevel':75}); await asyncio.sleep(1.5)
        await pg.mouse.move(600,300); await pg.mouse.move(640,320); await asyncio.sleep(.8)
        await pg.screenshot(path='s2_dim.png')
        await st({'blur':44}); await asyncio.sleep(.5)
        await pg.click('#box'); 
        await pg.evaluate("document.getElementById('box').requestFullscreen()")
        await asyncio.sleep(2.5)
        await pg.mouse.move(5,790)
        print('fs',await pg.evaluate("!!document.fullscreenElement"), await pg.evaluate("[innerWidth,innerHeight]"))
        await pg.screenshot(path='s3_fs.png')
        await pg.evaluate("document.exitFullscreen()"); await asyncio.sleep(1)
        await st({'spread':22,'blur':44})
        await pg.mouse.move(5,780); await asyncio.sleep(.6)
        await pg.screenshot(path='s_bg.png')
        pp=await ctx.new_page()
        await pp.add_init_script("chrome.tabs.query=(q,cb)=>cb([{id:1,url:'http://example.com/x'}]);")
        await pp.set_viewport_size({'width':345,'height':800})
        await pp.goto(f'chrome-extension://{sw.url.split("/")[2]}/popup.html'); await asyncio.sleep(1)
        await pp.screenshot(path='s_popup.png')
        await ctx.close()
asyncio.run(main())
