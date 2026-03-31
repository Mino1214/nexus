(function () {
  "use strict";

  const API_BASE = "/api";
  const STORAGE_KEY = "polywatch-admin-sales-session";
  const TAB_META = {
    overview: {
      eyebrow: "PolyWatch / Business Overview",
      title: "API 판매와 실시간 정산 현황",
      description: "",
    },
    clients: {
      eyebrow: "PolyWatch / Clients",
      title: "고객과 주문 등록",
      description: "",
    },
    keys: {
      eyebrow: "PolyWatch / API Keys",
      title: "API 키 발급과 접속 권한",
      description: "",
    },
    templates: {
      eyebrow: "PolyWatch / Templates",
      title: "상품 템플릿 관리",
      description: "",
    },
    network: {
      eyebrow: "PolyWatch / Reseller Tree",
      title: "총판 Binary Tree와 retained 요율",
      description: "",
    },
    analytics: {
      eyebrow: "PolyWatch / Analytics",
      title: "정산과 배팅 추이",
      description: "",
    },
  };

  let session = loadSession();
  let currentTab = "overview";
  let businessPayload = null;
  let automationState = {
    query: "대통령 선거",
    marketType: "yes-no",
    suggestions: [],
    selected: null,
  };
  let refreshTimer = null;

  const els = {
    authView: document.getElementById("authView"),
    dashboardView: document.getElementById("dashboardView"),
    loginForm: document.getElementById("loginForm"),
    identifierInput: document.getElementById("identifierInput"),
    passwordInput: document.getElementById("passwordInput"),
    loginBtn: document.getElementById("loginBtn"),
    loginError: document.getElementById("loginError"),
    sidebarUser: document.getElementById("sidebarUser"),
    sidebarSession: document.getElementById("sidebarSession"),
    logoutBtn: document.getElementById("logoutBtn"),
    sidebarLogoutBtn: document.getElementById("sidebarLogoutBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    quickClients: document.getElementById("quickClients"),
    quickKeys: document.getElementById("quickKeys"),
    quickTemplates: document.getElementById("quickTemplates"),
    quickNetwork: document.getElementById("quickNetwork"),
    quickAnalytics: document.getElementById("quickAnalytics"),
    sessionBadge: document.getElementById("sessionBadge"),
    topbarTitle: document.getElementById("topbarTitle"),
    panelEyebrow: document.getElementById("panelEyebrow"),
    panelTitle: document.getElementById("panelTitle"),
    panelDescription: document.getElementById("panelDescription"),
    generatedAt: document.getElementById("generatedAt"),
    statClients: document.getElementById("statClients"),
    statClientsHelp: document.getElementById("statClientsHelp"),
    statKeys: document.getElementById("statKeys"),
    statKeysHelp: document.getElementById("statKeysHelp"),
    statRevenue: document.getElementById("statRevenue"),
    statRevenueHelp: document.getElementById("statRevenueHelp"),
    statMasterShare: document.getElementById("statMasterShare"),
    statMasterShareHelp: document.getElementById("statMasterShareHelp"),
    systemStatusList: document.getElementById("systemStatusList"),
    salesSummaryList: document.getElementById("salesSummaryList"),
    settlementSummaryList: document.getElementById("settlementSummaryList"),
    liveMarketsGrid: document.getElementById("liveMarketsGrid"),
    clientsBody: document.getElementById("clientsBody"),
    keysBody: document.getElementById("keysBody"),
    templatesGrid: document.getElementById("templatesGrid"),
    resellerTree: document.getElementById("resellerTree"),
    resellersBody: document.getElementById("resellersBody"),
    trendChart: document.getElementById("trendChart"),
    economyList: document.getElementById("economyList"),
    betsBody: document.getElementById("betsBody"),
    issuedKeyBox: document.getElementById("issuedKeyBox"),
    clientForm: document.getElementById("clientForm"),
    clientCompanyInput: document.getElementById("clientCompanyInput"),
    clientNameInput: document.getElementById("clientNameInput"),
    clientContactInput: document.getElementById("clientContactInput"),
    clientPlanInput: document.getElementById("clientPlanInput"),
    clientResellerSelect: document.getElementById("clientResellerSelect"),
    clientTemplateSelect: document.getElementById("clientTemplateSelect"),
    clientTierSelect: document.getElementById("clientTierSelect"),
    clientTypeSelect: document.getElementById("clientTypeSelect"),
    clientMonthlyInput: document.getElementById("clientMonthlyInput"),
    clientDaysInput: document.getElementById("clientDaysInput"),
    clientSetupInput: document.getElementById("clientSetupInput"),
    clientLossInput: document.getElementById("clientLossInput"),
    clientMarketsInput: document.getElementById("clientMarketsInput"),
    clientNotesInput: document.getElementById("clientNotesInput"),
    keyForm: document.getElementById("keyForm"),
    keyClientSelect: document.getElementById("keyClientSelect"),
    keyLabelInput: document.getElementById("keyLabelInput"),
    keyExpiryInput: document.getElementById("keyExpiryInput"),
    keyScopesInput: document.getElementById("keyScopesInput"),
    keyRpmInput: document.getElementById("keyRpmInput"),
    keyOriginsInput: document.getElementById("keyOriginsInput"),
    keyIpsInput: document.getElementById("keyIpsInput"),
    automationForm: document.getElementById("automationForm"),
    automationQueryInput: document.getElementById("automationQueryInput"),
    automationTypeSelect: document.getElementById("automationTypeSelect"),
    automationYesNoBtn: document.getElementById("automationYesNoBtn"),
    automationMultiBtn: document.getElementById("automationMultiBtn"),
    automationRefreshBtn: document.getElementById("automationRefreshBtn"),
    automationStatus: document.getElementById("automationStatus"),
    automationSuggestions: document.getElementById("automationSuggestions"),
    templateForm: document.getElementById("templateForm"),
    templateNameInput: document.getElementById("templateNameInput"),
    templateCategoryInput: document.getElementById("templateCategoryInput"),
    templateTypeSelect: document.getElementById("templateTypeSelect"),
    templateTitlePatternInput: document.getElementById("templateTitlePatternInput"),
    templateOutcomesInput: document.getElementById("templateOutcomesInput"),
    templateDescriptionInput: document.getElementById("templateDescriptionInput"),
    templateMarginInput: document.getElementById("templateMarginInput"),
    templateDesignInput: document.getElementById("templateDesignInput"),
    templateSetupInput: document.getElementById("templateSetupInput"),
    templateMonthlyInput: document.getElementById("templateMonthlyInput"),
    templateSettlementInput: document.getElementById("templateSettlementInput"),
    templateAutomationBox: document.getElementById("templateAutomationBox"),
    resellerForm: document.getElementById("resellerForm"),
    resellerParentSelect: document.getElementById("resellerParentSelect"),
    resellerSlotSelect: document.getElementById("resellerSlotSelect"),
    resellerRateInput: document.getElementById("resellerRateInput"),
    resellerNameInput: document.getElementById("resellerNameInput"),
    resellerCodeInput: document.getElementById("resellerCodeInput"),
    resellerContactInput: document.getElementById("resellerContactInput"),
    navButtons: Array.from(document.querySelectorAll(".nav-button")),
    tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
    toast: document.getElementById("toast"),
  };

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function persistSession(nextSession) {
    session = nextSession;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  }

  function clearSession() {
    session = null;
    businessPayload = null;
    automationState.selected = null;
    stopRefreshLoop();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_error) {}
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2400);
  }

  function setLoginError(message) {
    if (!message) {
      els.loginError.classList.add("hidden");
      els.loginError.textContent = "";
      return;
    }
    els.loginError.classList.remove("hidden");
    els.loginError.textContent = message;
  }

  function request(path, options) {
    return fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        ...(options && options.headers ? options.headers : {}),
      },
    }).then(async (response) => {
      let payload = null;
      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }

      if (!response.ok) {
        const error = new Error(payload && (payload.message || payload.error) || "요청 처리에 실패했습니다.");
        error.status = response.status;
        throw error;
      }

      return payload;
    });
  }

  function getAuthHeaders(includeJson) {
    const headers = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    if (session && session.token) headers.Authorization = `Bearer ${session.token}`;
    return headers;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function formatCurrency(value) {
    return `${formatNumber(Math.round(Number(value || 0)))}원`;
  }

  function formatPoints(value) {
    return `${formatNumber(Math.round(Number(value || 0)))}P`;
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function setAutomationStatus(message) {
    if (!message) {
      els.automationStatus.classList.add("hidden");
      els.automationStatus.textContent = "";
      return;
    }
    els.automationStatus.classList.remove("hidden");
    els.automationStatus.textContent = message;
  }

  function setTemplateAutomationBox(message) {
    if (!message) {
      els.templateAutomationBox.classList.add("hidden");
      els.templateAutomationBox.textContent = "";
      return;
    }
    els.templateAutomationBox.classList.remove("hidden");
    els.templateAutomationBox.textContent = message;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ko-KR");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusChip(status) {
    const normalized = String(status || "").toLowerCase();
    return `<span class="status-chip ${escapeHtml(normalized)}">${escapeHtml(normalized || "unknown")}</span>`;
  }

  function renderMetricRows(target, rows) {
    target.innerHTML = rows.map((row) => `
      <div class="metric-row">
        <span class="muted">${escapeHtml(row.label)}</span>
        <strong>${row.value}</strong>
      </div>
    `).join("");
  }

  function renderState() {
    const tab = TAB_META[currentTab];
    els.panelEyebrow.textContent = tab.eyebrow;
    els.panelTitle.textContent = tab.title;
    els.panelDescription.textContent = tab.description;

    if (session && session.user) {
      els.sidebarUser.textContent = `${session.user.username} / ${session.user.email}`;
      els.sidebarSession.textContent = `${session.user.authSource || "local"} / ${session.user.adminRole || "admin"}`;
      els.sessionBadge.innerHTML = `<span class="badge-dot"></span><span>${escapeHtml(session.user.username)}</span>`;
    }

    els.navButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === currentTab);
    });
    els.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${currentTab}`);
    });
  }

  function activateTab(tab, focusElement) {
    currentTab = tab;
    renderState();
    if (tab === "templates") {
      loadAutomationSuggestions({ silent: true }).catch(() => {});
    }
    if (focusElement) {
      requestAnimationFrame(() => {
        focusElement.focus();
        if (typeof focusElement.select === "function") {
          focusElement.select();
        }
      });
    }
  }

  function renderOverview(data) {
    const summary = data.business.summary;
    const system = data.system;
    const settlement = data.business.analytics.settlement;
    const liveMarkets = data.business.analytics.liveMarkets;

    els.statClients.textContent = formatNumber(summary.activeClients);
    els.statClientsHelp.textContent = `활성 ${summary.activeClients} / 총판 ${summary.activeResellers} 운영 중`;
    els.statKeys.textContent = formatNumber(summary.activeKeys);
    els.statKeysHelp.textContent = `만료 임박 ${summary.expiringSoon}건`;
    els.statRevenue.textContent = formatCurrency(summary.monthlyRecurringRevenue);
    els.statRevenueHelp.textContent = `세팅비 백로그 ${formatCurrency(summary.setupRevenueBacklog)}`;
    els.statMasterShare.textContent = formatCurrency(summary.masterRetainedRevenue30d);
    els.statMasterShareHelp.textContent = `30일 손실금 풀 ${formatCurrency(summary.lossRevenue30d)} 기준`;

    renderMetricRows(els.systemStatusList, [
      { label: "Database", value: `${system.database.mode} / ${system.database.ready ? "ready" : "down"}` },
      { label: "Cache", value: `${system.cache.mode} / ${system.cache.ready ? "ready" : "down"}` },
      { label: "Queue", value: `${system.queue.mode} / ${system.queue.ready ? "ready" : "down"}` },
      { label: "Persistence", value: escapeHtml(system.persistence) },
      { label: "Admin Auth", value: escapeHtml(system.adminAuth) },
      { label: "JWT", value: escapeHtml(system.jwt) },
    ]);

    renderMetricRows(els.salesSummaryList, [
      { label: "활성 고객", value: formatNumber(summary.activeClients) },
      { label: "활성 키", value: formatNumber(summary.activeKeys) },
      { label: "커스텀 템플릿", value: formatNumber(summary.customTemplates) },
      { label: "만료 임박", value: formatNumber(summary.expiringSoon) },
      { label: "총 손실금 30d", value: formatCurrency(summary.lossRevenue30d) },
      { label: "마스터 retained", value: formatCurrency(summary.masterRetainedRevenue30d) },
    ]);

    renderMetricRows(els.settlementSummaryList, [
      { label: "정산 대기 베팅", value: formatNumber(settlement.pendingBets) },
      { label: "대기 스테이크", value: formatPoints(settlement.pendingStake) },
      { label: "예상 지급 노출", value: formatPoints(settlement.pendingPotentialPayout) },
      { label: "오버듀", value: formatNumber(settlement.pendingOverdue) },
      { label: "플랫폼 순정산", value: formatPoints(settlement.platformNetSettled) },
    ]);

    els.liveMarketsGrid.innerHTML = liveMarkets.map((market) => `
      <div class="mini-card">
        <div class="mini-title">${escapeHtml(market.question)}</div>
        <div class="mini-meta">
          <span>24h 거래량 ${formatNumber(market.volume24h)}</span>
          <span>유동성 ${formatNumber(market.liquidity)}</span>
          <span>마감 ${market.endDate ? formatDateTime(market.endDate) : "—"}</span>
        </div>
        <div class="pill-list" style="margin-top: 12px;">
          ${market.outcomes.map((outcome) => `<span class="pill">${escapeHtml(outcome.label)} ${Math.round(Number(outcome.price || 0) * 100)}%</span>`).join("")}
        </div>
      </div>
    `).join("") || `<div class="mini-card"><div class="mini-copy">실시간 마켓 데이터를 불러오지 못했습니다.</div></div>`;
  }

  function renderClients(data) {
    els.clientsBody.innerHTML = data.business.clients.map((client) => `
      <tr>
        <td>
          <strong>${escapeHtml(client.name)}</strong><br />
          <span class="muted">${escapeHtml(client.company)}</span>
        </td>
        <td>
          ${escapeHtml(client.planName)}<br />
          <span class="muted">${escapeHtml(client.accessTier)} / ${escapeHtml(client.marketType)}</span>
        </td>
        <td>${escapeHtml(client.resellerName)}</td>
        <td>${formatNumber(client.apiKeyCount)}</td>
        <td>${formatCurrency(client.lossRevenue30d)}</td>
        <td>${formatDateTime(client.contractEndsAt)}<br /><span class="muted">${formatNumber(client.daysRemaining)}일 남음</span></td>
        <td>${statusChip(client.status)}</td>
      </tr>
    `).join("");
  }

  function renderKeys(data) {
    els.keysBody.innerHTML = data.business.apiKeys.map((key) => `
      <tr>
        <td>
          <strong>${escapeHtml(key.label)}</strong><br />
          <span class="muted">${escapeHtml(key.keyPreview)}</span>
        </td>
        <td>
          ${escapeHtml(key.clientName)}<br />
          <span class="muted">${escapeHtml(key.clientCompany)}</span>
        </td>
        <td><div class="pill-list">${key.scopes.map((scope) => `<span class="pill">${escapeHtml(scope)}</span>`).join("")}</div></td>
        <td>${formatNumber(key.rateLimitPerMinute)}</td>
        <td>${formatDateTime(key.expiresAt)}<br /><span class="muted">${formatNumber(key.expiresInDays)}일 남음</span></td>
        <td>${statusChip(key.status)}</td>
      </tr>
    `).join("");
  }

  function renderTemplates(data) {
    els.templatesGrid.innerHTML = data.business.templates.map((template) => `
      <div class="mini-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div class="mini-title">${escapeHtml(template.name)}</div>
          ${statusChip(template.status)}
        </div>
        <div class="mini-copy">${escapeHtml(template.description)}</div>
        <div class="mini-meta">
          <span>카테고리 ${escapeHtml(template.category)}</span>
          <span>질문 구조 ${escapeHtml(template.marketType)}</span>
          <span>마진 ${formatPercent(Number(template.defaultOddsMargin || 0) * 100)}</span>
          <span>가격 모드 ${escapeHtml(template.pricingMode || "manual")}</span>
          <span>세팅비 ${formatCurrency(template.setupFee)}</span>
          <span>월 이용료 ${formatCurrency(template.monthlyFee)}</span>
          <span>디자인 ${escapeHtml(template.designPack)}</span>
          ${template.autoPricingEnabled ? `<span>자동 배당 ${escapeHtml(template.automationQuery || "live-market")} / ${escapeHtml(template.trackedMarketQuestion || template.trackedMarketId || "연동")}</span>` : ""}
        </div>
        <div class="pill-list" style="margin-top:12px;">${template.outcomes.map((outcome) => `<span class="pill">${escapeHtml(outcome)}</span>`).join("")}</div>
      </div>
    `).join("");
  }

  function renderAutomationSuggestions() {
    const suggestions = automationState.suggestions || [];
    els.automationTypeSelect.value = automationState.marketType;
    els.automationQueryInput.value = automationState.query;
    els.automationSuggestions.innerHTML = suggestions.map((suggestion, index) => `
      <div class="suggestion-card">
        <div>
          <div class="mini-title">${escapeHtml(suggestion.marketQuestion)}</div>
          <div class="mini-meta">
            <span>질문 구조 ${escapeHtml(suggestion.marketType)}</span>
            <span>24h 거래량 ${formatNumber(suggestion.volume24h)}</span>
            <span>유동성 ${formatNumber(suggestion.liquidity)}</span>
            <span>추세 ${escapeHtml(suggestion.trendDirection)} / ${formatPercent(suggestion.trendDeltaPercent)}</span>
            <span>새로고침 ${formatNumber(suggestion.refreshSeconds)}초</span>
          </div>
        </div>
        <div class="pill-list">
          ${suggestion.outcomes.map((outcome) => `<span class="pill">${escapeHtml(outcome.label)} ${Math.round(Number(outcome.probability || 0) * 100)}% / ${outcome.odds.toFixed(2)}배</span>`).join("")}
        </div>
        <div class="suggestion-actions">
          <button class="btn btn-primary" type="button" data-automation-create="${index}">바로 만들기</button>
          <button class="btn btn-ghost" type="button" data-automation-fill="${index}">폼 채우기</button>
        </div>
      </div>
    `).join("");
  }

  function applyAutomationSuggestion(index) {
    const suggestion = automationState.suggestions[index];
    if (!suggestion) return;

    automationState.selected = suggestion;
    els.templateNameInput.value = `${suggestion.marketType === "multi-candidate" ? "자동 다중선택" : "자동 YES/NO"} - ${suggestion.marketQuestion.slice(0, 28)}`;
    els.templateCategoryInput.value = "정치 자동형";
    els.templateTypeSelect.value = suggestion.marketType;
    els.templateTitlePatternInput.value = suggestion.titlePattern;
    els.templateOutcomesInput.value = suggestion.outcomes.map((outcome) => outcome.label).join(", ");
    els.templateDescriptionInput.value = suggestion.description;
    els.templateMarginInput.value = String(suggestion.suggestedMargin);
    els.templateDesignInput.value = suggestion.marketType === "multi-candidate" ? "Auto Candidate Board" : "Auto Binary Board";
    els.templateSetupInput.value = suggestion.marketType === "multi-candidate" ? "1800000" : "900000";
    els.templateMonthlyInput.value = suggestion.marketType === "multi-candidate" ? "650000" : "350000";
    els.templateSettlementInput.value = "실시간 시장 배당 + 관리자 확정";
    setTemplateAutomationBox(`자동 연동: ${suggestion.marketQuestion} / ${suggestion.query} / ${suggestion.refreshSeconds}초`);
    activateTab("templates", els.templateNameInput);
    showToast("자동 추천으로 템플릿 폼을 채웠습니다.");
  }

  async function createTemplateFromSuggestion(index) {
    const suggestion = automationState.suggestions[index];
    if (!suggestion) return;

    await request("/admin/business/templates", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        name: `${suggestion.marketType === "multi-candidate" ? "자동 다중선택" : "자동 YES/NO"} - ${suggestion.marketQuestion.slice(0, 28)}`,
        category: "정치 자동형",
        marketType: suggestion.marketType,
        titlePattern: suggestion.titlePattern,
        description: suggestion.description,
        outcomes: suggestion.outcomes.map((outcome) => outcome.label),
        defaultOddsMargin: suggestion.suggestedMargin,
        settlementSource: "실시간 시장 배당 + 관리자 확정",
        designPack: suggestion.marketType === "multi-candidate" ? "Auto Candidate Board" : "Auto Binary Board",
        customizable: true,
        setupFee: suggestion.marketType === "multi-candidate" ? 1800000 : 900000,
        monthlyFee: suggestion.marketType === "multi-candidate" ? 650000 : 350000,
        pricingMode: "live-market",
        autoPricingEnabled: true,
        automationQuery: suggestion.query,
        trackedMarketId: suggestion.marketId,
        trackedMarketQuestion: suggestion.marketQuestion,
        refreshSeconds: suggestion.refreshSeconds,
      }),
    });

    await loadBusinessData();
    showToast("자동 템플릿을 만들었습니다.");
  }

  async function loadAutomationSuggestions(options) {
    const query = (options && options.query != null ? options.query : els.automationQueryInput.value).trim();
    const marketType = options && options.marketType ? options.marketType : els.automationTypeSelect.value;
    const silent = Boolean(options && options.silent);

    automationState.query = query || "대통령 선거";
    automationState.marketType = marketType || "yes-no";

    if (!silent) {
      setAutomationStatus("자동 배당 추천을 찾는 중...");
    }

    const result = await request(`/admin/business/automation?q=${encodeURIComponent(automationState.query)}&marketType=${encodeURIComponent(automationState.marketType)}&limit=4`, {
      headers: getAuthHeaders(false),
    });

    automationState.suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    renderAutomationSuggestions();
    setAutomationStatus(`${automationState.suggestions.length}개 찾음 / ${result.refreshSeconds}초 기준 자동 배당`);
    return result;
  }

  function renderTreeNode(node) {
    if (!node) {
      return `<div class="mini-card"><div class="mini-copy">총판 트리가 아직 없습니다.</div></div>`;
    }

    return `
      <div class="tree-node">
        <div class="tree-head">
          <div>
            <div class="tree-title">${escapeHtml(node.name)} <span class="muted">(${escapeHtml(node.code)})</span></div>
            <div class="muted" style="margin-top:6px;">${escapeHtml(node.slot)} / 부모 대비 ${formatPercent(node.shareOfParentPercent)}</div>
          </div>
          ${statusChip(node.status)}
        </div>
        <div class="tree-meta">
          <span>효과 요율 ${formatPercent(node.effectiveSharePercent)}</span>
          <span>잔여 retained ${formatPercent(node.retainedSharePercent)}</span>
          <span>하위 고객 ${formatNumber(node.subtreeClientCount)} / 키 ${formatNumber(node.apiKeyCount)}</span>
          <span>손실금 30d ${formatCurrency(node.subtreeLossRevenue30d)} / 예상 retained ${formatCurrency(node.estimatedRetainedRevenue30d)}</span>
        </div>
        ${node.children && node.children.length ? `<div class="tree-children">${node.children.map(renderTreeNode).join("")}</div>` : ""}
      </div>
    `;
  }

  function renderNetwork(data) {
    els.resellerTree.innerHTML = renderTreeNode(data.business.resellers.tree);
    els.resellersBody.innerHTML = data.business.resellers.flat.map((reseller) => `
      <tr>
        <td><strong>${escapeHtml(reseller.name)}</strong><br /><span class="muted">${escapeHtml(reseller.code)}</span></td>
        <td>${escapeHtml(reseller.slot)}</td>
        <td>${formatPercent(reseller.effectiveSharePercent)}</td>
        <td>${formatPercent(reseller.retainedSharePercent)}</td>
        <td>${formatNumber(reseller.subtreeClientCount)}</td>
        <td>${formatCurrency(reseller.subtreeLossRevenue30d)}</td>
        <td>${formatCurrency(reseller.estimatedRetainedRevenue30d)}</td>
      </tr>
    `).join("");
  }

  function renderTrend(data) {
    const trend = data.business.analytics.bettingTrend || [];
    const maxPoints = Math.max(1, ...trend.map((item) => Number(item.pointsWagered || 0)));
    els.trendChart.innerHTML = trend.map((item) => {
      const height = Math.max(12, Math.round((Number(item.pointsWagered || 0) / maxPoints) * 180));
      return `
        <div class="trend-column">
          <div class="trend-value">${formatPoints(item.pointsWagered)}</div>
          <div class="trend-bar" style="height:${height}px;"></div>
          <div class="trend-date">${escapeHtml(item.date.slice(5))}</div>
        </div>
      `;
    }).join("");
  }

  function renderAnalytics(data) {
    renderTrend(data);
    renderMetricRows(els.economyList, [
      { label: "가입 보너스 지급", value: formatPoints(data.business.analytics.economy.signupAwarded) },
      { label: "일일 로그인 지급", value: formatPoints(data.business.analytics.economy.dailyAwarded) },
      { label: "베팅 포인트 투입", value: formatPoints(data.business.analytics.economy.betPlaced) },
      { label: "적중 지급", value: formatPoints(data.business.analytics.economy.betWinsPaid) },
      { label: "순 흐름", value: formatPoints(data.business.analytics.economy.netPointFlow) },
      { label: "포인트 로그 수", value: formatNumber(data.business.analytics.economy.pointLogCount) },
    ]);

    els.betsBody.innerHTML = data.business.analytics.settlement.recentBets.map((bet) => `
      <tr>
        <td>${escapeHtml(bet.username)}</td>
        <td>${escapeHtml(bet.marketQuestion)}</td>
        <td>${escapeHtml(bet.outcome)}</td>
        <td>${formatPoints(bet.pointsBet)}</td>
        <td>${formatPoints(bet.potentialWin)}</td>
        <td>${statusChip(bet.status)}</td>
        <td>${formatDateTime(bet.createdAt)}</td>
      </tr>
    `).join("");
  }

  function populateFormOptions(data) {
    const resellers = data.business.resellers.flat;
    const templates = data.business.templates;
    const clients = data.business.clients;

    els.clientResellerSelect.innerHTML = [`<option value="">직접 계약</option>`].concat(
      resellers.filter((node) => node.id !== "res_master").map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} (${escapeHtml(node.code)})</option>`),
    ).join("");

    els.clientTemplateSelect.innerHTML = [`<option value="">미지정</option>`].concat(
      templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`),
    ).join("");

    els.keyClientSelect.innerHTML = clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)} / ${escapeHtml(client.company)}</option>`).join("");

    els.resellerParentSelect.innerHTML = resellers.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} (${escapeHtml(node.code)})</option>`).join("");
  }

  function renderBusinessData(data) {
    businessPayload = data;
    renderState();
    renderOverview(data);
    renderClients(data);
    renderKeys(data);
    renderTemplates(data);
    renderNetwork(data);
    renderAnalytics(data);
    populateFormOptions(data);
    els.generatedAt.textContent = `마지막 갱신: ${formatDateTime(data.generatedAt)}`;
  }

  async function loadBusinessData() {
    const data = await request("/admin/business", {
      headers: getAuthHeaders(false),
    });
    renderBusinessData(data);
    if (currentTab === "templates") {
      await loadAutomationSuggestions({ silent: true });
    }
    return data;
  }

  function startRefreshLoop() {
    stopRefreshLoop();
    refreshTimer = setInterval(async () => {
      if (!session || !session.token) {
        return;
      }

      try {
        await loadBusinessData();
      } catch (_error) {
        // ignore polling failures
      }
    }, 30000);
  }

  function stopRefreshLoop() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  async function hydrateSession() {
    if (!session || !session.token) {
      renderAuth();
      return;
    }

    try {
      const me = await request("/users/me", { headers: getAuthHeaders(false) });
      if (!me.user || !me.user.isAdmin) {
        throw new Error("이 계정은 PolyWatch 관리자 권한이 없습니다.");
      }
      session.user = me.user;
      persistSession(session);
      renderDashboard();
      await loadBusinessData();
      startRefreshLoop();
    } catch (error) {
      clearSession();
      renderAuth();
      setLoginError(error instanceof Error ? error.message : "세션 확인에 실패했습니다.");
    }
  }

  function renderAuth() {
    els.authView.classList.remove("hidden");
    els.dashboardView.classList.remove("active");
  }

  function renderDashboard() {
    els.authView.classList.add("hidden");
    els.dashboardView.classList.add("active");
    renderState();
  }

  async function login(identifier, password) {
    const result = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    if (!result.user || !result.user.isAdmin) {
      throw new Error("이 계정은 PolyWatch 관리자 권한이 없습니다.");
    }

    persistSession({
      token: result.token,
      user: result.user,
    });
  }

  async function exchangeExternalToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      return false;
    }

    const result = await request("/auth/external/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    persistSession({
      token: result.token,
      user: result.user,
    });

    params.delete("token");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
    return true;
  }

  function logout() {
    clearSession();
    renderAuth();
    setLoginError("");
    els.passwordInput.value = "";
  }

  async function submitClientForm(event) {
    event.preventDefault();
    await request("/admin/business/clients", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        name: els.clientNameInput.value.trim(),
        company: els.clientCompanyInput.value.trim(),
        contact: els.clientContactInput.value.trim(),
        resellerId: els.clientResellerSelect.value || null,
        templateId: els.clientTemplateSelect.value || null,
        marketType: els.clientTypeSelect.value,
        accessTier: els.clientTierSelect.value,
        planName: els.clientPlanInput.value.trim(),
        monthlyFee: Number(els.clientMonthlyInput.value || 0),
        setupFee: Number(els.clientSetupInput.value || 0),
        lossRevenue30d: Number(els.clientLossInput.value || 0),
        contractDays: Number(els.clientDaysInput.value || 30),
        allowedMarkets: els.clientMarketsInput.value.split(",").map((item) => item.trim()).filter(Boolean),
        customizable: true,
        notes: els.clientNotesInput.value.trim(),
      }),
    });
    els.clientForm.reset();
    els.clientPlanInput.value = "Politics Growth";
    els.clientMonthlyInput.value = "350000";
    els.clientDaysInput.value = "30";
    els.clientSetupInput.value = "900000";
    els.clientLossInput.value = "0";
    els.clientMarketsInput.value = "politics";
    await loadBusinessData();
    showToast("고객이 등록되었습니다.");
  }

  async function submitKeyForm(event) {
    event.preventDefault();
    const result = await request("/admin/business/keys", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        clientId: els.keyClientSelect.value,
        label: els.keyLabelInput.value.trim(),
        scopes: els.keyScopesInput.value.split(",").map((item) => item.trim()).filter(Boolean),
        rateLimitPerMinute: Number(els.keyRpmInput.value || 120),
        expiryDays: Number(els.keyExpiryInput.value || 30),
        allowedOrigins: els.keyOriginsInput.value.split(",").map((item) => item.trim()).filter(Boolean),
        allowedIps: els.keyIpsInput.value.split(",").map((item) => item.trim()).filter(Boolean),
      }),
    });
    els.issuedKeyBox.classList.remove("hidden");
    els.issuedKeyBox.innerHTML = `<strong>발급 완료</strong><br />${escapeHtml(result.client.name)} / ${escapeHtml(result.apiKey.label)}<br /><strong>${escapeHtml(result.plainKey)}</strong>`;
    els.keyForm.reset();
    els.keyLabelInput.value = "Production Key";
    els.keyExpiryInput.value = "30";
    els.keyScopesInput.value = "markets:read, odds:read, settlement:read";
    els.keyRpmInput.value = "120";
    await loadBusinessData();
    showToast("API 키가 발급되었습니다.");
  }

  async function submitTemplateForm(event) {
    event.preventDefault();
    const selected = automationState.selected;
    await request("/admin/business/templates", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        name: els.templateNameInput.value.trim(),
        category: els.templateCategoryInput.value.trim(),
        marketType: els.templateTypeSelect.value,
        titlePattern: els.templateTitlePatternInput.value.trim(),
        description: els.templateDescriptionInput.value.trim(),
        outcomes: els.templateOutcomesInput.value.split(",").map((item) => item.trim()).filter(Boolean),
        defaultOddsMargin: Number(els.templateMarginInput.value || 0.07),
        settlementSource: els.templateSettlementInput.value.trim(),
        designPack: els.templateDesignInput.value.trim(),
        setupFee: Number(els.templateSetupInput.value || 0),
        monthlyFee: Number(els.templateMonthlyInput.value || 0),
        customizable: true,
        pricingMode: selected ? "live-market" : "manual",
        autoPricingEnabled: Boolean(selected),
        automationQuery: selected ? selected.query : null,
        trackedMarketId: selected ? selected.marketId : null,
        trackedMarketQuestion: selected ? selected.marketQuestion : null,
        refreshSeconds: selected ? selected.refreshSeconds : 30,
      }),
    });
    els.templateForm.reset();
    els.templateCategoryInput.value = "정치 기본형";
    els.templateTypeSelect.value = "yes-no";
    els.templateTitlePatternInput.value = "질문 1개 / YES·NO 2옵션";
    els.templateOutcomesInput.value = "YES, NO";
    els.templateMarginInput.value = "0.07";
    els.templateDesignInput.value = "PolyWatch Default / Cyan";
    els.templateSetupInput.value = "900000";
    els.templateMonthlyInput.value = "350000";
    els.templateSettlementInput.value = "공식 결과 + 관리자 확정";
    automationState.selected = null;
    setTemplateAutomationBox("");
    await loadBusinessData();
    showToast("템플릿이 등록되었습니다.");
  }

  async function submitResellerForm(event) {
    event.preventDefault();
    await request("/admin/business/resellers", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        parentId: els.resellerParentSelect.value,
        slot: els.resellerSlotSelect.value,
        name: els.resellerNameInput.value.trim(),
        code: els.resellerCodeInput.value.trim(),
        contact: els.resellerContactInput.value.trim(),
        shareOfParentPercent: Number(els.resellerRateInput.value || 0),
      }),
    });
    els.resellerForm.reset();
    els.resellerRateInput.value = "20";
    await loadBusinessData();
    showToast("총판이 추가되었습니다.");
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginError("");
      els.loginBtn.disabled = true;
      try {
      await login(els.identifierInput.value.trim(), els.passwordInput.value);
      renderDashboard();
      await loadBusinessData();
      startRefreshLoop();
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "로그인에 실패했습니다.");
      } finally {
        els.loginBtn.disabled = false;
      }
    });

    els.logoutBtn.addEventListener("click", logout);
    els.sidebarLogoutBtn.addEventListener("click", logout);
    els.refreshBtn.addEventListener("click", async () => {
      await loadBusinessData();
      showToast("대시보드를 새로고침했습니다.");
    });

    els.navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab || "overview");
      });
    });

    els.quickClients.addEventListener("click", () => activateTab("clients", els.clientCompanyInput));
    els.quickKeys.addEventListener("click", () => activateTab("keys", els.keyClientSelect));
    els.quickTemplates.addEventListener("click", () => activateTab("templates", els.templateNameInput));
    els.quickNetwork.addEventListener("click", () => activateTab("network", els.resellerNameInput));
    els.quickAnalytics.addEventListener("click", () => activateTab("analytics"));

    els.clientForm.addEventListener("submit", (event) => {
      submitClientForm(event).catch((error) => showToast(error instanceof Error ? error.message : "고객 등록에 실패했습니다."));
    });
    els.keyForm.addEventListener("submit", (event) => {
      submitKeyForm(event).catch((error) => showToast(error instanceof Error ? error.message : "키 발급에 실패했습니다."));
    });
    els.templateForm.addEventListener("submit", (event) => {
      submitTemplateForm(event).catch((error) => showToast(error instanceof Error ? error.message : "템플릿 등록에 실패했습니다."));
    });
    els.resellerForm.addEventListener("submit", (event) => {
      submitResellerForm(event).catch((error) => showToast(error instanceof Error ? error.message : "총판 추가에 실패했습니다."));
    });

    els.automationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      loadAutomationSuggestions({}).catch((error) => showToast(error instanceof Error ? error.message : "자동 추천에 실패했습니다."));
    });
    els.automationYesNoBtn.addEventListener("click", () => {
      els.automationTypeSelect.value = "yes-no";
      loadAutomationSuggestions({ marketType: "yes-no" }).catch((error) => showToast(error instanceof Error ? error.message : "자동 추천에 실패했습니다."));
    });
    els.automationMultiBtn.addEventListener("click", () => {
      els.automationTypeSelect.value = "multi-candidate";
      loadAutomationSuggestions({ marketType: "multi-candidate" }).catch((error) => showToast(error instanceof Error ? error.message : "자동 추천에 실패했습니다."));
    });
    els.automationSuggestions.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const fillIndex = target.getAttribute("data-automation-fill");
      if (fillIndex != null) {
        applyAutomationSuggestion(Number(fillIndex));
        return;
      }
      const createIndex = target.getAttribute("data-automation-create");
      if (createIndex != null) {
        createTemplateFromSuggestion(Number(createIndex)).catch((error) => showToast(error instanceof Error ? error.message : "자동 템플릿 생성에 실패했습니다."));
      }
    });
  }

  async function boot() {
    bindEvents();

    try {
      await exchangeExternalToken();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "외부 관리자 토큰 교환에 실패했습니다.");
    }

    if (session && session.token) {
      await hydrateSession();
      return;
    }

    renderAuth();
  }

  boot().catch((error) => {
    setLoginError(error instanceof Error ? error.message : "관리자 콘솔을 시작하지 못했습니다.");
  });
})();
