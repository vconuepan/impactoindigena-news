(function () {
  'use strict'

  var script = document.currentScript
  if (!script) return

  var config = {
    count: Math.min(5, Math.max(1, parseInt(script.getAttribute('data-count') || '3', 10) || 3)),
    issue: script.getAttribute('data-issue') || '',
    theme: script.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    title: script.getAttribute('data-title') || 'Voces Indígenas',
  }

  var API_BASE = 'https://api.vocesindigenas.org/api'
  var SITE_URL = 'https://vocesindigenas.org'

  // Create container with shadow DOM for style isolation
  var container = document.createElement('div')
  script.parentNode.insertBefore(container, script.nextSibling)
  var shadow = container.attachShadow({ mode: 'open' })

  var isDark = config.theme === 'dark'
  var bg = isDark ? '#1a1a1a' : '#ffffff'
  var text = isDark ? '#e5e5e5' : '#404040'
  var textMuted = isDark ? '#a3a3a3' : '#737373'
  var border = isDark ? '#333333' : '#e5e5e5'
  var accent = isDark ? '#93c5fd' : '#1d4ed8'
  var hoverBg = isDark ? '#262626' : '#f5f5f5'

  var style = document.createElement('style')
  style.textContent = [
    '.ar-widget { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:' + bg + '; border: 1px solid ' + border + '; border-radius: 8px; overflow: hidden; max-width: 400px; font-size: 14px; line-height: 1.5; color:' + text + '; }',
    '.ar-header { padding: 12px 16px; border-bottom: 1px solid ' + border + '; display: flex; align-items: center; gap: 8px; }',
    '.ar-header-icon { width: 14px; height: 14px; color:' + accent + '; }',
    '.ar-header-title { font-weight: 600; font-size: 13px; letter-spacing: 0.025em; }',
    '.ar-list { list-style: none; margin: 0; padding: 0; }',
    '.ar-item { padding: 10px 16px; border-bottom: 1px solid ' + border + '; }',
    '.ar-item:last-child { border-bottom: none; }',
    '.ar-item:hover { background:' + hoverBg + '; }',
    '.ar-link { text-decoration: none; color: inherit; display: block; }',
    '.ar-link:hover .ar-title { color:' + accent + '; }',
    '.ar-title { font-weight: 500; font-size: 14px; margin: 0 0 2px; transition: color 0.15s; }',
    '.ar-meta { font-size: 12px; color:' + textMuted + '; }',
    '.ar-footer { padding: 8px 16px; border-top: 1px solid ' + border + '; text-align: center; }',
    '.ar-footer a { font-size: 11px; color:' + textMuted + '; text-decoration: none; }',
    '.ar-footer a:hover { color:' + accent + '; }',
    '.ar-loading { padding: 24px 16px; text-align: center; color:' + textMuted + '; font-size: 13px; }',
    '.ar-error { padding: 16px; text-align: center; color: #ef4444; font-size: 13px; }',
  ].join('\n')
  shadow.appendChild(style)

  var widget = document.createElement('div')
  widget.className = 'ar-widget'
  widget.setAttribute('role', 'region')
  widget.setAttribute('aria-label', config.title)
  widget.innerHTML = '<div class="ar-loading">Loading stories...</div>'
  shadow.appendChild(widget)

  function timeAgo(dateStr) {
    var date = new Date(dateStr)
    var now = new Date()
    var seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    var minutes = Math.floor(seconds / 60)
    if (minutes < 60) return minutes + 'm ago'
    var hours = Math.floor(minutes / 60)
    if (hours < 24) return hours + 'h ago'
    var days = Math.floor(hours / 24)
    if (days < 30) return days + 'd ago'
    return date.toLocaleDateString()
  }

  function escapeHtml(str) {
    var div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  var params = new URLSearchParams()
  params.set('pageSize', String(config.count))
  params.set('page', '1')
  if (config.issue) params.set('issueSlug', config.issue)

  var url = API_BASE + '/stories?' + params.toString()

  var xhr = new XMLHttpRequest()
  xhr.open('GET', url)
  xhr.onload = function () {
    if (xhr.status !== 200) {
      widget.innerHTML = '<div class="ar-error">Could not load stories</div>'
      return
    }
    try {
      var data = JSON.parse(xhr.responseText)
      var stories = data.data || []
      if (stories.length === 0) {
        widget.innerHTML = '<div class="ar-loading">No stories available</div>'
        return
      }
      var html = '<div class="ar-header">'
      html += '<svg class="ar-header-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
      html += '<span class="ar-header-title">' + escapeHtml(config.title) + '</span>'
      html += '</div>'
      html += '<ul class="ar-list">'
      stories.forEach(function (story) {
        var storyTitle = story.title || story.sourceTitle
        var storyUrl = SITE_URL + '/stories/' + (story.slug || story.id)
        var source = (story.feed && (story.feed.displayTitle || story.feed.title)) || ''
        var date = story.datePublished || story.dateCrawled
        html += '<li class="ar-item">'
        html += '<a class="ar-link" href="' + escapeHtml(storyUrl) + '" target="_blank" rel="noopener noreferrer">'
        html += '<p class="ar-title">' + escapeHtml(storyTitle) + '</p>'
        html += '<span class="ar-meta">' + escapeHtml(source) + (date ? ' &middot; ' + timeAgo(date) : '') + '</span>'
        html += '</a></li>'
      })
      html += '</ul>'
      html += '<div class="ar-footer"><a href="' + SITE_URL + '" target="_blank" rel="noopener noreferrer">Powered by Voces Indígenas</a></div>'
      widget.innerHTML = html
    } catch (e) {
      widget.innerHTML = '<div class="ar-error">Could not load stories</div>'
    }
  }
  xhr.onerror = function () {
    widget.innerHTML = '<div class="ar-error">Could not load stories</div>'
  }
  xhr.send()
})()
