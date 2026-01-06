import React, { useState } from 'react'
import axios from 'axios'
import './App.css'

// API地址配置：优先使用环境变量，否则根据当前环境决定
// 开发环境：使用localhost；生产环境：使用相对路径或环境变量
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.DEV ? 'http://localhost:8000' : '')

function App() {
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [ideas, setIdeas] = useState([])
  const [totalGenerated, setTotalGenerated] = useState(0)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!requirement.trim()) {
      setError('请输入需求描述')
      return
    }

    setLoading(true)
    setError(null)
    setIdeas([])

    try {
      const response = await axios.post(`${API_BASE_URL}/generate`, {
        requirement: requirement.trim(),
      })

      setIdeas(response.data.top_ideas)
      setTotalGenerated(response.data.total_generated)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '生成失败，请重试')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>✨ AI Innovator</h1>
          <p className="subtitle">智能创意生成系统</p>
        </header>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="requirement">需求描述</label>
            <textarea
              id="requirement"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="例如：强化学习算法GRPO的改进思路"
              rows={4}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? '生成中...' : '生成创意'}
          </button>
        </form>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>正在生成创意并评估中，请稍候...</p>
          </div>
        )}

        {ideas.length > 0 && (
          <div className="results">
            <div className="results-header">
              <h2>🎯 Top {ideas.length} 创意</h2>
              <span className="total-badge">共生成 {totalGenerated} 个创意</span>
            </div>

            <div className="ideas-list">
              {ideas.map((item, index) => (
                <div key={index} className="idea-card">
                  <div className="idea-rank">#{index + 1}</div>
                  <div className="idea-content">
                    <h3 className="idea-title">{item.idea}</h3>
                    <div className="idea-scores">
                      <div className="score-item">
                        <span className="score-label">总分</span>
                        <span className="score-value highlight">{item.score}</span>
                      </div>
                      <div className="score-item">
                        <span className="score-label">创新性</span>
                        <span className="score-value">{item.innovation_score}</span>
                      </div>
                      <div className="score-item">
                        <span className="score-label">可行性</span>
                        <span className="score-value">{item.feasibility_score}</span>
                      </div>
                    </div>
                    <div className="idea-comment">
                      <strong>评价：</strong>{item.comment}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

