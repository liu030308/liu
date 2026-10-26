(() => {
  'use strict';
  const STORAGE_KEY = 'junwei-shipping-calculator-v2';
  const DEFAULT_PRESETS = ['成員 A', '成員 B', '成員 C'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const list = $('#member-list');
  const template = $('#member-template');
  const error = $('#form-error');
  let result = [];
  let products = [];
  const traditional = text => window.OpenCC ? OpenCC.Converter({ from: 'cn', to: 'tw' })(String(text)) : String(text);
  const refreshProducts = () => {
    document.querySelectorAll('.product-select').forEach(select => {
      select.replaceChildren(new Option('選擇物品，自動加入重量', ''));
      products.forEach((item, index) => select.add(new Option(`${item.name}（${item.weight} 公斤）`, String(index))));
    });
  };

  const readState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {
        shipping: saved?.shipping ?? '',
        taxEnabled: Boolean(saved?.taxEnabled),
        tax: saved?.tax ?? '',
        presets: Array.isArray(saved?.presets) ? saved.presets : DEFAULT_PRESETS,
        members: Array.isArray(saved?.members) && saved.members.length ? saved.members : [{ name: '', weight: '' }],
        theme: saved?.theme || 'dark'
      };
    } catch { return { shipping: '', taxEnabled: false, tax: '', presets: DEFAULT_PRESETS, members: [{ name: '', weight: '' }], theme: 'dark' }; }
  };
  let state = readState();

  const parseWeight = (value) => {
    const normalized = value.replace(/kg/gi, '').trim();
    if (!normalized || !/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*$/.test(normalized)) return null;
    const total = normalized.split('+').reduce((sum, part) => sum + Number(part.trim()), 0);
    return Number.isFinite(total) && total > 0 ? total : null;
  };
  const money = (value) => `NT$ ${Math.round(value).toLocaleString('zh-TW')}`;
  const collectMembers = () => [...list.querySelectorAll('.member-row')].map(row => ({
    name: $('.member-name', row).value.trim(), weight: $('.member-weight', row).value.trim()
  }));
  const save = () => {
    state.shipping = $('#shipping').value;
    state.taxEnabled = $('#tax-enabled').checked;
    state.tax = $('#tax').value;
    state.members = collectMembers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };
  const updateSummary = () => {
    const members = collectMembers();
    const totalWeight = members.reduce((sum, m) => sum + (parseWeight(m.weight) || 0), 0);
    $('#summary-shipping').textContent = money(Number($('#shipping').value) || 0);
    $('#summary-tax').textContent = money($('#tax-enabled').checked ? Number($('#tax').value) || 0 : 0);
    $('#summary-weight').textContent = `${totalWeight.toFixed(2)} kg`;
    $('#summary-members').textContent = `${members.filter(m => m.name && parseWeight(m.weight)).length} 人`;
  };

  const addMember = (member = { name: '', weight: '' }, focus = false) => {
    const row = template.content.firstElementChild.cloneNode(true);
    $('.member-name', row).value = member.name || '';
    $('.member-weight', row).value = member.weight || '';
    const recalc = () => {
      const total = parseWeight($('.member-weight', row).value);
      $('.member-total', row).textContent = `${(total || 0).toFixed(2)} kg`;
      $('.member-weight', row).setAttribute('aria-invalid', String($('.member-weight', row).value.length > 0 && total === null));
      error.textContent = '';
      save(); updateSummary();
    };
    row.addEventListener('input', recalc);
    $('.product-select', row).addEventListener('change', event => {
      const item = products[Number(event.target.value)];
      if (event.target.value === '' || !item) return;
      const input = $('.member-weight', row);
      input.value = input.value.trim() ? `${input.value.trim()} + ${item.weight}` : String(item.weight);
      recalc(); event.target.value = '';
    });
    $('.remove-member', row).addEventListener('click', () => {
      row.remove();
      if (!list.children.length) addMember();
      save(); updateSummary();
    });
    const move = direction => {
      const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      direction < 0 ? list.insertBefore(row, sibling) : list.insertBefore(sibling, row);
      save();
    };
    $('.move-up', row).addEventListener('click', () => move(-1));
    $('.move-down', row).addEventListener('click', () => move(1));
    list.append(row); recalc(); refreshProducts();
    if (focus) $('.member-name', row).focus();
  };

  const renderPresets = () => {
    const wrap = $('#preset-list'); wrap.replaceChildren();
    state.presets.forEach((name, index) => {
      const chip = document.createElement('span'); chip.className = 'preset-chip';
      const add = document.createElement('button'); add.type = 'button'; add.textContent = `+ ${name}`;
      add.setAttribute('aria-label', `加入 ${name}`);
      add.addEventListener('click', () => addMember({ name, weight: '' }, false));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'delete-preset'; del.textContent = '×';
      del.setAttribute('aria-label', `刪除常用成員 ${name}`);
      del.addEventListener('click', () => { state.presets.splice(index, 1); save(); renderPresets(); });
      chip.append(add, del); wrap.append(chip);
    });
  };

  const calculate = () => {
    error.textContent = '';
    const shippingRaw = Number($('#shipping').value);
    const shipping = Math.round(shippingRaw);
    if (!Number.isFinite(shippingRaw) || shippingRaw <= 0 || shippingRaw !== shipping) {
      error.textContent = '請輸入大於 0 的整數運費。'; $('#shipping').focus(); return;
    }
    const taxEnabled = $('#tax-enabled').checked;
    const taxRaw = taxEnabled ? Number($('#tax').value) : 0;
    const tax = Math.round(taxRaw);
    if (taxEnabled && (!Number.isFinite(taxRaw) || taxRaw <= 0 || taxRaw !== tax)) {
      error.textContent = '請輸入大於 0 的整數稅金。'; $('#tax').focus(); return;
    }
    const rawMembers = collectMembers();
    if (!rawMembers.length) { error.textContent = '請至少新增一位成員。'; return; }
    const grouped = new Map();
    for (const [index, member] of rawMembers.entries()) {
      const weight = parseWeight(member.weight);
      if (!member.name) { error.textContent = `第 ${index + 1} 位成員尚未輸入姓名。`; return; }
      if (weight === null) { error.textContent = `「${member.name}」的重量格式不正確。`; return; }
      const current = grouped.get(member.name) || { name: member.name, weight: 0, order: grouped.size };
      current.weight += weight; grouped.set(member.name, current);
    }
    const members = [...grouped.values()];
    const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
    members.forEach(m => {
      m.exact = m.weight / totalWeight * shipping;
      m.share = Math.floor(m.exact);
      m.fraction = m.exact - m.share;
    });
    let remainder = shipping - members.reduce((sum, m) => sum + m.share, 0);
    [...members].sort((a, b) => b.fraction - a.fraction || a.order - b.order).slice(0, remainder).forEach(m => m.share++);
    const taxBase = Math.ceil(tax / members.length);
    members.forEach((m, index) => {
      m.taxShare = taxBase;
      m.totalShare = m.share + m.taxShare;
    });
    result = members;
    const tbody = $('#result-rows'); tbody.replaceChildren();
    members.forEach(m => {
      const tr = document.createElement('tr');
      [m.name, `${m.weight.toFixed(2)} kg`, `${(m.weight / totalWeight * 100).toFixed(1)}%`, money(m.share), money(m.taxShare), money(m.totalShare)].forEach(value => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      tbody.append(tr);
    });
    $('#result-weight').textContent = `${totalWeight.toFixed(2)} kg`;
    $('#result-shipping').textContent = money(shipping);
    $('#result-tax').textContent = money(taxBase * members.length);
    $('#result-total').textContent = money(shipping + taxBase * members.length);
    $('#empty-result').hidden = true; $('#result-content').hidden = false;
    $('#result-status').textContent = '計算完成'; $('#result-status').classList.add('ready');
    updateSummary(); save();
    if (innerWidth < 901) $('#result-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const resultText = () => {
    const totalWeight = result.reduce((sum, m) => sum + m.weight, 0);
    const shipping = result.reduce((sum, m) => sum + m.share, 0);
    const tax = result.reduce((sum, m) => sum + m.taxShare, 0);
    return ['📦 運費與稅金分攤明細', ...result.map(m => `${m.name}：${m.weight.toFixed(2)} kg → 運費 ${money(m.share)} + 稅金 ${money(m.taxShare)} = ${money(m.totalShare)}`), `總重：${totalWeight.toFixed(2)} kg`, `運費：${money(shipping)}`, `稅金：${money(tax)}`, `總計：${money(shipping + tax)}`].join('\n');
  };

  $('#shipping').value = state.shipping;
  $('#tax-enabled').checked = state.taxEnabled;
  $('#tax').value = state.tax;
  $('#tax-field').hidden = !state.taxEnabled;
  state.members.forEach(member => addMember(member));
  renderPresets(); updateSummary();
  document.documentElement.dataset.theme = state.theme;
  $('#theme-toggle').textContent = state.theme === 'light' ? '☀' : '☾';
  $('#shipping').addEventListener('input', () => { error.textContent = ''; save(); updateSummary(); });
  $('#tax').addEventListener('input', () => { error.textContent = ''; save(); updateSummary(); });
  $('#tax-enabled').addEventListener('change', () => {
    $('#tax-field').hidden = !$('#tax-enabled').checked; error.textContent = ''; save(); updateSummary();
    if ($('#tax-enabled').checked) $('#tax').focus();
  });
  $('#add-member').addEventListener('click', () => addMember(undefined, true));
  $('#calculate').addEventListener('click', calculate);
  $('#preset-form').addEventListener('submit', event => {
    event.preventDefault(); const input = $('#preset-name'); const name = input.value.trim();
    if (!name || state.presets.includes(name)) return;
    state.presets.push(name); input.value = ''; save(); renderPresets();
  });
  $('#clear-all').addEventListener('click', () => {
    $('#shipping').value = ''; $('#tax-enabled').checked = false; $('#tax').value = ''; $('#tax-field').hidden = true;
    list.replaceChildren(); addMember(); result = [];
    $('#empty-result').hidden = false; $('#result-content').hidden = true;
    $('#result-status').textContent = '尚未計算'; $('#result-status').classList.remove('ready');
    save(); updateSummary(); $('#shipping').focus();
  });
  $('#copy-result').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(resultText()); $('#copy-status').textContent = '已複製到剪貼簿。'; }
    catch { $('#copy-status').textContent = '複製失敗，請手動選取結果。'; }
  });
  $('#export-csv').addEventListener('click', () => {
    const rows = [['成員', '重量(kg)', '運費(NTD)', '稅金(NTD)', '應付(NTD)'], ...result.map(m => [m.name, m.weight.toFixed(2), m.share, m.taxShare, m.totalShare])];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '運費分攤結果.csv'; anchor.click(); URL.revokeObjectURL(url);
  });
  $('#export-list').addEventListener('click', () => {
    const payload = { format: 'junwei-shipping-list', version: 1, exportedAt: new Date().toISOString(), presets: state.presets, members: collectMembers() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '團購成員名單.json'; anchor.click(); URL.revokeObjectURL(url);
    $('#list-status').textContent = '名單已匯出。';
  });
  $('#import-list').addEventListener('click', () => $('#import-file').click());
  $('#import-products').addEventListener('click', () => $('#products-file').click());
  $('#products-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('size');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const imported = [];
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const headerIndex = rows.findIndex(row => row.some(cell => traditional(cell).trim() === '物品名稱') && row.some(cell => traditional(cell).trim() === '包裹重量'));
        if (headerIndex < 0) continue;
        const headers = rows[headerIndex].map(cell => traditional(cell).trim());
        const nameIndex = headers.indexOf('物品名稱'), weightIndex = headers.indexOf('包裹重量');
        for (const row of rows.slice(headerIndex + 1)) {
          const name = traditional(row[nameIndex]).trim();
          const weight = Number(String(row[weightIndex]).replace(/(?:kg|公斤|千克)/gi, '').trim());
          if (name && Number.isFinite(weight) && weight > 0) imported.push({ name, weight });
        }
      }
      if (!imported.length) throw new Error('empty');
      products = imported; refreshProducts();
      $('#products-status').textContent = `已匯入 ${products.length} 項物品，請在成員下方選擇物品。`;
    } catch { $('#products-status').textContent = '匯入失敗：請使用包含「物品名稱」與「包裹重量」欄位的 Excel 檔案。'; }
    event.target.value = '';
  });
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format !== 'junwei-shipping-list' || !Array.isArray(payload.members) || !payload.members.length || payload.members.length > 200) throw new Error('invalid');
      const members = payload.members.map(member => ({ name: String(member?.name || '').slice(0, 30), weight: String(member?.weight || '').slice(0, 100) }));
      if (Array.isArray(payload.presets)) state.presets = [...new Set(payload.presets.map(name => String(name).trim().slice(0, 30)).filter(Boolean))].slice(0, 100);
      list.replaceChildren(); members.forEach(member => addMember(member)); renderPresets(); save(); updateSummary();
      $('#list-status').textContent = `已匯入 ${members.length} 位成員。`;
    } catch { $('#list-status').textContent = '匯入失敗：請選擇由本工具匯出的 JSON 名單。'; }
    event.target.value = '';
  });
  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme;
    $('#theme-toggle').textContent = state.theme === 'light' ? '☀' : '☾'; save();
  });
})();
