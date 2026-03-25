import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import ScrollToTopButton from './components/ScrollToTopButton'
import Home from './pages/Home'
import Category from './pages/Category'
import Post from './pages/Post'
import About from './pages/About'
import Story from './pages/Story'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function PageTransition({ children }) {
  const { pathname } = useLocation()
  const [show, setShow] = useState(true)

  useEffect(() => {
    setShow(false)
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setShow(true))
    })
    return () => cancelAnimationFrame(timer)
  }, [pathname])

  return (
    <div className={`transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        <PageTransition>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/category/:id" element={<Category />} />
            <Route path="/post/:id" element={<Post />} />
            <Route path="/about" element={<About />} />
            <Route path="/story" element={<Story />} />
          </Routes>
        </PageTransition>
      </main>
      <Footer />
      <ScrollToTopButton />
    </div>
  )
}
