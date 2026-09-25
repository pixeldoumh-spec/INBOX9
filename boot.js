(() => {
  const app = document.getElementById('app');
  const scriptTag = document.currentScript;
  const appScript = scriptTag?.dataset?.appScript || '/app.js';
  let started = false;
  let settled = false;

  const showError = (message) => {
    if (!app || settled) return;
    settled = true;
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '<div class="boot-loader boot-error" role="alert"><div class="boot-loader-inner"><div class="boot-loader-text">' + message + '</div></div></div>';
  };

  const mountCustomerShell = () => {
    if (!document.querySelector('.app-shell') || document.querySelector('.auth-shell') || document.getElementById('inbox9-mobile-shell')) return;

    const css = document.createElement('style');
    css.id = 'inbox9-mobile-shell-style';
    css.textContent = `
      #inbox9-mobile-shell{position:fixed;inset:0;z-index:1000;background:#d3d3d3;color:#111;display:flex;flex-direction:column;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .inbox9-modern-shell>.sidebar,.inbox9-modern-shell>.main{display:none!important}
      .inbox9-mobile-header{height:72px;flex:none;background:#fff;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 16px}
      .inbox9-mobile-header .inbox9-brand{display:flex}
      .inbox9-brand{appearance:none;border:0;background:none;align-items:center;gap:8px;color:#171925}
      .inbox9-brand-mark{width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,#7d51ee,#5b2fd0);color:#fff;display:grid;place-items:center;font-size:21px;font-weight:800}
      .inbox9-brand strong{font-size:21px}
      .inbox9-brand strong span{color:#6d43e8}
      .inbox9-header-actions{display:flex;align-items:center;gap:8px}
      .inbox9-add-funds{height:42px;border:1px solid #c9b8ff;background:#fbf9ff;color:#6d43e8;border-radius:12px;padding:0 11px;display:flex;align-items:center;gap:7px;font-size:12px}
      .inbox9-icon-button{width:38px;height:38px;border:0;background:transparent;color:#73798a;font-size:20px}
      .inbox9-modern-shell:has(.inbox9-service-page) .inbox9-mobile-header{display:flex}
      .inbox9-modern-shell:has(.inbox9-app-drawer) .inbox9-mobile-header{display:none}
      .inbox9-mobile-main{min-height:0;flex:1;overflow:auto;padding-bottom:78px;background:#d3d3d3}
      .inbox9-mobile-content{width:100%;margin:0 auto;padding:0 16px 28px}
      .inbox9-mobile-search{height:54px;margin:14px 28px 12px;border-radius:28px;background:#c3c3c3;display:flex;align-items:center;padding:0 16px;gap:10px;color:#5d5d5d}
      .inbox9-mobile-search>span{font-size:28px;line-height:1;transform:translateY(-1px)}
      .inbox9-mobile-search input{border:0;outline:0;background:transparent;min-width:0;flex:1;font-size:17px;color:#444}
      .inbox9-mobile-search input::placeholder{color:#666}
      .inbox9-app-drawer{min-height:calc(100vh - 92px);position:relative}
      .inbox9-app-drawer-head{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 3px 4px}
      .inbox9-app-drawer-head h2{margin:0;font-size:27px;letter-spacing:-.02em;font-weight:500}
      .inbox9-app-drawer-head button{border:0;background:transparent;color:#1a73d9;font-size:16px}
      .inbox9-app-drawer-list{position:relative;padding-right:18px}
      .inbox9-app-drawer-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:6px;row-gap:22px;padding:3px 3px 26px}
      .inbox9-app-tile{border:0;background:transparent;padding:0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;color:#111}
      .inbox9-app-icon{width:61px;height:61px;border-radius:50%;background:#e5e5e5;border:4px solid rgba(255,255,255,.45);box-shadow:0 1px 2px rgba(0,0,0,.08);display:grid;place-items:center;overflow:hidden}
      .inbox9-app-icon .service-logo-glyph{width:51px;height:51px;border-radius:50%;display:grid;place-items:center;font-size:20px!important;line-height:1}
      .inbox9-app-tile strong{max-width:100%;font-size:13px;font-weight:600;line-height:1.15;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inbox9-app-index{position:absolute;right:0;top:2px;bottom:20px;width:17px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;z-index:3}
      .inbox9-app-index button{border:0;background:transparent;padding:0;color:#696969;font-size:11px;line-height:1}
      .inbox9-app-empty{padding:60px 16px;text-align:center;display:flex;flex-direction:column;gap:6px;color:#4d4d4d}
      .inbox9-app-empty strong{font-size:17px}
      .inbox9-app-empty span{font-size:12px}
      .inbox9-apps-content .market-page> :not(.inbox9-app-drawer){display:none!important}
      .inbox9-apps-content .inbox9-app-drawer{display:block!important}
      .inbox9-bottom-nav{position:absolute;left:0;right:0;bottom:0;height:76px;background:rgba(255,255,255,.98);border-top:1px solid #ececf2;display:grid;grid-template-columns:repeat(4,1fr);padding:6px 8px max(6px,env(safe-area-inset-bottom));backdrop-filter:blur(14px)}
      .inbox9-bottom-tab{border:0;background:transparent;color:#9aa0ae;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
      .inbox9-bottom-tab span{font-size:22px;line-height:1}
      .inbox9-bottom-tab small{font-size:10px;font-weight:600}
      .inbox9-bottom-tab.active{color:#6d43e8}
      .inbox9-service-page{padding:0 0 24px}
      .inbox9-service-page-head{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:8px;padding:14px 0 12px}
      .inbox9-service-page-head>div{min-width:0}
      .inbox9-service-page-head>div>span{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.1em}
      .inbox9-service-page-head h2{margin:2px 0 0;font-size:18px}
      .inbox9-service-back-page{width:38px;height:38px;border:0;background:#fff;border-radius:12px;font-size:29px;color:#555}
      .inbox9-service-page-price{font-size:13px;font-weight:700;color:#222}
      .inbox9-service-page-hero{background:#fff;border-radius:20px;padding:20px 16px;display:flex;align-items:center;gap:13px;border:1px solid #ececf2}
      .inbox9-service-page-icon{width:68px;height:68px;flex:none;border-radius:19px;background:#efefef;display:grid;place-items:center;border:1px solid #e4e4e4;overflow:hidden}
      .inbox9-service-page-icon .service-logo-glyph{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:22px!important}
      .inbox9-service-page-hero>div:nth-child(2){min-width:0}
      .inbox9-service-page-hero>div:nth-child(2)>span{font-size:9px;color:#777}
      .inbox9-service-page-hero h1{margin:4px 0 2px;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inbox9-service-page-hero p{margin:0;font-size:10px;color:#888}
      .inbox9-service-page-hero>b{margin-left:auto;align-self:flex-start;padding:5px 7px;border-radius:20px;font-size:8px;white-space:nowrap}
      .inbox9-service-page-hero>b.ready{background:#eaf8ef;color:#19834a}
      .inbox9-service-page-hero>b.unavailable{background:#f5f5f5;color:#888}
      .inbox9-service-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
      .inbox9-service-info-grid>div,.inbox9-service-wallet{background:#fff;border:1px solid #ececf2;border-radius:14px;padding:12px}
      .inbox9-service-info-grid span,.inbox9-service-wallet span{display:block;font-size:8px;color:#999;letter-spacing:.08em}
      .inbox9-service-info-grid strong{display:block;margin-top:5px;font-size:12px;color:#333}
      .inbox9-service-info-grid small,.inbox9-service-wallet small{display:block;margin-top:3px;font-size:8px;color:#8e8e8e;line-height:1.35}
      .inbox9-otp-system{margin-top:10px;background:#fff;border:1px solid #ececf2;border-radius:16px;padding:15px}
      .inbox9-section-title span{font-size:8px;color:#8b8b8b;letter-spacing:.1em}
      .inbox9-section-title h3{margin:3px 0 14px;font-size:15px}
      .inbox9-otp-step{display:flex;align-items:center;gap:10px}
      .inbox9-otp-step>b{width:28px;height:28px;border-radius:9px;background:#eee8ff;color:#6d43e8;display:grid;place-items:center;font-size:11px}
      .inbox9-otp-step div{display:flex;flex-direction:column;gap:3px}
      .inbox9-otp-step strong{font-size:11px}
      .inbox9-otp-step span{font-size:9px;color:#858585}
      .inbox9-otp-line{width:2px;height:12px;margin:2px 0 2px 13px;background:#ddd}
      .inbox9-service-wallet{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .inbox9-service-wallet strong{display:block;margin-top:4px;font-size:15px}
      .inbox9-service-page-actions{position:sticky;bottom:0;background:rgba(211,211,211,.96);padding:10px 0 4px;backdrop-filter:blur(10px)}
      .inbox9-service-page-actions .primary-btn{width:100%;height:48px;border-radius:13px}
      @media(max-width:520px){
        .inbox9-mobile-header{height:66px}
        .inbox9-mobile-content{padding:0 10px 22px}
        .inbox9-mobile-search{margin:14px 26px 12px}
        .inbox9-app-drawer-head{padding-left:4px;padding-right:4px}
        .inbox9-app-drawer-head h2{font-size:25px}
        .inbox9-app-icon{width:57px;height:57px}
        .inbox9-app-icon .service-logo-glyph{width:47px;height:47px;font-size:18px!important}
        .inbox9-app-drawer-grid{row-gap:20px}
        .inbox9-app-tile strong{font-size:12px}
        .inbox9-app-index{right:-2px;font-size:10px}
      }
      @media(min-width:700px){
        .inbox9-app-drawer-grid{grid-template-columns:repeat(6,minmax(0,1fr));row-gap:28px;column-gap:14px}
      }
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.001ms!important;animation-duration:.001ms!important;animation-iteration-count:1!important}}
    `;
    document.head.appendChild(css);

    const TABS = [['apps','Apps','▦'],['buy','Buy','ϟ'],['active','Active','◌'],['account','Account','◉']];
    const hashPage = () => String(location.hash || '').replace(/^#/,'').toLowerCase();

    const go = (id) => {
      const node = document.querySelector(`[data-page="${id}"]`);
      if (node) node.click();
    };

    const render = () => {
      const shell = document.querySelector('.app-shell');
      if (!shell || document.querySelector('.auth-shell')) return;
      shell.classList.add('inbox9-modern-shell');
      let root = document.getElementById('inbox9-mobile-shell');
      if (!root) {
        root = document.createElement('div');
        root.id = 'inbox9-mobile-shell';
        root.innerHTML = '<header class="inbox9-mobile-header"><button class="inbox9-brand" type="button" data-i9-home><span class="inbox9-brand-mark">ϟ</span><strong>INBOX<span>9</span></strong></button><div class="inbox9-header-actions"><button class="inbox9-icon-button" type="button" data-i9-notifications aria-label="Notifications">♧</button><button class="inbox9-add-funds" type="button" data-page="wallet">▱ <strong>Add Funds</strong></button></div></header><main class="inbox9-mobile-main"><label class="inbox9-mobile-search" aria-label="Search apps"><span>⌕</span><input id="inbox9-mobile-search-input" placeholder="Search for apps on this device" autocomplete="off" spellcheck="false"></label><div class="inbox9-mobile-content"></div></main><nav class="inbox9-bottom-nav" aria-label="Customer navigation">' +
          TABS.map(([id,label,g]) => '<button type="button" class="inbox9-bottom-tab" data-i9-tab="' + id + '"><span>' + g + '</span><small>' + label + '</small></button>').join('') +
          '</nav>';
        app.appendChild(root);
      }

      const host = root.querySelector('.inbox9-mobile-content');
      const content = document.querySelector('#content');
      if (content && host && content.parentElement !== host) host.appendChild(content);

      const mobileSearch = document.getElementById('inbox9-mobile-search-input');
      const sourceSearch = document.getElementById('service-search');
      if (mobileSearch && sourceSearch && mobileSearch.value !== sourceSearch.value) mobileSearch.value = sourceSearch.value;

      const badge = document.querySelector('.notification-badge');
      const bell = root.querySelector('[data-i9-notifications]');
      const count = Number.parseInt(String(badge?.textContent || ''), 10);
      if (bell) {
        bell.querySelector('.inbox9-notification-badge')?.remove();
        if (Number.isFinite(count) && count > 0) {
          const b = document.createElement('span');
          b.className = 'inbox9-notification-badge';
          b.textContent = String(Math.min(count,99));
          bell.appendChild(b);
        }
      }

      const raw = hashPage();
      const isService = raw.startsWith('service/');
      if (document.body.dataset.i9Apps == null) document.body.dataset.i9Apps = (!raw || raw === 'buy') && !isService ? 'true' : 'false';
      const apps = document.body.dataset.i9Apps === 'true' && !isService;

      content?.classList.toggle('inbox9-apps-content', apps);
      content?.classList.toggle('inbox9-buy-content', !apps && raw === 'buy');
      document.body.classList.toggle('inbox9-launcher-mode', apps);
      root.classList.toggle('inbox9-launcher-mode', apps);

      root.querySelectorAll('[data-i9-tab]').forEach((node) => {
        const id = node.dataset.i9Tab;
        node.classList.toggle('active', id === (apps || isService ? 'apps' : raw));
      });

      if (apps) {
        const drawer = document.querySelector('.inbox9-app-drawer-grid');
        if (drawer) {
          // Keep all 832+ services in the launcher; search filtering is handled by the app.
          drawer.innerHTML = drawer.innerHTML;
        }
      }
    };

    if (document.body.dataset.i9Wired !== 'true') {
      document.body.dataset.i9Wired = 'true';

      document.addEventListener('input', (event) => {
        const input = event.target.closest('#inbox9-mobile-search-input');
        if (!input) return;
        const source = document.getElementById('service-search');
        if (source && source.value !== input.value) {
          source.value = input.value;
          source.dispatchEvent(new Event('input',{bubbles:true}));
        }
      }, true);

      document.addEventListener('click', (event) => {
        const tab = event.target.closest('[data-i9-tab]');
        if (tab) {
          const id = tab.dataset.i9Tab;
          if (id === 'apps') {
            document.body.dataset.i9Apps = 'true';
            document.getElementById('service-search')?.dispatchEvent(new Event('input',{bubbles:true}));
            go('buy');
          } else {
            document.body.dataset.i9Apps = 'false';
            go(id);
          }
          setTimeout(render, 0);
          return;
        }

        const appIndex = event.target.closest('[data-app-index]');
        if (appIndex) {
          const letter = appIndex.dataset.appIndex;
          const target = document.querySelector('.inbox9-app-tile[data-app-letter="' + CSS.escape(letter) + '"]');
          target?.scrollIntoView({behavior:'smooth',block:'center'});
          return;
        }

        if (event.target.closest('[data-i9-home]')) {
          document.body.dataset.i9Apps = 'true';
          go('buy');
          setTimeout(render,0);
        }

        if (event.target.closest('[data-i9-notifications]')) {
          document.querySelector('[data-action="notifications"]')?.click();
        }
      }, true);
    }

    render();
    new MutationObserver(() => {
      clearTimeout(window.__i9RenderTimer);
      window.__i9RenderTimer = setTimeout(render,0);
    }).observe(app,{childList:true,subtree:true});
  };

  const timeout = window.setTimeout(() => {
    if (!started) showError('The application is taking too long to start. Please reload the page.');
  },10000);

  window.addEventListener('error',event => {
    if (!started) showError(event?.error?.message || event?.message || 'The application could not be started.');
  });
  window.addEventListener('unhandledrejection',event => {
    if (!started) showError(event?.reason?.message || 'The application could not be started.');
  });

  const script = document.createElement('script');
  script.src = appScript;
  script.type = 'module';
  script.onload = () => {
    started = true;
    settled = true;
    window.clearTimeout(timeout);
    app?.setAttribute('aria-busy','false');
    mountCustomerShell();
  };
  script.onerror = () => {
    window.clearTimeout(timeout);
    showError('The application bundle could not be loaded. Please reload the page.');
  };
  document.head.appendChild(script);
})();