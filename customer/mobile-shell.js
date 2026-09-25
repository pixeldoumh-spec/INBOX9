(() => {
  'use strict';
  const ROOT_ID = 'inbox9-mobile-shell';
  const STYLE_ID = 'inbox9-mobile-shell-style';
  const TABS = [['apps','Apps','▦'],['buy','Buy','ϟ'],['active','Active','◌'],['account','Account','◉']];
  const isCustomer = () => Boolean(document.querySelector('.app-shell')) && !document.querySelector('.auth-shell');
  const app = () => document.getElementById('app');
  function installStyle(){ if(document.getElementById(STYLE_ID))return; const link=document.createElement('link'); link.id=STYLE_ID; link.rel='stylesheet'; link.href='/customer/mobile-shell.css'; document.head.appendChild(link); }
  function currentPage(){ return String(location.hash||'').replace('#','').toLowerCase() || 'buy'; }
  function go(page){ const existing=document.querySelector(`[data-page="${page}"]`); if(existing){existing.click();return;} if(page==='apps')document.querySelector('[data-page="buy"]')?.click(); }
  function header(){return `<header class="inbox9-mobile-header"><button class="inbox9-brand" type="button" data-inbox9-home aria-label="INBOX9 home"><span class="inbox9-brand-mark">ϟ</span><strong>INBOX<span>9</span></strong></button><div class="inbox9-header-actions"><button class="inbox9-add-funds" type="button" data-page="wallet"><span>▱</span><strong>Add Funds</strong></button><button class="inbox9-icon-button" type="button" aria-label="Notifications" data-inbox9-notifications>♧</button></div></header>`;}
  function bottomNav(){const page=currentPage();return `<nav class="inbox9-bottom-nav" aria-label="Customer navigation">${TABS.map(([id,label,glyph])=>{const active=id===page||(id==='apps'&&page==='buy'&&document.body.dataset.inbox9Apps==='true');return `<button type="button" class="inbox9-bottom-tab ${active?'active':''}" data-inbox9-tab="${id}" aria-current="${active?'page':'false'}"><span>${glyph}</span><small>${label}</small>${id==='active'?'<b class="inbox9-active-count" hidden></b>':''}</button>`;}).join('')}</nav>`;}
  function appsView(){
    document.body.dataset.inbox9Apps='true';
    const content=document.querySelector('#content');
    if(!content)return;
    content.classList.add('inbox9-apps-content');
    content.classList.remove('inbox9-buy-content');
    document.querySelector('.marketplace-hero')?.classList.add('inbox9-hide');
    document.querySelectorAll('.market-country-strip,.market-controls,.market-recent').forEach(el=>el.classList.add('inbox9-hide'));
    const oldSearch=content.querySelector('#service-search');
    if(oldSearch){oldSearch.closest('label')?.classList.add('inbox9-app-search');oldSearch.placeholder='Search services...';}
  }
  function buyView(){
    document.body.dataset.inbox9Apps='false';
    const content=document.querySelector('#content');
    if(!content)return;
    if(!content.querySelector('.market-service-group')&&!content.querySelector('.market-empty'))return;
    content.classList.add('inbox9-buy-content');content.classList.remove('inbox9-apps-content');
    document.querySelector('.marketplace-hero')?.classList.add('inbox9-hide');
    document.querySelectorAll('.market-country-strip,.market-controls,.market-recent').forEach(el=>el.classList.add('inbox9-hide'));
    const oldSearch=content.querySelector('#service-search');
    if(oldSearch){oldSearch.closest('label')?.classList.add('inbox9-buy-search');oldSearch.placeholder='Search services...';}
  }
  function accountView(){document.body.dataset.inbox9Apps='false';document.querySelector('#content')?.classList.add('inbox9-account-view');}
  function activeView(){document.body.dataset.inbox9Apps='false';document.querySelector('#content')?.classList.add('inbox9-active-view');}
  function updateBottomCount(){const n=document.querySelectorAll('.active-card').length;const badge=document.querySelector('.inbox9-active-count');if(!badge)return;badge.hidden=n===0;badge.textContent=n>99?'99+':String(n);}
  function mount(){
    installStyle();if(!isCustomer())return;const shell=document.querySelector('.app-shell');if(!shell)return;shell.classList.add('inbox9-modern-shell');
    let root=document.getElementById(ROOT_ID);
    if(!root){root=document.createElement('div');root.id=ROOT_ID;root.innerHTML=`${header()}<main class="inbox9-mobile-main"><div class="inbox9-mobile-content"></div></main>${bottomNav()}`;app()?.appendChild(root);wire(root);}
    if(document.body.dataset.inbox9Apps==null)document.body.dataset.inbox9Apps=currentPage()==='buy'?'true':'false';
    const host=root.querySelector('.inbox9-mobile-content');const content=document.querySelector('#content');
    if(content&&host&&content.parentElement!==host)host.appendChild(content);
    if(document.body.dataset.inbox9Apps==='true')appsView();else if(currentPage()==='active')activeView();else if(currentPage()==='account')accountView();else buyView();
    root.querySelectorAll('[data-inbox9-tab]').forEach(item=>{const page=item.dataset.inbox9Tab;const active=page===currentPage()||(page==='apps'&&currentPage()==='buy'&&document.body.dataset.inbox9Apps==='true');item.classList.toggle('active',active);item.setAttribute('aria-current',active?'page':'false');});
    updateBottomCount();
  }
  function wire(root){
    root.addEventListener('click',event=>{
      const tab=event.target.closest('[data-inbox9-tab]');
      if(tab){const id=tab.dataset.inbox9Tab;if(id==='apps'){document.body.dataset.inbox9Apps='true';go('buy');setTimeout(mount,0);}else if(id==='buy'){document.body.dataset.inbox9Apps='false';go('buy');}else{document.body.dataset.inbox9Apps='false';go(id);}return;}
      if(event.target.closest('[data-inbox9-home]')){document.body.dataset.inbox9Apps='true';go('buy');setTimeout(mount,0);return;}
      if(event.target.closest('[data-inbox9-notifications]'))document.querySelector('[data-action="notifications"]')?.click();
    });
    root.addEventListener('input',event=>{if(event.target?.id!=='inbox9-service-search')return;const source=document.querySelector('#service-search');if(source){source.value=event.target.value;source.dispatchEvent(new Event('input',{bubbles:true}));}});
  }
  const observer=new MutationObserver(()=>{if(!isCustomer())return;clearTimeout(window.__inbox9ShellTimer);window.__inbox9ShellTimer=setTimeout(mount,0);});
  function start(){installStyle();observer.observe(app()||document.body,{childList:true,subtree:true});mount();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
