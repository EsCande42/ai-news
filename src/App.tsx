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

const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url='

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

async function fetchSource(source: Source) {
  const response = await fetch(`${RSS_PROXY}${encodeURIComponent(source.rssUrl)}`)
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${source.name}`)
  }
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
