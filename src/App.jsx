import React, { useState } from 'react'
import axios from 'axios'
import './App.css'
import logo from './assets/OpenMOSS_logo.png'

// 自动根据当前环境获取对应的 API 前缀
// 优先级：环境变量 VITE_API_BASE_URL > 开发环境默认值 > 生产环境相对路径
const API_BASE = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.DEV ? 'http://localhost:8000' : '')

function App() {
  // 左侧对话状态
  const [requirement, setRequirement] = useState('')
  const [conversationHistory, setConversationHistory] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [isClarity, setIsClarity] = useState(false)
  const [clarifyingLoading, setClarifyingLoading] = useState(false)
  
  // 右侧创意生成状态
  const [loading, setLoading] = useState(false)
  const [ideas, setIdeas] = useState([])
  const [totalGenerated, setTotalGenerated] = useState(0)
  const [totalComparisons, setTotalComparisons] = useState(0)
  const [error, setError] = useState(null)
  
  // 最终确认的需求
  const [confirmedRequirement, setConfirmedRequirement] = useState('')

  // 处理初始需求提交
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!requirement.trim()) {
      setError('Please enter a requirement description')
      return
    }

    setClarifyingLoading(true)
    setError(null)
    setConversationHistory([])
    setCurrentQuestion('')

    try {
      // 调用澄清接口
      const response = await axios.post(`${API_BASE}/clarify`, {
        requirement: requirement.trim(),
        conversation_history: []
      })

      if (response.data.is_clear) {
        // 需求已明确，直接生成创意
        setIsClarity(true)
        setConfirmedRequirement(requirement.trim())
        await generateIdeas(requirement.trim())
      } else {
        // 需求不明确，显示澄清问题
        const newHistory = [...conversationHistory, {
          role: 'user',
          content: requirement.trim()
        }, {
          role: 'assistant',
          content: response.data.question
        }]
        setConversationHistory(newHistory)
        setCurrentQuestion(response.data.question)
        setIsClarity(false)
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Clarification failed, please try again')
      console.error('Error:', err)
    } finally {
      setClarifyingLoading(false)
    }
  }

  // 处理用户回复澄清问题
  const handleClarifyResponse = async (e) => {
    e.preventDefault()
    if (!requirement.trim()) {
      return
    }

    setClarifyingLoading(true)
    setError(null)

    try {
      const response = await axios.post(`${API_BASE}/clarify`, {
        requirement: requirement.trim(),
        conversation_history: conversationHistory
      })

      const newHistory = [...response.data.conversation_history]
      setConversationHistory(newHistory)

      if (response.data.is_clear) {
        // 需求已明确，生成创意
        setIsClarity(true)
        setConfirmedRequirement(requirement.trim())
        setCurrentQuestion('')
        await generateIdeas(requirement.trim())
      } else {
        // 继续澄清
        setCurrentQuestion(response.data.question)
        setIsClarity(false)
      }
      
      setRequirement('')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Clarification failed, please try again')
      console.error('Error:', err)
    } finally {
      setClarifyingLoading(false)
    }
  }

  // 生成创意
  const generateIdeas = async (finalRequirement) => {
    setLoading(true)
    setError(null)
    setIdeas([])

    try {
      const response = await axios.post(`${API_BASE}/generate`, {
        requirement: finalRequirement,
      })

      setIdeas(response.data.top_ideas)
      setTotalGenerated(response.data.total_generated)
      setTotalComparisons(response.data.total_comparisons)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Generation failed, please try again')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // 重新开始
  const handleReset = () => {
    setRequirement('')
    setConversationHistory([])
    setCurrentQuestion('')
    setIsClarity(false)
    setIdeas([])
    setTotalGenerated(0)
    setTotalComparisons(0)
    setError(null)
    setConfirmedRequirement('')
  }

  return (
    <div className="app">
      <header className="app-header">
        <img src={logo} alt="OpenMOSS Logo" className="logo" />
        <h1>✨ AI Innovator</h1>
        <p className="subtitle">Intelligent Creative Idea Generator</p>
        {conversationHistory.length > 0 && (
          <button onClick={handleReset} className="reset-btn">
            🔄 Start New Session
          </button>
        )}
      </header>

      <div className="main-container">
        {/* 左侧：需求澄清对话区 */}
        <div className="left-panel">
          <div className="panel-header">
            <h2>💬 Requirement Clarification</h2>
          </div>
          
          <div className="conversation-area">
            {conversationHistory.length === 0 ? (
              <div className="empty-state">
                <p>👋 Welcome! Please describe your requirement below.</p>
                <p>I'll help clarify your needs to generate better ideas.</p>
              </div>
            ) : (
              <div className="conversation-history">
                {conversationHistory.map((msg, index) => (
                  <div key={index} className={`message ${msg.role}`}>
                    <div className="message-label">
                      {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}
            
            {clarifyingLoading && (
              <div className="loading-message">
                <div className="spinner-small"></div>
                <span>Analyzing your requirement...</span>
              </div>
            )}
          </div>

          <form 
            onSubmit={conversationHistory.length === 0 ? handleSubmit : handleClarifyResponse} 
            className="input-form"
          >
            <div className="form-group">
              <textarea
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder={
                  conversationHistory.length === 0 
                    ? "e.g., I need ideas to improve my machine learning algorithm..."
                    : "Please provide your answer..."
                }
                rows={3}
                disabled={clarifyingLoading || loading}
                className="input-textarea"
              />
            </div>

            <button 
              type="submit" 
              disabled={clarifyingLoading || loading || !requirement.trim()} 
              className="submit-btn"
            >
              {clarifyingLoading ? 'Processing...' : conversationHistory.length === 0 ? '🚀 Start' : '📤 Send'}
            </button>
          </form>

          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}

          {isClarity && confirmedRequirement && (
            <div className="clarity-badge">
              ✅ Requirement Clarified
            </div>
          )}
        </div>

        {/* 右侧：创意生成结果区 */}
        <div className="right-panel">
          <div className="panel-header">
            <h2>💡 Generated Ideas</h2>
          </div>

          {!isClarity && ideas.length === 0 && !loading && (
            <div className="empty-state">
              <p>🎨 Ideas will appear here once your requirement is clarified.</p>
            </div>
          )}

          {loading && (
            <div className="loading">
              <div className="spinner"></div>
              <p>🔄 Generating and evaluating ideas...</p>
              <p className="loading-detail">This may take a few minutes...</p>
            </div>
          )}

          {ideas.length > 0 && (
            <div className="results">
              <div className="results-header">
                <h3>🎯 Top {ideas.length} Ideas</h3>
                <div className="stats">
                  <span className="stat-badge">📊 {totalGenerated} Generated</span>
                  <span className="stat-badge">🔍 {totalComparisons} Comparisons</span>
                </div>
              </div>

              <div className="ideas-list">
                {ideas.map((item, index) => (
                  <div key={index} className="idea-card">
                    <div className="idea-rank">#{index + 1}</div>
                    <div className="idea-content">
                      <h3 className="idea-title">{item.idea}</h3>
                      <div className="idea-scores">
                        <div className="score-item">
                          <span className="score-label">Win Rate</span>
                          <span className="score-value highlight">
                            {(item.win_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="score-item">
                          <span className="score-label">Wins</span>
                          <span className="score-value">{item.wins}/{item.total_comparisons}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

