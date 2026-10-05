const $ = id => document.getElementById(id);
const state = { artists: JSON.parse(localStorage.getItem('tr_artists') || '[]'), events: [], watches: JSON.parse(localStorage.getItem('tr_watches') || '{}'), current: null, filter: 'all' };
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeUrl = v => { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

function chips() { const html = state.artists.map((a,i) => `<span>${esc(a)} <button data-remove="${i}" aria-label="Remove ${esc(a)}">×</button></span>`).join(''); $('artist-chips').innerHTML = html; $('following-chips').innerHTML = state.artists.map(a => `<span>${esc(a)} <i>live</i></span>`).join(''); $('start').disabled = !state.artists.length; $('artist-count').textContent = state.artists.length; }
function persistArtists() { localStorage.setItem('tr_artists', JSON.stringify(state.artists)); chips(); }
function addArtist() { const input = $('artist-input'); const name = input.value.trim(); if (name && !state.artists.some(a => a.toLowerCase() === name.toLowerCase()) && state.artists.length < 8) state.artists.push(name); input.value=''; persistArtists(); }
$('artist-form').addEventListener('submit', e => { e.preventDefault(); addArtist(); });
$('artist-chips').addEventListener('click', e => { const i = e.target.dataset.remove; if (i !== undefined) { state.artists.splice(Number(i),1); persistArtists(); } });

function parseResult(raw) { if (typeof raw === 'object' && raw) return raw; const text = String(raw || '').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''); try { return JSON.parse(text); } catch { throw new Error('TinyFish returned an unreadable result. Please scan again.'); } }
function statusLabel(status) { return ({presale:'Presale soon','on-sale':'On sale','announced':'Announced','sold-out':'Sold out',unknown:'Check seller'})[status] || 'Check seller'; }
function initials(name) { return String(name || '?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }

function render() {
  const visible = state.events.filter(e => state.filter === 'all' || e.status === state.filter);
  $('events').innerHTML = visible.map((event,index) => {
    const original = state.events.indexOf(event); const watched = state.watches[event.id]; const url = safeUrl(event.purchaseUrl);
    return `<article class="event-card"><div class="event-art tone-${original%4}"><span>${esc(initials(event.artist))}</span><b>${esc(event.artist)}</b></div><div class="event-body"><div class="event-top"><span class="pill ${esc(event.status)}">${esc(statusLabel(event.status))}</span><span class="seller">via ${esc(event.seller || 'official seller')}</span></div><h3>${esc(event.title || event.artist)}</h3><p class="place">⌖ ${esc(event.venue || 'London venue')} · ${esc(event.date || 'Date not announced')}</p><div class="sale-grid"><div><small>PRESALE</small><b>${esc(event.presaleDate || 'Not found')}</b></div><div><small>GENERAL SALE</small><b>${esc(event.generalSaleDate || 'Not found')}</b></div><div><small>PRICE</small><b>${esc(event.price || 'Not shown')}</b></div></div><div class="card-actions"><button class="watch ${watched?'saved':''}" data-watch="${original}">${watched ? '✓ Watch saved' : 'Set ticket strategy'}</button>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Official tickets ↗</a>` : '<span class="unavailable">Link not verified</span>'}</div></div></article>`;
  }).join('');
  $('empty').classList.toggle('hidden', visible.length > 0);
  const alerts = state.events.filter(e => e.presale?.published);
  $('presale-alerts').innerHTML = alerts.map(e => `<div class="presale-banner"><div class="bell">✦</div><div><b>Presale update · ${esc(e.artist)}</b><p>${e.presale.code ? `Official public code: <strong>${esc(e.presale.code)}</strong>` : esc(e.presale.instructions || 'Official presale information has been published.')}</p></div>${safeUrl(e.presale.url) ? `<a href="${esc(safeUrl(e.presale.url))}" target="_blank" rel="noopener">View official source ↗</a>` : ''}</div>`).join('');
  $('watch-count').textContent = Object.keys(state.watches).length;
}

async function scan() {
  $('onboarding').classList.add('hidden'); $('dashboard').classList.add('hidden'); $('error').classList.add('hidden'); $('loading').classList.remove('hidden'); $('live-view').classList.add('hidden');
  $('progress').textContent = 'Looking for your artists across official sellers…';
  try {
    const response = await fetch('/api/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artists:state.artists})});
    if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error||'The scan could not start.');}
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',complete=false;
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const ev=JSON.parse(line);if(ev.type==='progress')$('progress').textContent=ev.message;if(ev.type==='stream'&&safeUrl(ev.url)){$('live-view').href=ev.url;$('live-view').classList.remove('hidden');}if(ev.type==='error')throw new Error(ev.message);if(ev.type==='complete'){const data=parseResult(ev.data);state.events=Array.isArray(data.events)?data.events:[];$('checked-at').textContent=`Live check · ${new Date(data.checkedAt||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;complete=true;render();}}if(done)break;}
    if(!complete)throw new Error('The live scan ended before results were ready.');
    $('loading').classList.add('hidden');$('dashboard').classList.remove('hidden');
  }catch(error){$('loading').classList.add('hidden');$('error-message').textContent=error.message;$('error').classList.remove('hidden');}
}

$('start').addEventListener('click',()=>{localStorage.setItem('tr_artists',JSON.stringify(state.artists));scan();});
$('refresh').addEventListener('click',scan);$('retry').addEventListener('click',scan);
$('edit-artists').addEventListener('click',()=>{$('dashboard').classList.add('hidden');$('onboarding').classList.remove('hidden');});
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;render();}));

$('events').addEventListener('click',e=>{const i=e.target.dataset.watch;if(i===undefined)return;state.current=state.events[Number(i)];$('dialog-title').textContent=state.current.artist;$('dialog-meta').textContent=`${state.current.venue} · ${state.current.date}`;const existing=state.watches[state.current.id];if(existing){document.querySelector(`input[name="mode"][value="${existing.mode}"]`).checked=true;$('budget').value=existing.budget||'';$('quantity').value=existing.quantity||'2';$('section').value=existing.section||'';$('ticket-type').value=existing.ticketType||'Primary or official resale';}toggleChance();$('watch-dialog').showModal();});
function toggleChance(){const mode=document.querySelector('input[name="mode"]:checked').value;$('chance-fields').classList.toggle('hidden',mode!=='chance');$('budget').required=mode==='chance';}
document.querySelectorAll('input[name="mode"]').forEach(r=>r.addEventListener('change',toggleChance));
$('watch-form').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const mode=document.querySelector('input[name="mode"]:checked').value;if(mode==='chance'&&!$('budget').value){e.preventDefault();$('budget').focus();return;}state.watches[state.current.id]={mode,budget:$('budget').value,quantity:$('quantity').value,section:$('section').value.trim(),ticketType:$('ticket-type').value,event:state.current};localStorage.setItem('tr_watches',JSON.stringify(state.watches));render();showToast(mode==='immediate'?'Sale reminders set: 1 week, 1 day and 30 minutes before.':'Price watch saved. We’ll alert you when your criteria match.');});
function showToast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),4500);}

chips(); if(state.artists.length){$('onboarding').classList.add('hidden');$('dashboard').classList.remove('hidden');$('empty').classList.remove('hidden');}
