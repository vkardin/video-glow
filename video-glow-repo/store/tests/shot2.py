import asyncio, http.server, threading, functools, sys, json
from playwright.async_api import async_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8769),functools.partial(Q,directory='.'))
threading.Thread(target=srv.serve_forever,daemon=True).start()
EXT='/home/claude/video-ambilight'
async def main(tag,st):
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context('/tmp/vgprof5'+tag,headless=False,args=['--headless=new','--no-sandbox','--autoplay-policy=no-user-gesture-required',f'--disable-extensions-except={EXT}',f'--load-extension={EXT}'],viewport={'width':1505,'height':900})
        sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        await asyncio.sleep(1)
        for o in list(ctx.pages): await o.close()
        pg=await ctx.new_page(); await pg.bring_to_front()
        await sw.evaluate("d=>chrome.storage.local.set(d)",st)
        await pg.goto('http://localhost:8769/page2.html'); await asyncio.sleep(3)
        await pg.mouse.move(5,5)
        await pg.screenshot(path=f'edge_{tag}.png')
        await ctx.close()
asyncio.run(main(sys.argv[1], json.loads(sys.argv[2])))
