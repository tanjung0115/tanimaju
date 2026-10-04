// Minimal local Chrome DevTools driver; no application dependencies or browser mocks.
import fs from 'node:fs/promises';
export async function browserSession(port = 9339) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const consoleMessages = [];
  const networkIssues = [];
  const requests = new Map();
  let acceptDialog = false;
  // Store diagnostics only, never cookies, request bodies or authentication headers.
  const sanitize = value => String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT redacted]').slice(0, 1200);
  const downloads = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      clearTimeout(waiting.timer); pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(sanitize(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? '')));
    else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) consoleMessages.push({ type: message.params.type, text: sanitize(message.params.args.map(arg => typeof arg.value === 'string' ? arg.value : arg.description ?? arg.type).join(' ')) });
    else if (message.method === 'Network.requestWillBeSent') requests.set(message.params.requestId, message.params.request.url.split('?')[0]);
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) networkIssues.push({ url: message.params.response.url.split('?')[0], status: message.params.response.status });
    else if (message.method === 'Network.loadingFailed') networkIssues.push({ url: requests.get(message.params.requestId), error: message.params.errorText, canceled: message.params.canceled ?? false });
    else if (message.method === 'Page.javascriptDialogOpening' && acceptDialog) { acceptDialog = false; void send('Page.handleJavaScriptDialog', { accept: true }); }
    else if (message.method === 'Browser.downloadWillBegin') downloads.set(message.params.guid, { filename: message.params.suggestedFilename, state: 'inProgress' });
    else if (message.method === 'Browser.downloadProgress') {
      const item = downloads.get(message.params.guid);
      if (item) { item.state = message.params.state; item.bytes = message.params.receivedBytes; }
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await evaluate(expression)) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('Browser condition timed out: ' + expression);
  };
  const navigate = async path => {
    await send('Page.navigate', { url: 'http://localhost:5180' + path });
    await wait('document.readyState === "complete" && document.body.innerText.length > 50');
  };
  const click = async selector => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    // Wait for dialog exit animations and verify the target is actually clickable.
    await wait(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center',inline:'center'}); return [...el.getClientRects()].some(r=>{const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(hit===el||el.contains(hit));}); })()`);
    const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); const r=[...el.getClientRects()].find(r=>{const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(hit===el||el.contains(hit));}); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await new Promise(resolve => setTimeout(resolve, 150));
  };
  const button = async text => {
    await evaluate(`(() => { const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}); if(!el) throw Error('Button missing'); el.setAttribute('data-cdp-action','true'); })()`);
    await click('[data-cdp-action="true"]');
    await evaluate(`document.querySelector('[data-cdp-action="true"]')?.removeAttribute('data-cdp-action')`);
  };
  const fill = async (selector, value) => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  };
  const screenshot = async filename => {
    await evaluate('document.fonts.ready');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(filename, Buffer.from(result.data, 'base64'));
  };
  return { send, evaluate, wait, navigate, click, button, fill, screenshot, errors, consoleMessages, networkIssues, downloads, acceptNextDialog: () => { acceptDialog = true; }, close: async () => { await send('Page.close'); socket.close(); } };
}
