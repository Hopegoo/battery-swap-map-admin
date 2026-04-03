// ===== 骑手部落后台数据管理系统 =====

// 数据存储（localStorage持久化）
let db = {
  shop: [],
  swap: [],
  driving: [],
  rest: []
}

// 页面加载时恢复数据
window.onload = function () {
  // 检查登录状态
  const isLoggedIn = sessionStorage.getItem('admin_logged_in') === 'true'
  if (!isLoggedIn) {
    return // 未登录，不初始化后台数据
  }
  
  loadFromStorage()
  updateStats()
  renderAllLists()
}

// ===== 数据持久化 =====
function saveToStorage() {
  localStorage.setItem('admin_db', JSON.stringify(db))
}

function loadFromStorage() {
  const raw = localStorage.getItem('admin_db')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      db.shop    = parsed.shop    || []
      db.swap    = parsed.swap    || []
      db.driving = parsed.driving || []
      db.rest    = parsed.rest    || []
    } catch(e) {
      console.error('数据解析失败', e)
    }
  }
}

// ===== Tab 切换 =====
function switchTab(tabName, el) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('tab-' + tabName).classList.add('active')
  if (el) el.classList.add('active')
}

// ===== 快捷标签拼接 =====
function appendTag(fieldId, tag) {
  const el = document.getElementById(fieldId)
  if (!el) return
  const cur = el.value.trim()
  const arr = cur ? cur.split(',').map(s => s.trim()).filter(Boolean) : []
  if (!arr.includes(tag)) {
    arr.push(tag)
    el.value = arr.join(',')
  }
}

// ===== 坐标解析（腾讯地图API） =====
function pickCoordinate(type) {
  const addressField = document.getElementById(type + '-address')
  const cityField    = document.getElementById(type + '-city')
  if (!addressField || !addressField.value.trim()) {
    showToast('请先填写详细地址', 'error')
    return
  }
  const addr = (cityField ? cityField.value : '') + addressField.value.trim()
  const url  = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(addr)}&key=OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77&output=jsonp&callback=onCoordResult_${type}`

  // 缓存当前type供回调用
  window['_pendingCoordType'] = type

  const script = document.createElement('script')
  script.src = url
  script.id = 'coord-script'
  document.body.appendChild(script)
  setTimeout(() => {
    const s = document.getElementById('coord-script')
    if (s) s.remove()
  }, 5000)
}

// 腾讯地图JSONP回调（动态生成）
;['shop','swap','driving','rest'].forEach(t => {
  window['onCoordResult_' + t] = function(res) {
    if (res.status === 0 && res.result) {
      const loc = res.result.location
      document.getElementById(t + '-longitude').value = loc.lng.toFixed(6)
      document.getElementById(t + '-latitude').value  = loc.lat.toFixed(6)
      showToast('坐标获取成功 ✅', 'success')
    } else {
      showToast('坐标获取失败，请手动填写', 'error')
    }
  }
})

// ===== 生成唯一ID =====
function genId(type, city) {
  const cityPinyin = {
    '西安': 'xian', '长沙': 'changsha', '其他': 'other'
  }
  const prefix = (cityPinyin[city] || 'city') + '_' + type + '_'
  const existing = db[type].filter(d => d.id.startsWith(prefix))
  const num = String(existing.length + 1).padStart(3, '0')
  return prefix + num
}

// ===== 表单读取工具 =====
function getVal(id) {
  const el = document.getElementById(id)
  return el ? el.value.trim() : ''
}
function getNum(id) {
  const v = parseFloat(getVal(id))
  return isNaN(v) ? null : v
}
function getArr(id) {
  const v = getVal(id)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}
function getChecked(cls) {
  return Array.from(document.querySelectorAll(`.${cls}:checked`)).map(el => el.value)
}

// ===== 表单验证 =====
function validate(type) {
  const name = getVal(type + '-name')
  const addr = getVal(type + '-address')
  const lng  = getNum(type + '-longitude')
  const lat  = getNum(type + '-latitude')
  if (!name)         { showToast('请填写名称', 'error'); return false }
  if (!addr)         { showToast('请填写地址', 'error'); return false }
  if (lng === null)  { showToast('请填写经度', 'error'); return false }
  if (lat === null)  { showToast('请填写纬度', 'error'); return false }
  return true
}

// ===== 提交表单 =====
function submitForm(type) {
  if (!validate(type)) return

  const city = getVal(type + '-city') || '西安'
  let entry = {
    id:            genId(type, city),
    type:          type,
    name:          getVal(type + '-name'),
    address:       getVal(type + '-address'),
    longitude:     getNum(type + '-longitude'),
    latitude:      getNum(type + '-latitude'),
    city:          city,
    status:        getVal(type + '-status') || 'operating',
    contact:       getVal(type + '-contact') || '',
    businessHours: getVal(type + '-businessHours') || '',
  }

  // 各类型专属字段
  if (type === 'shop') {
    entry.brands   = getArr('shop-brands')
    entry.services = getArr('shop-services')
    const r = getNum('shop-rating')
    const rc = getNum('shop-ratingCount')
    if (r !== null)  entry.rating      = r
    if (rc !== null) entry.ratingCount = rc
  }

  if (type === 'swap') {
    const brandMap = {
      tietac: '铁塔换电', xiaoha: '小哈换电',
      zhizu: '智租换电', echange: 'e换电', other: '其他'
    }
    entry.brandCode        = getVal('swap-brandCode')
    entry.brand            = brandMap[entry.brandCode] || '其他'
    entry.voltages         = getChecked('swap-voltage')
    entry.batteryTotal     = getNum('swap-batteryTotal')     || 0
    entry.batteryAvailable = getNum('swap-batteryAvailable') || 0
    entry.batteryCharging  = getNum('swap-batteryCharging')  || 0
    entry.batteryEmpty     = entry.batteryTotal - entry.batteryAvailable - entry.batteryCharging
    const price = getNum('swap-price')
    if (price !== null) entry.price = price
  }

  if (type === 'driving') {
    entry.subjects     = getChecked('driving-subject')
    entry.tags         = getArr('driving-tags')
    entry.duration     = getVal('driving-duration')
    const mp  = getNum('driving-motoPrice')
    const c1p = getNum('driving-c1Price')
    const r   = getNum('driving-rating')
    const rc  = getNum('driving-ratingCount')
    if (mp !== null)  entry.motoPrice   = mp
    if (c1p !== null) entry.c1Price     = c1p
    if (r !== null)   entry.rating      = r
    if (rc !== null)  entry.ratingCount = rc
  }

  if (type === 'rest') {
    const rawServices = getChecked('rest-service')
    entry.services = rawServices.map(s => {
      try { return JSON.parse(s) } catch(e) { return { icon: '✅', name: s } }
    })
  }

  // 存入数据库
  db[type].push(entry)
  saveToStorage()
  updateStats()
  renderList(type)
  clearForm(type)
  showToast('录入成功 ✅', 'success')
}

// ===== 清空表单 =====
function clearForm(type) {
  const panel = document.getElementById('tab-' + type)
  panel.querySelectorAll('input[type=text], input[type=number]').forEach(el => { el.value = '' })
  panel.querySelectorAll('input[type=checkbox]').forEach(el => { el.checked = false })
  panel.querySelectorAll('select').forEach(el => { el.selectedIndex = 0 })
}

// ===== 删除条目 =====
function deleteItem(type, id) {
  if (!confirm('确认删除该条记录？')) return
  db[type] = db[type].filter(d => d.id !== id)
  saveToStorage()
  updateStats()
  renderList(type)
  showToast('已删除', 'error')
}

// ===== 渲染列表 =====
function renderAllLists() {
  ['shop', 'swap', 'driving', 'rest'].forEach(t => renderList(t))
}

function renderList(type) {
  const container = document.getElementById(type + '-list')
  const countEl   = document.getElementById(type + '-list-count')
  const list = db[type]
  if (countEl) countEl.textContent = list.length

  if (!container) return
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-tip">暂无数据，请录入</div>'
    return
  }

  container.innerHTML = list.map((item, idx) => {
    const typeLabel = { shop: '🛵 车行', swap: '⚡ 换电', driving: '🏫 驾校', rest: '🏠 驿站' }[type]
    let meta = `${item.city} · ${item.address}`
    let tags = []

    if (type === 'shop' && item.brands)     tags = item.brands
    if (type === 'swap' && item.brand)      tags = [item.brand, ...(item.voltages || [])]
    if (type === 'driving' && item.subjects) tags = item.subjects
    if (type === 'rest' && item.services)   tags = item.services.map(s => s.name || s)

    return `
      <div class="data-item">
        <div class="data-item-info">
          <div class="data-item-name">${item.name}</div>
          <div class="data-item-meta">${meta}</div>
          <div class="data-item-tags">
            ${tags.slice(0,5).map(t => `<span class="data-item-tag">${t}</span>`).join('')}
          </div>
        </div>
        <div class="data-item-actions">
          <button class="btn btn-danger" onclick="deleteItem('${type}', '${item.id}')">🗑 删除</button>
        </div>
      </div>
    `
  }).join('')
}

// ===== 统计更新 =====
function updateStats() {
  ;['shop', 'swap', 'driving', 'rest'].forEach(t => {
    const el = document.getElementById('stat-' + t)
    if (el) el.textContent = db[t].length
  })
}

// ===== 生成 stations.js 代码 =====
function generateStationsCode() {
  const all = [...db.shop, ...db.swap, ...db.driving, ...db.rest]
  if (all.length === 0) return '// 暂无数据'

  const json = JSON.stringify(all, null, 2)
  return `// 点位数据 - 由后台管理系统导出
// 生成时间：${new Date().toLocaleString('zh-CN')}
// 总数：${all.length} 条（车行${db.shop.length} / 换电${db.swap.length} / 驾校${db.driving.length} / 驿站${db.rest.length}）

const stations = ${json}

module.exports = stations`
}

// ===== 预览数据 =====
function previewData() {
  const code = generateStationsCode()
  document.getElementById('preview-code').textContent = code
  document.getElementById('preview-modal').classList.add('open')
}

// ===== 关闭弹窗 =====
function closeModal() {
  document.getElementById('preview-modal').classList.remove('open')
}

// 点击遮罩关闭
document.getElementById('preview-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal()
})

// ===== 复制代码 =====
function copyCode() {
  const code = document.getElementById('preview-code').textContent
  navigator.clipboard.writeText(code).then(() => {
    showToast('代码已复制到剪贴板 ✅', 'success')
  }).catch(() => {
    showToast('复制失败，请手动选中复制', 'error')
  })
}

// ===== 下载文件 =====
function downloadFile() {
  const code = generateStationsCode()
  const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'stations.js'
  a.click()
  URL.revokeObjectURL(url)
  showToast('文件已下载', 'success')
}

// ===== 导出 =====
function exportData() {
  const all = [...db.shop, ...db.swap, ...db.driving, ...db.rest]
  if (all.length === 0) { showToast('暂无数据可导出', 'error'); return }
  downloadFile()
}

// ===== 查看全部数据 =====
function showAllData() {
  previewData()
}

// ===== 同步换电品牌名称 =====
function syncSwapBrand() {
  const brandMap = {
    tietac: '铁塔换电站', xiaoha: '小哈换电站',
    zhizu: '智租换电站', echange: 'e换电站', other: '换电站'
  }
  const code = document.getElementById('swap-brandCode').value
  const nameEl = document.getElementById('swap-name')
  if (nameEl && !nameEl.value) {
    nameEl.placeholder = `例：钟楼${brandMap[code] || '换电站'}`
  }
}

// ===== Toast 通知 =====
function showToast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast ' + type + ' show'
  setTimeout(() => { el.classList.remove('show') }, 2500)
}

// ===== 营销方案管理 =====
let campaignDb = {
  campaigns: [],
  registrations: []
}

// 页面加载时恢复营销方案数据
function loadCampaignFromStorage() {
  const raw = localStorage.getItem('campaign_db')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      campaignDb.campaigns = parsed.campaigns || []
      campaignDb.registrations = parsed.registrations || []
    } catch(e) {
      console.error('营销方案数据解析失败', e)
    }
  }
  renderCampaignList()
  updateRegistrationStats()
  populateCampaignSelect()
}

// 保存营销方案数据
function saveCampaignToStorage() {
  localStorage.setItem('campaign_db', JSON.stringify(campaignDb))
}

// 渲染营销方案列表
function renderCampaignList() {
  const container = document.getElementById('campaign-list')
  const countEl = document.getElementById('campaign-list-count')
  const list = campaignDb.campaigns
  if (countEl) countEl.textContent = list.length
  if (!container) return

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-tip">暂无方案，请创建</div>'
    return
  }

  container.innerHTML = list.map(item => {
    const statusMap = { active: '✅ 生效中', draft: '📝 草稿', expired: '⏰ 已过期' }
    const moduleMap = { license: '摩托驾照', health: '健康证', recruit: '骑手招募', trade: '二手交易' }
    return `
      <div class="data-item">
        <div class="data-item-info">
          <div class="data-item-name">${item.title}</div>
          <div class="data-item-meta">
            ${moduleMap[item.module] || item.module} · ${statusMap[item.status] || item.status}
            ${item.price ? ` · ¥${item.price}` : ''}
          </div>
          <div class="data-item-tags">
            <span class="data-item-tag">ID: ${item.id}</span>
            ${item.startDate ? `<span class="data-item-tag">${item.startDate}</span>` : ''}
            ${item.endDate ? `<span class="data-item-tag">至 ${item.endDate}</span>` : ''}
          </div>
        </div>
        <div class="data-item-actions">
          <button class="btn btn-outline" onclick="editCampaign('${item.id}')">✏️ 编辑</button>
          <button class="btn btn-secondary" onclick="generateLinkForCampaign('${item.id}')">🔗 生成链接</button>
          <button class="btn btn-danger" onclick="deleteCampaign('${item.id}')">🗑 删除</button>
        </div>
      </div>
    `
  }).join('')
}

// 提交营销方案
function submitCampaign() {
  const title = getVal('campaign-title')
  if (!title) {
    showToast('请填写方案标题', 'error')
    return
  }

  const _editIdEl = document.getElementById('campaign-edit-id')
  const existingId = _editIdEl ? _editIdEl.value : undefined
  const entry = {
    id: existingId || 'camp_' + Date.now(),
    title: title,
    module: getVal('campaign-module'),
    status: getVal('campaign-status'),
    price: getNum('campaign-price'),
    originalPrice: getNum('campaign-originalPrice'),
    startDate: getVal('campaign-startDate'),
    endDate: getVal('campaign-endDate'),
    cover: getVal('campaign-cover'),
    qrcode: getVal('campaign-qrcode'),
    content: getVal('campaign-content'),
    contact: getVal('campaign-contact'),
    createTime: existingId ? (function() { var c = campaignDb.campaigns.find(function(c) { return c.id === existingId }); return c ? c.createTime : new Date().toISOString(); })() : new Date().toISOString(),
    updateTime: new Date().toISOString()
  }

  if (existingId) {
    // 更新现有方案
    const idx = campaignDb.campaigns.findIndex(c => c.id === existingId)
    if (idx !== -1) {
      campaignDb.campaigns[idx] = entry
    }
    showToast('方案已更新 ✅', 'success')
  } else {
    // 新增方案
    campaignDb.campaigns.push(entry)
    showToast('方案创建成功 ✅', 'success')
  }

  saveCampaignToStorage()
  renderCampaignList()
  populateCampaignSelect()
  clearCampaignForm()
}

// 编辑方案
function editCampaign(id) {
  const item = campaignDb.campaigns.find(c => c.id === id)
  if (!item) return

  // 填充表单
  document.getElementById('campaign-title').value = item.title || ''
  document.getElementById('campaign-module').value = item.module || 'license'
  document.getElementById('campaign-status').value = item.status || 'draft'
  document.getElementById('campaign-price').value = item.price || ''
  document.getElementById('campaign-originalPrice').value = item.originalPrice || ''
  document.getElementById('campaign-startDate').value = item.startDate || ''
  document.getElementById('campaign-endDate').value = item.endDate || ''
  document.getElementById('campaign-cover').value = item.cover || ''
  document.getElementById('campaign-qrcode').value = item.qrcode || ''
  document.getElementById('campaign-content').value = item.content || ''
  document.getElementById('campaign-contact').value = item.contact || ''

  // 添加编辑ID标识
  let editIdEl = document.getElementById('campaign-edit-id')
  if (!editIdEl) {
    editIdEl = document.createElement('input')
    editIdEl.type = 'hidden'
    editIdEl.id = 'campaign-edit-id'
    document.getElementById('tab-campaign').appendChild(editIdEl)
  }
  editIdEl.value = id

  showToast('已加载方案，点击保存更新', 'success')
}

// 删除方案
function deleteCampaign(id) {
  if (!confirm('确认删除该方案？删除后相关链接将失效。')) return
  campaignDb.campaigns = campaignDb.campaigns.filter(c => c.id !== id)
  saveCampaignToStorage()
  renderCampaignList()
  populateCampaignSelect()
  showToast('方案已删除', 'error')
}

// 清空方案表单
function clearCampaignForm() {
  document.getElementById('campaign-title').value = ''
  document.getElementById('campaign-module').selectedIndex = 0
  document.getElementById('campaign-status').selectedIndex = 0
  document.getElementById('campaign-price').value = ''
  document.getElementById('campaign-originalPrice').value = ''
  document.getElementById('campaign-startDate').value = ''
  document.getElementById('campaign-endDate').value = ''
  document.getElementById('campaign-cover').value = ''
  document.getElementById('campaign-qrcode').value = ''
  document.getElementById('campaign-content').value = ''
  document.getElementById('campaign-contact').value = ''
  const editIdEl = document.getElementById('campaign-edit-id')
  if (editIdEl) editIdEl.remove()
}

// ===== 外链生成 =====
function populateCampaignSelect() {
  const select = document.getElementById('link-campaign')
  if (!select) return
  const html = '<option value="">-- 请选择方案 --</option>' +
    campaignDb.campaigns
      .filter(c => c.status === 'active')
      .map(c => `<option value="${c.id}">${c.title}</option>`)
      .join('')
  select.innerHTML = html
}

function updateLinkPreview() {
  const campaignId = document.getElementById('link-campaign').value
  const appid = document.getElementById('link-appid').value
  const path = document.getElementById('link-path').value
  const linkUrl = document.getElementById('link-url')

  if (!campaignId) {
    linkUrl.value = ''
    return
  }

  // 微信小程序URL Scheme格式
  const encodedPath = encodeURIComponent(`${path}?id=${campaignId}`)
  const url = `weixin://dl/business/?t=${campaignId}`

  // 也生成普通H5备用链接
  const h5Url = `https://wxaurl.com/${campaignId}`

  linkUrl.value = url
  document.getElementById('link-scene').value = campaignId
}

function copyLink() {
  const url = document.getElementById('link-url').value
  if (!url) {
    showToast('请先选择营销方案', 'error')
    return
  }
  navigator.clipboard.writeText(url).then(() => {
    showToast('链接已复制 ✅', 'success')
  }).catch(() => {
    showToast('复制失败，请手动复制', 'error')
  })
}

function generateQRCode() {
  const url = document.getElementById('link-url').value
  if (!url) {
    showToast('请先选择营销方案', 'error')
    return
  }

  // 使用QRCode.js生成二维码
  const canvas = document.getElementById('qrcode-canvas')
  if (!canvas) {
    showToast('二维码画布不存在', 'error')
    return
  }

  // 动态加载QRCode.js
  if (!window.QRCode) {
    const script = document.createElement('script')
    script.src = 'https://cdn.bootcdn.net/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    script.onload = () => drawQRCode(url)
    document.body.appendChild(script)
  } else {
    drawQRCode(url)
  }
}

function drawQRCode(url) {
  const box = document.getElementById('qrcode-box')
  box.innerHTML = '<canvas id="qrcode-canvas"></canvas>'
  new QRCode(document.getElementById('qrcode-canvas'), {
    text: url,
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff'
  })
  document.getElementById('qrcode-preview').style.display = 'block'
}

function downloadQRCode() {
  const canvas = document.getElementById('qrcode-canvas')
  if (!canvas) {
    showToast('请先生成二维码', 'error')
    return
  }

  const link = document.createElement('a')
  link.download = 'campaign_qrcode.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
  showToast('二维码已下载 ✅', 'success')
}

function generateLinkForCampaign(id) {
  switchTab('linkgen')
  document.getElementById('link-campaign').value = id
  updateLinkPreview()
  showToast('已选择方案，可生成链接和二维码', 'success')
}

// ===== 报名管理 =====
function updateRegistrationStats() {
  const regs = campaignDb.registrations
  const total = regs.length
  const confirmed = regs.filter(r => r.status === 'confirmed').length
  const pending = regs.filter(r => r.status === 'pending').length

  const elTotal = document.getElementById('reg-total')
  const elConfirmed = document.getElementById('reg-confirmed')
  const elPending = document.getElementById('reg-pending')
  const countEl = document.getElementById('reg-list-count')

  if (elTotal) elTotal.textContent = total
  if (elConfirmed) elConfirmed.textContent = confirmed
  if (elPending) elPending.textContent = pending
  if (countEl) countEl.textContent = total

  renderRegistrationList()
}

function renderRegistrationList() {
  const container = document.getElementById('reg-list')
  if (!container) return
  const regs = campaignDb.registrations

  if (regs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无报名数据</p>
        <p class="hint">用户通过外链报名后，数据将显示在这里</p>
      </div>
    `
    return
  }

  container.innerHTML = regs.map(r => {
    const statusMap = { pending: '⏳ 待处理', confirmed: '✅ 已确认', rejected: '❌ 已拒绝' }
    return `
      <div class="data-item">
        <div class="data-item-info">
          <div class="data-item-name">${r.name}</div>
          <div class="data-item-meta">
            📱 ${r.phone} · ${statusMap[r.status] || r.status}
          </div>
          <div class="data-item-tags">
            <span class="data-item-tag">方案: ${r.campaignTitle || r.campaignId}</span>
            <span class="data-item-tag">报名时间: ${new Date(r.createTime).toLocaleString('zh-CN')}</span>
          </div>
          ${r.note ? `<div class="data-item-meta" style="margin-top:4px">备注: ${r.note}</div>` : ''}
        </div>
        <div class="data-item-actions">
          <button class="btn btn-primary" onclick="confirmRegistration('${r.id}')">✅ 确认</button>
          <button class="btn btn-outline" onclick="rejectRegistration('${r.id}')">❌ 拒绝</button>
        </div>
      </div>
    `
  }).join('')
}

function confirmRegistration(id) {
  const reg = campaignDb.registrations.find(r => r.id === id)
  if (reg) {
    reg.status = 'confirmed'
    saveCampaignToStorage()
    updateRegistrationStats()
    showToast('已确认报名', 'success')
  }
}

function rejectRegistration(id) {
  const reg = campaignDb.registrations.find(r => r.id === id)
  if (reg) {
    reg.status = 'rejected'
    saveCampaignToStorage()
    updateRegistrationStats()
    showToast('已拒绝', 'error')
  }
}

// 页面加载时初始化
window.onload = function () {
  // 检查登录状态
  checkLogin()
  
  // 只有登录后才初始化其他数据
  if (sessionStorage.getItem('admin_logged_in') === 'true') {
    loadFromStorage()
    updateStats()
    renderAllLists()
    loadCampaignFromStorage()
    
    // 添加退出按钮
    setTimeout(function() {
      var headerActions = document.querySelector('.header-actions')
      if (headerActions) {
        var logoutBtn = document.createElement('button')
        logoutBtn.className = 'btn btn-outline'
        logoutBtn.onclick = logout
        logoutBtn.textContent = '🚪 退出'
        logoutBtn.style.marginLeft = '10px'
        headerActions.appendChild(logoutBtn)
      }
    }, 100)
  }
}
