/**
 * @name 1un4r-Free
 * @description 1un4r - All-in-one plugin [ BetterDiscord ] - Free Version
 * @version 1.3.0
 * @author linsae123
 */

let pluginInstance;

module.exports = class L1un4rFree {
  constructor() {
    this.panel = null;
    this.token = null;
    this.observer = null;
    this.randomMessageInterval = null;
    this.patches = {};
    this.uiToggleButton = null;
    this.buttonObserver = null;
    this.MessageActions = BdApi.findModuleByProps("sendMessage");
    this.flux = BdApi.findModuleByProps("dispatch", "subscribe");
    this.SelectedChannelStore = BdApi.findModuleByProps(
      "getLastSelectedChannelId"
    );

    this.randomMessageDelayScale = [
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000,
      10000,
    ];

    this.defaultSettings = {
      pollEnabled: false,
      pollMessage: "투표가 시작되었습니다!",
      pollItemCount: 1,
      autoBoldEnabled: false,
      autoBoldPrefix: "# ",
      autoRandomMessageEnabled: false,
      autoRandomMessageList: "안녕하세요\n반가워요!\n1un4r on Top!",
      autoRandomMessageDelay: 3000,
    };
    this.settings = { ...this.defaultSettings };
    pluginInstance = this;
  }

  start() {
    this.settings = {
      ...this.defaultSettings,
      ...BdApi.Data.load("L1un4rFree", "settings"),
    };
    this.injectPanel();
    this.createAndObserveToggleButton();
    this.applyPatches();
    if (this.settings.autoRandomMessageEnabled) {
      this.startRandomMessageInterval();
    }
    console.log("[1un4r Free] 플러그인이 시작되었습니다.");
  }

  stop() {
    BdApi.Patcher.unpatchAll("L1un4rFree");
    if (this.patches.xhr) this.patches.xhr();
    if (this.observer) this.observer.disconnect();
    if (this.buttonObserver) this.buttonObserver.disconnect();
    if (this.uiToggleButton) this.uiToggleButton.remove();
    this.patches = {};
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    this.stopRandomMessageInterval();
    console.log("[1un4r Free] 플러그인이 중지되었습니다.");
  }

  saveSettings() {
    BdApi.Data.save("L1un4rFree", "settings", this.settings);
  }

  applyPatches() {
    const MessageActions = BdApi.findModuleByProps("sendMessage", "editMessage");

    if (MessageActions) {
      BdApi.Patcher.before(
        "L1un4rFree",
        MessageActions,
        "sendMessage",
        (_, args) => {
          const message = args[1];
          const content = message.content?.trim();
          if (!content || content.startsWith("/")) return;

          if (this.settings.pollEnabled) {
            this.createPollDirectly(args[0], content);
            args[1].content = "";
            return args;
          }

          if (this.settings.autoBoldEnabled) {
            message.content = `${this.settings.autoBoldPrefix}${message.content}`;
          }
        }
      );
    }

    const { setRequestHeader } = XMLHttpRequest.prototype;
    XMLHttpRequest.prototype.setRequestHeader = function (h, v) {
      if (h.toLowerCase() === "authorization" && v)
        pluginInstance.handleTokenFound(v);
      return setRequestHeader.apply(this, arguments);
    };
    this.patches.xhr = () => {
      XMLHttpRequest.prototype.setRequestHeader = setRequestHeader;
    };
  }

  handleTokenFound(token) {
    if (this.token === token) return;
    this.token = token;
    console.log("[1un4r Free] 인증 토큰 확보");
    BdApi.UI.showToast("1un4r: 인증 토큰 확보 완료!", { type: "success" });
  }
  
  async createPollDirectly(channelId, question) {
    if (!this.token) {
        return BdApi.UI.showToast("인증 토큰이 없어 투표를 생성할 수 없습니다.", { type: "error" });
    }

    const itemCount = this.settings.pollItemCount || 1;
    const answers = [];

    for (let i = 0; i < itemCount; i++) {
        answers.push({ "poll_media": { "text": question } });
    }
    
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const headers = { 'Authorization': this.token, 'Content-Type': 'application/json' };
    const payload = {
        "content": this.settings.pollMessage || "",
        "poll": { 
            "question": { "text": question }, 
            "answers": answers, 
            "duration": 24, 
            "allow_multiselect": false, 
            "layout_type": 1 
        }
    };

    try {
        const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("[1un4r Free] 투표 생성 실패:", errorData);
            BdApi.UI.showToast(`투표 생성 실패: ${errorData.message || '알 수 없는 오류'}`, { type: "error" });
        }
    } catch (error) {
        console.error("[1un4r Free] 투표 요청 중 네트워크 오류:", error);
        BdApi.UI.showToast("투표 생성 중 네트워크 오류가 발생했습니다.", { type: "error" });
    }
  }

  toggleAutoRandomMessage(enabled) {
    this.settings.autoRandomMessageEnabled = enabled;
    this.saveSettings();
    enabled
      ? this.startRandomMessageInterval()
      : this.stopRandomMessageInterval();
    BdApi.showToast(`자동 랜덤 메시지 ${enabled ? "시작" : "중지"}`, { type: "info" });
  }

  startRandomMessageInterval() {
    this.stopRandomMessageInterval();
    const delay = parseInt(this.settings.autoRandomMessageDelay, 10);
    if (isNaN(delay) || delay <= 0) this.settings.autoRandomMessageDelay = 3000;
    this.randomMessageInterval = setInterval(() => this.sendRandomMessage(), this.settings.autoRandomMessageDelay);
  }

  stopRandomMessageInterval() {
    clearInterval(this.randomMessageInterval);
    this.randomMessageInterval = null;
  }
  
  async sendRandomMessage() {
    if (!this.token) {
      this.stopRandomMessageInterval();
      const checkbox = document.getElementById("lunar-autoRandomMessageEnabled");
      if (checkbox) checkbox.checked = false;
      this.settings.autoRandomMessageEnabled = false;
      this.saveSettings();
      BdApi.UI.showToast("인증 토큰이 없어 랜덤 메시지 전송을 중지합니다.", { type: "error" });
      return;
    }

    const channelId = this.SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages = this.settings.autoRandomMessageList.split("\n").filter((l) => l.trim());
    if (messages.length === 0) return;

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const headers = { 'Authorization': this.token, 'Content-Type': 'application/json' };
    const payload = { "content": randomMessage };

    try {
      const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("[1un4r Free] 랜덤 메시지 전송 실패:", errorData);
      }
    } catch (error) {
      console.error("[1un4r Free] 랜덤 메시지 요청 중 네트워크 오류:", error);
    }
  }

  createAndObserveToggleButton() {
    const selector = 'form [class^="buttons_"]';
    const insert = (container) => {
      if (document.getElementById("lunar-ui-toggle-button")) return;
      const giftBtn = container.querySelector(
        '[aria-label*="Gift"], [aria-label*="선물"]'
      );
      const wrapper = document.createElement("div");
      wrapper.id = "lunar-ui-toggle-button";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lunar-toggle-button";
      btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-5.4-5.4c0-1.81 0.9-3.39 2.26-4.4A8.995 8.995 0 0 0 12 3Z"></path></svg>`;
      btn.onclick = () => {
        if (!this.panel || !document.body.contains(this.panel))
          this.injectPanel();
        this.panel.style.display =
          this.panel.style.display === "none" ? "flex" : "none";
      };
      wrapper.appendChild(btn);
      if (giftBtn) giftBtn.parentElement.insertBefore(wrapper, giftBtn);
      else container.insertBefore(wrapper, container.firstChild);
      this.uiToggleButton = wrapper;
      if (!document.getElementById("lunar-style-toggle")) {
        const style = document.createElement("style");
        style.id = "lunar-style-toggle";
        style.innerHTML = `
          .lunar-toggle-button { background: 0; border: 0; padding: 0; border-radius: 4px; display:flex; align-items:center; cursor: pointer; margin: 0 4px; }
          .lunar-toggle-button svg { color: var(--interactive-normal); transition: transform 0.2s, color 0.2s; }
          .lunar-toggle-button:hover svg { color: var(--interactive-hover); transform: rotate(-15deg) scale(1.1); }
        `;
        document.head.appendChild(style);
      }
    };
    this.buttonObserver = new MutationObserver(() => {
      const container = document.querySelector(selector);
      if (container) insert(container);
      else if (this.uiToggleButton) {
        this.uiToggleButton.remove();
        this.uiToggleButton = null;
      }
    });
    this.buttonObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    if (document.querySelector(selector))
      insert(document.querySelector(selector));
  }
  
  injectPanel() {
    if (document.getElementById("LunarPanel")) {
      this.panel = document.getElementById("LunarPanel");
      return;
    }
    const panel = document.createElement("div");
    panel.id = "LunarPanel";
    this.panel = panel;

    const logoBase64 = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Imx1bmFyLWxvZ28tZ3JhZGllbnQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMjk4MEI5OyIgLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM4N0NFRUI7IiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxwYXRoIGZpbGw9InVybCgjbHVuYXItbG9nby1ncmFkaWVudCkiIGQ9Ik0xMiAzYTkgOSAwIDEgMCA5IDljMC0uNDYtLjA0LS45Mi0uMS0xLjM2YTUuMzg5IDUuMzg5IDAgMCAxLTQuNCAyLjI2IDUuNDAzIDUuNDAzIDAgMCAxLTUuNC01LjRjMC0xLjgxIDAuOS0zLjM5IDIuMjYtNC40QTguOTk1IDguOTk1IDAgMCAwIDEyIDNaIj48L3BhdGg+PC9zdmc+";

    const createId = (key) => `lunar-${key}`;
    const createToggle = (id, label, desc) => `<div class="setting-row"><div class="setting-label"><div class="label-text">${label}</div><div class="label-description">${desc}</div></div><div class="toggle-switch"><input type="checkbox" id="${createId(id)}" ${this.settings[id] ? "checked" : ""}><span class="slider"></span></div></div>`;
    const createInput = (id, label, desc, placeholder) => `<div class="setting-row vertical"><div class="setting-label"><div class="label-text">${label}</div><div class="label-description">${desc}</div></div><input type="text" id="${createId(id)}" placeholder="${placeholder}" class="text-input" value="${this.settings[id] || ""}"></div>`;
    const createSlider = (id, label, desc, min, max, step = 1, unit = "") => `<div class="setting-row vertical"><div class="setting-label"><div class="label-text">${label}</div><div class="label-description">${desc}</div></div><div class="slider-control"><input type="range" id="${createId(id)}" min="${min}" max="${max}" step="${step}" value="${this.settings[id]}" data-unit="${unit}"><div class="slider-tooltip">${this.settings[id]}${unit}</div></div></div>`;
    const createTextarea = (id, label, desc, placeholder) => `<div class="setting-row vertical"><div class="setting-label"><div class="label-text">${label}</div><div class="label-description">${desc}</div></div><textarea id="${createId(id)}" placeholder="${placeholder}" class="text-input">${this.settings[id] || ""}</textarea></div>`;
    const createDivider = () => `<div class="divider"></div>`;

    panel.innerHTML = `
      <style>
        :root { --lunar-accent: #2980B9; --lunar-bg: rgba(20, 20, 23, 0.8); --lunar-secondary-bg: rgba(30, 30, 34, 0.7); --lunar-border: rgba(255, 255, 255, 0.05); --lunar-text-primary: #FFFFFF; --lunar-text-secondary: #A0A0B0; --lunar-text-muted: #6B6B78; --lunar-gradient-start: #2980B9; --lunar-gradient-end: #87CEEB; }
        #LunarPanel { position: fixed; top: 100px; left: 100px; z-index: 1001; background: var(--lunar-bg); backdrop-filter: blur(12px) saturate(180%); border-radius: 12px; border: 1px solid var(--lunar-border); width: 480px; color: var(--lunar-text-primary); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37); display: flex; flex-direction: column; max-height: 70vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
        .titlebar { padding: 12px 16px; cursor: move; border-bottom: 1px solid var(--lunar-border); flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
        .titlebar-title { font-size: 20px; font-weight: 600; }
        .close-btn { width: 22px; height: 22px; border-radius: 50%; background: #333; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .2s; }
        .close-btn:hover { transform: scale(1.1); }
        .close-btn::before { content: '×'; font-size: 16px; color: var(--lunar-text-secondary); }
        .content-wrapper { padding: 16px; overflow-y: auto; }
        .content-wrapper::-webkit-scrollbar { display: none; }
        .setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .setting-row.vertical { flex-direction: column; align-items: flex-start; }
        .setting-label { flex-grow: 1; }
        .label-text { font-size: 16px; font-weight: 500; }
        .label-description { font-size: 13px; color: var(--lunar-text-muted); margin-top: 2px; }
        .toggle-switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 100%; height: 100%; position: absolute; z-index: 1; cursor: pointer; }
        .toggle-switch .slider { position: absolute; inset: 0; background-color: var(--lunar-secondary-bg); border-radius: 34px; transition: .4s; }
        .toggle-switch .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .4s; }
        .toggle-switch input:checked + .slider { background-image: linear-gradient(to right, var(--lunar-gradient-start), var(--lunar-gradient-end)); box-shadow: 0 0 10px var(--lunar-gradient-start); }
        .toggle-switch input:checked + .slider:before { transform: translateX(20px); }
        .vertical > .text-input, .vertical > .slider-control { margin-top: 12px; width: 100%; }
        .text-input, textarea { width: 100%; box-sizing: border-box; background: var(--lunar-secondary-bg); border: 1px solid var(--lunar-border); border-radius: 6px; padding: 10px; color: var(--lunar-text-primary); font-size: 14px; transition: .2s; font-family: inherit; }
        .text-input:focus { border-color: var(--lunar-accent); box-shadow: 0 0 10px -2px var(--lunar-accent); }
        textarea { resize: vertical; min-height: 80px; }
        .slider-control { position: relative; width: 100%; }
        .slider-control input[type=range] { width: 100%; -webkit-appearance: none; background: transparent; height: 20px; margin: 0; padding: 0; }
        .slider-control input[type=range]::-webkit-slider-runnable-track { height: 4px; cursor: pointer; border-radius: 3px; background-color: var(--lunar-secondary-bg); background-image: linear-gradient(to right, var(--lunar-gradient-start), var(--lunar-gradient-end)); background-size: var(--slider-fill-percent, 0%) 100%; background-repeat: no-repeat; }
        .slider-control input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 18px; width: 18px; border-radius: 50%; background: #fff; cursor: pointer; margin-top: -7px; border: 2px solid var(--lunar-accent); transition: .2s; }
        .slider-control:hover .slider-tooltip { opacity: 1; top: -35px; }
        .slider-tooltip { position: absolute; top: -30px; background-color: var(--lunar-accent); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; transform: translateX(-50%); pointer-events: none; opacity: 0; transition: .2s; white-space: nowrap; }
        .divider { border-top: 1px solid var(--lunar-border); margin: 24px 0; }
        .purchase-link { text-align: center; margin-top: 10px; font-size: 14px; }
        .purchase-link a { color: var(--lunar-accent); text-decoration: none; font-weight: bold; }
      </style>
      <div class="titlebar"><div style="display: flex; align-items: center;"><img src="${logoBase64}" style="width: 24px; height: 24px; margin-right: 8px; transform: rotate(-15deg);"/><h1 class="titlebar-title">1un4r [Free]</h1></div><div id="lunar-close-btn" class="close-btn"></div></div>
      <div class="content-wrapper">
        <div id="msg">
          ${createToggle("pollEnabled", "투표 입력", "메시지를 투표로 변환합니다.")}
          ${createInput("pollMessage", "투표 메시지", "투표와 함께 전송될 메시지입니다 (선택 사항).", "")}
          ${createSlider("pollItemCount", "항목 수", "생성될 투표 항목의 개수입니다.", 1, 10, 1)}
          ${createDivider()}
          ${createToggle("autoBoldEnabled", "자동 접두사", "메시지 앞에 설정된 텍스트를 자동으로 붙입니다.")}
          ${createInput("autoBoldPrefix", "자동 접두사 텍스트", "자동으로 붙일 접두사입니다.", "# ")}
          ${createDivider()}
          ${createToggle("autoRandomMessageEnabled", "자동 랜덤 메시지", "아래에 적은 메시지를 랜덤으로 골라 보냅니다.")}
          ${createTextarea("autoRandomMessageList", "메시지 목록", "한 줄에 하나씩 입력하세요.", "")}
          ${createSlider("autoRandomMessageDelay", "전송 딜레이", "메시지를 보내는 시간 간격입니다.", 0, this.randomMessageDelayScale.length - 1, 1, "초")}
        </div>
        ${createDivider()}
        <div class="purchase-link">
          <p>더 많은 강력한 기능(수정됨 숨기기, 선물 스나이퍼 등)을 원하시나요?</p>
          <a href="https://canary.discord.com/channels/1400496345587908608/1400824175760904422" target="_blank">정식 버전 구매하기</a>
        </div>
      </div>`;

    panel.style.display = "none";
    document.body.appendChild(panel);
    this.setupEventListeners(panel);
  }
  
  setupEventListeners(panel) {
    panel.querySelector("#lunar-close-btn")?.addEventListener("click", () => {
      if (this.panel) this.panel.style.display = "none";
    });

    const titlebar = panel.querySelector(".titlebar");
    let isDragging = false, x, y;
    titlebar?.addEventListener("mousedown", (e) => { isDragging = true; x = e.clientX - panel.getBoundingClientRect().left; y = e.clientY - panel.getBoundingClientRect().top; });
    document.addEventListener("mousemove", (e) => { if (isDragging) { panel.style.left = `${e.clientX - x}px`; panel.style.top = `${e.clientY - y}px`; } });
    document.addEventListener("mouseup", () => (isDragging = false));

    panel.querySelectorAll(".toggle-switch input, .text-input, .slider-control input").forEach((el) => {
        const id = el.id;
        if (!id) return;
        const key = id.replace(/^lunar-/, "");
        if (this.settings[key] === undefined) return;

        const eventType = el.type === "checkbox" || el.type === "range" ? "change" : "input";
        el.addEventListener(eventType, (e) => {
          const target = e.target;
          let value = target.type === "checkbox" ? target.checked : target.value;
          if (key === "autoRandomMessageDelay") {
            this.settings.autoRandomMessageDelay = this.randomMessageDelayScale[parseInt(value, 10)];
          } else {
            this.settings[key] = target.type === "range" ? parseFloat(value) : value;
          }
          this.saveSettings();
          if (key === "autoRandomMessageEnabled") this.toggleAutoRandomMessage(value);
          else if (key === "autoRandomMessageDelay" && this.settings.autoRandomMessageEnabled) this.startRandomMessageInterval();
        });
      });

    const setupSliderTooltip = (slider) => {
      const tooltip = slider.parentElement.querySelector(".slider-tooltip");
      if (!tooltip) return;
      const update = () => {
        const val = Number(slider.value);
        const min = Number(slider.min) || 0;
        const max = Number(slider.max) || 100;
        const unit = slider.dataset.unit || "";
        let displayValue;
        if (slider.id === "lunar-autoRandomMessageDelay") {
          const realDelay = this.randomMessageDelayScale[val];
          displayValue = realDelay < 1000 ? (realDelay / 1000).toFixed(1) : (realDelay / 1000).toFixed(0);
        } else {
          displayValue = val.toFixed(0);
        }
        tooltip.textContent = `${displayValue}${unit}`;
        const percentage = max === min ? 0 : ((val - min) / (max - min)) * 100;
        slider.style.setProperty("--slider-fill-percent", `${percentage}%`);
        tooltip.style.left = `calc(${percentage}% + (${8 - percentage * 0.16}px))`;
      };
      if (slider.id === "lunar-autoRandomMessageDelay") {
        const currentDelay = this.settings.autoRandomMessageDelay;
        slider.value = this.randomMessageDelayScale.indexOf(currentDelay) > -1 ? this.randomMessageDelayScale.indexOf(currentDelay) : this.randomMessageDelayScale.indexOf(3000);
      }
      slider.addEventListener("input", update);
      update();
    };
    panel.querySelectorAll(".slider-control input[type=range]").forEach(slider => setupSliderTooltip.call(this, slider));
  }
};
