(() => {
  'use strict';
  const mounted = new WeakMap();
  const maxQuantity = 100000;
  const display = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 3});
  function copyGoods(items) {
    return items.map(g => ({...g, lots: g.lots.map(lot => [...lot])}));
  }
  function element(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  }
  window.mountStockEditor=function mountStockEditor({getGoods,onApply}){
    const dialog=document.getElementById('stock-dialog');
    const form=document.getElementById('stock-form');
    const fields=document.getElementById('stock-fields');
    const trigger=document.getElementById('edit-stock');
    if(!dialog||!form||!fields||!trigger)throw Error('Не найдены элементы диалога складских партий.');
    if(typeof getGoods!=='function'||typeof onApply!=='function')throw Error('Нужны getGoods и onApply для складского редактора.');
    mounted.get(dialog)?.();
    const listeners=new AbortController(),opts={signal:listeners.signal};
    const close=document.getElementById('close-stock'),cancel=document.getElementById('cancel-stock');
    const submit=form.querySelector('button[type=submit]');
    if(close.textContent.trim()==='@x')close.textContent='×';
    const heading=document.getElementById('stock-dialog-title');
    heading.setAttribute('tabindex','-1');
    let original=[],bindings=[],errorNode=null,submitting=false;
    form.noValidate=true;

    function createField(label,description,kind,initial,assign){
      const el=element(kind==='expiry'?'select':'input');
      if(kind==='expiry'){
        for(let day=1;day<=5;day++)el.add(new Option('День '+day,String(day)));
      }else{
        el.type='number';el.min='0';el.max=String(maxQuantity);el.step='0.001';
        el.inputMode='decimal';el.autocomplete='off';
      }
      el.required=true;el.value=String(initial);
      el.setAttribute('aria-label',description);el.dataset.stockKind=kind;
      const wrap=element('label','se-field');
      wrap.append(element('span','se-field-name',label),el);
      bindings.push({el,kind,description,assign});
      return wrap;
    }
    function openEditor(){
      if(dialog.open)return;
      original=copyGoods(getGoods());bindings=[];
      fields.replaceChildren();
      const guide=element('p','se-guide','Дни отсчитываются от начала плана. Подтверждённая поставка поступит утром Д2 и будет годна до конца Д3.');
      errorNode=element('p','se-error');errorNode.setAttribute('role','alert');errorNode.hidden=true;
      fields.append(guide,errorNode);
      original.forEach((g,i)=>{
        const group=element('fieldset','se-item');
        group.append(element('legend','',g.name));
        const meta=element('p','se-meta','Упаковка '+display.format(g.pack)+' '+g.u+' · расход '+display.format(g.rate)+' '+g.u+' на напиток');
        group.append(meta);
        for(const [j,[qty,day]] of g.lots.entries()){
          const row=element('div','se-lot');
          const lotLabel='Партия '+(j+1),context=g.name+', '+lotLabel.toLowerCase();
          row.append(element('span','se-lot-name',lotLabel),
            createField('Остаток, '+g.u,context+', остаток в '+g.u,'quantity',qty,
              (out,v)=>{out[i].lots[j][0]=v;}),
            createField('Годна до конца',context+', последний годный день','expiry',day,
              (out,v)=>{out[i].lots[j][1]=v;}));
          group.append(row);
        }
        const delivery=element('div','se-supply');
        delivery.append(
          createField('В пути к утру Д2, '+g.u,g.name+', подтверждённая поставка в '+g.u,'incoming',g.incoming,
            (out,v)=>{out[i].incoming=v;}),
          createField('Резерв к утру Д4, '+g.u,g.name+', резерв в '+g.u,'reserve',g.reserve,
            (out,v)=>{out[i].reserve=v;}));
        group.append(delivery);fields.append(group);
      });
      dialog.showModal();heading.focus({preventScroll:true});
      fields.scrollTop=0;
    }
    function errorFor(binding){
      const {el,kind}=binding;
      if(el.value.trim()==='')return 'Заполните поле.';
      const value=Number(el.value);
      if(kind==='expiry')return Number.isInteger(value)&&value>=1&&value<=5?'':'Выберите день от 1 до 5.';
      if(!Number.isFinite(value)||value<0||value>maxQuantity)return 'Введите число от 0 до 100 000.';
      if(el.validity.stepMismatch)return 'Используйте не более трёх знаков после запятой.';
      return el.validity.valid?'':'Проверьте число.';
    }
    function closeEditor(){if(!submitting&&dialog.open)dialog.close();}
    trigger.addEventListener('click',openEditor,opts);
    close.addEventListener('click',closeEditor,opts);
    cancel.addEventListener('click',closeEditor,opts);
    dialog.addEventListener('cancel',e=>{if(submitting)e.preventDefault();},opts);
    dialog.addEventListener('close',()=>{
      if(dialog.open)return;
      original=[];bindings=[];if(trigger.isConnected)trigger.focus({preventScroll:true});
    },opts);
    form.addEventListener('input',e=>{
      e.target.removeAttribute('aria-invalid');
      if(errorNode)errorNode.hidden=true;
    },opts);
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(submitting||!dialog.open)return;
      const next=copyGoods(original);
      for(const binding of bindings){
        const error=errorFor(binding);
        if(error){
          binding.el.setAttribute('aria-invalid','true');errorNode.hidden=false;
          errorNode.textContent=binding.description+'. '+error;
          binding.el.setCustomValidity(error);
          binding.el.focus();binding.el.reportValidity();binding.el.setCustomValidity('');
          return;
        }
        binding.assign(next,Number(binding.el.value));
      }
      submitting=true;submit.disabled=true;
      try{
        await onApply(next);
        if(dialog.open)dialog.close();
      }catch(error){
        errorNode.hidden=false;
        errorNode.textContent='Не удалось применить склад. '+(error?.message||'Попробуйте ещё раз.');
      }finally{submitting=false;submit.disabled=false;}
    },opts);
    const dispose=()=>{
      listeners.abort();if(dialog.open)dialog.close();mounted.delete(dialog);
    };
    mounted.set(dialog,dispose);
    return dispose;
  };
})();
