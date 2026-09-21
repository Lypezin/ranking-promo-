(function () {
  const config = window.RANKING_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").replace(/\/$/, "");
  const key = config.SUPABASE_ANON_KEY || "";
  const configured = url.startsWith("https://") && key.length > 30;
  const table = { ranking: "ranking", elite: "elite_couriers", batches: "import_batches", records: "delivery_records" };

  function request(resource, options) {
    if (!configured) return Promise.reject(new Error("A conexão com o Supabase ainda não foi configurada."));
    options = options || {};
    const query = options.query ? "?" + new URLSearchParams(options.query).toString() : "";
    return fetch(url + "/rest/v1/" + resource + query, { method: options.method || "GET", headers: Object.assign({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, options.headers || {}), body: options.body === undefined ? undefined : JSON.stringify(options.body) }).then(async function (response) {
      const text = await response.text(); const data = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(data && (data.message || data.hint) ? data.message || data.hint : "Não foi possível concluir a operação.");
      return data;
    });
  }
  const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  function number(value) { return format.format(Number(value || 0)); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, function (ch) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" }[ch]; }); }
  function initials(name) { return String(name || "?").split(/\s+/).slice(0,2).map(function (part) { return part[0] || ""; }).join("").toUpperCase(); }
  function setStatus(element, text, kind) { element.textContent = text; element.className = "form-status " + (kind || ""); }

  function setupRanking() {
    const body = document.getElementById("ranking-body"), podium = document.getElementById("podium"), status = document.getElementById("ranking-status"), search = document.getElementById("search-courier"); let ranking = [];
    function render() {
      const term = search.value.trim().toLocaleLowerCase("pt-BR"); const visible = ranking.filter(function (person) { return String(person.courier_name || "").toLocaleLowerCase("pt-BR").includes(term); });
      podium.innerHTML = term ? "" : ranking.slice(0, 3).map(function (person, index) { return '<article class="podium-card ' + (index === 0 ? "first" : "") + '"><span class="rank">' + (index + 1) + "º LUGAR</span><span class=\"name\">" + escapeHtml(person.courier_name) + '</span><span class="points">' + number(person.total_points) + ' pts</span><span class="medal">' + ["♛", "●", "◆"][index] + "</span></article>"; }).join("");
      body.innerHTML = visible.map(function (person) { return '<tr><td>' + person.position + 'º</td><td><div class="courier-cell"><span class="avatar">' + initials(person.courier_name) + '</span><span>' + escapeHtml(person.courier_name) + (person.is_elite ? '<span class="elite-pill">ELITE</span>' : "") + '</span></div></td><td class="numeric">' + number(person.total_orders) + '</td><td class="numeric point-value">' + number(person.total_points) + " pts</td></tr>"; }).join("");
      if (!visible.length) body.innerHTML = '<tr><td colspan="4">Nenhum entregador encontrado.</td></tr>';
    }
    request(table.ranking, { query: { select: "courier_id,courier_name,total_orders,total_points,is_elite", order: "total_points.desc,courier_name.asc" } }).then(function (rows) { ranking = rows.map(function (row, index) { row.position = index + 1; return row; }); status.textContent = ranking.length ? ranking.length + " entregadores no ranking" : "Ainda não há dados importados."; render(); }).catch(function (error) { status.textContent = error.message; status.className = "status error"; });
    search.addEventListener("input", render);
  }

  function dateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    if (typeof value === "number" && window.XLSX) { const parsed = window.XLSX.SSF.parse_date_code(value); return parsed ? [parsed.y, String(parsed.m).padStart(2,"0"), String(parsed.d).padStart(2,"0")].join("-") : null; }
    const text = String(value || "").trim(); if (!text) return null;
    const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); if (br) return [br[3].length === 2 ? "20" + br[3] : br[3], br[2].padStart(2,"0"), br[1].padStart(2,"0")].join("-");
    const parsed = new Date(text); return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0,10);
  }
  function normalizedNumber(value) { if (typeof value === "number") return value; return Number(String(value || "0").replace(/\./g, "").replace(",", ".")) || 0; }

  function setupAdmin() {
    const file = document.getElementById("excel-file"), fileName = document.getElementById("file-name"), importButton = document.getElementById("import-button"), importStatus = document.getElementById("import-status"), eliteArea = document.getElementById("elite-ids"), eliteButton = document.getElementById("save-elite-button"), eliteStatus = document.getElementById("elite-status");
    file.addEventListener("change", function () { fileName.textContent = file.files[0] ? file.files[0].name : "Nenhum arquivo selecionado"; });
    request(table.elite, { query: { select: "courier_id", order: "courier_id" } }).then(function (rows) { eliteArea.value = rows.map(function (row) { return row.courier_id; }).join("\n"); }).catch(function () {});
    eliteButton.addEventListener("click", async function () {
      const ids = Array.from(new Set(eliteArea.value.split(/[\s,;]+/).map(function (id) { return id.trim(); }).filter(Boolean))); eliteButton.disabled = true; setStatus(eliteStatus, "Salvando lista…");
      try { await request(table.elite, { method: "DELETE" }); if (ids.length) await request(table.elite, { method: "POST", headers: { Prefer: "return=minimal" }, body: ids.map(function (courier_id) { return { courier_id: courier_id }; }) }); setStatus(eliteStatus, ids.length + " ID(s) Elite salvo(s). O ranking será recalculado automaticamente.", "success"); } catch (error) { setStatus(eliteStatus, error.message, "error"); } finally { eliteButton.disabled = false; }
    });
    importButton.addEventListener("click", async function () {
      if (!file.files[0]) { setStatus(importStatus, "Selecione uma planilha Excel antes de importar.", "error"); return; }
      if (!window.XLSX) { setStatus(importStatus, "Não foi possível carregar o leitor de Excel. Tente novamente.", "error"); return; }
      importButton.disabled = true; setStatus(importStatus, "Lendo a planilha…");
      try {
        const workbook = window.XLSX.read(await file.files[0].arrayBuffer(), { type: "array", cellDates: true }); const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true }); const required = ["id_da_pessoa_entregadora", "pessoa_entregadora", "numero_de_pedidos_aceitos_e_concluidos"];
        if (!rows.length) throw new Error("A primeira aba não contém linhas de dados."); const absent = required.filter(function (key) { return !Object.prototype.hasOwnProperty.call(rows[0], key); }); if (absent.length) throw new Error("Colunas obrigatórias ausentes: " + absent.join(", ") + ".");
        const records = rows.map(function (row) { return { period_date: dateValue(row.data_do_periodo), period_label: String(row.periodo || ""), courier_id: String(row.id_da_pessoa_entregadora || "").trim(), courier_name: String(row.pessoa_entregadora || "").trim(), market: String(row.praca || "").trim(), sub_market: String(row.sub_praca || "").trim(), accepted_completed_orders: normalizedNumber(row.numero_de_pedidos_aceitos_e_concluidos), payload: row }; }).filter(function (row) { return row.courier_id && row.courier_name; });
        if (!records.length) throw new Error("Nenhuma linha válida foi encontrada na planilha."); setStatus(importStatus, "Criando lote de importação…"); const dates = records.map(function (record) { return record.period_date; }).filter(Boolean).sort(); const batch = await request(table.batches, { method: "POST", headers: { Prefer: "return=representation" }, body: { file_name: file.files[0].name, row_count: records.length, period_start: dates[0] || null, period_end: dates[dates.length - 1] || null } }); const batchId = batch[0] && batch[0].id; if (!batchId) throw new Error("O Supabase não retornou o identificador do lote.");
        for (let start = 0; start < records.length; start += 500) { const part = records.slice(start, start + 500).map(function (record) { return Object.assign({}, record, { import_batch_id: batchId }); }); setStatus(importStatus, "Enviando " + Math.min(start + 500, records.length) + " de " + records.length + " linhas…"); await request(table.records, { method: "POST", headers: { Prefer: "return=minimal" }, body: part }); }
        setStatus(importStatus, records.length + " linhas importadas com sucesso. O ranking já está atualizado.", "success");
      } catch (error) { setStatus(importStatus, error.message, "error"); } finally { importButton.disabled = false; }
    });
  }
  if (document.body.dataset.page === "ranking") setupRanking(); else setupAdmin();
})();
