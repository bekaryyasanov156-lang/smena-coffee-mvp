(() => {
  'use strict';
  const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
  const dateLabel = new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'short', timeZone:'UTC' });
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday:'short', timeZone:'UTC' });
  const safe = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const display = n => decimal.format(Math.abs(n) < 1e-8 ? 0 : n);
  function chartScale(max) {
    const raw = (max || 1) / 3;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 4, 5, 10].find(v => v * power >= raw) || 10) * power;
    return Math.ceil((max || 1) / step) * step;
  }
  const style = `
    .sf{--sf-accent:#ff9a45;--sf-risk:#ff947b;--sf-ink:#f4f2ee;--sf-gray:#aaa9a6;--sf-rule:#38383b;--sf-axis:42px;--sf-height:128px;font:inherit;min-width:0;width:100%;color-scheme:dark;background:#19191b;color:var(--sf-ink);font-variant-numeric:tabular-nums;grid-column:1/-1}
    .sf *{box-sizing:border-box}.sf .sf-heading{margin:0;font-size:15px;line-height:1.35;font-weight:700}
    .sf-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}.sf-key{display:flex;list-style:none;padding:0;margin:0;gap:7px 15px;flex-wrap:wrap;color:#bcbab6;font-size:12px}
    .sf-key li{display:flex;align-items:center;gap:5px}.sf-line{width:19px;border-top:2px solid var(--sf-accent);display:inline-block}.sf-line.sf-reserve{border-top:2px dotted #91918e}.sf-line.sf-alt{border-top:2px dashed #b2b1ad}
    .sf-axes{display:grid;grid-template-columns:var(--sf-axis) minmax(0,1fr);padding-top:24px}
    .sf-yticks,.sf-plot{height:var(--sf-height);position:relative}.sf-axislabel{position:absolute;right:8px;transform:translateY(-50%);font-size:11px;color:var(--sf-gray);line-height:1}
    .sf-plot{border-left:1px solid #454547}.sf-rule{position:absolute;left:0;right:0;border-top:1px solid #38383b}.sf-rule.sf-zero{border-color:#92928f}.sf-rule.sf-target{border-top:2px dotted #898986;z-index:1}
    .sf-svg{position:absolute;width:100%;height:100%;left:0;top:0;overflow:visible;pointer-events:none}.sf-svg line,.sf-svg polyline{vector-effect:non-scaling-stroke;fill:none}
    .sf-dot{position:absolute;transform:translate(-50%,-50%);width:9px;height:9px;border:2px solid #19191b;background:var(--sf-accent);border-radius:50%;box-shadow:0 0 0 1.5px var(--sf-accent);z-index:2;pointer-events:none}.sf-dot.sf-chosen{box-shadow:0 0 0 2px var(--sf-accent),0 0 0 5px #ff9a4542}
    .sf-num{position:absolute;transform:translate(-50%,calc(-100% - 8px));white-space:nowrap;font-weight:700;font-size:14px;line-height:1.15;z-index:3;color:#ffad68;background:#19191b;padding:0 3px;border-radius:2px;pointer-events:none}
    .sf-guide{position:absolute;top:0;bottom:0;border-left:1px dashed #855b3e;pointer-events:none}.sf-days,.sf-shortages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-left:var(--sf-axis);gap:0;text-align:center}
    .sf button.sf-day{color:#bcbab6;background:transparent;border:0;border-radius:4px;min-height:42px;width:100%;padding:4px 2px 2px;font:inherit;font-size:12px;font-weight:580;cursor:pointer}.sf button.sf-day:hover{background:#302823}.sf button.sf-day[aria-pressed=true]{color:#ffad68;background:#30251e;font-weight:750}.sf .sf-day:focus-visible,.sf summary:focus-visible{outline:2px solid var(--sf-accent);outline-offset:1px}
    .sf-short{display:flex;align-items:center;gap:0;margin:2px 0 11px;background:#232325;border-radius:4px;min-height:27px}.sf-short>span{font-size:11px;color:#b3afa9;flex:0 0 var(--sf-axis);text-align:right}.sf-shortages{margin-left:0;flex:1;font-size:12px}.sf-shortages .sf-risk{color:var(--sf-risk);font-weight:750}.sf-shortages .sf-empty{color:#95938f}
    .sf-info{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid var(--sf-rule);padding:9px 0;gap:6px}.sf-info div{min-width:0;padding-left:12px;border-left:1px solid var(--sf-rule)}.sf-info div:first-child{border:0;padding-left:0}.sf-info span,.sf-info strong{display:block}.sf-info span{color:#aaa9a6;font-size:12px}.sf-info strong{font-size:15px;font-weight:700;margin-top:1px}
    .sf p.sf-compare-readout{font-size:12px;color:#b8b6b1;margin:7px 0 0}.sf details{margin:8px 0 0}.sf summary{width:fit-content;cursor:pointer;font-size:13px;font-weight:630;padding:6px 0}.sf-scroll{min-width:0;max-width:100%;overflow:auto}
    .sf table.sf-table{width:100%;border-collapse:collapse;font:inherit;font-size:12px;margin:4px 0}.sf .sf-table th,.sf .sf-table td{color:var(--sf-ink);background:transparent;border:0;border-bottom:1px solid var(--sf-rule);padding:5px 7px;white-space:normal;text-align:right;line-height:1.4}.sf .sf-table th:first-child{text-align:left;font-weight:540}.sf .sf-table tr:last-child>*{font-weight:700}.sf .sf-table caption{text-align:left;color:#aaa9a6;padding-bottom:4px}
    @media(max-width:510px){.sf{--sf-axis:38px;--sf-height:110px}.sf-top{display:block}.sf-key{margin-top:5px;font-size:11px;gap:4px 10px}.sf-num{font-size:13px}.sf-info span{font-size:11px}.sf-info div{padding-left:6px}.sf .sf-table th,.sf .sf-table td{padding:5px 3px}}
  `;
  const fields = [
    ['opening','На начало дня'],['confirm','Подтверждённая поставка'],['fresh','Новая закупка'],
    ['demand','Спрос'],['missing','Нехватка'],['waste','Списано'],['rest','Годный остаток']
  ];

  window.renderSmenaFlow = function renderSmenaFlow(container, {item,days,fore,comparison}) {
    const n=days.length;
    if(!n || n!==fore.length){container.replaceChildren();return;}
    const previous=container.querySelector('button.sf-day[aria-pressed="true"]');
    const previousItem=container.querySelector('.sf')?.dataset.ingredient;
    const wasOpen=container.querySelector('.sf details')?.open;
    const dates=fore.map(f=>dateLabel.format(f.day));
    const actual=days.map(d=>Math.max(0,d.rest));
    const similar=comparison?.days;
    const hasAlt=Boolean(similar?.length===n && similar.some((d,i)=>
      Math.abs(d.rest-days[i].rest)>1e-8 || Math.abs(d.missing-days[i].missing)>1e-8));
    const alt=hasAlt?similar.map(d=>Math.max(0,d.rest)):[];
    const altLabel=safe(comparison?.label || 'Другой заказ');
    const cap=chartScale(Math.max(item.reserve,...actual,...alt));
    const x=i=>(i+.5)*100/n, y=v=>100-100*v/cap;
    const points=values=>values.map((v,i)=>x(i)+','+y(v)).join(' ');
    const unit=safe(item.u);
    const quantity=v=>display(v)+' '+unit;
    const chosen=previous&&previousItem===item.name ? Math.min(n-1,Number(previous.dataset.day)) :
      (days.some(d=>d.missing>1e-8)?days.findIndex(d=>d.missing>1e-8):n-1);
    const reserve=item.reserve;
    container.innerHTML='<style>'+style+'</style><section class="sf" data-ingredient="'+safe(item.name)+'" aria-label="Движение запасов: '+safe(item.name)+'">'+
      '<div class="sf-top"><h3 class="sf-heading">Годный остаток на конец дня, '+unit+'</h3><ul class="sf-key"><li><i class="sf-line"></i>Выбрано</li>'+
      (hasAlt?'<li><i class="sf-line sf-alt"></i>'+altLabel+'</li>':'')+
      '<li><i class="sf-line sf-reserve"></i>Резерв к Д'+(n+1)+' · '+quantity(reserve)+'</li></ul></div>'+
      '<div class="sf-axes" aria-hidden="true"><div class="sf-yticks">'+[cap,cap/2,0].map(v=>
        '<span class="sf-axislabel" style="top:'+y(v)+'%">'+display(v)+'</span>').join('')+'</div><div class="sf-plot">'+
      [0,50,100].map(p=>'<i class="sf-rule '+(p===100?'sf-zero':'')+'" style="top:'+p+'%"></i>').join('')+
      '<i class="sf-rule sf-target" style="top:'+y(reserve)+'%"></i><i class="sf-guide"></i>'+
      '<svg class="sf-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon fill="#ff9a45" fill-opacity=".11" points="'+
      x(0)+',100 '+points(actual)+' '+x(n-1)+',100"/>'+
      (hasAlt?'<polyline stroke="#b9b7b2" stroke-width="1.6" stroke-dasharray="5 4" points="'+points(alt)+'"/>':'')+
      '<polyline stroke="#ff9a45" stroke-width="2.7" points="'+points(actual)+'"/></svg>'+
      actual.map((v,i)=>'<i class="sf-dot" style="left:'+x(i)+'%;top:'+y(v)+'%"></i><span class="sf-num" style="left:'+x(i)+'%;top:'+y(v)+'%">'+display(v)+'</span>').join('')+'</div></div>'+
      '<div class="sf-days" role="group" aria-label="Выбрать день для подробностей">'+days.map((d,i)=>
        '<button type="button" class="sf-day" data-day="'+i+'" aria-label="'+safe(dates[i])+', остаток '+quantity(d.rest)+', нехватка '+quantity(d.missing)+'">'+safe(weekday.format(fore[i].day))+' · '+safe(dates[i])+'</button>').join('')+'</div>'+
      '<div class="sf-short"><span>Нехватка</span><div class="sf-shortages">'+days.map((d,i)=>
        '<span class="'+(d.missing>1e-8?'sf-risk':'sf-empty')+'" aria-label="'+safe(dates[i])+', нехватка '+quantity(d.missing)+'">'+(d.missing>1e-8?quantity(d.missing):'—')+'</span>').join('')+'</div></div>'+
      '<div class="sf-readout" aria-live="polite"><div class="sf-info"></div>'+(hasAlt?'<p class="sf-compare-readout"></p>':'')+'</div>'+
      '<details'+(wasOpen?' open':'')+'><summary>Баланс по дням</summary><div class="sf-scroll"><table class="sf-table"><caption>Движение '+safe(item.gen)+', '+unit+'</caption><thead><tr><th scope="col">Показатель</th>'+
      dates.map(s=>'<th scope="col">'+safe(s)+'</th>').join('')+'</tr></thead><tbody>'+fields.map(([k,name])=>
        '<tr><th scope="row">'+name+'</th>'+days.map(d=>'<td>'+display(d[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details></section>';
    const buttons=[...container.querySelectorAll('.sf-day')];
    const dots=[...container.querySelectorAll('.sf-dot')];
    function select(i){
      buttons.forEach((b,index)=>b.setAttribute('aria-pressed',String(index===i)));
      dots.forEach((d,index)=>d.classList.toggle('sf-chosen',index===i));
      container.querySelector('.sf-guide').style.left=x(i)+'%';
      const day=days[i];
      container.querySelector('.sf-info').innerHTML=[['Поставка утром',day.confirm+day.fresh],['Спрос',day.demand],['Списано',day.waste]]
        .map(([label,v])=>'<div><span>'+label+'</span><strong>'+quantity(v)+'</strong></div>').join('');
      if(hasAlt){const ref=similar[i];container.querySelector('.sf-compare-readout').innerHTML=
        safe(dates[i])+' · '+altLabel+' — остаток '+quantity(ref.rest)+', нехватка '+quantity(ref.missing)+'.';}
    }
    buttons.forEach((button,i)=>{
      button.addEventListener('click',()=>select(i));
      button.addEventListener('keydown',event=>{
        let next;
        if(event.key==='ArrowLeft')next=(i+n-1)%n;
        else if(event.key==='ArrowRight')next=(i+1)%n;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=n-1;
        else return;
        event.preventDefault();buttons[next].focus();select(next);
      });
    });
    select(chosen);
  };
})();
