import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPosts } from '../data/posts'

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (query.trim()) {
      setResults(searchPosts(query))
    } else {
      setResults([])
    }
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleSelect = (postId) => {
    onClose()
    navigate(`/post/${postId}`)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="검색어를 입력하세요..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-base outline-none placeholder:text-gray-300"
          />
          <kbd className="hidden sm:inline-block text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200">ESC</kbd>
        </div>

        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map(post => (
              <li key={post.id}>
                <button
                  onClick={() => handleSelect(post.id)}
                  className="w-full text-left px-5 py-3 hover:bg-orange-50 transition-colors"
                >
                  <p className="text-sm font-semibold text-gray-900">{post.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{post.date} · {post.tags.slice(0, 3).map(t => `#${t}`).join(' ')}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim() && results.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            검색 결과가 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
