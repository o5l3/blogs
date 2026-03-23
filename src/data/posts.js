import { posts as rawPosts, postContents } from 'virtual:posts'

export const categories = [
  { id: 'all', name: '전체', description: '모든 게시글' },
  { id: 'report', name: '리포트', description: '고객사 분석 보고서 및 사례' },
  { id: 'tech', name: '기술', description: '기술 아티클 및 개발 가이드' },
  { id: 'news', name: '소식', description: '회사 소식 및 공지사항' },
]

export const posts = rawPosts

export function getPostsByCategory(categoryId) {
  if (categoryId === 'all') return posts
  return posts.filter(p => p.category === categoryId)
}

export function getPostById(id) {
  return posts.find(p => p.id === id)
}

export function getPostContent(id) {
  return postContents[id] || ''
}

export function searchPosts(query) {
  const q = query.toLowerCase()
  return posts.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.excerpt.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q))
  )
}
