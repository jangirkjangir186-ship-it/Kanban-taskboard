/* =====================================================
   GitHub Developer Explorer — Script
   Multi-endpoint: /users/:login, /users/:login/repos,
   /rate_limit. Handles rate limits, auth tokens,
   sorting/filtering, language breakdown chart.
   ===================================================== */

(function () {
  'use strict';

  const API = 'https://api.github.com';

  /* ─── Language colour map ─── */
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', HTML: '#e34c26', CSS: '#563d7c', 'C++': '#f34b7d',
    C: '#555555', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584',
    Ruby: '#701516', PHP: '#4F5D95', Shell: '#89e051', Swift: '#ffac45',
    Kotlin: '#A97BFF', Dart: '#00B4AB', Vue: '#41b883', Svelte: '#ff3e00',
    Lua: '#000080', Scala: '#c22d40', Haskell: '#5e5086', Elixir: '#6e4a7e',
    'Jupyter Notebook': '#DA5B0B', R: '#276DC3', MATLAB: '#e16737',
    Other: '#8b949e',
  };

  /* ─── DOM refs ─── */
  const $ = id => document.getElementById(id);
  const els = {
    tokenInput: $('tokenInput'),
    saveTokenBtn: $('saveTokenBtn'),
    clearTokenBtn: $('clearTokenBtn'),
    rateDisplay: $('rateDisplay'),
    rateBarFill: $('rateBarFill'),
    tokenStatusLabel: $('tokenStatusLabel'),
    usernameInput: $('usernameInput'),
    searchBtn: $('searchBtn'),
    statusBox: $('statusBox'),
    skeletonLoader: $('skeletonLoader'),
    results: $('results'),
    quickLinks: $('quickLinks'),
  };

  /* ─── Token helpers ─── */
  function getToken() { return localStorage.getItem('gh_token') || ''; }

  function authHeaders() {
    const t = getToken();
    const h = { Accept: 'application/vnd.github+json' };
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function updateTokenUI() {
    const t = getToken();
    if (t) {
      els.tokenStatusLabel.textContent = '🔑 Authenticated';
      els.tokenInput.placeholder = 'Token saved — click Clear to remove';
    } else {
      els.tokenStatusLabel.textContent = '🔓 Unauthenticated';
      els.tokenInput.placeholder = 'Paste GitHub Personal Access Token (optional)';
    }
  }

  els.saveTokenBtn.addEventListener('click', () => {
    const v = els.tokenInput.value.trim();
    if (v) {
      localStorage.setItem('gh_token', v);
      els.tokenInput.value = '';
      updateTokenUI();
      showStatus('Token saved — you now have 5 000 requests/hour.', 'success');
      checkRateLimit();
    }
  });

  els.clearTokenBtn.addEventListener('click', () => {
    localStorage.removeItem('gh_token');
    updateTokenUI();
    showStatus('Token cleared — back to 60 requests/hour.', 'info');
    checkRateLimit();
  });

  /* ─── Rate limit ─── */
  async function checkRateLimit() {
    try {
      const res = await fetch(`${API}/rate_limit`, { headers: authHeaders() });
      const data = await res.json();
      const core = data.resources.core;
      const pct = (core.remaining / core.limit) * 100;
      const resetTime = new Date(core.reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const auth = getToken() ? '· 🔑 authenticated' : '· unauthenticated';
      els.rateDisplay.textContent = `${core.remaining} / ${core.limit} requests remaining · resets ${resetTime} ${auth}`;
      els.rateBarFill.style.width = pct + '%';
      els.rateBarFill.style.background = pct > 40
        ? 'linear-gradient(90deg,#58a6ff,#bc8cff)'
        : pct > 15
        ? 'linear-gradient(90deg,#e3b341,#f0883e)'
        : 'linear-gradient(90deg,#f85149,#e3b341)';
    } catch {
      els.rateDisplay.textContent = 'Rate limit info unavailable.';
    }
  }

  /* ─── Status messages ─── */
  function showStatus(msg, type = 'info') {
    if (!msg) { els.statusBox.innerHTML = ''; return; }
    const icons = { error: '⚠️', info: 'ℹ️', success: '✅' };
    els.statusBox.innerHTML = `
      <div class="status-msg status-${type}" role="alert">
        <span>${icons[type] || 'ℹ️'}</span>
        <span>${escapeHtml(msg)}</span>
      </div>`;
  }

  /* ─── Fetch wrapper ─── */
  async function fetchJSON(url) {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const reset = res.headers.get('x-ratelimit-reset');
        const t = reset ? new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon';
        throw new Error(`Rate limit exceeded. Resets at ${t}. Add a GitHub Personal Access Token above to raise your limit to 5000/hr.`);
      }
      throw new Error('Access forbidden by GitHub API. If you used a token, verify it is valid.');
    }
    if (res.status === 404) throw new Error('User not found. Double-check the username and try again.');
    if (!res.ok) throw new Error(`GitHub API error (HTTP ${res.status}).`);
    return res.json();
  }

  /* ─── Utility ─── */
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function relDate(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}yr ago`;
  }

  /* ─── Language breakdown ─── */
  function computeLangBreakdown(repos) {
    const counts = {};
    repos.forEach(r => {
      if (!r.language) return;
      counts[r.language] = (counts[r.language] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { entries, total };
  }

  function renderLangSection(entries, total) {
    if (total === 0) return `<div class="lang-section"><p style="color:var(--text-secondary);font-size:.85rem">No language data available for public repos.</p></div>`;

    const topEntries = entries.slice(0, 10);
    const otherCount = entries.slice(10).reduce((s, [, c]) => s + c, 0);
    const displayEntries = otherCount > 0
      ? [...topEntries, ['Other', otherCount]]
      : topEntries;

    const segs = displayEntries.map(([lang, count]) => {
      const pct = (count / total * 100).toFixed(1);
      const color = LANG_COLORS[lang] || LANG_COLORS.Other;
      return `<div class="lang-seg" style="width:${pct}%;background:${color};" title="${escapeHtml(lang)}: ${pct}% (${count} repos)"></div>`;
    }).join('');

    const legend = displayEntries.map(([lang, count]) => {
      const pct = (count / total * 100).toFixed(1);
      const color = LANG_COLORS[lang] || LANG_COLORS.Other;
      return `
        <div class="lang-item" title="${count} repos">
          <span class="lang-dot" style="background:${color}"></span>
          <span>${escapeHtml(lang)}</span>
          <span class="lang-pct">${pct}%</span>
        </div>`;
    }).join('');

    return `
      <div class="lang-section">
        <h3>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color:var(--accent)" aria-hidden="true">
            <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"/>
          </svg>
          Language Breakdown
          <span style="color:var(--text-secondary);font-weight:400;font-size:.8rem">(${total} repos)</span>
        </h3>
        <div class="lang-bar">${segs}</div>
        <div class="lang-legend">${legend}</div>
      </div>`;
  }

  /* ─── Repo card ─── */
  function renderRepoCard(repo, isListView = false) {
    const color = LANG_COLORS[repo.language] || LANG_COLORS.Other;
    const topics = (repo.topics || []).slice(0, 4).map(t =>
      `<span class="topic-tag">${escapeHtml(t)}</span>`
    ).join('');

    const badge = repo.fork
      ? `<span class="repo-fork-badge">Fork</span>`
      : repo.stargazers_count > 0
      ? `<span class="repo-starred-badge" title="${repo.stargazers_count} stars">★</span>`
      : '';

    const listClass = isListView ? ' list-view-card' : '';

    return `
      <div class="repo-card${listClass}">
        ${badge}
        <div class="repo-body">
          <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="repo-name">
            <svg class="repo-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>
            ${escapeHtml(repo.name)}
          </a>
          ${topics ? `<div class="repo-topics">${topics}</div>` : ''}
          <p class="repo-desc">${repo.description ? escapeHtml(repo.description) : '<em style="color:var(--text-muted)">No description</em>'}</p>
        </div>
        <div class="repo-meta">
          ${repo.language ? `<span class="repo-meta-item"><span class="repo-lang-dot" style="background:${color}"></span>${escapeHtml(repo.language)}</span>` : ''}
          ${repo.stargazers_count > 0 ? `<span class="repo-meta-item">⭐ ${fmtNum(repo.stargazers_count)}</span>` : ''}
          ${repo.forks_count > 0 ? `<span class="repo-meta-item">🍴 ${fmtNum(repo.forks_count)}</span>` : ''}
          <span class="repo-meta-item" title="Last updated ${new Date(repo.updated_at).toLocaleDateString()}">🕒 ${relDate(repo.updated_at)}</span>
          ${repo.open_issues_count > 0 ? `<span class="repo-meta-item">⚠️ ${repo.open_issues_count}</span>` : ''}
        </div>
      </div>`;
  }

  /* ─── Sort repos ─── */
  function sortRepos(repos, mode) {
    const r = [...repos];
    if (mode === 'stars')   r.sort((a, b) => b.stargazers_count - a.stargazers_count);
    if (mode === 'forks')   r.sort((a, b) => b.forks_count - a.forks_count);
    if (mode === 'name')    r.sort((a, b) => a.name.localeCompare(b.name));
    if (mode === 'created') r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (mode === 'updated') r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    if (mode === 'issues')  r.sort((a, b) => b.open_issues_count - a.open_issues_count);
    if (mode === 'size')    r.sort((a, b) => b.size - a.size);
    return r;
  }

  /* ─── Filter repos ─── */
  function filterRepos(repos, query, lang) {
    let r = [...repos];
    if (query) {
      const q = query.toLowerCase();
      r = r.filter(repo =>
        repo.name.toLowerCase().includes(q) ||
        (repo.description && repo.description.toLowerCase().includes(q)) ||
        (repo.topics && repo.topics.some(t => t.toLowerCase().includes(q)))
      );
    }
    if (lang && lang !== 'all') {
      r = r.filter(repo => repo.language === lang);
    }
    return r;
  }

  /* ─── Render profile ─── */
  function renderProfile(user, repos) {
    const joinYear = new Date(user.created_at).getFullYear();
    const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);
    const totalForks = repos.reduce((s, r) => s + r.forks_count, 0);

    const metaItems = [
      user.company ? `<span class="meta-item"><svg class="meta-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 14.25c0 .138.112.25.25.25H4v-1.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75v1.25h2.25a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm-1.5 0A1.75 1.75 0 0 0 1.75 16H14.25A1.75 1.75 0 0 0 16 14.25V1.75A1.75 1.75 0 0 0 14.25 0H1.75A1.75 1.75 0 0 0 0 1.75v12.5ZM6 4.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 6 4.75ZM3.75 4h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM6 7.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 6 7.75Zm-2.25-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM6 10.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Zm-2.25-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Z"/></svg>${escapeHtml(user.company.replace(/^@/, ''))}</span>` : '',
      user.location ? `<span class="meta-item"><svg class="meta-icon" viewBox="0 0 16 16" fill="currentColor"><path d="m12.596 11.596-3.535 3.536a1.5 1.5 0 0 1-2.122 0l-3.535-3.536a6.5 6.5 0 1 1 9.192 0Zm-1.06-1.06a5 5 0 1 0-7.072 0L8 14.07l3.536-3.534v-.001Zm-4.538.215a2.5 2.5 0 1 1 3.534-3.534 2.5 2.5 0 0 1-3.534 3.534Z"/></svg>${escapeHtml(user.location)}</span>` : '',
      user.blog ? `<span class="meta-item"><svg class="meta-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/></svg><a href="${user.blog.startsWith('http') ? user.blog : 'https://' + user.blog}" target="_blank" rel="noopener">${escapeHtml(user.blog.replace(/^https?:\/\//, ''))}</a></span>` : '',
      user.twitter_username ? `<span class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><a href="https://twitter.com/${user.twitter_username}" target="_blank" rel="noopener">@${user.twitter_username}</a></span>` : '',
      `<span class="meta-item"><svg class="meta-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a.75.75 0 1 0 0 1.5 1.5 1.5 0 0 1 .666 2.844.75.75 0 0 0-.416.672v.352a.75.75 0 0 0 .574.73c1.2.289 2.162 1.2 2.522 2.372a.75.75 0 1 0 1.434-.44 5.01 5.01 0 0 0-2.56-3.012A3 3 0 0 0 11 4Z"/></svg>Joined ${joinYear}</span>`,
    ].filter(Boolean).join('');

    return `
      <div class="profile-card">
        <div class="avatar-wrap">
          <img src="${user.avatar_url}" alt="${escapeHtml(user.login)}'s avatar" loading="lazy">
          <div class="avatar-badge" title="GitHub user">🐙</div>
        </div>
        <div class="profile-info">
          <h2 class="profile-name">${escapeHtml(user.name || user.login)}</h2>
          <p class="profile-login">@${escapeHtml(user.login)}</p>
          ${user.bio ? `<p class="profile-bio">${escapeHtml(user.bio)}</p>` : ''}
          <div class="profile-meta">${metaItems}</div>
          <div class="stats-row">
            <div class="stat-badge"><span class="stat-num">${fmtNum(user.public_repos)}</span><span class="stat-label">Repos</span></div>
            <div class="stat-badge"><span class="stat-num">${fmtNum(user.followers)}</span><span class="stat-label">Followers</span></div>
            <div class="stat-badge"><span class="stat-num">${fmtNum(user.following)}</span><span class="stat-label">Following</span></div>
            <div class="stat-badge"><span class="stat-num">${fmtNum(user.public_gists)}</span><span class="stat-label">Gists</span></div>
            <div class="stat-badge"><span class="stat-num">⭐ ${fmtNum(totalStars)}</span><span class="stat-label">Total Stars</span></div>
            <div class="stat-badge"><span class="stat-num">🍴 ${fmtNum(totalForks)}</span><span class="stat-label">Total Forks</span></div>
          </div>
          <div class="profile-actions">
            <a href="${user.html_url}" target="_blank" rel="noopener" class="btn-profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
              View on GitHub
            </a>
            ${user.email ? `<a href="mailto:${user.email}" class="btn-profile btn-profile-ghost">✉️ ${escapeHtml(user.email)}</a>` : ''}
          </div>
        </div>
      </div>`;
  }

  /* ─── Render repo list ─── */
  let allRepos = [];
  let currentSort = 'updated';
  let currentFilter = '';
  let currentLang = 'all';
  let isListView = false;

  function renderRepoSection(repos) {
    const { entries, total } = computeLangBreakdown(repos);
    const uniqueLangs = [...new Set(repos.filter(r => r.language).map(r => r.language))].sort();
    const langOptions = uniqueLangs.map(l =>
      `<option value="${escapeHtml(l)}"${currentLang === l ? ' selected' : ''}>${escapeHtml(l)}</option>`
    ).join('');

    const filteredSorted = sortRepos(filterRepos(repos, currentFilter, currentLang), currentSort);

    const repoCards = filteredSorted.length
      ? filteredSorted.map(r => renderRepoCard(r, isListView)).join('')
      : `<div class="empty-state"><div class="empty-icon">🔍</div><p>No repositories match your search.</p></div>`;

    return `
      ${renderLangSection(entries, total)}

      <div class="repo-header">
        <div class="repo-count-label">
          <span>${filteredSorted.length}</span> of <span>${repos.length}</span> repositories
        </div>
        <div class="repo-filters">
          <div class="filter-input-wrap">
            <svg class="filter-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="filterInput" placeholder="Filter repos…" value="${escapeHtml(currentFilter)}">
          </div>
          <select id="langFilter">
            <option value="all"${currentLang === 'all' ? ' selected' : ''}>All languages</option>
            ${langOptions}
          </select>
          <select id="sortSelect">
            <option value="updated"${currentSort === 'updated' ? ' selected' : ''}>Recently updated</option>
            <option value="stars"${currentSort === 'stars' ? ' selected' : ''}>Most stars</option>
            <option value="forks"${currentSort === 'forks' ? ' selected' : ''}>Most forks</option>
            <option value="issues"${currentSort === 'issues' ? ' selected' : ''}>Open issues</option>
            <option value="created"${currentSort === 'created' ? ' selected' : ''}>Newest first</option>
            <option value="size"${currentSort === 'size' ? ' selected' : ''}>Largest</option>
            <option value="name"${currentSort === 'name' ? ' selected' : ''}>Name (A–Z)</option>
          </select>
          <div class="view-toggle">
            <button class="view-btn${!isListView ? ' active' : ''}" id="gridViewBtn" title="Grid view" aria-label="Grid view">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5z"/></svg>
            </button>
            <button class="view-btn${isListView ? ' active' : ''}" id="listViewBtn" title="List view" aria-label="List view">
              <svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div id="repoGrid" class="${isListView ? 'list-view' : 'grid-view'}">
        ${repoCards}
      </div>
    `;
  }

  /* ─── Re-render repos (without hitting API again) ─── */
  function reRenderRepos() {
    const repoSection = document.getElementById('repoSection');
    if (!repoSection) return;
    repoSection.innerHTML = renderRepoSection(allRepos);
    attachRepoControls();
  }

  function attachRepoControls() {
    const filterInput = $('filterInput');
    const sortSelect = $('sortSelect');
    const langFilter = $('langFilter');
    const gridViewBtn = $('gridViewBtn');
    const listViewBtn = $('listViewBtn');

    if (filterInput) {
      filterInput.addEventListener('input', e => {
        currentFilter = e.target.value;
        reRenderRepos();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', e => {
        currentSort = e.target.value;
        reRenderRepos();
      });
    }
    if (langFilter) {
      langFilter.addEventListener('change', e => {
        currentLang = e.target.value;
        reRenderRepos();
      });
    }
    if (gridViewBtn) {
      gridViewBtn.addEventListener('click', () => {
        isListView = false;
        reRenderRepos();
      });
    }
    if (listViewBtn) {
      listViewBtn.addEventListener('click', () => {
        isListView = true;
        reRenderRepos();
      });
    }
  }

  /* ─── Main search ─── */
  async function searchUser() {
    const username = els.usernameInput.value.trim();
    if (!username) {
      showStatus('Please enter a GitHub username to search.', 'error');
      return;
    }

    /* Reset state */
    currentFilter = '';
    currentLang = 'all';
    currentSort = 'updated';
    isListView = false;

    els.searchBtn.disabled = true;
    els.searchBtn.classList.add('btn-loading');
    showStatus('', '');
    els.results.innerHTML = '';
    els.skeletonLoader.classList.remove('hidden');

    try {
      /* Parallel fetch: user profile + repos */
      const [user, repos] = await Promise.all([
        fetchJSON(`${API}/users/${encodeURIComponent(username)}`),
        fetchJSON(`${API}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`),
      ]);

      allRepos = repos;
      els.skeletonLoader.classList.add('hidden');
      showStatus('', '');

      els.results.innerHTML = `
        ${renderProfile(user, repos)}
        <div id="repoSection">${renderRepoSection(repos)}</div>
      `;

      attachRepoControls();

      /* Smooth scroll to results */
      els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      els.skeletonLoader.classList.add('hidden');
      showStatus(err.message, 'error');
    } finally {
      els.searchBtn.disabled = false;
      els.searchBtn.classList.remove('btn-loading');
      checkRateLimit();
    }
  }

  /* ─── Event listeners ─── */
  els.searchBtn.addEventListener('click', searchUser);
  els.usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchUser();
  });

  /* Quick link pills */
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      els.usernameInput.value = btn.dataset.user;
      searchUser();
    });
  });

  /* ─── Init ─── */
  updateTokenUI();
  checkRateLimit();
})();
