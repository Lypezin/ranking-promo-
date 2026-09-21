(function () {
  const config = window.RANKING_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  const configured = url.startsWith("https://") && key.length > 30;
  const table = { ranking: "ranking", rankingCache: "ranking_cache", elite: "elite_couriers", batches: "import_batches", records: "delivery_records" };

  function request(resource, options) {
    if (!configured) return Promise.reject(new Error("A conexão com o Supabase ainda não foi configurada."));
    options = options || {};
    const query = options.query ? "?" + new URLSearchParams(options.query).toString() : "";
    return fetch(url + "/rest/v1/" + resource + query, {
      method: options.method || "GET",
      headers: Object.assign({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, options.headers || {}),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }).then(async function (response) {
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!response.ok) throw new Error(data && (data.message || data.hint) ? data.message || data.hint : "Não foi possível concluir a operação.");
      return data;
    });
  }

  function refreshRanking() {
    return request("rpc/refresh_ranking_cache", { method: "POST", body: {} }).catch(function () {});
  }

  function ensureEliteSnapshotReady() {
    return request(table.records, { query: { select: "score_multiplier", limit: "1" } }).catch(function () {
      throw new Error("A atualização de segurança do banco ainda não foi aplicada. Não apague a lista Elite antes de executar a migração 002.");
    });
  }

  const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  function number(value) { return format.format(Number(value || 0)); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, function (ch) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" }[ch]; }); }
  function initials(name) { return String(name || "?").split(/\s+/).slice(0, 2).map(function (part) { return part[0] || ""; }).join("").toUpperCase(); }
  function setStatus(element, text, kind) { element.textContent = text; element.className = "form-status " + (kind || ""); }

  function setupRanking() {
    const body = document.getElementById("ranking-body"), podium = document.getElementById("podium"), status = document.getElementById("ranking-status"), search = document.getElementById("search-courier"), loadMore = document.getElementById("ranking-load-more");
    const pageSize = 50;
    let ranking = [], visible = [], searchTimer, latestSearch = 0, usingCache = true, loading = false;

    function loadRows(query) {
      const cacheQuery = Object.assign({ select: "courier_id,courier_name,total_orders,total_points,is_elite,position", order: "position.asc" }, query || {});
      if (!usingCache) {
        const fallback = Object.assign({}, cacheQuery, { select: "courier_id,courier_name,total_orders,total_points,is_elite", order: "total_points.desc,courier_name.asc" });
        return request(table.ranking, { query: fallback });
      }
      return request(table.rankingCache, { query: cacheQuery }).catch(function () { usingCache = false; return loadRows(query); });
    }

    function render(showPodium) {
      podium.innerHTML = showPodium ? ranking.slice(0, 3).map(function (person, index) {
        return '<article class="podium-card p' + (index + 1) + '"><span class="podium-position">' + (index + 1) + '</span><span class="podium-avatar">' + initials(person.courier_name) + '</span><span class="name">' + escapeHtml(person.courier_name) + '</span><span class="points">' + number(person.total_points) + ' <small>pts</small></span></article>';
      }).join("") : "";
      body.innerHTML = visible.map(function (person, index) {
        const position = person.position || (showPodium ? index + 1 : "—");
        return '<tr class="' + (person.is_elite ? "elite-row" : "") + '"><td class="rank-cell">' + position + (position === "—" ? "" : "º") + '</td><td><div class="courier-cell"><span class="avatar">' + initials(person.courier_name) + '</span><span>' + escapeHtml(person.courier_name) + (person.is_elite ? '<span class="elite-pill">ELITE</span>' : "") + '</span></div></td><td class="numeric orders">' + number(person.total_orders) + '</td><td class="numeric point-value">' + number(person.total_points) + ' pts</td></tr>';
      }).join("");
      if (!visible.length) body.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum entregador encontrado.</td></tr>';
    }

    function updateLoadMore(lastCount) { loadMore.hidden = search.value.trim().length > 0 || lastCount < pageSize; }
    function loadInitial() {
      status.className = "status";
      loadRows({ limit: String(pageSize), offset: "0" }).then(function (rows) {
        ranking = rows.map(function (row, index) { if (!row.position) row.position = index + 1; return row; }); visible = ranking;
        status.textContent = ranking.length ? "Classificação atual" : "Ainda não há dados importados."; render(true); updateLoadMore(rows.length);
      }).catch(function (error) { status.textContent = error.message; status.className = "status error"; });
    }

    loadMore.addEventListener("click", function () {
      if (loading) return;
      loading = true; loadMore.disabled = true; loadMore.textContent = "Carregando…";
      loadRows({ limit: String(pageSize), offset: String(ranking.length) }).then(function (rows) {
        rows.forEach(function (row, index) { if (!row.position) row.position = ranking.length + index + 1; });
        ranking = ranking.concat(rows); visible = ranking; render(true); updateLoadMore(rows.length);
      }).catch(function (error) { status.textContent = error.message; status.className = "status error"; }).finally(function () { loading = false; loadMore.disabled = false; loadMore.textContent = "Carregar mais"; });
    });

    search.addEventListener("input", function () {
      const term = search.value.trim(); clearTimeout(searchTimer); latestSearch += 1;
      if (!term) { visible = ranking; status.textContent = ranking.length ? "Classificação atual" : "Ainda não há dados importados."; status.className = "status"; render(true); updateLoadMore(pageSize); return; }
      const requestId = latestSearch; status.textContent = "Buscando…"; status.className = "status"; loadMore.hidden = true;
      searchTimer = setTimeout(function () {
        const safeTerm = term.replace(/[*,.()]/g, "");
        loadRows({ courier_name: "ilike.*" + safeTerm + "*", limit: "100", offset: "0" }).then(function (rows) {
          if (requestId !== latestSearch) return;
          visible = rows; status.textContent = rows.length ? rows.length + " resultado(s)" : "Nenhum resultado"; render(false);
        }).catch(function (error) { if (requestId !== latestSearch) return; status.textContent = error.message; status.className = "status error"; });
      }, 300);
    });
    loadInitial();
  }

  function dateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
    if (typeof value === "number" && window.XLSX) { const parsed = window.XLSX.SSF.parse_date_code(value); return parsed ? [parsed.y, String(parsed.m).padStart(2, "0"), String(parsed.d).padStart(2, "0")].join("-") : null; }
    const text = String(value || "").trim(); if (!text) return null;
    const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); if (br) return [br[3].length === 2 ? "20" + br[3] : br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")].join("-");
    const parsed = new Date(text); return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
  }
  function normalizedNumber(value) { if (typeof value === "number") return value; return Number(String(value || "0").replace(/\./g, "").replace(",", ".")) || 0; }

  function setupAdmin() {
    const file = document.getElementById("excel-file"), fileName = document.getElementById("file-name"), importButton = document.getElementById("import-button"), importStatus = document.getElementById("import-status"), eliteArea = document.getElementById("elite-ids"), eliteButton = document.getElementById("save-elite-button"), deleteEliteButton = document.getElementById("delete-elite-button"), eliteStatus = document.getElementById("elite-status");
    file.addEventListener("change", function () { fileName.textContent = file.files[0] ? file.files[0].name : "Nenhum arquivo selecionado"; });
    request(table.elite, { query: { select: "courier_id", order: "courier_id" } }).then(function (rows) { eliteArea.value = rows.map(function (row) { return row.courier_id; }).join("\n"); }).catch(function () {});

    eliteButton.addEventListener("click", async function () {
      const ids = Array.from(new Set(eliteArea.value.split(/[\s,;]+/).map(function (id) { return id.trim(); }).filter(Boolean)));
      if (!ids.length) { setStatus(eliteStatus, "Cole pelo menos um ID Elite.", "error"); return; }
      eliteButton.disabled = true; setStatus(eliteStatus, "Salvando lista…");
      try {
        await request(table.elite, { method: "POST", query: { on_conflict: "courier_id" }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: ids.map(function (courier_id) { return { courier_id: courier_id }; }) });
        await refreshRanking(); setStatus(eliteStatus, ids.length + " ID(s) Elite salvo(s).", "success");
      } catch (error) { setStatus(eliteStatus, error.message, "error"); } finally { eliteButton.disabled = false; }
    });

    deleteEliteButton.addEventListener("click", async function () {
      if (!window.confirm("Apagar todos os IDs Elite atuais? Os pontos já registrados serão mantidos.")) return;
      deleteEliteButton.disabled = true; setStatus(eliteStatus, "Apagando lista…");
      try {
        await ensureEliteSnapshotReady();
        await request(table.elite, { method: "DELETE", query: { courier_id: "not.is.null" } }); eliteArea.value = ""; await refreshRanking();
        setStatus(eliteStatus, "Lista Elite apagada. Os pontos históricos foram mantidos.", "success");
      } catch (error) { setStatus(eliteStatus, error.message, "error"); } finally { deleteEliteButton.disabled = false; }
    });

    importButton.addEventListener("click", async function () {
      if (!file.files[0]) { setStatus(importStatus, "Selecione uma planilha Excel antes de importar.", "error"); return; }
      if (!window.XLSX) { setStatus(importStatus, "Não foi possível carregar o leitor de Excel. Tente novamente.", "error"); return; }
      importButton.disabled = true; setStatus(importStatus, "Lendo a planilha…");
      try {
        const workbook = window.XLSX.read(await file.files[0].arrayBuffer(), { type: "array", cellDates: true });
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true });
        const required = ["id_da_pessoa_entregadora", "pessoa_entregadora", "numero_de_pedidos_aceitos_e_concluidos"];
        if (!rows.length) throw new Error("A primeira aba não contém linhas de dados.");
        const absent = required.filter(function (column) { return !Object.prototype.hasOwnProperty.call(rows[0], column); });
        if (absent.length) throw new Error("Colunas obrigatórias ausentes: " + absent.join(", ") + ".");
        await ensureEliteSnapshotReady();
        const eliteRows = await request(table.elite, { query: { select: "courier_id" } });
        const eliteIds = new Set(eliteRows.map(function (row) { return String(row.courier_id); }));
        const records = rows.map(function (row) {
          const courierId = String(row.id_da_pessoa_entregadora || "").trim();
          return { period_date: dateValue(row.data_do_periodo), period_label: String(row.periodo || ""), courier_id: courierId, courier_name: String(row.pessoa_entregadora || "").trim(), market: String(row.praca || "").trim(), sub_market: String(row.sub_praca || "").trim(), accepted_completed_orders: normalizedNumber(row.numero_de_pedidos_aceitos_e_concluidos), score_multiplier: eliteIds.has(courierId) ? 1.5 : 1, payload: row };
        }).filter(function (row) { return row.courier_id && row.courier_name; });
        if (!records.length) throw new Error("Nenhuma linha válida foi encontrada na planilha.");
        setStatus(importStatus, "Criando lote de importação…");
        const dates = records.map(function (record) { return record.period_date; }).filter(Boolean).sort();
        const batch = await request(table.batches, { method: "POST", headers: { Prefer: "return=representation" }, body: { file_name: file.files[0].name, row_count: records.length, period_start: dates[0] || null, period_end: dates[dates.length - 1] || null } });
        const batchId = batch[0] && batch[0].id;
        if (!batchId) throw new Error("O Supabase não retornou o identificador do lote.");
        for (let start = 0; start < records.length; start += 500) {
          const part = records.slice(start, start + 500).map(function (record) { return Object.assign({}, record, { import_batch_id: batchId }); });
          setStatus(importStatus, "Enviando " + Math.min(start + 500, records.length) + " de " + records.length + " linhas…");
          await request(table.records, { method: "POST", headers: { Prefer: "return=minimal" }, body: part });
        }
        setStatus(importStatus, "Atualizando ranking…"); await refreshRanking();
        setStatus(importStatus, records.length + " linhas importadas com sucesso.", "success");
      } catch (error) { setStatus(importStatus, error.message, "error"); } finally { importButton.disabled = false; }
    });
  }

  function setupAdminGate() {
    const lock = document.getElementById("admin-lock"), content = document.getElementById("admin-content"), form = document.getElementById("admin-login"), password = document.getElementById("admin-password"), status = document.getElementById("login-status");
    function unlock() { lock.hidden = true; content.hidden = false; setupAdmin(); }
    if (sessionStorage.getItem("ranking-admin") === "ok") { unlock(); return; }
    form.addEventListener("submit", function (event) { event.preventDefault(); if (password.value === "3296") { sessionStorage.setItem("ranking-admin", "ok"); unlock(); } else { password.value = ""; setStatus(status, "Senha incorreta.", "error"); password.focus(); } });
    password.focus();
  }
  if (document.body.dataset.page === "ranking") setupRanking(); else setupAdminGate();
})();
