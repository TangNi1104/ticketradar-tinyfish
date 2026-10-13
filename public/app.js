const $ = id => document.getElementById(id);
const state = { artists: JSON.parse(localStorage.getItem('tr_artists') || '[]'), email: localStorage.getItem('tr_email') || '', account: null, events: [], renderedEvents: [], scanEvents: {}, watches: JSON.parse(localStorage.getItem('tr_watches') || '{}'), current: null, filter: 'all', view: 'discover' };
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeUrl = v => { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function chips() { const html = state.artists.map((a,i) => `<span>${esc(a)} <button data-remove="${i}" aria-label="Remove ${esc(a)}">×</button></span>`).join(''); $('artist-chips').innerHTML = html; $('following-chips').innerHTML = state.artists.map(a => `<span>${esc(a)} <i>live</i></span>`).join(''); $('start').disabled = !state.artists.length || !validEmail(state.email); $('artist-count').textContent = state.artists.length; }
function persistArtists() { localStorage.setItem('tr_artists', JSON.stringify(state.artists)); chips(); syncProfile(); }
function addArtist() { const input = $('artist-input'); const name = input.value.trim(); if (name && !state.artists.some(a => a.toLowerCase() === name.toLowerCase()) && state.artists.length < 8) state.artists.push(name); input.value=''; persistArtists(); }
$('artist-form').addEventListener('submit', e => { e.preventDefault(); addArtist(); });
$('artist-chips').addEventListener('click', e => { const i = e.target.dataset.remove; if (i !== undefined) { state.artists.splice(Number(i),1); persistArtists(); } });
$('notification-email').value=state.email;
$('notification-email').addEventListener('input',e=>{state.email=e.target.value.trim();chips();});

function parseResult(raw) { if (typeof raw === 'object' && raw) return raw; const text = String(raw || '').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''); try { return JSON.parse(text); } catch { throw new Error('TinyFish returned an unreadable result. Please scan again.'); } }
function statusLabel(status) { return ({presale:'Presale soon','on-sale':'On sale','announced':'Announced','sold-out':'Sold out',unknown:'Check seller'})[status] || 'Check seller'; }
function initials(name) { return String(name || '?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }

function profilePayload(){ return {artists:state.artists,watches:state.watches,notificationEmail:state.email}; }
async function requestJson(url,options={}){const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
function accountLabel(){const label=state.account?`@${state.account.username}`:'Log in';document.querySelectorAll('.account-button').forEach(button=>button.textContent=label);}
function applyProfile(data){
  state.account={username:data.username};state.artists=Array.isArray(data.profile?.artists)?data.profile.artists:[];state.watches=data.profile?.watches&&typeof data.profile.watches==='object'?data.profile.watches:{};state.email=data.profile?.notificationEmail||'';
  localStorage.setItem('tr_artists',JSON.stringify(state.artists));localStorage.setItem('tr_watches',JSON.stringify(state.watches));localStorage.setItem('tr_email',state.email);$('notification-email').value=state.email;chips();render();accountLabel();
}
async function syncProfile(){if(!state.account)return;try{await requestJson('/api/profile',{method:'PUT',body:JSON.stringify(profilePayload())});}catch(error){showToast(`Could not sync account: ${error.message}`);}}
async function restoreAccount(){try{applyProfile(await requestJson('/api/auth/me'));}catch{accountLabel();}}
function openAccount(){
  $('auth-error').classList.add('hidden');$('auth-username').value=state.account?.username||'';$('auth-password').value='';$('auth-username').disabled=Boolean(state.account);$('auth-password').closest('.notify-field').classList.toggle('hidden',Boolean(state.account));$('auth-actions').classList.toggle('hidden',Boolean(state.account));$('logout').classList.toggle('hidden',!state.account);$('auth-title').textContent=state.account?'Account saved':'Save your radar';$('auth-copy').textContent=state.account?`Logged in as @${state.account.username}. Your artists and watches sync to this account.`:'Create an account or log in to restore your artists and ticket watches.';$('auth-dialog').showModal();
}

function render() {
  const source = state.view === 'watches' ? Object.values(state.watches).map(watch=>watch.event).filter(Boolean) : state.events;
  const visible = source.filter(e => state.view === 'watches' || state.filter === 'all' || e.status === state.filter);
  state.renderedEvents = visible;
  $('events').innerHTML = visible.map((event,index) => {
    const watched = state.watches[event.id]; const url = safeUrl(event.purchaseUrl);
    return `<article class="event-card"><div class="event-art tone-${index%4}"><span>${esc(initials(event.artist))}</span><b>${esc(event.artist)}</b></div><div class="event-body"><div class="event-top"><span class="pill ${esc(event.status)}">${esc(statusLabel(event.status))}</span><span class="seller">via ${esc(event.seller || 'official seller')}</span></div><h3>${esc(event.title || event.artist)}</h3><p class="place">⌖ ${esc(event.venue || 'London venue')} · ${esc(event.date || 'Date not announced')}</p><div class="sale-grid"><div><small>PRESALE</small><b>${esc(event.presaleDate || 'Not found')}</b></div><div><small>GENERAL SALE</small><b>${esc(event.generalSaleDate || 'Not found')}</b></div><div><small>PRICE</small><b>${esc(event.price || 'Not shown')}</b></div></div><div class="card-actions"><button class="watch ${watched?'saved':''}" data-watch="${index}">${watched ? '✓ Watch saved' : 'Set ticket strategy'}</button>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Official tickets ↗</a>` : '<span class="unavailable">Link not verified</span>'}</div></div></article>`;
  }).join('');
  $('empty').classList.toggle('hidden', visible.length > 0);
  const alerts = state.events.filter(e => e.presale?.published);
  $('presale-alerts').innerHTML = alerts.map(e => `<div class="presale-banner"><div class="bell">✦</div><div><b>Presale update · ${esc(e.artist)}</b><p>${e.presale.code ? `Official public code: <strong>${esc(e.presale.code)}</strong>` : esc(e.presale.instructions || 'Official presale information has been published.')}</p></div>${safeUrl(e.presale.url) ? `<a href="${esc(safeUrl(e.presale.url))}" target="_blank" rel="noopener">View official source ↗</a>` : ''}</div>`).join('');
  $('watch-count').textContent = Object.keys(state.watches).length;
}

function closeMenu(){ $('side-menu').classList.remove('open'); $('menu-backdrop').classList.add('hidden'); }
function setView(view){
  state.view=view;
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('discover-content').classList.toggle('hidden',view==='artists');
  $('artists-view').classList.toggle('hidden',view!=='artists');
  $('presale-alerts').classList.toggle('hidden',view==='watches');
  $('filter-row').classList.toggle('hidden',view==='watches');
  $('view-title').textContent=view==='watches'?'My ticket watches':view==='artists'?'Followed artists':'Upcoming drops';
  $('empty-title').textContent=view==='watches'?'No ticket watches yet':'No verified London shows found';
  $('empty-copy').textContent=view==='watches'?'Choose “Set ticket strategy” on a concert to add it here.':'That can change fast. Scan again later—we won’t invent events that aren’t confirmed.';
  render(); closeMenu();
}
function showHome(push=true){
  closeMenu();
  $('loading').classList.add('hidden'); $('dashboard').classList.add('hidden'); $('error').classList.add('hidden'); $('onboarding').classList.remove('hidden');
  if(push) history.pushState({page:'home'},'',location.pathname);
}

async function scan() {
  state.scanEvents = {};
  $('onboarding').classList.add('hidden'); $('dashboard').classList.add('hidden'); $('error').classList.add('hidden'); $('loading').classList.remove('hidden'); $('live-view').classList.add('hidden');
  $('progress').textContent = 'Looking for your artists across official sellers…';
  try {
    const response = await fetch('/api/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artists:state.artists})});
    if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error||'The scan could not start.');}
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',complete=false,finished=0;
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const ev=JSON.parse(line);if(ev.type==='artist_started')$('progress').textContent=`Checking ${ev.artist} (${ev.index} of ${ev.total})…`;if(ev.type==='progress'){$('progress').textContent=ev.message;if(!$('dashboard').classList.contains('hidden'))$('checked-at').textContent=`Still verifying · ${ev.message}`;}if(ev.type==='quick_result'){const quick=parseResult(ev.data);state.scanEvents[ev.artist]=Array.isArray(quick.events)?quick.events:[];state.events=Object.values(state.scanEvents).flat();render();$('loading').classList.add('hidden');$('dashboard').classList.remove('hidden');$('checked-at').textContent='Fast matches ready · deep verification continues';}if(ev.type==='artist_complete'){finished+=1;const verified=parseResult(ev.data);state.scanEvents[ev.artist]=Array.isArray(verified.events)?verified.events:[];state.events=Object.values(state.scanEvents).flat();render();$('progress').textContent=`${ev.artist} checked${ev.cached?' from a recent scan':''} · ${finished} of ${ev.total} ready`;if(!$('dashboard').classList.contains('hidden'))$('checked-at').textContent=`Verified ${finished} of ${ev.total} artists…`;}if(ev.type==='stream'&&safeUrl(ev.url)){$('live-view').href=ev.url;$('live-view').classList.remove('hidden');}if(ev.type==='error')throw new Error(ev.message);if(ev.type==='complete'){const data=parseResult(ev.data);state.events=Array.isArray(data.events)?data.events:[];$('checked-at').textContent=`Live check complete · ${new Date(data.checkedAt||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;complete=true;render();}}if(done)break;}
    if(!complete)throw new Error('The live scan ended before results were ready.');
    $('loading').classList.add('hidden');$('dashboard').classList.remove('hidden');
  }catch(error){$('loading').classList.add('hidden');$('error-message').textContent=error.message;$('error').classList.remove('hidden');}
}

$('start').addEventListener('click',()=>{localStorage.setItem('tr_artists',JSON.stringify(state.artists));localStorage.setItem('tr_email',state.email);syncProfile();scan();});
$('refresh').addEventListener('click',scan);$('retry').addEventListener('click',scan);
$('edit-artists').addEventListener('click',()=>{$('dashboard').classList.add('hidden');$('onboarding').classList.remove('hidden');});
$('menu-toggle').addEventListener('click',()=>{$('side-menu').classList.toggle('open');$('menu-backdrop').classList.toggle('hidden',!$('side-menu').classList.contains('open'));});
$('menu-backdrop').addEventListener('click',closeMenu);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
document.querySelectorAll('.logo').forEach(logo=>logo.addEventListener('click',e=>{e.preventDefault();showHome();}));
window.addEventListener('popstate',()=>showHome(false));
$('notification-settings').addEventListener('click',()=>{$('settings-email').value=state.email;$('email-dialog').showModal();});
$('email-form').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const email=$('settings-email').value.trim();if(!validEmail(email)){e.preventDefault();$('settings-email').focus();return;}state.email=email;$('notification-email').value=email;localStorage.setItem('tr_email',email);chips();syncProfile();showToast(`Alert email saved. Your watches will use ${email}.`);});
document.querySelectorAll('.account-button').forEach(button=>button.addEventListener('click',openAccount));
$('auth-close').addEventListener('click',()=>$('auth-dialog').close());
$('auth-form').addEventListener('submit',async e=>{e.preventDefault();const action=e.submitter?.value||'login';const username=$('auth-username').value.trim();const password=$('auth-password').value;try{const data=await requestJson(`/api/auth/${action}`,{method:'POST',body:JSON.stringify({username,password,profile:profilePayload()})});applyProfile(data);$('auth-dialog').close();showToast(action==='signup'?'Account created. Your preferences are saved.':'Welcome back. Your radar has been restored.');}catch(error){$('auth-error').textContent=error.message;$('auth-error').classList.remove('hidden');}});
$('logout').addEventListener('click',async()=>{await requestJson('/api/auth/logout',{method:'POST'}).catch(()=>{});state.account=null;state.artists=[];state.watches={};state.email='';localStorage.removeItem('tr_artists');localStorage.removeItem('tr_watches');localStorage.removeItem('tr_email');$('notification-email').value='';chips();render();accountLabel();$('auth-dialog').close();showHome();showToast('Logged out. Local preferences were cleared from this browser.');});
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;render();}));

$('events').addEventListener('click',e=>{const i=e.target.dataset.watch;if(i===undefined)return;state.current=state.renderedEvents[Number(i)];$('dialog-title').textContent=state.current.artist;$('dialog-meta').textContent=`${state.current.venue} · ${state.current.date}`;const existing=state.watches[state.current.id];if(existing){document.querySelector(`input[name="mode"][value="${existing.mode}"]`).checked=true;$('budget').value=existing.budget||'';$('quantity').value=existing.quantity||'2';$('section').value=existing.section||'';$('ticket-type').value=existing.ticketType||'Primary or official resale';}toggleChance();$('watch-dialog').showModal();});
function toggleChance(){const mode=document.querySelector('input[name="mode"]:checked').value;$('chance-fields').classList.toggle('hidden',mode!=='chance');$('budget').required=mode==='chance';}
document.querySelectorAll('input[name="mode"]').forEach(r=>r.addEventListener('change',toggleChance));
$('watch-form').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const mode=document.querySelector('input[name="mode"]:checked').value;if(mode==='chance'&&!$('budget').value){e.preventDefault();$('budget').focus();return;}state.watches[state.current.id]={mode,email:state.email,budget:$('budget').value,quantity:$('quantity').value,section:$('section').value.trim(),ticketType:$('ticket-type').value,event:state.current};localStorage.setItem('tr_watches',JSON.stringify(state.watches));render();syncProfile();showToast(mode==='immediate'?`Sale reminders saved for ${state.email}.`:`Price watch saved for ${state.email}.`);});
function showToast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),4500);}

chips();accountLabel();restoreAccount();if(state.artists.length&&validEmail(state.email)){$('onboarding').classList.add('hidden');$('dashboard').classList.remove('hidden');$('empty').classList.remove('hidden');}
