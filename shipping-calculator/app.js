(() => {
  'use strict';
  const STORAGE_KEY = 'junwei-shipping-calculator-v2';
  const DEFAULT_PRESETS = ['成員 A', '成員 B', '成員 C'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const list = $('#member-list');
  const template = $('#member-template');
  const error = $('#form-error');
  let result = [];

  const readState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {
        shipping: saved?.shipping ?? '',
        presets: Array.isArray(saved?.presets) ? saved.presets : DEFAULT_PRESETS,
        members: Array.isArray(saved?.members) && saved.members.length ? saved.members : [{ name: '', weight: '' }],
        theme: saved?.theme || 'dark'
      };
    } catch { return { shipping: '', presets: DEFAULT_PRESETS, members: [{ name: '', weight: '' }], theme: 'dark' }; }
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
    state.members = collectMembers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };
  const updateSummary = () => {
    const members = collectMembers();
    const totalWeight = members.reduce((sum, m) => sum + (parseWeight(m.weight) || 0), 0);
    $('#summary-shipping').textContent = money(Number($('#shipping').value) || 0);
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
    list.append(row); recalc();
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
    result = members;
    const tbody = $('#result-rows'); tbody.replaceChildren();
    members.forEach(m => {
      const tr = document.createElement('tr');
      [m.name, `${m.weight.toFixed(2)} kg`, `${(m.weight / totalWeight * 100).toFixed(1)}%`, money(m.share)].forEach(value => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      tbody.append(tr);
    });
    $('#result-weight').textContent = `${totalWeight.toFixed(2)} kg`;
    $('#result-total').textContent = money(shipping);
    $('#empty-result').hidden = true; $('#result-content').hidden = false;
    $('#result-status').textContent = '計算完成'; $('#result-status').classList.add('ready');
    updateSummary(); save();
    if (innerWidth < 901) $('#result-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const resultText = () => {
    const totalWeight = result.reduce((sum, m) => sum + m.weight, 0);
    return ['📦 運費分攤明細', ...result.map(m => `${m.name}：${m.weight.toFixed(2)} kg → ${money(m.share)}`), `總重：${totalWeight.toFixed(2)} kg`, `總運費：${money(result.reduce((sum, m) => sum + m.share, 0))}`].join('\n');
  };

  $('#shipping').value = state.shipping;
  state.members.forEach(member => addMember(member));
  renderPresets(); updateSummary();
  document.documentElement.dataset.theme = state.theme;
  $('#theme-toggle').textContent = state.theme === 'light' ? '☀' : '☾';
  $('#shipping').addEventListener('input', () => { error.textContent = ''; save(); updateSummary(); });
  $('#add-member').addEventListener('click', () => addMember(undefined, true));
  $('#calculate').addEventListener('click', calculate);
  $('#preset-form').addEventListener('submit', event => {
    event.preventDefault(); const input = $('#preset-name'); const name = input.value.trim();
    if (!name || state.presets.includes(name)) return;
    state.presets.push(name); input.value = ''; save(); renderPresets();
  });
  $('#clear-all').addEventListener('click', () => {
    $('#shipping').value = ''; list.replaceChildren(); addMember(); result = [];
    $('#empty-result').hidden = false; $('#result-content').hidden = true;
    $('#result-status').textContent = '尚未計算'; $('#result-status').classList.remove('ready');
    save(); updateSummary(); $('#shipping').focus();
  });
  $('#copy-result').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(resultText()); $('#copy-status').textContent = '已複製到剪貼簿。'; }
    catch { $('#copy-status').textContent = '複製失敗，請手動選取結果。'; }
  });
  $('#export-csv').addEventListener('click', () => {
    const rows = [['成員', '重量(kg)', '應付(NTD)'], ...result.map(m => [m.name, m.weight.toFixed(2), m.share])];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '運費分攤結果.csv'; anchor.click(); URL.revokeObjectURL(url);
  });
  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme;
    $('#theme-toggle').textContent = state.theme === 'light' ? '☀' : '☾'; save();
  });
})();
