  // ---------- STORAGE KEYS ----------
  const STORAGE = {
    elections: 'voteapp_elections',
    votes: 'voteapp_votes',
    users: 'voteapp_users',
    loggedUser: 'voteapp_current_user'
  };

  let currentUser = null;
  let currentView = 'login';

  // Helper functions (load/save)
  function loadElections() { return JSON.parse(localStorage.getItem(STORAGE.elections) || '[]'); }
  function saveElections(elections) { localStorage.setItem(STORAGE.elections, JSON.stringify(elections)); }
  function loadVotes() { return JSON.parse(localStorage.getItem(STORAGE.votes) || '[]'); }
  function saveVotes(votes) { localStorage.setItem(STORAGE.votes, JSON.stringify(votes)); }
  function loadUsers() { return JSON.parse(localStorage.getItem(STORAGE.users) || '[]'); }
  function saveUsers(users) { localStorage.setItem(STORAGE.users, JSON.stringify(users)); }

  function generateUniqueElectionCode() {
    const elections = loadElections();
    const existing = new Set(elections.map(e => e.code));
    let code = '';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    do { code = Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
    while (existing.has(code));
    return code;
  }

  function hasUserVoted(electionCode, username) {
    return loadVotes().some(v => v.electionCode === electionCode && v.voterUsername === username);
  }

  function castVote(electionCode, voterUsername, selectedOption) {
    if (hasUserVoted(electionCode, voterUsername)) return false;
    const votes = loadVotes();
    votes.push({ electionCode, voterUsername, selectedOption, votedAt: new Date().toISOString() });
    saveVotes(votes);
    return true;
  }

  function getElectionResults(electionCode, electionOptions) {
    const votes = loadVotes().filter(v => v.electionCode === electionCode);
    const map = {};
    electionOptions.forEach(opt => map[opt] = 0);
    votes.forEach(v => map[v.selectedOption] = (map[v.selectedOption] || 0) + 1);
    return map;
  }

  function isVotingActive(election) {
    const now = new Date();
    return (now >= new Date(election.startTime) && now <= new Date(election.endTime));
  }

  // Auth
  function loginUser(username) {
    if (!username.trim()) return false;
    const trimmed = username.trim();
    let users = loadUsers();
    if (!users.find(u => u.username.toLowerCase() === trimmed.toLowerCase())) {
      users.push({ username: trimmed, createdAt: new Date().toISOString() });
      saveUsers(users);
    }
    currentUser = { username: trimmed };
    localStorage.setItem(STORAGE.loggedUser, trimmed);
    return true;
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem(STORAGE.loggedUser);
    renderView('login');
  }

  function initAuth() {
    const stored = localStorage.getItem(STORAGE.loggedUser);
    if (stored && loadUsers().some(u => u.username.toLowerCase() === stored.toLowerCase())) {
      currentUser = { username: stored };
      renderView('dashboard');
    } else {
      renderView('login');
    }
  }

  // Helper: escape HTML
  function escapeHtml(str) { return str.replace(/[&<>]/g, function(m){return m==='&'?'&amp;':m==='<'?'&lt;':'&gt;';}); }

  // ------------------- RENDER VIEWS (with code hiding) -------------------
  function renderView(viewName, params = {}) {
    currentView = viewName;
    const container = document.getElementById('dynamicView');
    if (!container) return;
    const userStatusDiv = document.getElementById('userStatusArea');
    if (currentUser) {
      userStatusDiv.innerHTML = `<div class="user-badge">${escapeHtml(currentUser.username)} · <button id="logoutBtn" class="btn-outline" style="background:transparent;padding:0.2rem 0.8rem;font-size:0.75rem; color:white;">logout</button></div>`;
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
    } else {
      userStatusDiv.innerHTML = `<div class="user-badge"> Not logged in</div>`;
    }

    if (viewName === 'login') renderLogin(container);
    else if (viewName === 'dashboard') renderDashboard(container);
    else if (viewName === 'createElection') renderCreateElection(container);
    else if (viewName === 'joinPrompt') renderJoinPrompt(container);
    else if (viewName === 'voteScreen') renderVoteScreen(container, params.electionCode);
    else if (viewName === 'resultsScreen') renderResultsScreen(container, params.electionCode);
    else if (viewName === 'myElections') renderMyElections(container);
  }

  function renderLogin(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center; width:80%; margin: 0 auto; margin-top:3rem; padding:3rem;">
        <h3> Sign in</h3>
        <p style="margin:1rem 0 0.5rem;">Any username (auto‑register)</p>
        <input style="width:50%;" type="text" id="loginUsername" placeholder="e.g., alex_voter">
        <button id="doLoginBtn" class="btn-success" style="width:50%;">Continue</button>
        <div id="loginMessage"></div>
      </div>
    `;
    document.getElementById('doLoginBtn')?.addEventListener('click', () => {
      const val = document.getElementById('loginUsername').value.trim();
      if (!val) document.getElementById('loginMessage').innerHTML = '<div class="message error">❌ Username required</div>';
      else if (loginUser(val)) renderView('dashboard');
      else document.getElementById('loginMessage').innerHTML = '<div class="message error">Error</div>';
    });
  }

  function renderDashboard(container) {
  if (!currentUser) { renderView('login'); return; }
  container.innerHTML = `
    <div class="flex-between" style="margin-bottom: 1rem;">
      
      <div class="grid-2">
        <button id="createElectionBtn" class="btn">Create Election</button>
        <button id="joinElectionBtn" class="btn-outline"> Join with Code</button>
        <button id="myCreatedBtn" class="btn-outline">My Elections</button>
      </div>
    </div>
    <div class="card">
      <p><strong>All elections are private.</strong><br>
      To vote or view results, you must enter the <strong>6‑digit election code</strong> given to you by the election creator.<br>
      Use the <strong>Join with Code</strong> button above.</p>
      <p>As a creator, you can see your own elections in <strong>My Elections</strong> and share the code with voters.</p>
    </div>
  `;
  document.getElementById('createElectionBtn')?.addEventListener('click', () => renderView('createElection'));
  document.getElementById('joinElectionBtn')?.addEventListener('click', () => renderView('joinPrompt'));
  document.getElementById('myCreatedBtn')?.addEventListener('click', () => renderView('myElections'));
}

  function renderCreateElection(container) {
    if (!currentUser) { renderView('login'); return; }
    let optionsList = ['Candidate A', 'Candidate B'];
    const updateOptionsUI = () => {
      const optsDiv = document.getElementById('dynamicOptionsContainer');
      if (!optsDiv) return;
      optsDiv.innerHTML = optionsList.map((opt, idx) => `
        <div class="option-row">
          <input type="text" value="${escapeHtml(opt)}" data-opt-index="${idx}" class="opt-input">
          <button class="removeOptBtn" data-index="${idx}" style="background:#e2e8f0; color:#1e293b;">✖️</button>
        </div>
      `).join('');
      document.querySelectorAll('.opt-input').forEach(inp => inp.addEventListener('change', (e) => { const idx = parseInt(inp.dataset.optIndex); if (!isNaN(idx)) optionsList[idx] = inp.value; }));
      document.querySelectorAll('.removeOptBtn').forEach(btn => btn.addEventListener('click', (e) => { const idx = parseInt(btn.dataset.index); if (optionsList.length > 2) { optionsList.splice(idx,1); updateOptionsUI(); } else alert("Need at least 2 options"); }));
    };
    container.innerHTML = `
      <h3>Create election</h3>
      <div class="card">
        <input type="text" id="electionTitle" placeholder="Title *">
        <textarea id="electionDesc" rows="2" placeholder="Description"></textarea>
        <label>Options (min 2)</label>
        <div id="dynamicOptionsContainer"></div>
        <button id="addOptionBtn" class="btn-outline" style="margin-bottom:1rem;">+ Add Option</button>
        <label>⏱Start time *</label><input type="datetime-local" id="startTimeInput">
        <label>⏱End time *</label><input type="datetime-local" id="endTimeInput">
        <div class="flex-between">
          <button id="cancelCreateBtn" class="btn-outline">Cancel</button>
          <button id="submitElectionBtn" class="btn-success">Create</button>
        </div>
        <div id="createMsg"></div>
      </div>
    `;
    const now = new Date();
    document.getElementById('startTimeInput').value = now.toISOString().slice(0,16);
    document.getElementById('endTimeInput').value = new Date(now.getTime()+3600000).toISOString().slice(0,16);
    updateOptionsUI();
    document.getElementById('addOptionBtn')?.addEventListener('click', () => { optionsList.push(`Option ${optionsList.length+1}`); updateOptionsUI(); });
    document.getElementById('cancelCreateBtn')?.addEventListener('click', () => renderView('dashboard'));
    document.getElementById('submitElectionBtn')?.addEventListener('click', () => {
      const title = document.getElementById('electionTitle').value.trim();
      const desc = document.getElementById('electionDesc').value.trim();
      const start = document.getElementById('startTimeInput').value;
      const end = document.getElementById('endTimeInput').value;
      let finalOpts = [...optionsList];
      document.querySelectorAll('.opt-input').forEach(inp => { const idx = parseInt(inp.dataset.optIndex); if (!isNaN(idx) && inp.value.trim()) finalOpts[idx] = inp.value.trim(); });
      finalOpts = finalOpts.filter(o => o.trim());
      if (!title) return showMsg('createMsg','Title required',true);
      if (finalOpts.length<2) return showMsg('createMsg','At least 2 options',true);
      if (!start || !end) return showMsg('createMsg','Set times',true);
      const startDate = new Date(start), endDate = new Date(end);
      if (endDate <= startDate) return showMsg('createMsg','End after start',true);
      const elections = loadElections();
      const newCode = generateUniqueElectionCode();
      elections.push({
        id: Date.now()+Math.random(), code: newCode, title, description: desc, options: finalOpts,
        startTime: startDate.toISOString(), endTime: endDate.toISOString(),
        creatorUsername: currentUser.username, createdAt: new Date().toISOString()
      });
      saveElections(elections);
      showMsg('createMsg',`Election created! Your code: ${newCode} (share it)`, false);
      setTimeout(()=>renderView('dashboard'),2000);
    });
    function showMsg(id,text,isErr){ const el=document.getElementById(id); if(el) el.innerHTML=`<div class="message ${isErr?'error':'success'}">${escapeHtml(text)}</div>`; }
  }

  function renderJoinPrompt(container) {
    container.innerHTML = `
      <div class="card">
        <h3>Enter election code</h3>
        <input type="text" style="width:30%;" id="joinCodeInput" placeholder="e.g., A3F9K2" autocomplete="off">
        <div class="grid-2">
          <button id="joinVoteBtn" class="btn">Vote</button>
          <button id="joinResultsBtn" class="btn-outline">Results</button>
          <button id="backDashJoin" class="btn-outline">Back</button>
        </div>
        <div id="joinMsg"></div>
      </div>
    `;
    document.getElementById('joinVoteBtn')?.addEventListener('click', () => {
      const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
      const election = loadElections().find(e=>e.code===code);
      if(!election) document.getElementById('joinMsg').innerHTML='<div class="message error">Invalid code</div>';
      else renderView('voteScreen',{ electionCode: code });
    });
    document.getElementById('joinResultsBtn')?.addEventListener('click', () => {
      const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
      const election = loadElections().find(e=>e.code===code);
      if(!election) document.getElementById('joinMsg').innerHTML='<div class="message error">Invalid code</div>';
      else renderView('resultsScreen',{ electionCode: code });
    });
    document.getElementById('backDashJoin')?.addEventListener('click', () => renderView('dashboard'));
  }

  function renderVoteScreen(container, electionCode) {
    if (!currentUser) { renderView('login'); return; }
    const election = loadElections().find(e => e.code === electionCode);
    if (!election) { container.innerHTML = `<div class="card error">Election not found. <button onclick="renderView('dashboard')">Back</button></div>`; return; }
    const already = hasUserVoted(electionCode, currentUser.username);
    const active = isVotingActive(election);
    const isCreator = (currentUser.username === election.creatorUsername);
    let statusMsg = '';
    if (!active) {
      const now = new Date(), start = new Date(election.startTime), end = new Date(election.endTime);
      if (now < start) statusMsg = `Voting starts at ${start.toLocaleString()}`;
      else if (now > end) statusMsg = `Voting ended at ${end.toLocaleString()}`;
    }
    const canVote = active && !already;
    container.innerHTML = `
      <div class="card">
        <div class="flex-between"><h3>${escapeHtml(election.title)}</h3>
        ${isCreator ? `<span class="badge">Code: ${election.code}</span>` : `<span class="badge">🔒 Private Election</span>`}
        </div>
        <p>${escapeHtml(election.description || 'No description')}</p>
        <small>${new Date(election.startTime).toLocaleString()} → ${new Date(election.endTime).toLocaleString()}</small>
        ${statusMsg ? `<div class="message error">${statusMsg}</div>` : ''}
        ${already ? `<div class="message error">⚠️ You have already voted in this election.</div>` : ''}
        ${!active && !already ? `<div class="message error">Voting is not active.</div>` : ''}
        ${canVote ? `
          <form id="voteForm">
            <div class="vote-radio-group" id="voteOptionsGroup"></div>
            <button type="submit" class="btn-success">✔️ Submit Vote</button>
          </form>
        ` : `<button class="btn-outline" onclick="renderView('resultsScreen', { electionCode: '${electionCode}' })">See Results</button>`}
        <button style="margin-top:12px;" class="btn-outline" onclick="renderView('dashboard')">Dashboard</button>
        <div id="voteResultMsg"></div>
      </div>
    `;
    if (canVote) {
      const group = document.getElementById('voteOptionsGroup');
      if (group) group.innerHTML = election.options.map(opt => `<label><input type="radio" name="voteOption" value="${escapeHtml(opt)}" required> ${escapeHtml(opt)}</label>`).join('');
      document.getElementById('voteForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const selected = document.querySelector('input[name="voteOption"]:checked');
        if (!selected) { const msgDiv = document.getElementById('voteResultMsg'); if(msgDiv) msgDiv.innerHTML='<div class="message error">Select an option</div>'; return; }
        if (castVote(electionCode, currentUser.username, selected.value)) {
          const msgDiv = document.getElementById('voteResultMsg'); if(msgDiv) msgDiv.innerHTML='<div class="message success">Vote recorded!</div>';
          setTimeout(()=>renderView('resultsScreen',{ electionCode }),1200);
        } else {
          const msgDiv = document.getElementById('voteResultMsg'); if(msgDiv) msgDiv.innerHTML='<div class="message error">Already voted or error</div>';
        }
      });
    }
  }

  function renderResultsScreen(container, electionCode) {
    const election = loadElections().find(e => e.code === electionCode);
    if (!election) { container.innerHTML = `<div class="card error">Not found. <button onclick="renderView('dashboard')">Back</button></div>`; return; }
    const isCreator = currentUser && (currentUser.username === election.creatorUsername);
    const results = getElectionResults(electionCode, election.options);
    const total = Object.values(results).reduce((a,b)=>a+b,0);
    container.innerHTML = `
      <div class="card">
        <div class="flex-between"><h3>${escapeHtml(election.title)}</h3>
        ${isCreator ? `<span class="badge">${election.code}</span>` : `<span class="badge">Results (code hidden)</span>`}
        </div>
        <p>${total} vote(s) cast</p>
        <div style="margin:1rem 0;">
          ${election.options.map(opt => {
            const count = results[opt] || 0;
            const percent = total===0 ? 0 : ((count/total)*100).toFixed(1);
            return `<div style="margin-bottom:0.8rem;"><strong>${escapeHtml(opt)}</strong> <span style="float:right;">${count} (${percent}%)</span><div style="background:#e2e8f0; border-radius:20px; margin-top:4px;"><div style="background:#3b82f6; width:${percent}%; height:8px; border-radius:20px;"></div></div></div>`;
          }).join('')}
        </div>
        <div class="flex-between">
          <button class="btn-outline" onclick="renderView('voteScreen', { electionCode: '${electionCode}' })">Vote</button>
          <button class="btn-outline" onclick="renderView('dashboard')">Dashboard</button>
        </div>
      </div>
    `;
  }

  function renderMyElections(container) {
    if (!currentUser) { renderView('login'); return; }
    const myElections = loadElections().filter(e => e.creatorUsername === currentUser.username);
    if (myElections.length === 0) {
      container.innerHTML = `<div class="card">You haven't created any election. <button class="btn-outline" onclick="renderView('createElection')">Create one</button> <button onclick="renderView('dashboard')">Back</button></div>`;
      return;
    }
    container.innerHTML = `<h3>My elections (codes visible to you only)</h3>` + myElections.map(e => `
      <div class="card election-card">
        <div class="flex-between"><strong>${escapeHtml(e.title)}</strong><span class="badge">code: ${e.code}</span></div>
        <small>${new Date(e.startTime).toLocaleString()} — ${new Date(e.endTime).toLocaleString()}</small>
        <div style="margin-top:10px;">
          <button class="resultsMyBtn" data-code="${e.code}" class="btn-outline">Results</button>
          <button class="voteMyBtn" data-code="${e.code}" style="margin-left:8px;">Vote (as user)</button>
          <button class="copyCodeBtn" data-code="${e.code}" style="background:#1e293b;">Copy Code</button>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('.resultsMyBtn').forEach(btn => btn.addEventListener('click', () => renderView('resultsScreen', { electionCode: btn.dataset.code })));
    document.querySelectorAll('.voteMyBtn').forEach(btn => btn.addEventListener('click', () => renderView('voteScreen', { electionCode: btn.dataset.code })));
    document.querySelectorAll('.copyCodeBtn').forEach(btn => btn.addEventListener('click', () => { navigator.clipboard.writeText(btn.dataset.code); alert("Code copied!"); }));
    const backBtn = document.createElement('button'); backBtn.innerText = 'Back'; backBtn.classList.add('btn-outline'); backBtn.onclick = () => renderView('dashboard');
    container.appendChild(backBtn);
  }

  // Start
  initAuth();
