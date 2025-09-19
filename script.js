/* script.js — таблица, круговой селектор ролей, пагинация, назначение в БД (team_players) */
const hiddenPlayerIds = [49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,97,98,99,100,101,102,103,104,105,106,107,108,121,122,123,124,125,126,127,128,129,130,131,132,157,158,159,160,161,162,163,164,165,166,167,168,181,182,183,184,185,186,187,188,189,190,191,192,229,230,231,232,233,234,235,236,237,238,239,240,277,278,279,280,281,282,283,284,285,286,287,288,133,134,135,136,137,138,139,140,141,142,143,144,37,38,39,40,41,42,43,44,45,46,47,48,25,26,27,28,29,30,31,32,33,34,35,36,1,2,3,4,5,6,7,8,9,10,11,12,193,194,195,196,197,198,199,200,201,202,203,204,265,266,267,268,269,270,271,272,273,274,275,276,145,146,147,148,149,150,151,152,153,154,155,156,217,218,219,220,221,222,223,224,225,226,227,228];
const BUDGET_CAP = 70;
const DEFAULT_AVATAR = "";
const playersPerPage = 8;
const ROLE_KEYS = ["Scorer", "Assistant", "Rebounder", "Stopper", "Shooter", "Young"];
let ROLE_OPTIONS = [
  { key: "Scorer", label: "SCORER" },
  { key: "Assistant", label: "ASSISTANT" },
  { key: "Rebounder", label: "REBOUNDER" },
  { key: "Stopper", label: "STOPPER" },
  { key: "Shooter", label: "SHOOTER" },
  { key: "Young", label: "SURPRISE", maxPrice: 7 }
];
const selectedRoles = {
  Scorer: null,
  Assistant: null,
  Rebounder: null,
  Stopper: null,
  Shooter: null,
  Young: null
};
const cachedData = {
  players: [],
  teamPlayers: [],
  teams: [],
  roles: [],
  playerStats: [],
};
let players = [];
let rolesFromDb = [];
let teamPlayers = [];
let currentUser = null;
let currentUserTeamId = null;
let currentPage = 1;
let currentTourId = null;

function logDebug(...args) { console.debug("[script.js]", ...args); }
function ensureSupabase() {
  if (!window.supabase) {
    console.error("Supabase клиент не найден. Подключите supabaseClient.js перед script.js");
    return false;
  }
  return true;
}

async function loadRolesFromDb() {
  if (!ensureSupabase()) return;
  try {
    const { data, error } = await supabase.from("roles").select("id,name,formula");
    if (error) throw error;
    rolesFromDb = data || [];
    ROLE_OPTIONS.forEach(opt => {
      const match = rolesFromDb.find(r => String(r.name).toLowerCase() === String(opt.key).toLowerCase() || String(r.name).toLowerCase() === String(opt.label).toLowerCase());
      if (match) opt.dbId = match.id;
    });
    logDebug("ROLE_OPTIONS mapped:", ROLE_OPTIONS);
  } catch (err) {
    console.error("Ошибка загрузки roles:", err);
  }
}

async function loadCurrentUserAndTeam() {
  if (!ensureSupabase()) return;
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = session?.user ?? null;
    const { data: teamData, error: teamError } = await supabase
      .from("user_teams")
      .select("id,team_name")
      .eq("user_id", currentUser.id)
      .limit(1)
      .maybeSingle();
    if (teamError) throw teamError;
    if (teamData) {
      currentUserTeamId = teamData.id;
    } else {
      const username = currentUser.user_metadata?.username || `user_${currentUser.id.slice(0,6)}`;
      const { data: newTeam, error: insertErr } = await supabase
        .from("user_teams")
        .insert([{ user_id: currentUser.id, team_name: username }])
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      currentUserTeamId = newTeam.id;
    }
    const userNameEl = document.getElementById("header-username");
    if (userNameEl) {
      const username = currentUser.user_metadata?.username || currentUser.email || "Игрок";
      userNameEl.textContent = username;
    }
    logDebug("currentUserTeamId:", currentUserTeamId);
  } catch (err) {
    console.error("Ошибка получения текущего пользователя / команды:", err);
  }
}

async function loadCurrentTour() {
  const { data: tours, error } = await supabase
    .from("tours")
    .select("*")
    .order("start_time", { ascending: true });
  if (error) {
    console.error("Ошибка загрузки туров:", error);
    return;
  }
  const now = new Date();
  const currentTour = tours.find(t => new Date(t.start_time) <= now && now <= new Date(t.end_time));
  currentTourId = currentTour ? currentTour.id : null;
  console.log("currentTourId:", currentTourId);
}

async function loadAllData() {
  try {
    console.log('Загружаем все данные из Supabase с пагинацией...');
    const fetchAll = async (tableName) => {
      let allData = [];
      let offset = 0;
      const limit = 1000;
      while (true) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .range(offset, offset + limit - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        offset += limit;
      }
      return allData;
    };
    const playersData = await fetchAll('players');
    const playerStatsData = await fetchAll('player_stats');
    cachedData.teamPlayers = await fetchAll('team_players');
    cachedData.teams = await fetchAll('user_teams');
    cachedData.roles = await fetchAll('roles');

    const statsByPlayer = {};
    (playerStatsData || []).forEach(s => {
      const pid = s.player_id;
      const tour = (s.tour === 2 || s.tour === 3) ? 2 : s.tour;
      const record = { ...s, tour };
      if (!statsByPlayer[pid]) statsByPlayer[pid] = [];
      statsByPlayer[pid].push(record);
    });

    cachedData.players = (playersData || []).map(p => {
      const list = statsByPlayer[p.id] || [];
      const count = list.length || 1;
      const sumPts = list.reduce((s, r) => s + (r.points || 0), 0);
      const sumAst = list.reduce((s, r) => s + (r.assists || 0), 0);
      const sumReb = list.reduce((s, r) => s + (r.rebounds || 0), 0);
      const sumBlk = list.reduce((s, r) => s + (r.blocks || 0), 0);
      const sumStl = list.reduce((s, r) => s + (r.steals || 0), 0);
      const sumTo  = list.reduce((s, r) => s + (r.turnover || 0), 0);
      const avgFormula = (
        (sumPts)
        + (sumAst * 1.5)
        + (sumReb * 1.3)
        + (sumStl * 3)
        + (sumBlk * 3)
        + (sumTo * -2)
      ) / count;
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        name: [p.first_name, p.last_name].filter(Boolean).join(" "),
        position: p.position,
        country: p.country,
        price: Number(p.price ?? 0),
        photo: p.photo_url || "",
        stats: p.stats || {},
        avg: Number(avgFormula.toFixed(1)),
        pts: Number((sumPts / count).toFixed(1)),
        ast: Number((sumAst / count).toFixed(1)),
        reb: Number((sumReb / count).toFixed(1)),
        blk: Number((sumBlk / count).toFixed(1)),
        stl: Number((sumStl / count).toFixed(1)),
        to:  Number((sumTo  / count).toFixed(1))
      };
    });

    console.log('Всего игроков:', cachedData.players.length);
    return true;
  } catch (error) {
    console.error('Ошибка в loadAllData:', error);
    return false;
  }
}

async function loadTeamPlayers() {
  if (!ensureSupabase()) return;
  if (!currentUserTeamId) return;
  if (!currentTourId) return;
  try {
    const { data, error } = await supabase
      .from("team_players")
      .select("id,team_id,player_id,role_id,tour_id")
      .eq("team_id", currentUserTeamId)
      .eq("tour_id", currentTourId);
    if (error) throw error;
    teamPlayers = data || [];
    const roleIdToKey = {};
    ROLE_OPTIONS.forEach(opt => { if (opt.dbId) roleIdToKey[opt.dbId] = opt.key; });
    Object.keys(selectedRoles).forEach(k => selectedRoles[k] = null);
    (teamPlayers || []).forEach(tp => {
      const key = roleIdToKey[tp.role_id];
      if (key) selectedRoles[key] = tp.player_id;
    });
    logDebug("teamPlayers loaded for current tour:", currentTourId, selectedRoles);
  } catch (err) {
    console.error("Ошибка загрузки team_players:", err);
  }
}

function renderRoster() {
  ROLE_OPTIONS.forEach(opt => {
    const slot = document.getElementById(`slot-${opt.key}`);
    if (!slot) return;
    if (opt.dbId) slot.dataset.roleId = opt.dbId;
    slot.dataset.roleKey = opt.key;
    slot.innerHTML = "";
    const playerId = selectedRoles[opt.key];
    if (!playerId) {
      const empty = document.createElement("div");
      empty.className = "empty-slot";
      empty.textContent = "—";
      const name = document.createElement("div");
      name.className = "role-name";
      name.textContent = opt.label;
      slot.appendChild(empty);
      slot.appendChild(name);
      return;
    }
    const pl = players.find(x => String(x.id) === String(playerId));
    const img = document.createElement("img");
    img.src = pl?.photo || DEFAULT_AVATAR;
    img.alt = pl?.name || "Player";
    const name = document.createElement("div");
    name.className = "role-name";
    name.textContent = opt.label;
    slot.appendChild(img);
    slot.appendChild(name);
  });
}

async function renderTeamHistory() {
  if (!ensureSupabase()) return;
  if (!currentUserTeamId) return;
  try {
    const { data, error } = await supabase
      .from("team_players")
      .select("tour_id, player_id, role_id, players(name, photo)")
      .eq("team_id", currentUserTeamId)
      .order("tour_id", { ascending: true });
    if (error) throw error;
    const historyEl = document.getElementById("team-history");
    historyEl.innerHTML = "";
    const grouped = {};
    data.forEach(row => {
      if (!grouped[row.tour_id]) grouped[row.tour_id] = [];
      grouped[row.tour_id].push(row);
    });
    Object.keys(grouped).forEach(tourId => {
      const block = document.createElement("div");
      block.className = "tour-block";
      const title = document.createElement("h3");
      title.textContent = `Тур ${tourId}`;
      block.appendChild(title);
      const list = document.createElement("div");
      list.className = "players-list";
      grouped[tourId].forEach(p => {
        const playerDiv = document.createElement("div");
        playerDiv.className = "player-card";
        const img = document.createElement("img");
        img.src = p.players?.photo || DEFAULT_AVATAR;
        img.alt = p.players?.name || "Player";
        const name = document.createElement("span");
        name.textContent = p.players?.name || "Неизвестный";
        playerDiv.appendChild(img);
        playerDiv.appendChild(name);
        list.appendChild(playerDiv);
      });
      block.appendChild(list);
      historyEl.appendChild(block);
    });
  } catch (err) {
    console.error("Ошибка загрузки истории состава:", err);
  }
}

function getSpentCoins(nextMap = null) {
  const map = nextMap || selectedRoles;
  const ids = new Set(Object.values(map).filter(Boolean));
  let total = 0;
  ids.forEach(id => {
    const p = players.find(pl => String(pl.id) === String(id));
    if (p) total += Number(p.price || 0);
  });
  return total;
}

function updateBudgetDisplay() {
  const spentEl = document.getElementById("spent-money");
  if (spentEl) spentEl.textContent = String(getSpentCoins());
}

function getFilteredAndSortedPlayers() {
  const country = (document.getElementById("filter-country")?.value || "").trim();
  const pos = (document.getElementById("filter-pos")?.value || "").trim();
  const sort = (document.getElementById("filter-sort")?.value || "").trim();
  let list = Array.isArray(players) ? [...players] : [];
  if (country) list = list.filter(p => (p.country || "").toLowerCase() === country.toLowerCase());
  if (pos) list = list.filter(p => (p.position || p.pos || "").toUpperCase() === pos.toUpperCase());
  list = list.filter(p => !hiddenPlayerIds.includes(p.id));
  if (sort) {
    switch (sort) {
      case "price-asc": list.sort((a,b) => (a.price||0) - (b.price||0)); break;
      case "price-desc": list.sort((a,b) => (b.price||0) - (a.price||0)); break;
      case "avg-asc": list.sort((a,b) => (a.avg||0) - (b.avg||0)); break;
      case "avg-desc": list.sort((a,b) => (b.avg||0) - (a.avg||0)); break;
      default: break;
    }
  }
  return list;
}

function populateCountryFilter() {
  const sel = document.getElementById("filter-country");
  if (!sel) return;
  const countries = Array.from(new Set(players.map(p => (p.country || "").trim()).filter(Boolean))).sort();
  sel.innerHTML = `<option value="">All</option>` + countries.map(c => `<option value="${c}">${c}</option>`).join("");
}

function renderPlayersTable() {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const filtered = getFilteredAndSortedPlayers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / playersPerPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * playersPerPage;
  const pagePlayers = filtered.slice(start, start + playersPerPage);
  pagePlayers.forEach(p => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    tr.innerHTML = `
      <td><button class="add-btn" data-id="${p.id}" aria-label="Add ${p.name}">+</button></td>
      <td>${p.photo ? `<img src="${p.photo}" alt="${p.name}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;">` : ''}</td>
      <td>${p.name}</td>
      <td>${p.price}$</td>
      <td>${p.avg}</td>
      <td>${p.pts}</td>
      <td>${p.ast}</td>
      <td>${p.reb}</td>
      <td>${p.stl}</td>
      <td>${p.blk}</td>
      <td>${p.to}</td>
    `;
    tbody.appendChild(tr);
  });
  initAddButtonDelegation();
  const pageInfo = document.getElementById("page-info");
  if (pageInfo) pageInfo.textContent = `${currentPage} / ${totalPages}`;
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function initPaginationButtons() {
  const prev = document.getElementById("prev-page");
  const next = document.getElementById("next-page");
  prev?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderPlayersTable(); }
  });
  next?.addEventListener("click", () => {
    const filtered = getFilteredAndSortedPlayers();
    const totalPages = Math.max(1, Math.ceil(filtered.length / playersPerPage));
    if (currentPage < totalPages) { currentPage++; renderPlayersTable(); }
  });
}

function initAddButtonDelegation() {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;
  tbody.replaceWith(tbody.cloneNode(true));
  const newTbody = document.getElementById("players-tbody");
  newTbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-btn");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const player = players.find(p => String(p.id) === String(id));
    if (!player) return;
    openRoleSelector(btn, player);
  });
}

async function assignPlayerToRoleDb(teamId, playerId, roleDbId) {
  if (!ensureSupabase()) return false;
  if (!teamId || !playerId || !roleDbId || !currentTourId) {
    console.warn("assignPlayerToRoleDb: отсутствуют аргументы", { teamId, playerId, roleDbId, currentTourId });
    return false;
  }
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("team_players")
      .select("id,player_id")
      .eq("team_id", teamId)
      .eq("role_id", roleDbId)
      .eq("tour_id", currentTourId)
      .limit(1)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (existing && existing.id) {
      const { error: updErr } = await supabase
        .from("team_players")
        .update({ player_id: playerId })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from("team_players")
        .insert([{ team_id: teamId, player_id: playerId, role_id: roleDbId, tour_id: currentTourId }]);
      if (insErr) throw insErr;
    }
    const roleOpt = ROLE_OPTIONS.find(o => o.dbId === roleDbId);
    if (roleOpt) selectedRoles[roleOpt.key] = playerId;
    await loadTeamPlayers();
    renderRoster();
    updateBudgetDisplay();
    return true;
  } catch (err) {
    console.error("Ошибка при назначении игрока:", err);
    return false;
  }
}

let selectorOverlay = null;
let selectorEl = null;

function openRoleSelector(triggerBtn, player) {
  closeRoleSelector();
  selectorOverlay = document.createElement("div");
  selectorOverlay.className = "role-overlay";
  selectorOverlay.addEventListener("click", closeRoleSelector);
  selectorEl = document.createElement("div");
  selectorEl.className = "role-selector";
  selectorEl.setAttribute("role", "dialog");
  selectorEl.setAttribute("aria-label", "Выбор роли");
  selectorEl.style.position = "fixed";
  const rect = triggerBtn.getBoundingClientRect();
  const size = 220;
  let left = rect.left + rect.width / 2 - size / 2;
  let top  = rect.top  + rect.height / 2 - size / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - size - 8));
  top  = Math.max(8, Math.min(top, window.innerHeight - size - 8));
  selectorEl.style.left = `${left}px`;
  selectorEl.style.top  = `${top}px`;
  selectorEl.style.width = `${size}px`;
  selectorEl.style.height = `${size}px`;
  const rolesToShow = ROLE_OPTIONS.filter(r => !(r.key === "Young" && player.price > (r.maxPrice || 7)));
  const R = 80;
  rolesToShow.forEach((opt, i) => {
    const angle = (i / rolesToShow.length) * (Math.PI * 2) - Math.PI / 2;
    const bw = 90, bh = 40;
    const x = size / 2 + R * Math.cos(angle) - bw / 2;
    const y = size / 2 + R * Math.sin(angle) - bh / 2;
    const b = document.createElement("button");
    b.textContent = opt.label;
    b.style.position = "absolute";
    b.style.left = `${x}px`;
    b.style.top  = `${y}px`;
    b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!opt.dbId) {
        alert("Эта роль ещё не сконфигурирована в базе (roles). Обновите роли в админке.");
        return;
      }
      const next = { ...selectedRoles, [opt.key]: player.id };
      const nextSpent = getSpentCoins(next);
      if (nextSpent > BUDGET_CAP) {
        alert(`Превышен бюджет (${nextSpent}$). Лимит ${BUDGET_CAP}$.`);
        return;
      }
      const ok = await assignPlayerToRoleDb(currentUserTeamId, player.id, opt.dbId);
      if (ok) {
        closeRoleSelector();
      } else {
        alert("Не удалось назначить игрока. Смотрите консоль для ошибок.");
      }
    });
    selectorEl.appendChild(b);
  });
  document.body.appendChild(selectorOverlay);
  document.body.appendChild(selectorEl);
  requestAnimationFrame(() => {
    selectorOverlay.classList.add("show");
    selectorEl.classList.add("show");
  });
  document.addEventListener("keydown", escCloseOnce);
  window.addEventListener("resize", closeRoleSelector, { once: true });
  window.addEventListener("scroll", closeRoleSelector, { once: true });
}

function escCloseOnce(e) { if (e.key === "Escape") closeRoleSelector(); }

function closeRoleSelector() {
  if (selectorOverlay) { selectorOverlay.classList.remove("show"); setTimeout(()=>selectorOverlay?.remove(),180); selectorOverlay = null; }
  if (selectorEl) { selectorEl.classList.remove("show"); setTimeout(()=>selectorEl?.remove(),180); selectorEl = null; }
  document.removeEventListener("keydown", escCloseOnce);
}

async function saveTeamScore(teamId, totalPoints) {
  if (!ensureSupabase()) return;
  const { data, error } = await supabase
    .from("scores")
    .upsert({
      team_id: teamId,
      tour_id: currentTourId,
      total_points: totalPoints
    }, { onConflict: ['team_id', 'tour_id'] });
  if (error) {
    console.error("Ошибка при сохранении очков команды:", error);
  }
}

async function loadScoresForCurrentTour() {
  if (!ensureSupabase()) return [];
  const { data: scores, error } = await supabase
    .from("scores")
    .select("team_id,total_points")
    .eq("tour_id", currentTourId);
  if (error) {
    console.error("Ошибка загрузки очков:", error);
    return [];
  }
  return scores;
}

function initTableFilters() {
  ["filter-country","filter-pos","filter-sort"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      currentPage = 1;
      renderPlayersTable();
    });
  });
}

function initParButtons() {
  document.querySelectorAll(".panel").forEach(p => { p.setAttribute("role","region"); p.setAttribute("aria-hidden","true"); });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".par-btn");
    if (!btn) return;
    e.preventDefault();
    const targetId = btn.dataset.target;
    const panel = document.getElementById(targetId);
    if (!panel) return;
    const isOpen = panel.classList.toggle("show");
    const wrap = btn.closest(".strip-wrapper");
    const strip = wrap?.querySelector(".strip");
    if (isOpen) {
      strip?.classList.add("expanded");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
      if (targetId === "rules-panel") {
        const imgEl = panel.querySelector("#rules-img");
        if (imgEl) {
          imgEl.src = "./image/rules.jpg";
          imgEl.style.maxWidth = "60%";
          imgEl.style.height = "auto";
          imgEl.style.display = "block";
        }
      }
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      strip?.classList.remove("expanded");
      btn.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
    }
  });
  const hashId = location.hash?.slice(1);
  if (hashId) {
    const btn = document.querySelector(`.par-btn[data-target="${hashId}"]`);
    if (btn) btn.click();
  }
}

async function saveRosterToDb() {
  if (!currentUserTeamId) { alert("Невозможно сохранить — команда не найдена."); return; }
  for (const opt of ROLE_OPTIONS) {
    const roleId = opt.dbId;
    if (!roleId) continue;
    const playerId = selectedRoles[opt.key];
    if (!playerId) continue;
    await assignPlayerToRoleDb(currentUserTeamId, playerId, roleId);
  }
  alert("Состав сохранён в базе.");
}

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = "index.html";
    return;
  }
  try {
    const { data: team, error: teamError } = await supabase
      .from("user_teams")
      .select("team_name")
      .eq("user_id", user.id)
      .single();
    if (teamError) throw teamError;
    const welcomeEl = document.getElementById("welcome-message");
    const teamEl = document.getElementById("team-name");
    const headerTitle = document.querySelector("header h1");
    if (welcomeEl) {
      const nickname = user.user_metadata?.username || user.email || "Игрок";
      welcomeEl.textContent = `Привет, ${nickname}!`;
    }
    if (teamEl && team?.team_name) {
      teamEl.textContent = `Название команды: ${team.team_name}`;
    }
    if (headerTitle && team?.team_name) {
      headerTitle.textContent = team.team_name;
    }
  } catch (err) {
    console.error("Ошибка при получении данных пользователя:", err);
  }
  if (!ensureSupabase()) return;
  const dataLoaded = await loadAllData();
  if (!dataLoaded) {
    console.error("Не удалось загрузить данные.");
    return;
  }
  players = cachedData.players;
  rolesFromDb = cachedData.roles;
  await loadRolesFromDb();
  await loadCurrentUserAndTeam();
  await loadCurrentTour();
  await loadTeamPlayers();
  populateCountryFilter();
  initTableFilters();
  initPaginationButtons();
  renderPlayersTable();
  renderRoster();
  await renderTeamHistory();
  updateBudgetDisplay();
  initParButtons();
  const saveBtn = document.getElementById("save-roster");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      await saveRosterToDb();
      saveBtn.disabled = false;
    });
  }
  document.querySelectorAll(".role-slot").forEach(slot => {
    slot.addEventListener("click", async () => {
      slot.classList.add("active");
      setTimeout(()=>slot.classList.remove("active"), 250);
    });
  });
});
