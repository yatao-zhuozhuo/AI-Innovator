import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import '../App.css'
import logo from '../assets/OpenMOSS_logo.png'
import scientTasteLogo from '../assets/taste_logo.png'
import { getCategoryDisplayName, getMainCategory, getAllCategories } from '../utils/categoryMapping'

// 自动根据当前环境获取对应的 API 前缀
const API_BASE = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.DEV ? 'http://localhost:8011' : '')

// 配置 axios 实例
const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 1200000,
  headers: {
    'Content-Type': 'application/json',
  },
  maxRedirects: 5,
  maxContentLength: 50 * 1024 * 1024,
})

// 获取 ISO 周数 (1-53)
function getISOWeek(date) {
  const target = new Date(date.valueOf())
  const dayNr = (date.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const jan4 = new Date(target.getFullYear(), 0, 4)
  const dayDiff = (target - jan4) / 86400000
  return 1 + Math.ceil(dayDiff / 7)
}

// 获取日期的 ISO 周所在年（该周周四所在的日历年）
function getISOWeekYear(date) {
  const d = new Date(date.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - dayNr + 3)
  return thursday.getFullYear()
}

// 获取前一天的日期
function getYesterdayDate() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

// 获取前一天的ISO周数
function getYesterdayISOWeek() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return getISOWeek(yesterday)
}

// 获取最近一个“已结束月份”（用于月榜默认值）
function getLatestCompletedMonthSelection() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (currentMonth === 1) {
    return { year: currentYear - 1, month: 12 }
  }
  return { year: currentYear, month: currentMonth - 1 }
}

// 上月最后一天 YYYY-MM-DD（日榜默认与可选上限，不展示当前月）
function getLastDayOfLastMonth() {
  const completed = getLatestCompletedMonthSelection()
  const lastDay = new Date(completed.year, completed.month, 0) // 当月 0 日 = 上月最后一天
  return lastDay.toISOString().split('T')[0]
}

// 最近一个“已结束周”的 ISO (year, week)（周榜默认与可选上限）
function getLastCompletedWeekSelection() {
  const lastDayStr = getLastDayOfLastMonth()
  const lastDay = new Date(lastDayStr + 'T12:00:00')
  const year = getISOWeekYear(lastDay)
  const week = getISOWeek(lastDay)
  return { year, week }
}

// 给定 ISO (year, week) 的周一
function getMondayOfISOWeek(year, week) {
  const jan4 = new Date(year, 0, 4)
  const dayNr = (jan4.getDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - dayNr)
  const monday = new Date(week1Monday)
  monday.setDate(week1Monday.getDate() + (week - 1) * 7)
  return monday
}

// 周选项展示为「某月第几周」，用该周周一所在的日历年月（避免跨年周显示成下一年）
// e.g. ISO 2026-W01 的周一是 2025-12-29 → "2025年12月 第5周"
function getWeekLabel(year, isoWeek) {
  const monday = getMondayOfISOWeek(year, isoWeek)
  const displayYear = monday.getFullYear()
  const month = monday.getMonth() + 1
  const day = monday.getDate()
  const weekOfMonth = Math.ceil(day / 7)
  return `${displayYear}年${month}月 第${weekOfMonth}周`
}

function HomePage() {
  const [papers, setPapers] = useState([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState('range') // 'range' | 'global'
  const [papersStats, setPapersStats] = useState({ total: 0, ranked_count: 0 })
  const [showAllPapers, setShowAllPapers] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [expandedAbstracts, setExpandedAbstracts] = useState(new Set())
  const [extendIdeas, setExtendIdeas] = useState({})
  const [ideaLanguageByPaper, setIdeaLanguageByPaper] = useState({})
  const [totalPapersInCategory, setTotalPapersInCategory] = useState(0)
  // 固定的五个分类
  const categories = getAllCategories()
  
  // 时间维度相关状态 - 仅展示已结束范围（不展示当前月）
  const initialCompletedMonth = getLatestCompletedMonthSelection()
  const initialCompletedWeek = getLastCompletedWeekSelection()
  const [timePeriod, setTimePeriod] = useState('monthly') // 'daily', 'weekly', 'monthly'
  const [selectedDate, setSelectedDate] = useState(getLastDayOfLastMonth()) // 日榜：上月最后一天
  const [selectedYear, setSelectedYear] = useState(initialCompletedMonth.year)
  const [selectedWeek, setSelectedWeek] = useState(initialCompletedWeek.week) // 周榜：包含上月最后一天的周
  const [selectedMonth, setSelectedMonth] = useState(initialCompletedMonth.month) // 月榜：上一个已结束月
  const hasAutoAdjustedInitialMonth = useRef(false)
  // 排序方式：Judger（默认）或引用数
  const [sortBy, setSortBy] = useState('judger')
  // 当前周期是否有引用数据及获取日期（由 /papers 响应更新）
  const [citationMeta, setCitationMeta] = useState({ available: false, fetched_at: null })

  useEffect(() => {
    fetchPapers()
  }, [timePeriod, selectedDate, selectedYear, selectedWeek, selectedMonth, selectedCategory, sortBy])

  const getLatestAvailableDateFromBackend = async () => {
    try {
      // 不传 date，让后端自动回退到最近有数据的一天
      const response = await axiosInstance.get('/papers?limit=1&ranked_only=true&period=daily')
      const latestPaper = response?.data?.papers?.[0]
      if (!latestPaper?.published_date) return null
      return latestPaper.published_date
    } catch (err) {
      console.error('Error probing latest available papers date:', err)
      return null
    }
  }

  const fetchPapers = async () => {
    setPapersLoading(true)
    try {
      // 构建API请求参数
      const normalizedQuery = searchQuery.trim()
      const requestLimit = showAllPapers ? 1000 : 200
      let apiUrl = normalizedQuery
        ? `/papers/search?limit=${requestLimit}&ranked_only=false&scope=${searchScope}&query=${encodeURIComponent(normalizedQuery)}`
        : `/papers?limit=${requestLimit}&ranked_only=true`
      
      if (timePeriod === 'daily') {
        apiUrl += `&period=daily&date=${selectedDate}`
      } else if (timePeriod === 'weekly') {
        apiUrl += `&period=weekly&year=${selectedYear}&week=${selectedWeek}`
      } else if (timePeriod === 'monthly') {
        apiUrl += `&period=monthly&year=${selectedYear}&month=${selectedMonth}`
      }
      
      // 添加分类筛选参数（如果选择了特定分类）
      if (selectedCategory !== 'all') {
        apiUrl += `&category=${selectedCategory}`
      }
      // 列表接口支持按 Judger 或引用数排序（搜索接口暂不传 sort_by）
      if (!normalizedQuery && apiUrl.includes('/papers?')) {
        apiUrl += `&sort_by=${sortBy}`
      }
      
      const response = await axiosInstance.get(apiUrl)
      const papersList = response.data.papers

      // 首次进入页面时，如果默认“当月”没有数据，自动跳转到最近有论文的月份
      if (
        !normalizedQuery &&
        timePeriod === 'monthly' &&
        papersList.length === 0 &&
        !hasAutoAdjustedInitialMonth.current
      ) {
        hasAutoAdjustedInitialMonth.current = true
        const latestAvailableDate = await getLatestAvailableDateFromBackend()
        if (latestAvailableDate) {
          const latest = new Date(latestAvailableDate)
          const latestMonthStart = new Date(latest.getFullYear(), latest.getMonth(), 1)
          const currentMonthStart = new Date()
          currentMonthStart.setDate(1)
          currentMonthStart.setHours(0, 0, 0, 0)

          const fallbackCompletedMonth = getLatestCompletedMonthSelection()
          const shouldClampToCompletedMonth = latestMonthStart >= currentMonthStart
          const latestYear = shouldClampToCompletedMonth ? fallbackCompletedMonth.year : latest.getFullYear()
          const latestMonth = shouldClampToCompletedMonth ? fallbackCompletedMonth.month : (latest.getMonth() + 1)
          const latestDay = latest.toISOString().split('T')[0]

          const monthChanged = latestYear !== selectedYear || latestMonth !== selectedMonth
          if (monthChanged) {
            setSelectedYear(latestYear)
            setSelectedMonth(latestMonth)
          }
          setSelectedDate(latestDay)
          if (monthChanged) {
            return
          }
        }
      }
      
      // 保存总数
      setTotalPapersInCategory(papersList.length)
      
      // 显示前10篇或全部（根据showAllPapers状态）
      const displayCount = showAllPapers ? papersList.length : Math.min(10, papersList.length)
      setPapers(papersList.slice(0, displayCount))
      
      setPapersStats({
        total: response.data.total,
        ranked_count: response.data.ranked_count
      })
      if (response.data.citation_available !== undefined) {
        setCitationMeta({
          available: response.data.citation_available === true,
          fetched_at: response.data.citation_fetched_at || null
        })
      }
      
      console.log(`📊 Loaded ${papersList.length} ranked papers for category: ${selectedCategory}, displaying: ${displayCount}`)
    } catch (err) {
      console.error('Error fetching papers:', err)
    } finally {
      setPapersLoading(false)
    }
  }

  const handleSearch = () => {
    setShowAllPapers(false)
    fetchPapers()
  }
  
  // 当showAllPapers改变时，更新显示的论文数量
  useEffect(() => {
    if (papers.length > 0 && totalPapersInCategory > 10) {
      // 只有在有更多论文时才需要重新获取
      if (showAllPapers && papers.length < totalPapersInCategory) {
        fetchPapers()
      } else if (!showAllPapers && papers.length > 10) {
        setPapers(papers.slice(0, 10))
      }
    }
  }, [showAllPapers])
  
  const toggleAbstract = (paperId) => {
    setExpandedAbstracts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(paperId)) {
        newSet.delete(paperId)
      } else {
        newSet.add(paperId)
      }
      return newSet
    })
  }

  const handleToggleAllPapers = () => {
    setShowAllPapers(!showAllPapers)
  }

  const getIdeaLanguageForPaper = (paperId) => ideaLanguageByPaper[paperId] || 'zh'

  const setIdeaLanguageForPaper = (paperId, language) => {
    setIdeaLanguageByPaper(prev => ({
      ...prev,
      [paperId]: language
    }))
  }

  const parseExtendIdea = (ideaText) => {
    if (!ideaText) return null
    try {
      const parsed = JSON.parse(ideaText)
      if (parsed && (parsed.idea_1 || parsed.idea_2 || parsed.en || parsed.zh)) {
        return parsed
      }
    } catch (err) {
      // fall through to raw
    }
    return { raw: ideaText }
  }

  const handleExtendIdea = async (paper) => {
    const cachedIdea = extendIdeas[paper.id]?.idea
    const existingIdea = cachedIdea || paper.extend_idea
    if (existingIdea) {
      setExtendIdeas(prev => ({
        ...prev,
        [paper.id]: {
          ...(prev[paper.id] || {}),
          loading: false,
          error: '',
          visible: true,
          idea: existingIdea,
          ideaData: prev[paper.id]?.ideaData || parseExtendIdea(existingIdea)
        }
      }))
      return
    }

    setExtendIdeas(prev => {
      const existing = prev[paper.id] || {}
      return {
        ...prev,
        [paper.id]: {
          ...existing,
          loading: true,
          error: '',
          visible: true,
          idea: existing.idea || paper.extend_idea || '',
          ideaData: existing.ideaData || parseExtendIdea(paper.extend_idea || '')
        }
      }
    })

    try {
      const response = await axiosInstance.post(`/papers/${paper.id}/extend-idea`)
      const ideaText = response.data.idea || ''
      const ideaData = parseExtendIdea(ideaText)
      setExtendIdeas(prev => ({
        ...prev,
        [paper.id]: {
          loading: false,
          error: '',
          visible: true,
          idea: ideaText,
          ideaData
        }
      }))
    } catch (err) {
      setExtendIdeas(prev => ({
        ...prev,
        [paper.id]: {
          ...(prev[paper.id] || {}),
          loading: false,
          error: err.response?.data?.detail || err.message || 'Failed to generate idea'
        }
      }))
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
  
  // 切换时间维度
  const handlePeriodChange = (period) => {
    setTimePeriod(period)
    setShowAllPapers(false)
  }
  
  // 切换分类
  const handleCategoryChange = (category) => {
    setSelectedCategory(category)
    setShowAllPapers(false)
  }
  
  // 获取时间维度标题
  const getPeriodTitle = () => {
    if (timePeriod === 'daily') {
      return `📅 ${selectedDate}`
    } else if (timePeriod === 'weekly') {
      return `📅 ${getWeekLabel(selectedYear, selectedWeek)}`
    } else if (timePeriod === 'monthly') {
      return `📅 ${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    }
    return ''
  }
  
  // 生成年份选项（最近3年）
  const getYearOptions = () => {
    const currentYear = new Date().getFullYear()
    return [currentYear, currentYear - 1, currentYear - 2]
  }
  
  // 周选项：仅已结束周，展示为「某月第几周」
  const getWeekOptions = () => {
    const lastCompleted = getLastCompletedWeekSelection()
    const currentYear = new Date().getFullYear()
    const maxWeek = selectedYear === currentYear ? lastCompleted.week : 53
    if (maxWeek <= 0) return []
    return Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => ({
      value: w,
      label: getWeekLabel(selectedYear, w)
    }))
  }
  
  // 生成月份选项（仅展示已结束月份）
  const getMonthOptions = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    if (selectedYear > currentYear) {
      return []
    }
    const maxMonth = selectedYear === currentYear ? currentMonth - 1 : 12
    if (maxMonth <= 0) {
      return []
    }
    return Array.from({ length: maxMonth }, (_, i) => i + 1)
  }

  // 月榜：保证选中的是已结束月份
  useEffect(() => {
    if (timePeriod !== 'monthly') return
    const monthOptions = getMonthOptions()
    if (monthOptions.length === 0) {
      const fallback = getLatestCompletedMonthSelection()
      if (selectedYear !== fallback.year) setSelectedYear(fallback.year)
      if (selectedMonth !== fallback.month) setSelectedMonth(fallback.month)
      return
    }
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[monthOptions.length - 1])
    }
  }, [timePeriod, selectedYear, selectedMonth])

  // 周榜：保证选中的是已结束周
  useEffect(() => {
    if (timePeriod !== 'weekly') return
    const weekOptions = getWeekOptions()
    if (weekOptions.length === 0) {
      const fallback = getLastCompletedWeekSelection()
      if (selectedYear !== fallback.year) setSelectedYear(fallback.year)
      if (selectedWeek !== fallback.week) setSelectedWeek(fallback.week)
      return
    }
    const validWeeks = weekOptions.map((o) => o.value)
    if (!validWeeks.includes(selectedWeek)) {
      setSelectedWeek(validWeeks[validWeeks.length - 1])
    }
  }, [timePeriod, selectedYear, selectedWeek])

  // 日榜：若日期在当前月则回退到上月最后一天
  useEffect(() => {
    if (timePeriod !== 'daily') return
    const maxDate = getLastDayOfLastMonth()
    if (selectedDate > maxDate) setSelectedDate(maxDate)
  }, [timePeriod, selectedDate])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="hero-title">
          <img src={scientTasteLogo} alt="Scientific Taste Logo" className="title-logo" />
          <span>AI can Learn Scientific Taste</span>
        </h1>
        <p className="subtitle">Rank ArXiv Papers & Propose Follow-Up Research Ideas - All From AI's Learned Scientific Taste!</p>
      </header>

      <section className="project-links-section">
        <div className="project-links-content">
          <span className="project-links-label">Project Links</span>
          <a
            href="https://tongjingqi.github.io/AI-Can-Learn-Scientific-Taste/"
            target="_blank"
            rel="noopener noreferrer"
            className="project-link-chip"
          >
            Paper Homepage
          </a>
          <a
            href="https://github.com/tongjingqi/AI-Can-Learn-Scientific-Taste"
            target="_blank"
            rel="noopener noreferrer"
            className="project-link-chip secondary"
          >
            GitHub Repository
          </a>
        </div>
      </section>

      <div className="home-container">
        <div className="papers-panel-full">
          <div className="panel-header">
            <div>
              <h2>📚 arXiv Featured Papers</h2>
              {papersStats.ranked_count > 0 && (
                <p className="papers-stats">
                  {showAllPapers 
                    ? `🏆 Showing all ${totalPapersInCategory} papers`
                    : `🏆 Top ${papers.length} / ${totalPapersInCategory} papers`
                  }
                  {selectedCategory !== 'all' && (
                    <span style={{ marginLeft: '10px', color: '#888' }}>
                      (Category: {getCategoryDisplayName(selectedCategory)})
                    </span>
                  )}
                  {timePeriod !== 'daily' && totalPapersInCategory > 0 && (
                    <span style={{ marginLeft: '10px', color: '#888' }}>
                      (Ranked by score from all papers in this {timePeriod === 'weekly' ? 'week' : 'month'})
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="header-buttons">
              <select
                className="search-scope-select"
                value={searchScope}
                onChange={(e) => setSearchScope(e.target.value)}
                title="Search scope"
              >
                <option value="range">In current range</option>
                <option value="global">Global</option>
              </select>
              <input
                type="text"
                className="paper-search-input"
                placeholder="Search by paper title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch()
                  }
                }}
              />
              <button onClick={handleSearch} className="search-btn" disabled={papersLoading}>
                Search
              </button>
            </div>
          </div>
          
          {/* 时间维度控制区 */}
          <div className="time-control-section">
            {/* 时间维度切换器 */}
            <div className="time-period-toggle">
              <button
                className={`period-btn ${timePeriod === 'daily' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('daily')}
              >
                📅 Day
              </button>
              <button
                className={`period-btn ${timePeriod === 'weekly' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('weekly')}
              >
                📊 Week
              </button>
              <button
                className={`period-btn ${timePeriod === 'monthly' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('monthly')}
              >
                📈 Month
              </button>
            </div>
            
            {/* 日期/周期选择器 */}
            <div className="date-selector">
              {timePeriod === 'daily' && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="date-input"
                  max={getLastDayOfLastMonth()}
                />
              )}
              
              {timePeriod === 'weekly' && (
                <div className="week-selector">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="period-select"
                  >
                    {getYearOptions().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(Number(e.target.value))}
                    className="period-select"
                    style={{ marginLeft: '8px', minWidth: '140px' }}
                  >
                    {getWeekOptions().map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {timePeriod === 'monthly' && (
                <div className="month-selector">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="period-select"
                  >
                    {getYearOptions().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="period-select"
                    style={{ marginLeft: '8px' }}
                  >
                    {getMonthOptions().map(month => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <span className="period-display">{getPeriodTitle()}</span>
              {/* 排序方式：Judger / 引用数 */}
              <div className="sort-by-toggle" style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className={`period-btn ${sortBy === 'judger' ? 'active' : ''}`}
                  onClick={() => setSortBy('judger')}
                >
                  Judger
                </button>
                <button
                  type="button"
                  className={`period-btn ${sortBy === 'citation' ? 'active' : ''}`}
                  onClick={() => citationMeta.available && setSortBy('citation')}
                  disabled={!citationMeta.available}
                  title={!citationMeta.available ? '该周期引用数据未就绪' : '按引用数排序'}
                >
                  引用数
                </button>
                {sortBy === 'citation' && citationMeta.fetched_at && (
                  <span className="citation-fetch-date" style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>
                    引用数获取日期：{citationMeta.fetched_at}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* 分类筛选栏 */}
            <div className="category-filter">
              <button
                className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('all')}
              >
                All
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => handleCategoryChange(category)}
                title={getCategoryDisplayName(category)}
                >
                  {getCategoryDisplayName(category)}
                </button>
              ))}
            </div>
          
          <div className="papers-list">
            {papersLoading ? (
              <div className="loading-papers">
                <div className="spinner-small"></div>
                <p>Loading papers...</p>
              </div>
            ) : papers.length === 0 ? (
              <div className="empty-state-papers">
                <p>📄 No ranked papers available yet.</p>
                <p>Papers will be fetched and ranked automatically.</p>
                <button 
                  onClick={handleSearch} 
                  className="refresh-btn-small"
                  style={{ marginTop: '10px' }}
                >
                  Search
                </button>
              </div>
            ) : (
              <>
                {papers.map((paper, index) => (
                  <div 
                    key={paper.id} 
                    className="paper-card"
                  >
                    <div className="paper-rank">#{index + 1}</div>
                    <div className="paper-content">
                      <h3 className="paper-title">{paper.title}</h3>
                      <div 
                        className={`paper-abstract ${expandedAbstracts.has(paper.id) ? 'expanded' : ''}`}
                        onClick={() => toggleAbstract(paper.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        {expandedAbstracts.has(paper.id) 
                          ? paper.abstract 
                          : `${paper.abstract.substring(0, 150)}...`
                        }
                        <span className="abstract-toggle">
                          {expandedAbstracts.has(paper.id) ? ' [Collapse]' : ' [Expand]'}
                        </span>
                      </div>
                      <div className="paper-meta">
                        <span className="paper-date">📅 {formatDate(paper.published_date)}</span>
                      </div>
                      <div className="paper-links">
                        <a 
                          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="paper-link-btn arxiv-btn"
                        >
                          📖 arXiv
                        </a>
                        <a 
                          href={paper.pdf_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="paper-link-btn pdf-btn"
                        >
                          📄 PDF
                        </a>
                        <button
                          className="paper-link-btn extend-idea-btn"
                          onClick={() => handleExtendIdea(paper)}
                          disabled={extendIdeas[paper.id]?.loading}
                        >
                          💡 Extend Idea
                        </button>
                      </div>
                      {extendIdeas[paper.id]?.visible && (
                        <div className="extend-idea-box">
                          {(() => {
                            const currentIdeaLanguage = getIdeaLanguageForPaper(paper.id)
                            return (
                          <div className="extend-idea-toolbar">
                            <span className="extend-idea-toolbar-label">Idea Language</span>
                            <div className="idea-language-toggle">
                              <button
                                className={`idea-lang-btn ${currentIdeaLanguage === 'zh' ? 'active' : ''}`}
                                onClick={() => setIdeaLanguageForPaper(paper.id, 'zh')}
                              >
                                中文
                              </button>
                              <button
                                className={`idea-lang-btn ${currentIdeaLanguage === 'en' ? 'active' : ''}`}
                                onClick={() => setIdeaLanguageForPaper(paper.id, 'en')}
                              >
                                EN
                              </button>
                            </div>
                          </div>
                            )
                          })()}
                          {extendIdeas[paper.id]?.loading && (
                            <div className="extend-idea-loading">
                              <div className="spinner-small"></div>
                              <span>Generating idea...</span>
                            </div>
                          )}
                          {!extendIdeas[paper.id]?.loading && extendIdeas[paper.id]?.idea && (
                            <>
                              {extendIdeas[paper.id]?.ideaData?.idea_1 || extendIdeas[paper.id]?.ideaData?.idea_2 ? (
                                <div className="extend-idea-grid">
                                  {['idea_1', 'idea_2'].map((key, idx) => {
                                    const ideaItem = extendIdeas[paper.id].ideaData?.[key]
                                    const langData = ideaItem?.[getIdeaLanguageForPaper(paper.id)]
                                    return (
                                      <div key={key} className="extend-idea-card">
                                        <div className="extend-idea-card-title">
                                          {idx === 0 ? 'Idea 1' : 'Idea 2'}
                                        </div>
                                        <div className="extend-idea-card-content">
                                          <div className="extend-idea-card-heading">
                                            {langData?.title || ideaItem?.title || 'Untitled'}
                                          </div>
                                          <div className="extend-idea-card-abstract">
                                            {langData?.abstract || ideaItem?.abstract || ''}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="extend-idea-text">
                                  {extendIdeas[paper.id]?.ideaData?.raw || extendIdeas[paper.id].idea}
                                </div>
                              )}
                            </>
                          )}
                          {!extendIdeas[paper.id]?.loading && extendIdeas[paper.id]?.error && (
                            <div className="extend-idea-error">
                              {extendIdeas[paper.id].error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {totalPapersInCategory > papers.length && !showAllPapers && (
                        <div className="view-all-container">
                          <button onClick={handleToggleAllPapers} className="view-all-btn">
                      📖 View All Papers ({totalPapersInCategory})
                          </button>
                        </div>
                      )}
                      
                {showAllPapers && totalPapersInCategory > 10 && (
                        <div className="view-all-container">
                          <button onClick={handleToggleAllPapers} className="view-all-btn collapse-btn">
                            ⬆️ Show Top 10 Only
                          </button>
                        </div>
                      )}
              </>
            )}
          </div>
        </div>
      </div>
      <footer className="site-footer">
        <div className="footer-brand">
          <img src={logo} alt="OpenMOSS Logo" className="footer-logo" />
        </div>
        <div className="citation-section">
          <h3>Cite Our Work</h3>
          <pre className="citation-box">
{`@misc{tong2026ailearnscientifictaste,
      title={AI Can Learn Scientific Taste}, 
      author={Jingqi Tong and Mingzhe Li and Hangcheng Li and Yongzhuo Yang and Yurong Mou and Weijie Ma and Zhiheng Xi and Hongji Chen and Xiaoran Liu and Qinyuan Cheng and Ming Zhang and Qiguang Chen and Weifeng Ge and Qipeng Guo and Tianlei Ying and Tianxiang Sun and Yining Zheng and Xinchi Chen and Jun Zhao and Ning Ding and Xuanjing Huang and Yugang Jiang and Xipeng Qiu},
      year={2026},
      eprint={2603.14473},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2603.14473}, 
}`}
          </pre>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
