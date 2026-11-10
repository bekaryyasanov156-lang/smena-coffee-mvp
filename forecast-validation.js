/* Проверка двух прогнозов на общей, заранее зафиксированной временной отсечке. */
(() => {
  'use strict';

  const firstDay = Date.UTC(2026, 7, 24);
  const dayMs = 86400000;
  const trainingDays = 56;
  const spikeDay = 52;
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const sales = [
    [30, 33, 36, 39, 48, 44, 35], [31, 33, 39, 41, 53, 43, 34],
    [27, 36, 38, 37, 49, 44, 32], [29, 32, 36, 40, 50, 46, 35],
    [30, 35, 37, 36, 46, 41, 34], [32, 33, 39, 40, 50, 45, 36],
    [29, 34, 38, 44, 54, 49, 33], [31, 36, 40, 40, 50, 45, 35],
    [31, 34, 41, 41, 53, 46, 33], [29, 36, 39, 38, 51, 43, 36]
  ].flat();
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const print = value => number.format(value);

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function evaluate(weeks, spike) {
    const history = sales.slice(0, trainingDays);
    if (spike) history[spikeDay] += 70;
    const byDay = dayNames.map((_, weekday) => {
      const values = history.slice(-7 * weeks).filter((_, i) => i % 7 === weekday);
      return { median: median(values), previous: history[trainingDays - 7 + weekday] };
    });
    const rows = sales.map((raw, i) => {
      const learn = i < trainingDays;
      const date = new Date(firstDay + i * dayMs).toISOString().slice(0, 10);
      const observed = learn ? history[i] : raw;
      const predicted = learn ? null : byDay[i % 7];
      return {
        date, weekday: dayNames[i % 7], learn, raw, observed, predicted,
        difference: predicted ? {
          median: Math.abs(observed - predicted.median),
          previous: Math.abs(observed - predicted.previous)
        } : null
      };
    });
    const test = rows.slice(trainingDays);
    const total = test.reduce((sum, r) => sum + r.observed, 0);
    function score(method) {
      const errors = test.reduce((sum, r) => sum + r.difference[method], 0);
      return { errors, mae: errors / test.length, wape: total ? 100 * errors / total : null };
    }
    return { rows, byDay, median: score('median'), previous: score('previous'), total };
  }

  function exportCsv(result, weeks, spike) {
    const header = ['Дата', 'День', 'Выборка', 'Продажи исходные, шт.', 'Продажи в сценарии, шт.',
      'Прогноз медианы, шт.', 'Прогноз прошлой недели, шт.', 'Ошибка медианы по модулю, шт.',
      'Ошибка прошлой недели по модулю, шт.', 'Недель для медианы', 'Последний день обучения', 'Всплеск включён'];
    function serialize(row) {
      return row.map(value => {
        const literal = value == null ? '' : String(value);
        return '"' + literal.replace(/"/g, '""') + '"';
      }).join(';');
    }
    function numeric(value) { return value == null ? '' : String(value).replace('.', ','); }
    const lines = result.rows.map(r => serialize([
      r.date, r.weekday, r.learn ? 'Обучение' : 'Проверка', r.raw, r.observed,
      numeric(r.predicted?.median), numeric(r.predicted?.previous),
      numeric(r.difference?.median), numeric(r.difference?.previous),
      weeks, '2026-10-18', spike ? 'Да' : 'Нет'
    ]));
    const csv = '\uFEFF' + [serialize(header), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'forecast-check-' + weeks + 'w-' + (spike ? 'spike' : 'base') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function paintErrors(host, rows, selected) {
    const largest=Math.max(1,...rows.flatMap(r=>[r.difference.median,r.difference.previous]));
    const step=largest>20?10:largest>6?5:1;
    const top=Math.ceil(largest/step)*step;
    function shortDate(r){return r.date.slice(8)+'.'+r.date.slice(5,7);}
    function week(start){
      const slice=rows.slice(start,start+7);
      return '<section class="fv-week"><h4>'+shortDate(slice[0])+' – '+shortDate(slice.at(-1))+'</h4>'+
        '<div class="fv-week-grid"><div aria-hidden="true" class="fv-ys"><span>'+print(top)+'</span><span>0</span></div>'+
        '<div class="fv-cols" role="group" aria-label="Ошибки по дням с '+shortDate(slice[0])+'">'+slice.map((r,j)=>{
          const label=shortDate(r)+', медиана '+print(r.difference.median)+', прошлая неделя '+print(r.difference.previous)+' напитков';
          return '<button type="button" class="fv-barbtn" data-error-day="'+(start+j)+'" aria-label="'+label+'"><span class="fv-bars" aria-hidden="true"><i style="height:'+
            (100*r.difference.median/top)+'%"></i><i style="height:'+(100*r.difference.previous/top)+'%"></i></span><span class="fv-dlabel">'+
            r.weekday+'<small>'+r.date.slice(8)+'</small></span></button>';
        }).join('')+'</div></div></section>';
    }
    host.innerHTML='<div class="fv-chart-head"><div><h3>Абсолютная ошибка по дням</h3><p>Отклонение от продаж, напитков</p></div>'+
      '<div class="fv-legend"><span><i></i>Медиана</span><span><i></i>Прошлая неделя</span></div></div>'+
      '<div class="fv-weeks">'+week(0)+week(7)+'</div><p class="fv-inspect" aria-live="polite"></p>';
    const buttons=[...host.querySelectorAll('[data-error-day]')];
    function select(i){
      const r=rows[i];host.dataset.selected=String(i);
      buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));
      host.querySelector('.fv-inspect').innerHTML='<b>'+shortDate(r)+' · '+r.weekday+'</b><span>Продано <strong>'+r.observed+'</strong></span>'+
        '<span>Ошибка медианы <strong>'+print(r.difference.median)+'</strong></span><span>Ошибка прошлой недели <strong>'+print(r.difference.previous)+'</strong></span>';
    }
    buttons.forEach((b,i)=>{
      b.addEventListener('click',()=>select(i));
      b.addEventListener('keydown',e=>{
        let next;
        if(e.key==='ArrowLeft')next=(i+13)%14;
        else if(e.key==='ArrowRight')next=(i+1)%14;
        else if(e.key==='Home')next=0;else if(e.key==='End')next=13;else return;
        e.preventDefault();buttons[next].focus();select(next);
      });
    });
    select(selected);
  }

  window.initForecastValidation = function initForecastValidation(root) {
    if (!root || typeof root.querySelector !== 'function') throw new Error('Для проверки нужен контейнер интерфейса.');
    root.innerHTML = `
      <style>
        .fv{--fv-accent:#ff9a45;--fv-ink:#f4f2ee;--fv-gray:#aaa9a6;--fv-line:#38383b;--fv-ink2:#b4b3af;color-scheme:dark;background:#19191b;color:var(--fv-ink);font:inherit;max-width:100%;min-width:0}
        .fv *{box-sizing:border-box}.fv p{line-height:1.5}.fv h3,.fv h4,.fv p{margin:0}
        .fv-window{display:grid;grid-template-columns:4fr 1fr;gap:4px;max-width:720px;margin-bottom:16px}
        .fv-window div{border-top:4px solid #636365;padding:5px 0 0;color:#aaa9a6;font-size:12px}
        .fv-window div:last-child{border-color:var(--fv-accent);color:#ffb779}
        .fv-controls,.fv-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px;margin:12px 0 17px}
        .fv label{display:flex;align-items:center;gap:8px;line-height:1.4;font-size:14px}
        .fv select,.fv button{font:inherit;min-height:40px;padding:6px 11px;border:1px solid #626265;border-radius:5px;background:#242426;color:var(--fv-ink)}
        .fv input[type=checkbox]{width:17px;height:17px;accent-color:var(--fv-accent);flex-shrink:0}.fv button,.fv summary{cursor:pointer}
        .fv button:focus-visible,.fv select:focus-visible,.fv input:focus-visible,.fv summary:focus-visible{outline:2px solid var(--fv-accent);outline-offset:2px}
        .fv-chart{padding:20px 22px 0;background:#19191b;border:1px solid var(--fv-line);border-radius:8px;margin-bottom:15px}
        .fv-chart-head,.fv-legend,.fv-legend span{display:flex;align-items:center}.fv-chart-head{justify-content:space-between;gap:12px;flex-wrap:wrap}
        .fv .fv-chart-head h3{font-size:20px;line-height:1.25;letter-spacing:-.45px;font-weight:660}.fv .fv-chart-head p{font-size:12px;color:#aaa9a6;margin:2px 0 0}
        .fv-legend{gap:12px;flex-wrap:wrap;font-size:12px;color:#bfbdba}.fv-legend span{gap:5px}.fv-legend i{width:12px;height:7px;background:var(--fv-accent)}
        .fv-legend span:nth-child(2) i{background:repeating-linear-gradient(135deg,#b5b4b0 0 2px,#58585b 2px 4px)}
        .fv-weeks{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:14px 0 8px}.fv-week{min-width:0}.fv .fv-week h4{margin:0 0 7px;padding-left:22px;font-size:12px;color:var(--fv-ink2);font-weight:650}
        .fv-week-grid{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:start}.fv-ys{height:85px;display:flex;flex-direction:column;justify-content:space-between;color:var(--fv-ink2);font-size:10px;line-height:1}
        .fv-cols{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0}
        .fv .fv-barbtn{display:block;min-width:0;min-height:44px;border:0;border-radius:0;background:transparent;padding:0;font:inherit;box-shadow:none}
        .fv .fv-barbtn:hover{background:#302c29}.fv .fv-barbtn[aria-pressed=true]{background:#392a20;box-shadow:inset 0 -2px var(--fv-accent)}.fv .fv-barbtn:focus-visible{outline-offset:0}
        .fv-bars{display:flex;height:85px;align-items:flex-end;justify-content:center;gap:2px;border-top:1px solid var(--fv-line);border-bottom:1px solid #858581;background:linear-gradient(to bottom,transparent calc(50% - .5px),#38383b calc(50% - .5px) calc(50% + .5px),transparent calc(50% + .5px))}
        .fv-bars i{display:block;width:min(24%,10px);background:var(--fv-accent)}.fv-bars i:last-child{background:repeating-linear-gradient(135deg,#b5b4b0 0 2px,#58585b 2px 4px)}
        .fv-dlabel{font-size:10px;line-height:1.1;padding:5px 0;display:block;color:#aaa9a6}.fv-dlabel small{display:block;font:inherit;color:#f4f2ee;font-weight:660;margin-top:2px}
        .fv .fv-inspect{display:flex;flex-wrap:wrap;gap:5px 18px;align-items:baseline;min-height:39px;border-top:1px solid var(--fv-line);padding:9px 0;font-size:12px;color:#b7b5b2}
        .fv-inspect b{color:var(--fv-accent)}.fv-inspect strong{color:var(--fv-ink)}
        .fv-scroll{max-width:100%;overflow:auto}.fv table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;color:inherit}
        .fv .fv-scroll th,.fv .fv-scroll td{padding:9px 11px;background:transparent;color:var(--fv-ink);border:0;border-bottom:1px solid var(--fv-line);text-align:right;vertical-align:middle;line-height:1.35}
        .fv .fv-scroll th{background:#27272a;color:#c6c4c0;font-weight:620}.fv .fv-scroll th:first-child,.fv .fv-scroll td:first-child{text-align:left}
        .fv .fv-score td:nth-child(3){color:var(--fv-accent);font-weight:730}.fv table.fv-detail{font-size:13px;min-width:720px}.fv-detail td:first-child{white-space:nowrap}
        .fv details{margin-top:9px;border-top:1px solid var(--fv-line)}.fv summary{font-weight:630;padding:11px 0}.fv details p{margin:0 0 8px;max-width:85ch;font-size:14px}
        .fv .fv-note{padding:10px 0;margin:0;color:#e1dcd6;font-size:14px}.fv .fv-quiet{color:#aaa9a6;font-size:13px}
        @media(max-width:620px){.fv-chart{padding:14px 12px 0}.fv-weeks{grid-template-columns:1fr;gap:12px}.fv-ys,.fv-bars{height:68px}.fv-window{grid-template-columns:2fr 1fr}.fv-controls{align-items:flex-start;gap:8px}.fv .fv-scroll th,.fv .fv-scroll td{padding:6px 4px}.fv-window div{font-size:11px}.fv .fv-inspect{gap:4px 11px}.fv label{font-size:13px}}
      </style>
      <section class="fv" aria-label="Проверка качества прогноза">
        <div class="fv-window"><div>56 дней учебной истории · 24 августа – 18 октября</div><div>14 дней проверки · 19 октября – 1 ноября</div></div>
        <div class="fv-controls">
          <label>История для медианы
            <select data-fv="weeks"><option value="4">4 последние недели</option><option value="8">Все 8 недель</option></select>
          </label>
          <label><input type="checkbox" data-fv="spike">Добавить 70 напитков к продажам 15 октября</label>
        </div>
        <div data-fv="chart" class="fv-chart"></div>
        <div class="fv-scroll"><table class="fv-score" aria-label="Сравнение ошибок прогнозов">
          <thead><tr><th scope="col">Метод</th><th scope="col">MAE, шт./день</th><th scope="col">WAPE</th><th scope="col">Сумма ошибок, шт.</th></tr></thead>
          <tbody data-fv="metrics"></tbody>
        </table></div>
        <div data-fv="status" class="fv-note" role="status"></div>
        <details><summary>Как получены прогноз и ошибки</summary>
          <p>Вечером 18 октября 2026 года фиксируем оба прогноза на 14 дней. Первый усредняет два средних из 4 или 8 продаж в тот же день недели, второй повторяет соответствующий день 12–18 октября. Данные контрольного периода в прогноз не входят.</p>
          <p>MAE — сумма абсолютных ошибок, делённая на 14 дней. WAPE — та же сумма, делённая на все фактические продажи контрольного периода и умноженная на 100%. При нулевых суммарных продажах WAPE не определён. Меньшая ошибка соответствует более точному прогнозу.</p>
          <p class="fv-quiet">Продажи приравнены к спросу. Для проверки на реальной точке понадобятся отметки о недоступных позициях, праздниках и акциях. Ошибка на этом учебном ряду не измеряет снижение списаний.</p>
        </details>
        <details><summary>Дневные продажи и расчёт ошибок</summary>
          <div class="fv-actions">
            <label>Строки <select data-fv="view"><option value="test">Проверка · 14 дней</option><option value="train">Обучение · 56 дней</option><option value="all">Весь ряд · 70 дней</option></select></label>
            <button type="button" data-fv="download">Скачать 70 строк CSV</button>
          </div>
          <div class="fv-scroll"><table class="fv-detail" aria-label="Дневные продажи и ошибки, в напитках">
            <thead><tr><th scope="col">Дата</th><th scope="col">Выборка</th><th scope="col">Исходные продажи</th><th scope="col">Продажи в сценарии</th><th scope="col">Медиана</th><th scope="col">Прошлая неделя</th><th scope="col">Ошибка медианы</th><th scope="col">Ошибка прошлой недели</th></tr></thead>
            <tbody data-fv="rows"></tbody>
          </table></div>
        </details>
      </section>`;

    const pick = name => root.querySelector('[data-fv="' + name + '"]');
    const weeksInput = pick('weeks'), spikeInput = pick('spike'), viewInput = pick('view');
    let result;
    function drawRows() {
      const subset = result.rows.filter(r => viewInput.value === 'all' || (viewInput.value === 'train') === r.learn);
      const cell = n => n == null ? '—' : print(n);
      pick('rows').innerHTML = subset.map(r => {
        const [year, month, day] = r.date.split('-');
        return '<tr><td>' + day + '.' + month + '.' + year + ' ' + r.weekday + '</td><td>' +
          (r.learn ? 'Обучение' : 'Проверка') + '</td><td>' + r.raw + '</td><td>' + r.observed +
          '</td><td>' + cell(r.predicted?.median) + '</td><td>' + cell(r.predicted?.previous) +
          '</td><td>' + cell(r.difference?.median) + '</td><td>' + cell(r.difference?.previous) + '</td></tr>';
      }).join('');
    }
    function update() {
      const weeks = Number(weeksInput.value);
      result = evaluate(weeks, spikeInput.checked);
      const chart=pick('chart'),test=result.rows.slice(trainingDays);
      const wasSpike=chart.dataset.spike==='true';
      const activeDay=spikeInput.checked&&!wasSpike?3:Number(chart.dataset.selected??3);
      chart.dataset.spike=String(spikeInput.checked);
      paintErrors(chart,test,activeDay);
      pick('metrics').innerHTML = [['Медиана по дням недели', result.median], ['Повтор прошлой недели', result.previous]]
        .map(([name, s]) => '<tr><td>' + name + '</td><td>' + print(s.mae) + '</td><td>' +
          (s.wape === null ? 'Не определён' : print(s.wape) + '%') + '</td><td>' + print(s.errors) + '</td></tr>').join('');
      const winner = result.median.errors < result.previous.errors ? 'Точнее медиана.' :
        result.median.errors > result.previous.errors ? 'Точнее повтор прошлой недели.' : 'Суммарная ошибка обоих методов одинакова.';
      const intervention = spikeInput.checked ?
        'В учебной истории за 15 октября вместо 40 продано 110 напитков. ' : '';
      const thu = result.byDay[3];
      pick('status').textContent = intervention + 'Прогноз на четверг — ' +
        print(thu.median) + ' шт. по медиане и ' + print(thu.previous) + ' шт. по прошлой неделе. ' + winner;
      drawRows();
    }
    weeksInput.addEventListener('change', update);
    spikeInput.addEventListener('change', update);
    viewInput.addEventListener('change', drawRows);
    pick('download').addEventListener('click', () => exportCsv(result, Number(weeksInput.value), spikeInput.checked));
    update();
  };
})();
