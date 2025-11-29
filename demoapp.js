// app.js (module)
const API = 'http://localhost:4000/api'; // <-- change to your backend base URL
const TOAST = document.getElementById('toast-container');

// ---------- simple toast ----------
export function toast(message, type = 'info', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerText = message;
  TOAST.appendChild(el);
  setTimeout(()=> el.remove(), ms);
}

// If loaded via <script type="module"> we need window access:
window.toast = toast;

// ---------- Preloader hide ----------
document.addEventListener('DOMContentLoaded', () => {
  const pre = document.getElementById('preloader');
  if (pre) {
    setTimeout(()=> pre.classList.add('hidden'), 600);
    setTimeout(()=> pre && pre.remove(), 1200);
  }
});

/* ---------- AUTH: login & signup ---------- */
if (document.getElementById('loginForm')) {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    try {
      const res = await fetch(`${API}/login`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
      const j = await res.json();
      if (res.ok && j.token) {
        localStorage.setItem('ps_token', j.token);
        localStorage.setItem('ps_email', email);
        toast('Logged in', 'success');
        setTimeout(()=> location.href='dashboard.html', 400);
      } else {
        toast(j.error || 'Login failed', 'warn');
      }
    } catch (err) {
      toast('Server error', 'danger');
    }
  });
}

if (document.getElementById('signupForm')) {
  const form = document.getElementById('signupForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    try {
      const res = await fetch(`${API}/register`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, email, password })
      });
      const j = await res.json();
      if (res.ok) {
        toast('Account created. Log in.', 'success');
        setTimeout(()=> location.href='index.html', 900);
      } else toast(j.error || 'Signup failed', 'warn');
    } catch (err) { toast('Server error', 'danger') }
  });
}

/* ---------- DASHBOARD: devices list & quick actions ---------- */
async function fetchJSON(url, opts = {}) {
  const headers = opts.headers || {};
  const token = localStorage.getItem('ps_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, {...opts, headers});
  return res;
}

async function loadDevicesTo(selectorId = 'devicesList', includeSelect=false) {
  const el = document.getElementById(selectorId);
  if (!el) return;
  el.innerHTML = 'Loading...';
  try {
    const res = await fetchJSON(`${API}/devices`);
    if (!res.ok) {
      el.innerHTML = <div class="muted">Failed to load devices</div>;
      return;
    }
    const j = await res.json();
    const devices = j.devices || [];
    if (!devices.length) { el.innerHTML = '<div class="muted">No devices registered</div>'; return; }

    if (includeSelect) {
      const sel = document.getElementById('deviceSelect') || document.getElementById('controlDevice');
      if (sel) {
        sel.innerHTML = '';
        devices.forEach(d => sel.append(new Option(d.device_name || d.device_id, d.device_id)));
      }
    }

    el.innerHTML = '';
    devices.forEach(d => {
      const item = document.createElement('div'); item.className='device-item';
      const left = document.createElement('div'); left.className='device-info';
      left.innerHTML = `<div>
        <div class="device-name">${escapeHtml(d.device_name || d.device_id)}</div>
        <div class="device-meta">Last: ${d.last_seen || 'never'}</div>
      </div>`;
      const right = document.createElement('div');
      right.innerHTML = `<button class="btn btn-ghost" data-id="${d.device_id}" data-action="preview">Preview</button>
        <button class="btn" data-id="${d.device_id}" data-action="loc">Locate</button>
        <button class="btn danger" data-id="${d.device_id}" data-action="lock">Lock</button>`;
      item.appendChild(left); item.appendChild(right);
      el.appendChild(item);
    });

    // attach device buttons
    el.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', (e)=>{
        const action = b.dataset.action;
        const id = b.dataset.id;
        if (action === 'preview') showDevicePreview(id);
        if (action === 'loc') sendCommand(id, 'request-location');
        if (action === 'lock') sendCommand(id, 'lock', { message: 'Locked by owner' });
      });
    });

  } catch (err) { el.innerHTML = '<div class="muted">Error</div>' }
}

function escapeHtml(s=''){ return (''+s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

async function showDevicePreview(deviceId) {
  const el = document.getElementById('devicePreview');
  el.innerHTML = 'Loading...';
  try {
    const res = await fetchJSON(`${API}/device/${deviceId}/info`);
    if (!res.ok) return el.innerHTML='Failed';
    const j = await res.json();
    el.innerHTML = `
      <div><strong>${escapeHtml(j.device.device_name||j.device.device_id)}</strong></div>
      <div class="muted small">Last seen: ${j.device.last_seen || 'never'}</div>
      <div style="margin-top:8px">${j.device.is_stolen ? '<b style="color:var(--danger)">Marked stolen</b>':'Status normal'}</div>
      <div class="small muted" style="margin-top:8px">Battery: ${j.device.battery||'—'} | SIM: ${j.device.sim||'—'}</div>
    `;
  } catch (e) { el.innerHTML='Error' }
}

/* ---------- CONTROL PAGE: commands + confirm modal ---------- */
if (document.getElementById('controlDevice')) {
  loadDevicesTo('devicesList', true); // also populates selects
  (async ()=>{
    await loadDevicesTo('devicesList', true);
    const sel = document.getElementById('controlDevice');
    if (sel) {
      sel.addEventListener('change', ()=>{});
    }
  })();

  document.getElementById('cmdLocate').addEventListener('click', ()=>{
    const id = document.getElementById('controlDevice').value;
    sendCommand(id, 'request-location');
  });
  document.getElementById('cmdLock').addEventListener('click', ()=>{
    const id = document.getElementById('controlDevice').value;
    sendCommand(id, 'lock', { message: 'Locked by owner via web' });
  });
  document.getElementById('cmdAlarm').addEventListener('click', ()=>{
    const id = document.getElementById('controlDevice').value;
    sendCommand(id, 'alarm', {});
  });

  // wipe with confirm modal
  document.getElementById('cmdWipe').addEventListener('click', ()=>{
    document.getElementById('modal').classList.remove('hidden');
  });
  document.getElementById('modalCancel').addEventListener('click', ()=>{
    document.getElementById('modal').classList.add('hidden');
  });
  document.getElementById('modalConfirm').addEventListener('click', ()=>{
    const id = document.getElementById('controlDevice').value;
    sendCommand(id, 'wipe', {});
    document.getElementById('modal').classList.add('hidden');
  });
}

/* ---------- MAP PAGE: google maps integration ---------- */
if (document.getElementById('map')) {
  let map, marker, follow = false, currentDeviceId = null;
  const deviceSelect = document.getElementById('deviceSelect');
  const centerBtn = document.getElementById('centerBtn');
  const followBtn = document.getElementById('followBtn');

  async function initMap() {
    map = new google.maps.Map(document.getElementById('map'), { center:{lat:23.0,lng:79.0}, zoom:5 });
    marker = new google.maps.Marker({ map });

    // populate select
    const res = await fetchJSON(`${API}/devices`);
    if (res.ok) {
      const j = await res.json();
      deviceSelect.innerHTML = '';
      j.devices.forEach(d => deviceSelect.append(new Option(d.device_name||d.device_id, d.device_id)));
      deviceSelect.addEventListener('change', ()=>{
        currentDeviceId = deviceSelect.value;
        fetchAndPlace();
      });
      if (j.devices.length) {
        currentDeviceId = j.devices[0].device_id;
        deviceSelect.value = currentDeviceId;
        fetchAndPlace();
      }
    }

    centerBtn.addEventListener('click', ()=> map.panTo(marker.getPosition()));
    followBtn.addEventListener('click', ()=> follow = !follow);

    // poll location every 6s
    setInterval(()=> {
      if (currentDeviceId) fetchAndPlace();
    }, 6000);
  }

  async function fetchAndPlace() {
    try {
      const res = await fetchJSON(`${API}/device/${currentDeviceId}/location`);
      if (!res.ok) return;
      const j = await res.json();
      if (!j.location) return;
      const { latitude, longitude } = j.location;
      const latLng = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
      marker.setPosition(latLng);
      if (follow) map.panTo(latLng);
      else map.setCenter(latLng);
      map.setZoom(16);
      toast('Location updated', 'info', 1400);
    } catch (e) { /* ignore */ }
  }

  window.initMap = initMap;
  // If google maps already loaded, call init immediately:
  if (window.google && window.google.maps) initMap();
}

/* ---------- ADMIN PAGE ---------- */
if (document.getElementById('usersList')) {
  loadAdminData();
  async function loadAdminData() {
    try {
      const [uRes, dRes, lRes] = await Promise.all([
        fetchJSON(`${API}/admin/users`),
        fetchJSON(`${API}/admin/devices`),
        fetchJSON(`${API}/admin/commands`)
      ]);
      if (uRes.ok) {
        const uj = await uRes.json(); renderAdminUsers(uj.users || []);
      } else document.getElementById('usersList').innerHTML='Failed';
      if (dRes.ok) {
        const dj = await dRes.json(); renderAdminDevices(dj.devices || []);
      } else document.getElementById('adminDevices').innerHTML='Failed';
      if (lRes.ok) {
        const lj = await lRes.json(); renderAdminLogs(lj.logs || []);
      } else document.getElementById('adminLogs').innerHTML='Failed';
    } catch (e) { console.error(e) }
  }

  function renderAdminUsers(users){
    const el = document.getElementById('usersList'); el.innerHTML='';
    users.forEach(u => {
      const div = document.createElement('div'); div.className='device-item';
      div.innerHTML = `<div><strong>${escapeHtml(u.email)}</strong><div class="small muted">id: ${u.id}</div></div>
        <div><button class="btn btn-ghost" data-id="${u.id}" data-act="impersonate">Impersonate</button></div>`;
      el.appendChild(div);
    });
    el.querySelectorAll('button[data-act="impersonate"]').forEach(b=>{
      b.addEventListener('click', () => toast('Impersonation not enabled in demo', 'warn'));
    });
  }
  function renderAdminDevices(devs){
    const el = document.getElementById('adminDevices'); el.innerHTML='';
    devs.forEach(d => {
      const div = document.createElement('div'); div.className='device-item';
      div.innerHTML = `<div><strong>${escapeHtml(d.device_name||d.device_id)}</strong><div class="small muted">user: ${d.user_email || '—'}</div></div>
        <div><button class="btn danger" data-id="${d.device_id}" data-act="force-wipe">Wipe</button></div>`;
      el.appendChild(div);
    });
    el.querySelectorAll('button[data-act="force-wipe"]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if (!confirm('Force wipe device?')) return;
        const id = b.dataset.id;
        await sendCommand(id, 'wipe', {});
      });
    });
  }
  function renderAdminLogs(logs){
    const el = document.getElementById('adminLogs'); el.innerHTML='';
    logs.slice(0,30).forEach(l => {
      const div = document.createElement('div'); div.className='small muted';
      div.innerText = `${l.created_at} | ${l.command} | device:${l.device_id} | by:${l.user_id}`;
      el.appendChild(div);
    });
  }
}

/* ---------- Quick topbar buttons and dark toggle ---------- */
document.addEventListener('click', (e)=>{
  if (e.target.id === 'mapButton') location.href='track.html';
  if (e.target.id === 'controlButton') location.href='control.html';
  if (e.target.id === 'adminButton') location.href='admin.html';
});
const darkToggle = document.getElementById('darkToggle');
if (darkToggle) {
  const saved = localStorage.getItem('ps_dark') === '1';
  if (saved) document.body.classList.add('dark'), darkToggle.checked = true;
  darkToggle.addEventListener('change', (e)=>{
    if (e.target.checked) { document.body.classList.add('dark'); localStorage.setItem('ps_dark','1'); }
    else { document.body.classList.remove('dark'); localStorage.removeItem('ps_dark'); }
  });
}

/* ---------- SEND COMMAND helper ---------- */
async function sendCommand(deviceId, command, payload = {}) {
  try {
    const res = await fetchJSON(`${API}/device/${deviceId}/command`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ command, payload })
    });
    const j = await res.json();
    if (res.ok) {
      toast(`${command} sent`, 'success');
      return j;
    } else {
      toast(j.error || 'Failed to send', 'warn');
    }
  } catch (e) { toast('Network error', 'danger') }
}
window.sendCommand = sendCommand;

/* ---------- Recent logs polling for dashboard ---------- */
if (document.getElementById('recentLogs')) {
  setInterval(async ()=>{
    try {
      const res = await fetchJSON(`${API}/commands/recent`);
      if (!res.ok) return;
      const j = await res.json();
      const el = document.getElementById('recentLogs');
      el.innerHTML = j.logs.slice(0,6).map(l=>`${l.created_at} • ${l.command} • ${l.device_id}`).join('<br>');
    } catch (e){}
  }, 5000);
}

/* ---------- small helper to populate dashboard on load ---------- */
if (document.body.classList.contains('page-dashboard')) {
  document.addEventListener('DOMContentLoaded', ()=> loadDevicesTo('devicesList', true));
  document.getElementById('quickLocate')?.addEventListener('click', async ()=>{
    const first = document.querySelector('.device-item button[data-action="loc"]');
    if (!first) return toast('No device selected','warn');
    first.click();
  });
  document.getElementById('quickLock')?.addEventListener('click', ()=>{
    const first = document.querySelector('.device-item button[data-action="lock"]');
    if (!first) return toast('No device','warn'); first.click();
  });
  document.getElementById('quickWipe')?.addEventListener('click', ()=>{
    const first = document.querySelector('.device-item button[data-action="lock"]');
    if (!first) return toast('No device','warn');
    if (!confirm('Wipe first device? This is irreversible.')) return;
    sendCommand(first.dataset.id, 'wipe', {});
  });
}

/* ---------- utility: escape, etc. (already provided) ---------- */