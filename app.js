(() => {
  'use strict';
  const DAY = 86400000;
  const initialStart = '2026-10-22';
  const format = n => Number(n.toFixed(3)).toLocaleString('ru-RU');
  const dateFmt = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
  const weekFmt = new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:'UTC'});
  const id = key => document.getElementById(key);
  const dateAt = (start,offset) => new Date(Date.parse(start+'T00:00:00Z') + offset*DAY);
  const iso = d => d.toISOString().slice(0,10);
  const sampleSales = [
    [30,33,36,39,48,44,35],[31,33,39,41,53,43,34],[27,36,38,37,49,44,32],[29,32,36,40,50,46,35],
    [30,35,37,36,46,41,34],[32,33,39,40,50,45,36],[29,34,38,44,54,49,33],[31,36,40,40,50,45,35]
  ].flat().map((drinks,i)=>({date:iso(dateAt('2026-08-24',i)),drinks,stop:0}));
  const initialGoods=[
    {name:'Молоко',gen:'молока',u:'л',rate:.2,lots:[[10,1],[5,3]],incoming:4,pack:6,reserve:2},
    {name:'Кофейное зерно',gen:'кофейного зерна',u:'кг',rate:.018,lots:[[1.5,4]],incoming:0,pack:1,reserve:.2},
    {name:'Сироп',gen:'сиропа',u:'л',rate:.01,lots:[[2,1],[2,4]],incoming:0,pack:.5,reserve:.2}
  ];
  let goods=structuredClone(initialGoods), stockChanged=false;
  let history=sampleSales, start=initialStart, origin='sample', arrival=2, multiplier=1, edited={}, sku=0, draft=null, selectedPlan=null;
  function forecast(rows,first) {
    return [0,1,2].map(offset=>{
      const day=dateAt(first,offset);
      const matches=rows.filter(r=>r.date<first&&!r.stop&&dateAt(r.date,0).getUTCDay()===day.getUTCDay()).slice(-4);
      if(matches.length<4)throw Error('Для '+dateFmt.format(day)+' нужны четыре предыдущих дня той же недели без стоп-листа. Проверьте даты и горизонт.');
      const sorted=matches.map(r=>r.drinks).sort((a,b)=>a-b);
      return {day,matches,median:(sorted[1]+sorted[2])/2};
    });
  }
  function simulate(g,amount,fore) {
    const lots=g.lots.map(([q,expiry])=>({q,expiry}));
    return fore.map((f,i)=>{
      const day=i+1, opening=lots.reduce((s,l)=>s+l.q,0);
      const confirm=day===2?g.incoming:0, fresh=day===arrival?amount:0;
      if(confirm>0)lots.push({q:confirm,expiry:3});if(fresh>0)lots.push({q:fresh,expiry:5});
      const demand=f.median*multiplier*g.rate;let missing=demand,waste=0;
      lots.sort((a,b)=>a.expiry-b.expiry);
      for(const lot of lots){const used=Math.min(lot.q,missing);lot.q-=used;missing-=used;}
      for(const lot of lots)if(lot.expiry===day){waste+=lot.q;lot.q=0;}
      return {day,opening,confirm,fresh,demand,missing,waste,rest:lots.reduce((s,l)=>s+l.q,0)};
    });
  }
  function recommend(g,fore) {
    let low=0,high=Math.ceil((fore.reduce((s,r)=>s+r.median,0)*multiplier*g.rate+g.reserve)/g.pack);
    while(low<high){const mid=Math.floor((low+high)/2),days=simulate(g,mid*g.pack,fore);
      if(days.slice(arrival-1).every(r=>r.missing<1e-8)&&days[2].rest+1e-8>=g.reserve)high=mid;else low=mid+1;}
    return low;
  }
  function qty(i,rec){return edited[i]??rec;}
  function field(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
  function clearDraft(){draft=null;id('receipt').hidden=true;id('order-status').textContent='';}
  function redraw(keepQuantityFields=false) {
    const fore=forecast(history,start);
    const picks=goods.map((g,i)=>{const rec=recommend(g,fore),count=qty(i,rec),days=simulate(g,count*g.pack,fore);
      return {g,rec,count,days,miss:days.reduce((s,x)=>s+x.missing,0),loss:days.reduce((s,x)=>s+x.waste,0),demand:days.reduce((s,x)=>s+x.demand,0)};});
    selectedPlan={fore,picks};
    const milk=picks[0], m=milk.g;
    id('milk-quantity').textContent=format(milk.rec*m.pack);
    id('hero-detail').textContent=milk.rec+' уп. × '+format(m.pack)+' л · поставка '+dateFmt.format(fore[arrival-1].day);
    id('milk-demand').textContent=format(milk.demand)+' л';
    id('milk-inbound').textContent=format(m.incoming)+' л';
    id('order-note').textContent='Поставка утром '+fore[arrival-1].day.toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'})+'. Заказ в целых упаковках.';
    const smaller=Math.max(0,milk.rec-1), alt=simulate(m,smaller*m.pack,fore),miss=alt.reduce((s,d)=>s+d.missing,0);
    const first=alt.findIndex(d=>d.missing>1e-8);
    const selected=milk.count===smaller&&smaller!==milk.rec;
    const missingDate=first<0?'':fore[first].day.toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
    const portions=Number((miss/m.rate).toFixed(3));
    const portionNote=Number.isInteger(portions)?' По рецептуре это '+format(portions)+' порц. по 0,2 л.':'';
    if(selected){
      const outcome=miss>1e-8?'Первая нехватка — '+missingDate+'. За три дня не хватает '+format(miss)+' л.'+portionNote:'На четвёртый день останется '+format(alt[2].rest)+' л при резерве '+format(m.reserve)+' л.';
      id('compare-text').textContent='Вы выбрали '+format(smaller*m.pack)+' л. '+outcome;
    }else{
      id('compare-text').textContent='Если заказать '+format(smaller*m.pack)+' л, '+(miss>1e-8?'не хватит '+format(miss)+' л за три дня.':'останется '+format(alt[2].rest)+' л на четвёртый день.');
    }
    id('compare').textContent=selected?'Вернуть рекомендацию '+format(milk.rec*m.pack)+' л':'Проверить заказ '+format(smaller*m.pack)+' л →';
    id('compare').disabled=milk.rec===0;
    id('compare').onclick=()=>{if(selected)delete edited[0];else edited[0]=smaller;sku=0;id('sku').value=0;clearDraft();redraw();};
    id('date-range').textContent=dateFmt.formatRange(fore[0].day,fore[2].day)+' '+fore[0].day.getUTCFullYear();
    const body=id('goods-body');
    picks.forEach(({g,rec,count,miss,loss,demand,days},i)=>{
      let row=body.rows[i];
      if(!row){
        row=body.insertRow();
        const name=row.insertCell(),title=field('span',g.name),unit=field('span','Упаковка '+format(g.pack)+' '+g.u);
        title.className='name';unit.className='unit';name.append(title,unit);
        row.insertCell();row.insertCell().className='num';
        const input=document.createElement('input');input.type='number';input.className='qty';input.id='qty-'+i;
        input.min=0;input.max=1000000;input.step=1;input.required=true;input.value=count;
        input.setAttribute('aria-label','Заказать упаковок, '+g.name);
        input.oninput=()=>{
          clearDraft();
          if(input.validity.valid)edited[i]=input.valueAsNumber;
          redraw(true);
        };
        input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(input.validity.valid)input.blur();else input.reportValidity();}};
        row.insertCell().append(input);row.insertCell();
      }
      row.cells[1].textContent=format(demand)+' '+g.u;row.cells[2].textContent=format(rec*g.pack)+' '+g.u;
      if(!keepQuantityFields)row.cells[3].firstElementChild.value=count;
      const riskCell=row.cells[4];riskCell.replaceChildren();
      const badge=(txt,ok=false)=>{const e=field('span',txt);e.className='risk'+(ok?' ok':'');riskCell.append(e);};
      if(miss>1e-8)badge('Нехватка '+format(miss)+' '+g.u);if(loss>1e-8)badge('Списание '+format(loss)+' '+g.u);
      if(days[2].rest+1e-8<g.reserve)badge('Ниже резерва');if(!riskCell.children.length)badge('Запас достаточен',true);
    });
    const hasInvalid=[...body.querySelectorAll('.qty')].some(input=>!input.validity.valid);
    id('draft').disabled=hasInvalid;id('export').disabled=hasInvalid;
    if(hasInvalid)id('order-status').textContent='Введите целое число упаковок от 0 до 1 000 000.';
    const inspected=picks[sku], otherCount=inspected.count===inspected.rec?Math.max(0,inspected.rec-1):inspected.rec;
    const comparison=otherCount===inspected.count?null:{label:'Заказ '+format(otherCount*inspected.g.pack)+' '+inspected.g.u,days:simulate(inspected.g,otherCount*inspected.g.pack,fore)};
    window.renderSmenaFlow(id('days'),{item:inspected.g,days:inspected.days,fore,comparison});
    id('evidence').innerHTML=fore.map(f=>'<p><b>'+dateFmt.format(f.day)+'</b> · '+f.matches.map(r=>dateFmt.format(dateAt(r.date,0))+' ('+r.drinks+')').join(', ')+' → медиана '+format(f.median)+' напитков.</p>').join('');
    id('source-badge').textContent=origin==='sample'&&!stockChanged?'Учебные данные':(origin==='sample'?'Учебные продажи':'Продажи из CSV')+' · '+(stockChanged?'свой склад':'учебный склад');
  }
  function saveCSV(name,rows){
    const join=v=>typeof v==='number'?String(Number(v.toFixed(5))).replace('.',','):String(v??'');
    const text='\uFEFF'+rows.map(r=>r.map(x=>'"'+join(x).replaceAll('"','""')+'"').join(';')).join('\r\n');
    const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    a.href=u;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  function parseCSV(raw){
    const text=raw.replace(/^\uFEFF/,'').trim();
    const headerText=text.split(/\r?\n/,1)[0].replace(/"(?:[^"]|"")*"/g,'');
    const delim=headerText.includes(';')?';':',';
    const records=[];
    let fields=[],value='',quoted=false,afterQuote=false,line=1,begin=1;
    function endField(){fields.push(value.trim());value='';afterQuote=false;}
    function endRow(){
      endField();
      if(fields.length>1||fields[0])records.push({fields,line:begin});
      fields=[];
    }
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){
        if(c==='"'){
          if(text[i+1]==='"'){value+='"';i++;}
          else{quoted=false;afterQuote=true;}
        }else{value+=c;if(c==='\n')line++;}
      }else if(c===delim){endField();}
      else if(c==='\r'||c==='\n'){
        if(c==='\r'&&text[i+1]==='\n')i++;
        endRow();begin=++line;
      }else if(c==='"'&&!afterQuote&&!value.trim()){quoted=true;value='';}
      else if(c==='"'||(afterQuote&&c.trim()))throw Error('Неверные кавычки в строке '+begin+'.');
      else value+=c;
    }
    if(quoted)throw Error('Незакрытая кавычка в строке '+begin+'.');
    endRow();
    const header=(records.shift()?.fields||[]).map(x=>x.toLowerCase());
    if(!header.includes('date')||!header.includes('drinks'))throw Error('Нужны столбцы date и drinks. Скачайте шаблон.');
    if(new Set(header).size!==header.length)throw Error('В заголовке есть повторяющиеся названия столбцов.');
    const dates=new Set();const rows=records.map(({fields:c,line})=>{
      if(c.length!==header.length)throw Error('Число полей в строке '+line+' отличается от заголовка.');
      const date=c[header.indexOf('date')],rawN=c[header.indexOf('drinks')],s=header.includes('stop')?c[header.indexOf('stop')]:'0';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(dateAt(date,0).getTime())||iso(dateAt(date,0))!==date||dates.has(date))throw Error('Неверная или повторная дата в строке '+line+'. Используйте ГГГГ-ММ-ДД.');
      if(!/^\d+$/.test(rawN)||Number(rawN)>100000||!['0','1',''].includes(s))throw Error('Проверьте строку '+line+': drinks — от 0 до 100 000, stop — 0 или 1.');
      dates.add(date);return {date,drinks:Number(rawN),stop:Number(s)};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    if(!rows.length)throw Error('В файле нет строк продаж.');return rows;
  }
  id('factor').onchange=e=>{multiplier=Number(e.target.value);edited={};clearDraft();redraw();};
  id('arrival').onchange=e=>{arrival=Number(e.target.value);edited={};clearDraft();redraw();};
  id('sku').onchange=e=>{sku=Number(e.target.value);redraw(true);};
  id('draft').onclick=()=>{
    draft=selectedPlan.picks.filter(p=>p.count>0).map(p=>[p.g.name,p.count,p.g.pack,p.g.u,p.count*p.g.pack]);
    const box=id('receipt');box.hidden=false;box.replaceChildren(field('h3','Черновик закупки · '+dateFmt.format(dateAt(start,arrival-1))),field('p',draft.length?'Заявка готова к проверке управляющим.':'Для выбранных позиций закупка не требуется.'));
    if(draft.length){const list=field('ul','');draft.forEach(([n,k,size,u,total])=>list.append(field('li',n+' · '+k+' уп. × '+format(size)+' '+u+' = '+format(total)+' '+u)));box.append(list);
      const save=field('button','Скачать заявку CSV');save.onclick=()=>saveCSV('smena-order',[['Дата поставки','Ингредиент','Упаковок','Размер упаковки','Ед.','Количество'],...draft.map(line=>[iso(dateAt(start,arrival-1)),...line])]);box.append(save)}
    id('order-status').textContent='Черновик сформирован';box.scrollIntoView({block:'nearest'});
  };
  id('export').onclick=()=>{const rows=[['Дата','Ингредиент','Единица','Предложено','Выбрано','Начало','Поставка подтверждена','Поставка новая','Спрос','Нехватка','Списание','Конец']];
    selectedPlan.picks.forEach(p=>p.days.forEach((d,i)=>rows.push([iso(selectedPlan.fore[i].day),p.g.name,p.g.u,p.rec*p.g.pack,p.count*p.g.pack,d.opening,d.confirm,d.fresh,d.demand,d.missing,d.waste,d.rest])));saveCSV('smena-calculation',rows)};
  id('template').onclick=()=>saveCSV('sales-sample',[['date','drinks','stop'],...sampleSales.map(r=>[r.date,r.drinks,r.stop])]);
  id('start-date').onchange=e=>{
    if(!e.target.value){e.target.value=start;return}
    try{forecast(history,e.target.value);start=e.target.value;edited={};clearDraft();redraw();id('import-status').textContent='Горизонт обновлён.'}
    catch(err){e.target.value=start;id('import-status').textContent=err.message;}
  };
  id('file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>1500000)throw Error('Размер файла должен быть меньше 1,5 МБ.');
      const rows=parseCSV(await file.text()),first=iso(dateAt(rows.at(-1).date,1));forecast(rows,first);
      history=rows;origin='upload';start=first;id('start-date').value=first;edited={};clearDraft();redraw();
      id('import-status').textContent='Принято '+rows.length+' строк. Исключены дни со стоп-листом: '+rows.filter(r=>r.stop).length+'. План начинается после последней даты файла.';}
    catch(err){id('import-status').textContent='Файл не применён. '+err.message;}e.target.value='';
  };
  id('restore').onclick=()=>{goods=structuredClone(initialGoods);stockChanged=false;renderStock();history=sampleSales;origin='sample';start=initialStart;multiplier=1;arrival=2;sku=0;edited={};id('factor').value='1';id('arrival').value='2';id('sku').value='0';id('start-date').value=start;clearDraft();redraw();id('import-status').textContent='Учебный пример восстановлен.';};
  function renderStock(){
  id('stock').innerHTML='<table><thead><tr><th>Ингредиент</th><th>На старте, до конца дня</th><th>Уже в пути</th><th>На напиток</th><th>Резерв</th></tr></thead><tbody>'+goods.map(g=>'<tr><td>'+g.name+'</td><td>'+g.lots.map(([n,ex])=>format(n)+' '+g.u+' до Д'+ex).join(' + ')+'</td><td>'+(g.incoming?format(g.incoming)+' '+g.u+' утром Д2, годно до Д3':'—')+'</td><td>'+format(g.rate)+' '+g.u+'</td><td>'+format(g.reserve)+' '+g.u+'</td></tr>').join('')+'</tbody></table>';
  }
  renderStock();
  window.mountStockEditor({getGoods:()=>goods,onApply:(values)=>{goods=values;stockChanged=true;edited={};clearDraft();renderStock();redraw();id('import-status').textContent='Партии обновлены. Заказ пересчитан.';}});
  const labs=[['01','Доставка от кассы до двери','Заказ гостя, кофейня, управляющий и собственный курьер.'],['02','Компост из кофейного жмыха','Баланс массы партии, упаковка и порог окупаемости.'],['03','Время готовности напитка','Прогноз очереди до оплаты при одной и двух станциях.'],['04','План закупок','Спрос, сроки годности и заявка управляющего.'],['05','Цифровой помощник бариста','Четыре учебные инструкции со ссылками на источник.'],['06','Выбор локации кофейни','Три адреса и три сценария месячной экономики.']];
  id('lab-list').innerHTML=labs.map(([n,title,desc])=>'<a class="lab-link" href="'+(n==='04'?'#plan':'lab.html#'+Number(n))+'"><em>'+n+'</em><span><strong>'+title+'</strong><small>'+desc+'</small></span><span aria-hidden="true">↗</span></a>').join('');
  let backtestReady=false;
  const menu=id('menu-trigger'), sidebar=id('sidebar');
  function setMenu(open){sidebar.dataset.open=String(open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');}
  menu.addEventListener('click',()=>setMenu(sidebar.dataset.open!=='true'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar.dataset.open==='true'){setMenu(false);menu.focus();}});
  document.addEventListener('click',e=>{if(sidebar.dataset.open==='true'&&!sidebar.contains(e.target))setMenu(false);});
  document.querySelectorAll('.tabs a,.wordmark').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  function navigate(){
    const route=location.hash.slice(1),view=['test','lab'].includes(route)?route:'plan';
    for(const a of document.querySelectorAll('.tabs [data-view]')){
      if(a.dataset.view===view&&route!=='data')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    }
    for(const s of ['plan','test','lab'])id(s+'-view').hidden=s!==view;
    id('crumb').textContent=({plan:'Снабжение',test:'Аналитика',lab:'Хакатон'})[view];
    if(view==='test'&&!backtestReady&&window.initForecastValidation){window.initForecastValidation(id('backtest'));backtestReady=true;}
    if(route==='data'){id('sources').open=true;id('sources-nav').setAttribute('aria-current','page');id('sources').scrollIntoView({block:'start'});}
    else{id('sources-nav').removeAttribute('aria-current');window.scrollTo(0,0);}
  }
  id('sources-nav').addEventListener('click',()=>{setMenu(false);if(location.hash==='#data')navigate();else location.hash='data';});
  document.querySelector('.skip').onclick=e=>{e.preventDefault();id('main').focus()};
  window.addEventListener('hashchange',navigate);redraw();navigate();
})();
