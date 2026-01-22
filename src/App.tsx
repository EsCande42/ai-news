import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Source = {
  id: string
  name: string
  rssUrl: string
}

type NewsItem = {
  id: string
  sourceId: string
  source: string
  title: string
  summary: string
  imageUrl: string | null
  link: string
  publishedAt: string
}

const SOURCES: Source[] = [
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    rssUrl: 'https://techcrunch.com/feed/',
  },
  {
    id: 'verge',
    name: 'The Verge',
    rssUrl: 'https://www.theverge.com/rss/index.xml',
  },
  {
    id: 'reuters',
    name: 'Reuters',
    rssUrl: 'https://feeds.reuters.com/reuters/topNews',
  },
  {
    id: 'therundown',
    name: 'The Rundown',
    rssUrl: 'https://www.therundown.ai/rss',
  },
]

const RSS_PROXIES = [
  {
    id: 'rss2json',
    name: 'rss2json',
    type: 'json' as const,
    buildUrl: (rssUrl: string) =>
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
  },
  {
    id: 'allorigins',
    name: 'AllOrigins',
    type: 'xml' as const,
    buildUrl: (rssUrl: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
  },
]

const stripHtml = (html: string) => {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}

const truncate = (text: string, max = 160) => {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Без даты'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getImage = (item: Record<string, unknown>) => {
  if (typeof item.thumbnail === 'string' && item.thumbnail) return item.thumbnail
  const enclosure = item.enclosure as { link?: string } | undefined
  if (enclosure?.link) return enclosure.link
  return null
}

const getFirstText = (node: ParentNode, selectors: string[]) => {
  for (const selector of selectors) {
    const value = node.querySelector(selector)?.textContent?.trim()
    if (value) return value
  }
  return ''
}

const getFirstAttr = (node: ParentNode, selectors: string[], attr: string) => {
  for (const selector of selectors) {
    const value = node.querySelector(selector)?.getAttribute(attr)?.trim()
    if (value) return value
  }
  return ''
}

const extractImageFromHtml = (html: string) => {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const img = doc.querySelector('img')
  return img?.getAttribute('src') ?? null
}

const parseRssItems = (doc: Document, source: Source) => {
  const nodes = Array.from(doc.querySelectorAll('item'))
  return nodes.map((item) => {
    const title = getFirstText(item, ['title']) || 'Без названия'
    const rawSummary = getFirstText(item, [
      'content\\:encoded',
      'description',
      'content',
      'summary',
    ])
    const link = getFirstText(item, ['link'])
    const publishedAt = getFirstText(item, ['pubDate', 'published', 'updated', 'dc\\:date'])
    const imageUrl =
      getFirstAttr(item, ['media\\:content', 'media\\:thumbnail', 'enclosure'], 'url') ||
      extractImageFromHtml(rawSummary)

    return {
      id: `${source.id}-${getFirstText(item, ['guid']) || link || title}`,
      sourceId: source.id,
      source: source.name,
      title,
      summary: truncate(stripHtml(rawSummary).trim()),
      imageUrl,
      link,
      publishedAt,
    } as NewsItem
  })
}

const parseAtomEntries = (doc: Document, source: Source) => {
  const nodes = Array.from(doc.querySelectorAll('entry'))
  return nodes.map((entry) => {
    const title = getFirstText(entry, ['title']) || 'Без названия'
    const linkNode =
      entry.querySelector('link[rel="alternate"]') ?? entry.querySelector('link')
    const link = linkNode?.getAttribute('href')?.trim() || linkNode?.textContent?.trim() || ''
    const rawSummary = getFirstText(entry, ['content', 'summary'])
    const publishedAt = getFirstText(entry, ['published', 'updated'])
    const imageUrl =
      getFirstAttr(entry, ['media\\:content', 'media\\:thumbnail'], 'url') ||
      extractImageFromHtml(rawSummary)

    return {
      id: `${source.id}-${getFirstText(entry, ['id']) || link || title}`,
      sourceId: source.id,
      source: source.name,
      title,
      summary: truncate(stripHtml(rawSummary).trim()),
      imageUrl,
      link,
      publishedAt,
    } as NewsItem
  })
}

const parseXmlFeed = (xmlText: string, source: Source) => {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error(`Не удалось разобрать RSS ${source.name}`)
  }
  const rssItems = doc.querySelectorAll('item')
  if (rssItems.length > 0) return parseRssItems(doc, source)

  const atomEntries = doc.querySelectorAll('entry')
  if (atomEntries.length > 0) return parseAtomEntries(doc, source)

  return []
}

async function fetchSource(source: Source) {
  let lastError: Error | null = null

  for (const proxy of RSS_PROXIES) {
    try {
      const response = await fetch(proxy.buildUrl(source.rssUrl))
      if (!response.ok) {
        throw new Error(`Не удалось загрузить ${source.name}`)
      }

      if (proxy.type === 'json') {
        const data = (await response.json()) as {
          status?: string
          message?: string
          items?: Array<Record<string, unknown>>
        }
        if (data.status && data.status !== 'ok') {
          throw new Error(data.message ?? `Не удалось загрузить ${source.name}`)
        }
        const items = data.items ?? []
        return items.map((item) => {
          const title = (item.title as string) ?? 'Без названия'
          const rawSummary =
            (item.description as string) ??
            (item.content as string) ??
            (item.contentSnippet as string) ??
            ''

          return {
            id: `${source.id}-${item.guid ?? item.link ?? title}`,
            sourceId: source.id,
            source: source.name,
            title,
            summary: truncate(stripHtml(rawSummary).trim()),
            imageUrl: getImage(item),
            link: (item.link as string) ?? '#',
            publishedAt: (item.pubDate as string) ?? '',
          } as NewsItem
        })
      }

      const xmlText = await response.text()
      const items = parseXmlFeed(xmlText, source)
      if (items.length > 0) {
        return items
      }
      throw new Error(`Пустой ответ ${source.name}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Источник недоступен')
    }
  }

  throw lastError ?? new Error(`Не удалось загрузить ${source.name}`)
}

function App() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [activeItem, setActiveItem] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<Array<{ source: string; message: string }>>([])
  const [query, setQuery] = useState('')
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(SOURCES.map((source) => source.id)),
  )
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const loadNews = async () => {
    setLoading(true)
    setError(null)
    setWarnings([])
    try {
      const results = await Promise.allSettled(SOURCES.map((source) => fetchSource(source)))
      const merged: NewsItem[] = []
      const issues: Array<{ source: string; message: string }> = []

      results.forEach((result, index) => {
        const source = SOURCES[index]
        if (result.status === 'fulfilled') {
          merged.push(...result.value)
        } else {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : 'Источник временно недоступен'
          issues.push({ source: source.name, message })
        }
      })

      merged.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      setItems(merged)
      setWarnings(issues)
      if (merged.length === 0) {
        setError('Не удалось загрузить ни один источник.')
      }
      setActiveItem((prev) => {
        if (prev && merged.some((item) => item.id === prev.id)) return prev
        return merged[0] ?? null
      })
      setLastUpdated(
        new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNews()
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items.filter((item) => {
      const isSourceActive = selectedSources.has(item.sourceId)
      const matchesQuery = normalizedQuery
        ? item.title.toLowerCase().includes(normalizedQuery)
        : true
      return isSourceActive && matchesQuery
    })
  }, [items, query, selectedSources])

  const toggleSource = (id: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__text">
          <p className="hero__badge">✨ Кавай‑лента AI‑новостей</p>
          <h1>Аниме‑редактор новостей</h1>
          <p className="hero__subtitle">
            Собираем свежие новости из TechCrunch, The Verge, Reuters и The Rundown в
            одной нежной ленте. Кликайте — и источник откроется справа.
          </p>
        </div>
        <div className="hero__sparkles" aria-hidden="true" />
      </header>

      <section className="controls">
        <div className="controls__search">
          <label htmlFor="search">Поиск</label>
          <input
            id="search"
            type="search"
            placeholder="Найти новость..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="controls__filters">
          <span>Источники:</span>
          <div className="filters__list">
            {SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                className={`chip ${selectedSources.has(source.id) ? 'chip--active' : ''}`}
                onClick={() => toggleSource(source.id)}
              >
                {source.name}
              </button>
            ))}
          </div>
        </div>
        <div className="controls__meta">
          <button type="button" className="refresh" onClick={() => void loadNews()}>
            Обновить ленту
          </button>
          <span>Обновлено: {lastUpdated || '—'}</span>
        </div>
      </section>

      <main className="layout">
        <section className="feed">
          <div className="feed__header">
            <h2>Свежие публикации</h2>
            <span>{filteredItems.length} новостей</span>
          </div>

          {warnings.length > 0 ? (
            <div className="state state--warning">
              <strong>Часть источников недоступна:</strong>
              <div className="state__list">
                {warnings.map((warning) => (
                  <span key={warning.source}>
                    {warning.source}: {warning.message}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="state">Загружаем милые новости...</div>
          ) : error ? (
            <div className="state state--error">
              {error}
              <span>Проверьте соединение или повторите попытку позже.</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="state">Пока пусто. Попробуйте изменить фильтр.</div>
          ) : (
            <div className="feed__list">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className={`card ${activeItem?.id === item.id ? 'card--active' : ''}`}
                  onClick={() => setActiveItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setActiveItem(item)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="card__media">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="card__placeholder">🎀</div>
                    )}
                  </div>
                  <div className="card__content">
                    <div className="card__meta">
                      <span>{item.source}</span>
                      <span>{formatDate(item.publishedAt)}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summary || 'Без описания, но очень интересно!'}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="preview">
          <div className="preview__header">
            <h2>Окно источника</h2>
            {activeItem?.link ? (
              <a href={activeItem.link} target="_blank" rel="noreferrer">
                Открыть в новой вкладке
              </a>
            ) : null}
          </div>
          {activeItem ? (
            <iframe
              title={activeItem.title}
              src={activeItem.link}
              className="preview__frame"
              loading="lazy"
            />
          ) : (
            <div className="state">Выберите новость слева, чтобы открыть источник.</div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
